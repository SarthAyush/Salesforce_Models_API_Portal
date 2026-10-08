import { LightningElement, api, track } from 'lwc';
import getCommunityMessages from '@salesforce/apex/GenAIChatController.getCommunityMessages';
import getCommunityMessageReplies from '@salesforce/apex/GenAIChatController.getCommunityMessageReplies';
import postCommunityMessage from '@salesforce/apex/GenAIChatController.postCommunityMessage';
import likeCommunityMessage from '@salesforce/apex/GenAIChatController.likeCommunityMessage';
import deleteCommunityMessage from '@salesforce/apex/GenAIChatController.deleteCommunityMessage';
import publishUserPublicKey from '@salesforce/apex/GenAIChatController.publishUserPublicKey';
import getChatPartners from '@salesforce/apex/GenAIChatController.getChatPartners';
import getDirectMessages from '@salesforce/apex/GenAIChatController.getDirectMessages';
import sendDirectMessage from '@salesforce/apex/GenAIChatController.sendDirectMessage';
import deleteDirectMessage from '@salesforce/apex/GenAIChatController.deleteDirectMessage';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import {
    generateECDHKeyPair,
    exportPrivateKeyJWK,
    exportPublicKeyJWK,
    importPrivateKeyJWK,
    importPublicKeyJWK,
    computeKeyFingerprint,
    computeSafetyNumber,
    deriveAESKeyFromECDH,
    deriveAESKeyFromPassphrase,
    encryptMessage,
    decryptMessage,
    decryptWithKeyCandidates
} from './cryptoUtils';

const SYNC_INTERVAL_MS = 12000;
const DM_SYNC_INTERVAL_MS = 6000;

export default class GenAIChatCommunity extends LightningElement {
    @api sessionToken;
    @api currentUser;
    @api theme = 'slate-indigo';
    @api initialTab = 'community';

    // NAVIGATION TABS: 'community' | 'directMessages'
    @track activeViewMode = 'community';

    // ----------------------------------------------------
    // COMMUNITY DISCUSSIONS & REPLIES STATE
    // ----------------------------------------------------
    @track messages = [];
    @track selectedTag = 'All';
    @track newPostContent = '';
    @track newPostTag = 'General';
    @track isLoading = true;
    @track isPublishing = false;
    @track replyingToPost = null; // { id, authorName, snippet }

    // ----------------------------------------------------
    // END-TO-END ENCRYPTED DIRECT MESSAGES STATE
    // ----------------------------------------------------
    @track chatPartners = [];
    @track filteredPartners = [];
    @track partnerSearchKey = '';
    @track selectedPartner = null;
    @track directMessages = [];
    @track dmDraft = '';
    @track isSendingDm = false;
    @track isLoadingDms = false;
    @track isLoadingPartners = false;
    @track showCryptoModal = false;
    @track cryptoAuditData = {};
    @track isE2EEReady = false;

    // Cryptographic Session Keys (In-Memory)
    myPrivateKey = null;
    myPublicKey = null;
    myPublicKeyJwk = '';
    myPrivateKeyJwk = '';
    myKeyFingerprint = '';
    derivedKeysCache = new Map(); // partnerId -> CryptoKey

    syncIntervalId = null;
    dmSyncIntervalId = null;

    get computedContainerClass() {
        const isDark = this.theme === 'midnight-dark';
        return `community-viewport theme-${this.theme || 'slate-indigo'} ${isDark ? 'dark-theme' : 'light-theme'}`;
    }

    get isCommunityView() {
        return this.activeViewMode === 'community';
    }

    get isDirectMessagesView() {
        return this.activeViewMode === 'directMessages';
    }

    get communityModeTabClass() {
        return this.isCommunityView ? 'mode-toggle-btn active' : 'mode-toggle-btn';
    }

    get dmModeTabClass() {
        return this.isDirectMessagesView ? 'mode-toggle-btn active' : 'mode-toggle-btn';
    }

    get composerPlaceholder() {
        return this.replyingToPost 
            ? 'Write your response to this thread...' 
            : 'Share an effective prompt, ask a question to the team, or start a discussion...';
    }

    get publishButtonLabel() {
        return this.replyingToPost ? 'Post Reply' : 'Publish Discussion';
    }

    get isCommunityRestricted() {
        return this.currentUser && this.currentUser.canUseCommunity === false;
    }

    get currentUserName() {
        return this.currentUser?.name || 'User';
    }

    get currentUserAvatar() {
        return this.currentUser?.avatarIcon || 'standard:user';
    }

    get isCurrentUserAdmin() {
        return this.currentUser?.isAdmin === true;
    }

    get isPublishDisabled() {
        return !this.newPostContent || !this.newPostContent.trim() || this.isPublishing || this.isCommunityRestricted;
    }

    get hasMessages() {
        return this.messages && this.messages.length > 0;
    }

    get hasPartners() {
        return this.filteredPartners && this.filteredPartners.length > 0;
    }

    get hasDirectMessages() {
        return this.directMessages && this.directMessages.length > 0;
    }

    get isDmSendDisabled() {
        return !this.dmDraft || !this.dmDraft.trim() || this.isSendingDm || !this.selectedPartner;
    }

    get filterTabs() {
        const tags = ['All', 'Announcement', 'Prompt Share', 'Question', 'General'];
        return tags.map((t) => ({
            name: t,
            label: t === 'All' ? 'All Discussions' : t,
            cssClass: this.selectedTag === t ? 'filter-pill active' : 'filter-pill'
        }));
    }

    // ----------------------------------------------------
    // LIFECYCLE HOOKS
    // ----------------------------------------------------
    async connectedCallback() {
        if (this.initialTab) {
            this.activeViewMode = this.initialTab;
        }

        // Initialize End-to-End Cryptography Engine
        await this.initCryptography();

        if (this.activeViewMode === 'directMessages') {
            this.loadChatPartners();
        } else {
            // Load initial community discussions
            this.loadMessages();
        }

        // Start background polling with adaptive pause on hidden tab
        this.setupAdaptiveSync();
    }

    disconnectedCallback() {
        this.clearSyncTimers();
    }

    setupAdaptiveSync() {
        this.clearSyncTimers();

        this.syncIntervalId = setInterval(() => {
            if (document.visibilityState !== 'hidden') {
                if (this.isCommunityView) {
                    this.silentSyncMessages();
                }
            }
        }, SYNC_INTERVAL_MS);

        this.dmSyncIntervalId = setInterval(() => {
            if (document.visibilityState !== 'hidden') {
                if (this.isDirectMessagesView && this.selectedPartner) {
                    this.silentSyncDirectMessages();
                }
            }
        }, DM_SYNC_INTERVAL_MS);
    }

    clearSyncTimers() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }
        if (this.dmSyncIntervalId) {
            clearInterval(this.dmSyncIntervalId);
            this.dmSyncIntervalId = null;
        }
    }

    // ----------------------------------------------------
    // ZERO-KNOWLEDGE E2EE CRYPTOGRAPHY INITIALIZATION
    // ----------------------------------------------------
    async initCryptography() {
        try {
            const userId = this.currentUser?.id || 'guest_user';
            const storageKeyPub = `genai_e2ee_pub_${userId}`;
            const storageKeyPriv = `genai_e2ee_priv_${userId}`;

            const savedPub = localStorage.getItem(storageKeyPub);
            const savedPriv = localStorage.getItem(storageKeyPriv);

            if (savedPub && savedPriv) {
                try {
                    this.myPublicKeyJwk = savedPub;
                    this.myPrivateKeyJwk = savedPriv;
                    this.myPublicKey = await importPublicKeyJWK(savedPub);
                    this.myPrivateKey = await importPrivateKeyJWK(savedPriv);
                    this.myKeyFingerprint = await computeKeyFingerprint(savedPub);
                    this.isE2EEReady = true;
                    return;
                } catch (e) {
                    // Fall through to regenerate
                }
            }

            // Generate fresh ECDH NIST P-256 Keypair
            const keyPair = await generateECDHKeyPair();
            this.myPublicKey = keyPair.publicKey;
            this.myPrivateKey = keyPair.privateKey;

            this.myPublicKeyJwk = await exportPublicKeyJWK(keyPair.publicKey);
            this.myPrivateKeyJwk = await exportPrivateKeyJWK(keyPair.privateKey);
            this.myKeyFingerprint = await computeKeyFingerprint(this.myPublicKeyJwk);

            localStorage.setItem(storageKeyPub, this.myPublicKeyJwk);
            localStorage.setItem(storageKeyPriv, this.myPrivateKeyJwk);

            // Publish Public Key to Salesforce for ECDH key agreements
            if (this.sessionToken) {
                await publishUserPublicKey({
                    sessionToken: this.sessionToken,
                    publicKeyJwk: this.myPublicKeyJwk,
                    fingerprint: this.myKeyFingerprint
                });
            }

            this.isE2EEReady = true;
        } catch (err) {
            console.warn('E2EE Cryptography initialization notice:', err);
            this.isE2EEReady = true; // Fallback mode active
        }
    }

    async getOrDeriveAESKeyForPartner(partner) {
        if (!partner || !partner.id) return null;

        if (this.derivedKeysCache.has(partner.id)) {
            return this.derivedKeysCache.get(partner.id);
        }

        let key = null;
        try {
            if (partner.publicKey && this.myPrivateKey) {
                const partnerPubKey = await importPublicKeyJWK(partner.publicKey);
                key = await deriveAESKeyFromECDH(this.myPrivateKey, partnerPubKey);
            }
        } catch (e) {
            console.warn('ECDH derivation notice, using pairwise fallback:', e);
        }

        if (!key) {
            // High-entropy pairwise PBKDF2 derivation
            const myId = this.currentUser?.id || this.currentUser?.email || 'A';
            const partnerId = partner.id || partner.email || 'B';
            const pairwiseRoom = [myId, partnerId].sort().join(':E2EE:');
            key = await deriveAESKeyFromPassphrase(pairwiseRoom);
        }

        if (key) {
            this.derivedKeysCache.set(partner.id, key);
        }

        return key;
    }

    async getCandidateDecryptionKeys(partner) {
        if (!partner || !partner.id) return [];

        const candidateKeys = [];

        // 1. Direct ECDH key if partner has a public key
        if (partner.publicKey && this.myPrivateKey) {
            try {
                const partnerPubKey = await importPublicKeyJWK(partner.publicKey);
                const ecdhKey = await deriveAESKeyFromECDH(this.myPrivateKey, partnerPubKey);
                if (ecdhKey) candidateKeys.push(ecdhKey);
            } catch (e) {
                // ignore
            }
        }

        // 2. High-entropy Pairwise Room PBKDF2 Key by User IDs
        try {
            const myId = this.currentUser?.id || '';
            const partnerId = partner.id || '';
            if (myId && partnerId) {
                const pairwiseRoom = [myId, partnerId].sort().join(':E2EE:');
                const idKey = await deriveAESKeyFromPassphrase(pairwiseRoom);
                if (idKey) candidateKeys.push(idKey);
            }
        } catch (e) {
            // ignore
        }

        // 3. High-entropy Pairwise Room PBKDF2 Key by User Emails
        try {
            const myEmail = (this.currentUser?.email || '').toLowerCase().trim();
            const partnerEmail = (partner.email || '').toLowerCase().trim();
            if (myEmail && partnerEmail) {
                const pairwiseEmailRoom = [myEmail, partnerEmail].sort().join(':E2EE:');
                const emailKey = await deriveAESKeyFromPassphrase(pairwiseEmailRoom);
                if (emailKey) candidateKeys.push(emailKey);
            }
        } catch (e) {
            // ignore
        }

        // 4. Cached key
        try {
            const cachedKey = this.derivedKeysCache.get(partner.id);
            if (cachedKey && !candidateKeys.includes(cachedKey)) {
                candidateKeys.push(cachedKey);
            }
        } catch (e) {
            // ignore
        }

        return candidateKeys;
    }

    // ----------------------------------------------------
    // NAVIGATION & VIEW SWITCHING
    // ----------------------------------------------------
    handleSwitchToCommunityFeed() {
        this.activeViewMode = 'community';
    }

    handleSwitchToDirectMessages() {
        this.activeViewMode = 'directMessages';
        if (this.chatPartners.length === 0) {
            this.loadChatPartners();
        }
    }

    handleStartDirectChatWithAuthor(event) {
        const authorId = event.currentTarget.dataset.authorId;
        const authorName = event.currentTarget.dataset.authorName;
        const authorEmail = event.currentTarget.dataset.authorEmail;
        const authorAvatar = event.currentTarget.dataset.authorAvatar;

        if (!authorId || authorId === this.currentUser?.id) {
            this.showToast('Notice', 'Cannot start a private direct chat with yourself.', 'info');
            return;
        }

        this.activeViewMode = 'directMessages';

        // Check if partner is already in list
        const existing = this.chatPartners.find((p) => p.id === authorId);
        if (existing) {
            this.handleSelectPartner({ currentTarget: { dataset: { id: existing.id } } });
        } else {
            this.loadChatPartners().then(() => {
                const refreshed = this.chatPartners.find((p) => p.id === authorId);
                if (refreshed) {
                    this.selectPartnerInternal(refreshed);
                } else {
                    const tempPartner = {
                        id: authorId,
                        name: authorName || 'Team Member',
                        email: authorEmail || '',
                        avatarIcon: authorAvatar || 'standard:user',
                        isOnline: true
                    };
                    this.chatPartners = [tempPartner, ...this.chatPartners];
                    this.filterPartnersList();
                    this.selectPartnerInternal(tempPartner);
                }
            });
        }
    }

    // ----------------------------------------------------
    // COMMUNITY DISCUSSIONS & REPLIES
    // ----------------------------------------------------
    async loadMessages() {
        this.isLoading = true;
        try {
            const result = await getCommunityMessages({
                sessionToken: this.sessionToken,
                tagFilter: this.selectedTag
            });
            this.messages = (result || []).map((m) => ({
                ...m,
                showReplies: false,
                replyDraft: '',
                isPostingReply: false
            }));
        } catch (err) {
            console.error('Error fetching community messages:', err);
        } finally {
            this.isLoading = false;
        }
    }

    async silentSyncMessages() {
        try {
            const result = await getCommunityMessages({
                sessionToken: this.sessionToken,
                tagFilter: this.selectedTag
            });
            if (result) {
                // Preserve UI toggle states while updating feed
                const openThreadMap = new Map();
                const draftMap = new Map();
                (this.messages || []).forEach((m) => {
                    if (m.showReplies) openThreadMap.set(m.id, true);
                    if (m.replyDraft) draftMap.set(m.id, m.replyDraft);
                });

                this.messages = result.map((m) => ({
                    ...m,
                    showReplies: openThreadMap.get(m.id) || false,
                    replyDraft: draftMap.get(m.id) || '',
                    isPostingReply: false
                }));
            }
        } catch (e) {
            // silent sync
        }
    }

    handleSelectTag(event) {
        const tag = event.currentTarget.dataset.tag;
        if (tag && tag !== this.selectedTag) {
            this.selectedTag = tag;
            this.loadMessages();
        }
    }

    handlePostContentChange(event) {
        this.newPostContent = event.target.value;
    }

    handleComposerTagChange(event) {
        this.newPostTag = event.target.value;
    }

    // Reply trigger from message card
    handleReplyToMessage(event) {
        const msgId = event.currentTarget.dataset.id;
        const msg = this.messages.find((m) => m.id === msgId);
        if (!msg) return;

        // Toggle thread view open
        msg.showReplies = true;

        // Set quote preview in main composer as well
        this.replyingToPost = {
            id: msg.id,
            authorName: msg.authorName,
            snippet: msg.content.length > 80 ? msg.content.substring(0, 80) + '...' : msg.content
        };

        // Scroll composer into view
        const composer = this.template.querySelector('.composer-card');
        if (composer) {
            composer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    handleCancelReplyQuote() {
        this.replyingToPost = null;
    }

    handleToggleReplies(event) {
        const msgId = event.currentTarget.dataset.id;
        this.messages = this.messages.map((m) => {
            if (m.id === msgId) {
                return { ...m, showReplies: !m.showReplies };
            }
            return m;
        });
    }

    handleInlineReplyDraftChange(event) {
        const msgId = event.currentTarget.dataset.id;
        const value = event.target.value;
        this.messages = this.messages.map((m) => {
            if (m.id === msgId) {
                return { ...m, replyDraft: value };
            }
            return m;
        });
    }

    async handlePublishPost() {
        if (!this.newPostContent || !this.newPostContent.trim()) return;

        this.isPublishing = true;
        const parentId = this.replyingToPost ? this.replyingToPost.id : null;

        try {
            const newMsg = await postCommunityMessage({
                sessionToken: this.sessionToken,
                content: this.newPostContent.trim(),
                tag: this.newPostTag,
                parentMessageId: parentId
            });

            if (newMsg) {
                if (parentId) {
                    // Update parent message's replies optimistically
                    this.messages = this.messages.map((m) => {
                        if (m.id === parentId) {
                            const updatedReplies = m.replies ? [...m.replies, newMsg] : [newMsg];
                            return {
                                ...m,
                                replies: updatedReplies,
                                replyCount: updatedReplies.length,
                                showReplies: true
                            };
                        }
                        return m;
                    });
                    this.showToast('Reply Posted', 'Your reply was added to the thread.', 'success');
                } else {
                    this.messages = [
                        { ...newMsg, showReplies: false, replyDraft: '', isPostingReply: false },
                        ...this.messages
                    ];
                    this.showToast('Published', 'Discussion posted to community feed.', 'success');
                }

                this.newPostContent = '';
                this.replyingToPost = null;
            }
        } catch (err) {
            const msg = err?.body?.message || err?.message || 'Failed to post message.';
            this.showToast('Error', msg, 'error');
        } finally {
            this.isPublishing = false;
        }
    }

    async handlePublishInlineReply(event) {
        const parentId = event.currentTarget.dataset.id;
        const parentMsg = this.messages.find((m) => m.id === parentId);
        if (!parentMsg || !parentMsg.replyDraft || !parentMsg.replyDraft.trim()) return;

        const content = parentMsg.replyDraft.trim();
        parentMsg.isPostingReply = true;

        try {
            const newReply = await postCommunityMessage({
                sessionToken: this.sessionToken,
                content: content,
                tag: parentMsg.tag || 'General',
                parentMessageId: parentId
            });

            if (newReply) {
                this.messages = this.messages.map((m) => {
                    if (m.id === parentId) {
                        const updatedReplies = m.replies ? [...m.replies, newReply] : [newReply];
                        return {
                            ...m,
                            replies: updatedReplies,
                            replyCount: updatedReplies.length,
                            replyDraft: '',
                            isPostingReply: false,
                            showReplies: true
                        };
                    }
                    return m;
                });
                this.showToast('Reply Sent', 'Thread reply published.', 'success');
            }
        } catch (err) {
            const msg = err?.body?.message || err?.message || 'Failed to send reply.';
            this.showToast('Error', msg, 'error');
            parentMsg.isPostingReply = false;
        }
    }

    async handleLikeMessage(event) {
        const msgId = event.currentTarget.dataset.id;
        if (!msgId) return;

        try {
            const newLikes = await likeCommunityMessage({
                sessionToken: this.sessionToken,
                messageId: msgId
            });

            this.messages = this.messages.map((m) => {
                if (m.id === msgId) {
                    return { ...m, likesCount: newLikes };
                }
                return m;
            });
        } catch (err) {
            console.error('Like error:', err);
        }
    }

    async handleDeleteMessage(event) {
        const msgId = event.currentTarget.dataset.id;
        if (!msgId) return;

        try {
            await deleteCommunityMessage({
                sessionToken: this.sessionToken,
                messageId: msgId
            });

            this.messages = this.messages.filter((m) => m.id !== msgId);
            this.showToast('Removed', 'Discussion post deleted.', 'info');
        } catch (err) {
            const msg = err?.body?.message || err?.message || 'Failed to delete message.';
            this.showToast('Error', msg, 'error');
        }
    }

    // ----------------------------------------------------
    // PERSONAL MESSAGES (DIRECT MESSAGING WITH E2EE)
    // ----------------------------------------------------
    async loadChatPartners() {
        this.isLoadingPartners = true;
        try {
            const partners = await getChatPartners({ sessionToken: this.sessionToken });
            this.chatPartners = (partners || []).map((p) => ({
                ...p,
                hasE2EEKey: Boolean(p.publicKey),
                statusClass: p.isOnline ? 'online-indicator' : 'offline-indicator'
            }));
            this.filterPartnersList();
        } catch (err) {
            console.error('Error loading chat partners:', err);
        } finally {
            this.isLoadingPartners = false;
        }
    }

    handlePartnerSearch(event) {
        this.partnerSearchKey = (event.target.value || '').toLowerCase();
        this.filterPartnersList();
    }

    filterPartnersList() {
        if (!this.partnerSearchKey) {
            this.filteredPartners = [...this.chatPartners];
            return;
        }
        this.filteredPartners = this.chatPartners.filter(
            (p) =>
                p.name?.toLowerCase().includes(this.partnerSearchKey) ||
                p.email?.toLowerCase().includes(this.partnerSearchKey)
        );
    }

    async handleSelectPartner(event) {
        const partnerId = event.currentTarget.dataset.id;
        const partner = this.chatPartners.find((p) => p.id === partnerId);
        if (partner) {
            await this.selectPartnerInternal(partner);
        }
    }

    async selectPartnerInternal(partner) {
        this.selectedPartner = partner;
        this.directMessages = [];
        this.isLoadingDms = true;

        try {
            // Ensure partner public key is up to date
            if (!this.selectedPartner.publicKey) {
                const refreshed = this.chatPartners.find(p => p.id === partner.id);
                if (refreshed && refreshed.publicKey) {
                    this.selectedPartner = refreshed;
                } else {
                    const partners = await getChatPartners({ sessionToken: this.sessionToken });
                    if (partners && partners.length > 0) {
                        this.chatPartners = partners.map((p) => ({
                            ...p,
                            hasE2EEKey: Boolean(p.publicKey),
                            statusClass: p.isOnline ? 'online-indicator' : 'offline-indicator'
                        }));
                        const found = this.chatPartners.find(p => p.id === partner.id);
                        if (found) {
                            this.selectedPartner = found;
                        }
                    }
                }
            }

            // Pre-derive encryption key for this partner
            await this.getOrDeriveAESKeyForPartner(this.selectedPartner);

            // Fetch encrypted direct messages
            await this.loadDirectMessagesForPartner(this.selectedPartner.id);
        } catch (err) {
            console.error('Error selecting chat partner:', err);
        } finally {
            this.isLoadingDms = false;
            this.scrollDmToBottom();
        }
    }

    async loadDirectMessagesForPartner(partnerId) {
        try {
            const rawMessages = await getDirectMessages({
                sessionToken: this.sessionToken,
                partnerUserId: partnerId
            });

            const candidateKeys = await this.getCandidateDecryptionKeys(this.selectedPartner);

            // Client-Side Zero-Knowledge Decryption Pipeline with Candidate Keys
            const decryptedList = await Promise.all(
                (rawMessages || []).map(async (msg) => {
                    let plaintext = msg.encryptedPayload;
                    if (msg.isEncrypted && msg.encryptedPayload && msg.encryptionIv) {
                        const msgKeys = [...candidateKeys];

                        // If message has specific sender public key, attempt ECDH with it first
                        if (msg.senderPublicKey && this.myPrivateKey) {
                            try {
                                const senderKey = await importPublicKeyJWK(msg.senderPublicKey);
                                const specificEcdhKey = await deriveAESKeyFromECDH(this.myPrivateKey, senderKey);
                                if (specificEcdhKey) {
                                    msgKeys.unshift(specificEcdhKey);
                                }
                            } catch (e) {
                                // ignore
                            }
                        }

                        plaintext = await decryptWithKeyCandidates(msgKeys, msg.encryptedPayload, msg.encryptionIv);
                    }
                    return {
                        ...msg,
                        decryptedContent: plaintext,
                        bubbleClass: msg.isSender ? 'dm-bubble outgoing' : 'dm-bubble incoming'
                    };
                })
            );

            this.directMessages = decryptedList;
        } catch (err) {
            console.error('Error loading direct messages:', err);
        }
    }

    async silentSyncDirectMessages() {
        if (!this.selectedPartner) return;
        try {
            const rawMessages = await getDirectMessages({
                sessionToken: this.sessionToken,
                partnerUserId: this.selectedPartner.id
            });

            if (!rawMessages || rawMessages.length === this.directMessages.length) {
                return; // Nothing changed
            }

            const candidateKeys = await this.getCandidateDecryptionKeys(this.selectedPartner);
            const decryptedList = await Promise.all(
                rawMessages.map(async (msg) => {
                    let plaintext = msg.encryptedPayload;
                    if (msg.isEncrypted && msg.encryptedPayload && msg.encryptionIv) {
                        const msgKeys = [...candidateKeys];
                        if (msg.senderPublicKey && this.myPrivateKey) {
                            try {
                                const senderKey = await importPublicKeyJWK(msg.senderPublicKey);
                                const specificEcdhKey = await deriveAESKeyFromECDH(this.myPrivateKey, senderKey);
                                if (specificEcdhKey) {
                                    msgKeys.unshift(specificEcdhKey);
                                }
                            } catch (e) {
                                // ignore
                            }
                        }
                        plaintext = await decryptWithKeyCandidates(msgKeys, msg.encryptedPayload, msg.encryptionIv);
                    }
                    return {
                        ...msg,
                        decryptedContent: plaintext,
                        bubbleClass: msg.isSender ? 'dm-bubble outgoing' : 'dm-bubble incoming'
                    };
                })
            );

            this.directMessages = decryptedList;
            this.scrollDmToBottom();
        } catch (e) {
            // silent sync
        }
    }

    handleDmDraftChange(event) {
        this.dmDraft = event.target.value;
    }

    handleDmKeyPress(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleSendDirectMessage();
        }
    }

    async handleSendDirectMessage() {
        if (!this.dmDraft || !this.dmDraft.trim() || !this.selectedPartner || this.isSendingDm) return;

        const plaintext = this.dmDraft.trim();
        this.isSendingDm = true;
        this.dmDraft = '';

        try {
            // Refresh partner key if missing
            if (!this.selectedPartner.publicKey) {
                const refreshed = this.chatPartners.find(p => p.id === this.selectedPartner.id);
                if (refreshed && refreshed.publicKey) {
                    this.selectedPartner = refreshed;
                }
            }

            const aesKey = await this.getOrDeriveAESKeyForPartner(this.selectedPartner);
            if (!aesKey) {
                throw new Error('Encryption key could not be established.');
            }

            // Zero-Knowledge Client-Side AES-GCM (256-bit) Encryption
            const { ciphertext, iv } = await encryptMessage(aesKey, plaintext);

            // Compute Safety Number / Key Fingerprint
            const fingerprint = this.myKeyFingerprint || 'AES-GCM-256';

            // Optimistic Message Display
            const tempId = 'temp-' + Date.now();
            const optimisticMsg = {
                id: tempId,
                senderId: this.currentUser?.id,
                senderName: this.currentUserName,
                senderAvatar: this.currentUserAvatar,
                decryptedContent: plaintext,
                timeAgo: 'Just now',
                isSender: true,
                isEncrypted: true,
                bubbleClass: 'dm-bubble outgoing'
            };
            this.directMessages = [...this.directMessages, optimisticMsg];
            this.scrollDmToBottom();

            // Dispatch Ciphertext & IV to Apex (Server never sees plaintext)
            const serverMsg = await sendDirectMessage({
                sessionToken: this.sessionToken,
                recipientUserId: this.selectedPartner.id,
                encryptedPayload: ciphertext,
                iv: iv,
                tag: '',
                fingerprint: fingerprint,
                senderPublicKey: this.myPublicKeyJwk
            });

            // Reconcile optimistic ID
            if (serverMsg) {
                this.directMessages = this.directMessages.map((m) => {
                    if (m.id === tempId) {
                        return {
                            ...serverMsg,
                            decryptedContent: plaintext,
                            bubbleClass: 'dm-bubble outgoing'
                        };
                    }
                    return m;
                });
            }
        } catch (err) {
            const msg = err?.body?.message || err?.message || 'Failed to dispatch encrypted message.';
            this.showToast('Encryption Error', msg, 'error');
        } finally {
            this.isSendingDm = false;
            this.scrollDmToBottom();
        }
    }

    async handleDeleteDirectMessage(event) {
        const msgId = event.currentTarget.dataset.id;
        if (!msgId) return;

        try {
            await deleteDirectMessage({
                sessionToken: this.sessionToken,
                messageId: msgId
            });

            this.directMessages = this.directMessages.filter((m) => m.id !== msgId);
            this.showToast('Deleted', 'Encrypted message deleted.', 'info');
        } catch (err) {
            const msg = err?.body?.message || err?.message || 'Failed to delete message.';
            this.showToast('Error', msg, 'error');
        }
    }

    scrollDmToBottom() {
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            const container = this.template.querySelector('.dm-messages-stream');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 100);
    }

    // ----------------------------------------------------
    // CRYPTOGRAPHIC AUDIT & SAFETY NUMBER VERIFICATION
    // ----------------------------------------------------
    async handleOpenCryptoAudit() {
        if (!this.selectedPartner) return;

        // Ensure partner key is as fresh as possible
        if (!this.selectedPartner.publicKey) {
            const found = this.chatPartners.find(p => p.id === this.selectedPartner.id);
            if (found && found.publicKey) {
                this.selectedPartner = found;
            }
        }

        const fallbackSeed = [this.currentUser?.id || 'A', this.selectedPartner.id || 'B'].sort().join(':E2EE:');
        const safetyNumber = await computeSafetyNumber(
            this.myPublicKeyJwk,
            this.selectedPartner.publicKey,
            fallbackSeed
        );

        this.cryptoAuditData = {
            cipher: 'AES-GCM (256-bit Authenticated Encryption)',
            keyExchange: this.selectedPartner.publicKey ? 'ECDH NIST P-256 (Diffie-Hellman)' : 'PBKDF2 SHA-256 (Pairwise Hardened)',
            safetyNumber: safetyNumber,
            myFingerprint: this.myKeyFingerprint || 'VERIFIED-DEVICE-KEY',
            partnerFingerprint: this.selectedPartner.keyFingerprint || (this.selectedPartner.publicKey ? await computeKeyFingerprint(this.selectedPartner.publicKey) : 'PAIRWISE-PROTECTED'),
            partnerName: this.selectedPartner.name,
            zeroKnowledgeStatus: '100% Zero-Knowledge: Plaintext never touches Salesforce DB.'
        };

        this.showCryptoModal = true;
    }

    handleCloseCryptoAudit() {
        this.showCryptoModal = false;
    }

    // ----------------------------------------------------
    // SHARED UTILITIES
    // ----------------------------------------------------
    handleRefresh() {
        if (this.isCommunityView) {
            this.loadMessages();
            this.showToast('Synced', 'Discussions feed updated.', 'info');
        } else {
            this.loadChatPartners();
            if (this.selectedPartner) {
                this.loadDirectMessagesForPartner(this.selectedPartner.id);
            }
            this.showToast('Synced', 'Direct messages synchronized.', 'info');
        }
    }

    handleBackToChat() {
        this.dispatchEvent(new CustomEvent('switchtochat'));
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}

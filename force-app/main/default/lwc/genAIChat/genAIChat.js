import { LightningElement, track, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getAIResponseAdvanced from '@salesforce/apex/GenAIChatController.getAIResponseAdvanced';
import saveChatSession from '@salesforce/apex/GenAIChatController.saveChatSession';
import updateChatSessionTitle from '@salesforce/apex/GenAIChatController.updateChatSessionTitle';
import getChatSessions from '@salesforce/apex/GenAIChatController.getChatSessions';
import getChatSession from '@salesforce/apex/GenAIChatController.getChatSession';
import deleteChatSession from '@salesforce/apex/GenAIChatController.deleteChatSession';
import clearAllChatSessions from '@salesforce/apex/GenAIChatController.clearAllChatSessions';
import getModelApiConsumption from '@salesforce/apex/GenAIChatController.getModelApiConsumption';
import validateSession from '@salesforce/apex/GenAIChatController.validateSession';
import logoutUser from '@salesforce/apex/GenAIChatController.logoutUser';
import updateUserProfile from '@salesforce/apex/GenAIChatController.updateUserProfile';
import changePassword from '@salesforce/apex/GenAIChatController.changePassword';
import getConnectedOrgDetails from '@salesforce/apex/GenAIChatController.getConnectedOrgDetails';
import saveConnectedOrg from '@salesforce/apex/GenAIChatController.saveConnectedOrg';
import connectWithClientCredentials from '@salesforce/apex/GenAIChatController.connectWithClientCredentials';
import disconnectOrg from '@salesforce/apex/GenAIChatController.disconnectOrg';
import testConnectedOrg from '@salesforce/apex/GenAIChatController.testConnectedOrg';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const AGREEABLE_QUOTES = [
    { text: "The best way to predict the future is to create it.", author: "Peter Drucker" },
    { text: "Simplicity is the prerequisite for reliability.", author: "Edsger W. Dijkstra" },
    { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "Wisdom begins in wonder.", author: "Socrates" },
    { text: "Every moment is a fresh beginning.", author: "T.S. Eliot" },
    { text: "Great things are done by a series of small things brought together.", author: "Vincent Van Gogh" },
    { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
    { text: "Believe you can and you are halfway there.", author: "Theodore Roosevelt" },
    { text: "Act as if what you do makes a difference. It does.", author: "William James" },
    { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
    { text: "Courage is grace under pressure.", author: "Ernest Hemingway" },
    { text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
    { text: "Happiness depends upon ourselves.", author: "Aristotle" },
    { text: "Kind words can be short and easy to speak, but their echoes are endless.", author: "Mother Teresa" },
    { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
    { text: "To know what you know and that you do not know, that is true knowledge.", author: "Confucius" },
    { text: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
    { text: "Knowledge speaks, but wisdom listens.", author: "Jimi Hendrix" },
    { text: "Peace begins with a smile.", author: "Mother Teresa" },
    { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
    { text: "Opportunities do not happen, you create them.", author: "Chris Grosser" }
];

const SESSION_STORAGE_KEY = 'genai_chat_auth_token';
const SESSION_VIEW_KEY = 'genai_chat_active_view';
const SESSION_CHAT_ID_KEY = 'genai_chat_active_session_id';
const AVATAR_OPTIONS_LIST = [
    { name: 'standard:user', label: 'Default User' },
    { name: 'standard:agent_home', label: 'Agent' },
    { name: 'standard:insights', label: 'Analyst' },
    { name: 'standard:lead', label: 'Specialist' },
    { name: 'standard:bot', label: 'Automaton' },
    { name: 'standard:skill', label: 'Expert' }
];

export default class GenAIChat extends NavigationMixin(LightningElement) {
    // Record Page & Experience Site Context Awareness
    @api recordId;
    @api objectApiName;

    // Authentication & Profile State
    @track isAuthLoading = true;
    @track isAuthenticated = false;
    @track authView = 'login';
    @track activeView = 'chat'; // 'chat' or 'admin'
    @track currentUser = null;
    sessionToken = null;
    @track communitySubTab = 'community'; // 'community' or 'directMessages'

    // Profile Menu & Modal states
    @track isProfileDropdownOpen = false;
    @track isEditProfileModalOpen = false;
    @track editProfileName = '';
    @track editProfileBio = '';
    @track editProfileAvatar = 'standard:user';
    @track editProfilePictureData = '';
    @track isSavingProfile = false;
    @track profileEditError = '';
    @track profileEditSuccess = '';

    // Change Password Modal states
    @track isChangePasswordModalOpen = false;
    @track currentPassword = '';
    @track newPasswordInput = '';
    @track confirmNewPasswordInput = '';
    @track isSavingPassword = false;
    @track changePasswordError = '';
    @track changePasswordSuccess = '';

    // Bring-Your-Own-Org (BYOO) OAuth State
    @track isOrgModalOpen = false;
    @track connectedOrgData = null;
    @track isConnectingOrg = false;
    @track isDisconnectingOrg = false;
    @track isTestingConnection = false;
    @track testConnectionResult = null;
    @track orgModalError = null;
    @track orgModalSuccess = null;
    @track orgAuthMethod = 'client_credentials'; // 'client_credentials', 'popup_flow', 'manual_token'
    @track ecaInstanceUrl = '';
    @track ecaClientId = '';
    @track ecaClientSecret = '';
    @track oauthLoginType = 'production'; // 'production', 'sandbox', 'custom'
    @track customLoginUrl = '';
    @track customClientId = '3MVG9dAEux2v1sLtSEM4FyBcmzGMke.RrEKCrxlOPo07CEiC2uaKXGv3N7vN.jSWSY6G1o4zjLIkddak6Axk1';
    @track showAdvancedOAuth = false;
    @track showManualTokenInput = false;
    @track manualAccessToken = '';
    @track manualInstanceUrl = '';
    boundHandleOAuthMessage = null;

    @track messages = [];
    @track userInput = '';
    @track loading = false;
    @track history = [];

    // Agreeable & Inspiring Quotes State
    @track currentQuote = AGREEABLE_QUOTES[0];

    // Persona & Multi-Colour Theme State
    @track selectedPersona = 'general';
    @track selectedTheme = 'slate-indigo';
    @track isThemePaletteOpen = false;

    // Temporary Chat Mode (Ephemeral / Incognito)
    @track isTemporaryChat = false;

    // Current Chat Title Inline Editing
    @track isEditingCurrentTitle = false;
    @track currentTitleDraft = '';

    // Session / History State
    @track sessions = [];
    @track historySearchTerm = '';
    @track isHistoryOpen = false;
    @track loadingSessions = false;
    @track currentSessionId = null;
    @track currentSessionTitle = '';
    @track editingSessionId = null;
    @track editingSessionTitleDraft = '';

    // Model API Consumption / Org Limits Monitor
    @track isQuotaModalOpen = false;
    @track apiConsumption = null;

    // UI Interactive States
    @track isListening = false;
    @track liveVoiceTranscript = '';
    @track speakingMsgId = null;
    @track showScrollBottom = false;

    msgId = 0;
    speechRecognition = null;
    voiceBaseInput = '';
    voiceAccumulatedText = '';

    modelOptions = [
        { label: 'GPT 4 Omni', value: 'sfdc_ai__DefaultGPT4Omni' },
        { label: 'GPT 4 Omni Mini (Geo)', value: 'sfdc_ai__DefaultGPT4OmniMini' },
        { label: 'GPT 4 Omni Mini', value: 'sfdc_ai__DefaultOpenAIGPT4OmniMini' },
        { label: 'GPT 4.1', value: 'sfdc_ai__DefaultGPT41' },
        { label: 'GPT 4.1 Mini', value: 'sfdc_ai__DefaultGPT41Mini' },
        { label: 'GPT 5', value: 'sfdc_ai__DefaultGPT5' },
        { label: 'GPT 5 Mini', value: 'sfdc_ai__DefaultGPT5Mini' },
        { label: 'GPT 5.1', value: 'sfdc_ai__DefaultGPT51' },
        { label: 'GPT 5.2', value: 'sfdc_ai__DefaultGPT52' },
        { label: 'O3', value: 'sfdc_ai__DefaultO3' },
        { label: 'O4 Mini', value: 'sfdc_ai__DefaultO4Mini' },
        { label: 'Claude Haiku 4.5', value: 'sfdc_ai__DefaultBedrockAnthropicClaude45Haiku' },
        { label: 'Claude Sonnet 4', value: 'sfdc_ai__DefaultBedrockAnthropicClaude4Sonnet' },
        { label: 'Claude Sonnet 4.5', value: 'sfdc_ai__DefaultBedrockAnthropicClaude45Sonnet' },
        { label: 'Claude Opus 4.5', value: 'sfdc_ai__DefaultBedrockAnthropicClaude45Opus' },
        { label: 'NVIDIA Nemotron Nano 30B (Beta)', value: 'sfdc_ai__DefaultBedrockNvidiaNemotronNano330b' },
        { label: 'Gemini 2.5 Flash', value: 'sfdc_ai__DefaultVertexAIGemini25Flash001' },
        { label: 'Gemini 2.5 Flash Lite', value: 'sfdc_ai__DefaultVertexAIGemini25FlashLite001' },
        { label: 'Gemini 2.5 Pro', value: 'sfdc_ai__DefaultVertexAIGeminiPro25' },
        { label: 'Gemini 3 Flash', value: 'sfdc_ai__DefaultVertexAIGemini30Flash' },
        { label: 'Gemini 3 Pro (Beta)', value: 'sfdc_ai__DefaultVertexAIGeminiPro30' },
        { label: 'Gemini 3.1 Pro (Beta)', value: 'sfdc_ai__DefaultVertexAIGeminiPro31' }
    ];

    selectedModel = 'sfdc_ai__DefaultGPT4Omni';

    // ----------------------------------------------------
    // LIFECYCLE
    // ----------------------------------------------------
    async connectedCallback() {
        this.shuffleRandomQuote();
        this.initSpeechRecognition();
        this.initThemePreference();
        this.boundHandleOAuthMessage = this.handleOAuthMessage.bind(this);
        window.addEventListener('message', this.boundHandleOAuthMessage);
        await this.checkCurrentSession();
        this.fetchApiConsumption();
    }

    disconnectedCallback() {
        if (this.boundHandleOAuthMessage) {
            window.removeEventListener('message', this.boundHandleOAuthMessage);
        }
    }

    // ----------------------------------------------------
    // SESSION ISOLATION & AUTHENTICATION HANDLERS
    // ----------------------------------------------------
    async checkCurrentSession() {
        this.isAuthLoading = true;
        try {
            let token = null;
            try {
                // Strictly read from sessionStorage: isolating each tab & browser instance
                token = window.sessionStorage ? window.sessionStorage.getItem(SESSION_STORAGE_KEY) : null;
            } catch (e) {
                token = null;
            }

            if (token) {
                // Validate session token with Org database
                const user = await validateSession({ sessionToken: token });
                if (user && user.id) {
                    this.currentUser = user;
                    this.sessionToken = token;
                    this.isAuthenticated = true;

                    // Restore previously active screen on refresh (Admin, Community, or Chat)
                    let savedView = null;
                    try {
                        savedView = window.sessionStorage ? window.sessionStorage.getItem(SESSION_VIEW_KEY) : null;
                    } catch (e) {
                        savedView = null;
                    }

                    if (savedView && ['chat', 'admin', 'community'].includes(savedView)) {
                        if (savedView === 'admin' && !user.isAdmin) {
                            this.activeView = 'chat';
                        } else {
                            this.activeView = savedView;
                        }
                    } else if (user.isAdmin) {
                        this.activeView = 'admin';
                    } else {
                        this.activeView = 'chat';
                    }
                    this.persistActiveView(this.activeView);

                    await this.fetchSavedSessions();
                    this.loadConnectedOrgStatus();

                    // Restore previous chat session if user was chatting
                    if (this.activeView === 'chat') {
                        let savedSessionId = null;
                        try {
                            savedSessionId = window.sessionStorage ? window.sessionStorage.getItem(SESSION_CHAT_ID_KEY) : null;
                        } catch (e) {
                            savedSessionId = null;
                        }
                        if (savedSessionId && this.sessions && this.sessions.some((s) => s.id === savedSessionId)) {
                            await this.loadSessionById(savedSessionId, false);
                        }
                    }
                } else {
                    this.clearLocalSession();
                }
            } else {
                this.clearLocalSession();
            }
        } catch (err) {
            console.error('Session validation error:', err);
            this.clearLocalSession();
        } finally {
            this.isAuthLoading = false;
        }
    }

    clearLocalSession() {
        this.currentUser = null;
        this.sessionToken = null;
        this.isAuthenticated = false;
        try {
            if (window.sessionStorage) {
                window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
                window.sessionStorage.removeItem(SESSION_VIEW_KEY);
                window.sessionStorage.removeItem(SESSION_CHAT_ID_KEY);
            }
        } catch (e) {
            // ignore
        }
    }

    persistActiveView(view) {
        try {
            if (window.sessionStorage) {
                window.sessionStorage.setItem(SESSION_VIEW_KEY, view);
            }
        } catch (e) {
            // ignore
        }
    }

    // Child LWC Event Listeners (Event-Driven Communication)
    handleUserLoggedIn(event) {
        const { user, sessionToken, role } = event.detail || {};
        if (user && sessionToken) {
            this.currentUser = user;
            this.sessionToken = sessionToken;
            this.isAuthenticated = true;
            // Direct admin role routing or default chat assistant workspace
            if (role === 'admin' || (user.isAdmin && role !== 'user')) {
                this.activeView = 'admin';
            } else {
                this.activeView = 'chat';
            }
            this.persistActiveView(this.activeView);
            try {
                if (window.sessionStorage) {
                    window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionToken);
                }
            } catch (e) {
                // ignore
            }
            this.fetchSavedSessions();
            this.loadConnectedOrgStatus();
            this.showToast('Welcome', `Signed in as ${user.name}`, 'success');
        }
    }

    handleUserSignedUp(event) {
        const { user, sessionToken } = event.detail || {};
        if (user && sessionToken) {
            this.currentUser = user;
            this.sessionToken = sessionToken;
            this.isAuthenticated = true;
            this.activeView = 'chat';
            this.persistActiveView('chat');
            try {
                if (window.sessionStorage) {
                    window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionToken);
                }
            } catch (e) {
                // ignore
            }
            this.fetchSavedSessions();
            this.loadConnectedOrgStatus();
            this.showToast('Account Created', `Welcome to GenAI Chat, ${user.name}!`, 'success');
        }
    }

    handleSwitchToSignup() {
        this.authView = 'signup';
    }

    handleSwitchToLogin() {
        this.authView = 'login';
    }

    handleSwitchToAdmin() {
        this.activeView = 'admin';
        this.persistActiveView('admin');
        this.isProfileDropdownOpen = false;
    }

    handleSwitchToCommunity() {
        this.communitySubTab = 'community';
        this.activeView = 'community';
        this.persistActiveView('community');
        this.isProfileDropdownOpen = false;
    }

    handleSwitchToDirectMessages() {
        this.communitySubTab = 'directMessages';
        this.activeView = 'community';
        this.persistActiveView('community');
        this.isProfileDropdownOpen = false;
    }

    handleSwitchToChat() {
        this.activeView = 'chat';
        this.persistActiveView('chat');
    }

    async handleLogout() {
        this.isProfileDropdownOpen = false;
        const token = this.sessionToken;
        this.clearLocalSession();
        this.messages = [];
        this.history = [];
        this.sessions = [];
        this.currentSessionId = null;
        this.currentSessionTitle = '';
        this.authView = 'login';
        this.activeView = 'chat';
        this.showToast('Signed Out', 'You have been logged out successfully.', 'info');

        if (token) {
            try {
                await logoutUser({ sessionToken: token });
            } catch (e) {
                // silent
            }
        }
    }

    // ----------------------------------------------------
    // USER PROFILE & PASSWORD MODAL CONTROLS
    // ----------------------------------------------------
    toggleProfileDropdown() {
        this.isProfileDropdownOpen = !this.isProfileDropdownOpen;
    }

    openEditProfileModal() {
        this.isProfileDropdownOpen = false;
        this.editProfileName = this.currentUser?.name || '';
        this.editProfileBio = this.currentUser?.bio || '';
        this.editProfileAvatar = this.currentUser?.avatarIcon || 'standard:user';
        this.editProfilePictureData = this.currentUser?.profilePictureData || '';
        this.profileEditError = '';
        this.profileEditSuccess = '';
        this.isEditProfileModalOpen = true;
    }

    closeEditProfileModal() {
        this.isEditProfileModalOpen = false;
        this.profileEditError = '';
        this.profileEditSuccess = '';
    }

    handleEditProfileNameChange(event) {
        this.editProfileName = event.target.value;
        this.profileEditError = '';
    }

    handleEditProfileBioChange(event) {
        this.editProfileBio = event.target.value;
    }

    handleSelectProfileAvatar(event) {
        const avatar = event.currentTarget.dataset.avatar;
        if (avatar) {
            this.editProfileAvatar = avatar;
        }
    }

    triggerPhotoFileInput() {
        const fileInput = this.template.querySelector('.profile-file-input');
        if (fileInput) {
            fileInput.value = '';
            fileInput.click();
        }
    }

    handleProfilePhotoUpload(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this.profileEditError = 'Please select a valid image file (PNG, JPG, WEBP).';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Resize/downsample to 160x160 JPEG base64 to store easily in Custom Field (~10-15KB)
                const canvas = document.createElement('canvas');
                const size = 160;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                // Fill with white background so transparent PNGs render clean without black backdrops in JPEG
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, size, size);

                let srcX = 0, srcY = 0, srcWidth = img.width, srcHeight = img.height;
                if (img.width > img.height) {
                    srcX = (img.width - img.height) / 2;
                    srcWidth = img.height;
                } else {
                    srcY = (img.height - img.width) / 2;
                    srcHeight = img.width;
                }

                ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, size, size);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                this.editProfilePictureData = dataUrl;
                this.profileEditError = '';
            };
            img.onerror = () => {
                this.profileEditError = 'Failed to process selected image file.';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    handleRemoveProfilePhoto() {
        this.editProfilePictureData = '';
    }

    async handleSaveProfile(event) {
        event.preventDefault();
        if (!this.editProfileName || !this.editProfileName.trim()) {
            this.profileEditError = 'Display Name is required.';
            return;
        }

        this.isSavingProfile = true;
        this.profileEditError = '';
        this.profileEditSuccess = '';

        try {
            const result = await updateUserProfile({
                sessionToken: this.sessionToken,
                fullName: this.editProfileName.trim(),
                bio: (this.editProfileBio || '').trim(),
                avatarIcon: this.editProfileAvatar,
                profilePictureData: this.editProfilePictureData || ''
            });

            if (result && (result.success || result.isSuccess)) {
                this.currentUser = result.user;
                this.profileEditSuccess = 'Profile updated successfully!';
                setTimeout(() => {
                    this.closeEditProfileModal();
                }, 1000);
                this.showToast('Profile Updated', 'Your profile details have been saved.', 'success');
            } else {
                this.profileEditError = result?.message || result?.errorMessage || 'Failed to update profile.';
            }
        } catch (err) {
            this.profileEditError = err?.body?.message || err?.message || 'Error updating profile.';
        } finally {
            this.isSavingProfile = false;
        }
    }

    openChangePasswordModal() {
        this.isProfileDropdownOpen = false;
        this.currentPassword = '';
        this.newPasswordInput = '';
        this.confirmNewPasswordInput = '';
        this.changePasswordError = '';
        this.changePasswordSuccess = '';
        this.isChangePasswordModalOpen = true;
    }

    closeChangePasswordModal() {
        this.isChangePasswordModalOpen = false;
        this.changePasswordError = '';
        this.changePasswordSuccess = '';
    }

    handleCurrentPasswordChange(event) {
        this.currentPassword = event.target.value;
        this.changePasswordError = '';
    }

    handleNewPasswordInputChange(event) {
        this.newPasswordInput = event.target.value;
        this.changePasswordError = '';
    }

    handleConfirmNewPasswordInputChange(event) {
        this.confirmNewPasswordInput = event.target.value;
        this.changePasswordError = '';
    }

    async handleSaveChangePassword(event) {
        event.preventDefault();
        this.changePasswordError = '';
        this.changePasswordSuccess = '';

        if (!this.currentPassword) {
            this.changePasswordError = 'Please enter your current password.';
            return;
        }
        if (!this.newPasswordInput || this.newPasswordInput.length < 6) {
            this.changePasswordError = 'New password must be at least 6 characters long.';
            return;
        }
        if (this.newPasswordInput !== this.confirmNewPasswordInput) {
            this.changePasswordError = 'New passwords do not match.';
            return;
        }

        this.isSavingPassword = true;
        try {
            const result = await changePassword({
                sessionToken: this.sessionToken,
                currentPassword: this.currentPassword,
                newPassword: this.newPasswordInput
            });

            if (result && (result.success || result.isSuccess)) {
                this.changePasswordSuccess = 'Password updated successfully!';
                setTimeout(() => {
                    this.closeChangePasswordModal();
                }, 1200);
                this.showToast('Security', 'Your password has been changed.', 'success');
            } else {
                this.changePasswordError = result?.message || result?.errorMessage || 'Failed to update password.';
            }
        } catch (err) {
            this.changePasswordError = err?.body?.message || err?.message || 'Error changing password.';
        } finally {
            this.isSavingPassword = false;
        }
    }

    // ----------------------------------------------------
    // BRING-YOUR-OWN-ORG (BYOO) OAUTH & CONNECTION HANDLERS
    // ----------------------------------------------------
    async loadConnectedOrgStatus() {
        if (!this.sessionToken) return;
        try {
            const data = await getConnectedOrgDetails({ sessionToken: this.sessionToken });
            if (data) {
                this.connectedOrgData = data;
                if (this.currentUser) {
                    this.currentUser = {
                        ...this.currentUser,
                        isOrgConnected: data.isConnected,
                        connectedOrgInstanceUrl: data.instanceUrl,
                        connectedOrgType: data.orgType,
                        connectedOrgUsername: data.username,
                        connectedOrgConnectedDate: data.connectedDate
                    };
                }
            }
        } catch (e) {
            // Non-blocking status loader
        }
    }

    toggleOrgModal() {
        this.isOrgModalOpen = !this.isOrgModalOpen;
        this.isProfileDropdownOpen = false;
        this.orgModalError = null;
        this.orgModalSuccess = null;
        this.testConnectionResult = null;
        if (this.isOrgModalOpen) {
            this.loadConnectedOrgStatus();
        }
    }

    handleSelectAuthMethod(event) {
        this.orgAuthMethod = event.currentTarget.dataset.method;
        this.orgModalError = null;
        this.orgModalSuccess = null;
    }

    handleEcaInstanceUrlChange(event) {
        this.ecaInstanceUrl = event.target.value;
    }

    handleEcaClientIdChange(event) {
        this.ecaClientId = event.target.value;
    }

    handleEcaClientSecretChange(event) {
        this.ecaClientSecret = event.target.value;
    }

    async handleConnectClientCredentials() {
        const instanceUrl = (this.ecaInstanceUrl || '').trim();
        const clientId = (this.ecaClientId || '').trim();
        const clientSecret = (this.ecaClientSecret || '').trim();

        if (!instanceUrl) {
            this.orgModalError = 'Please enter Org 2 My Domain URL (e.g. https://yourorg.develop.my.salesforce.com).';
            return;
        }
        if (!clientId) {
            this.orgModalError = 'Please enter the Consumer Key (Client ID) from Org 2 External Client App.';
            return;
        }
        if (!clientSecret) {
            this.orgModalError = 'Please enter the Consumer Secret from Org 2 External Client App.';
            return;
        }

        this.isConnectingOrg = true;
        this.orgModalError = null;
        this.orgModalSuccess = null;

        try {
            const result = await connectWithClientCredentials({
                sessionToken: this.sessionToken,
                instanceUrl: instanceUrl,
                clientId: clientId,
                clientSecret: clientSecret
            });

            this.connectedOrgData = result;
            if (this.currentUser) {
                this.currentUser = {
                    ...this.currentUser,
                    isOrgConnected: true,
                    connectedOrgInstanceUrl: result.instanceUrl,
                    connectedOrgType: result.orgType || 'Client Credentials (ECA)',
                    connectedOrgUsername: result.username || 'Client Credentials User',
                    connectedOrgConnectedDate: result.connectedDate
                };
            }

            this.ecaClientSecret = ''; // Clear secret from UI state for security
            this.orgModalSuccess = `Connected to ${result.instanceUrl}! Your chat queries will now execute against this org's Model API using auto-refreshing JWT credentials.`;
            this.showToast('Org Connected!', `Connected via Client Credentials. Model requests now use ${result.instanceUrl}'s Einstein API.`, 'success');
        } catch (err) {
            const msg = err.body?.message || err.message || 'Failed to authenticate with External Client App.';
            this.orgModalError = msg;
            this.showToast('Connection Error', msg, 'error');
        } finally {
            this.isConnectingOrg = false;
        }
    }

    handleSelectOAuthEnv(event) {
        this.oauthLoginType = event.currentTarget.dataset.env;
    }

    handleCustomLoginUrlChange(event) {
        this.customLoginUrl = event.target.value;
    }

    handleClientIdChange(event) {
        this.customClientId = event.target.value;
    }

    toggleAdvancedOAuth() {
        this.showAdvancedOAuth = !this.showAdvancedOAuth;
    }

    toggleManualTokenSection() {
        this.showManualTokenInput = !this.showManualTokenInput;
    }

    handleManualInstanceUrlChange(event) {
        this.manualInstanceUrl = event.target.value;
    }

    handleManualAccessTokenChange(event) {
        this.manualAccessToken = event.target.value;
    }

    handleStartOAuthPopupFlow() {
        this.orgModalError = null;
        this.orgModalSuccess = null;
        this.isConnectingOrg = true;

        let loginDomain = 'https://login.salesforce.com';
        if (this.oauthLoginType === 'sandbox') {
            loginDomain = 'https://test.salesforce.com';
        } else if (this.oauthLoginType === 'custom') {
            if (!this.customLoginUrl) {
                this.orgModalError = 'Please specify your Custom My Domain URL.';
                this.isConnectingOrg = false;
                return;
            }
            loginDomain = this.customLoginUrl.trim();
            if (loginDomain.endsWith('/')) {
                loginDomain = loginDomain.substring(0, loginDomain.length - 1);
            }
        }

        const clientId = (this.customClientId || '').trim();
        if (!clientId) {
            this.orgModalError = 'Consumer Key (Client ID) cannot be empty.';
            this.isConnectingOrg = false;
            return;
        }

        // Determine redirect callback URI
        // Both the Salesforce Experience Site and host org have genAIOAuthCallback deployed
        const isSitesUrl = window.location.origin.includes('salesforce-sites.com');
        const callbackUrl = isSitesUrl
            ? window.location.origin + '/mumodelsarthak/apex/genAIOAuthCallback'
            : window.location.origin + '/apex/genAIOAuthCallback';

        const authorizeUrl = `${loginDomain}/services/oauth2/authorize?` +
            `response_type=token` +
            `&client_id=${encodeURIComponent(clientId)}` +
            `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
            `&prompt=login%20consent` +
            `&display=popup`;

        const width = 640;
        const height = 740;
        const left = Math.max(0, (window.screen.width - width) / 2);
        const top = Math.max(0, (window.screen.height - height) / 2);

        const popup = window.open(
            authorizeUrl,
            'SalesforceOrgOAuthPopup',
            `width=${width},height=${height},top=${top},left=${left},menubar=no,toolbar=no,location=yes,status=yes`
        );

        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            this.orgModalError = 'Popup blocked! Please allow popups for this site in your browser to complete authentication.';
            this.isConnectingOrg = false;
        }
    }

    async handleOAuthMessage(event) {
        if (!event.data || event.data.type !== 'SALESFORCE_ORG_AUTH_RESPONSE') {
            return;
        }

        const data = event.data;
        if (data.error) {
            this.orgModalError = `Authentication Failed: ${data.errorDescription || data.error}`;
            this.isConnectingOrg = false;
            return;
        }

        if (data.accessToken && data.instanceUrl) {
            try {
                this.isConnectingOrg = true;
                const envLabel = this.oauthLoginType === 'sandbox' ? 'Sandbox' : this.oauthLoginType === 'custom' ? 'Custom Domain' : 'Production / Dev';
                const result = await saveConnectedOrg({
                    sessionToken: this.sessionToken,
                    accessToken: data.accessToken,
                    instanceUrl: data.instanceUrl,
                    orgType: envLabel,
                    clientId: this.customClientId,
                    refreshToken: data.refreshToken || null,
                    idUrl: data.id || null
                });

                this.connectedOrgData = result;
                if (this.currentUser) {
                    this.currentUser = {
                        ...this.currentUser,
                        isOrgConnected: true,
                        connectedOrgInstanceUrl: result.instanceUrl,
                        connectedOrgType: result.orgType,
                        connectedOrgUsername: result.username,
                        connectedOrgConnectedDate: result.connectedDate
                    };
                }

                this.orgModalSuccess = `Connected to ${result.username || result.instanceUrl}! Your chat queries will now execute against this org's Model API.`;
                this.showToast('Org Connected!', `Connected to ${result.username || result.instanceUrl}. Model requests now use this org's Einstein API.`, 'success');
            } catch (err) {
                const msg = err.body?.message || err.message || 'Failed to save connected org credentials.';
                this.orgModalError = msg;
                this.showToast('Connection Error', msg, 'error');
            } finally {
                this.isConnectingOrg = false;
            }
        }
    }

    async handleSaveManualToken() {
        if (!this.manualInstanceUrl || !this.manualAccessToken) {
            this.orgModalError = 'Please provide both Instance URL and Access Token.';
            return;
        }
        try {
            this.isConnectingOrg = true;
            this.orgModalError = null;
            const result = await saveConnectedOrg({
                sessionToken: this.sessionToken,
                accessToken: this.manualAccessToken.trim(),
                instanceUrl: this.manualInstanceUrl.trim(),
                orgType: 'Direct Token',
                clientId: this.customClientId,
                refreshToken: null,
                idUrl: null
            });
            this.connectedOrgData = result;
            if (this.currentUser) {
                this.currentUser = {
                    ...this.currentUser,
                    isOrgConnected: true,
                    connectedOrgInstanceUrl: result.instanceUrl,
                    connectedOrgType: result.orgType,
                    connectedOrgUsername: result.username,
                    connectedOrgConnectedDate: result.connectedDate
                };
            }
            this.manualAccessToken = '';
            this.manualInstanceUrl = '';
            this.showManualTokenInput = false;
            this.orgModalSuccess = `Successfully connected to ${result.username || result.instanceUrl}!`;
            this.showToast('Org Connected!', `Connected to ${result.instanceUrl}`, 'success');
        } catch (err) {
            this.orgModalError = err.body?.message || err.message || 'Failed to connect org.';
        } finally {
            this.isConnectingOrg = false;
        }
    }

    async handleDisconnectOrg() {
        this.isDisconnectingOrg = true;
        this.orgModalError = null;
        try {
            await disconnectOrg({ sessionToken: this.sessionToken });
            this.connectedOrgData = null;
            if (this.currentUser) {
                this.currentUser = {
                    ...this.currentUser,
                    isOrgConnected: false,
                    connectedOrgInstanceUrl: null,
                    connectedOrgType: null,
                    connectedOrgUsername: null,
                    connectedOrgConnectedDate: null
                };
            }
            this.showToast('Disconnected', 'Your external org connection has been removed. Queries will now use the host org Model API.', 'info');
        } catch (err) {
            this.orgModalError = err.body?.message || err.message || 'Failed to disconnect org.';
        } finally {
            this.isDisconnectingOrg = false;
        }
    }

    async handleTestConnection() {
        this.isTestingConnection = true;
        this.testConnectionResult = null;
        try {
            const res = await testConnectedOrg({ sessionToken: this.sessionToken });
            this.testConnectionResult = res;
            this.showToast('Connection Test', res, 'success');
        } catch (err) {
            const msg = err.body?.message || err.message || 'Connection test failed.';
            this.testConnectionResult = 'Error: ' + msg;
            this.showToast('Connection Test Failed', msg, 'error');
        } finally {
            this.isTestingConnection = false;
        }
    }

    // ----------------------------------------------------
    // BRING-YOUR-OWN-ORG (BYOO) GETTERS
    // ----------------------------------------------------
    get isUserOrgConnected() {
        return (this.currentUser && this.currentUser.isOrgConnected) || (this.connectedOrgData && this.connectedOrgData.isConnected);
    }

    get connectedOrgInstanceUrl() {
        return this.currentUser?.connectedOrgInstanceUrl || this.connectedOrgData?.instanceUrl || 'Salesforce Org';
    }

    get connectedOrgUsername() {
        return this.currentUser?.connectedOrgUsername || this.connectedOrgData?.username || this.currentUser?.email || '-';
    }

    get connectedOrgType() {
        return this.currentUser?.connectedOrgType || this.connectedOrgData?.orgType || 'Production / Dev';
    }

    get connectedOrgDateFormatted() {
        const d = this.currentUser?.connectedOrgConnectedDate || this.connectedOrgData?.connectedDate;
        return d ? new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Active';
    }

    get connectedOrgBtnClass() {
        return `action-pill-btn org-connection-pill-btn ${this.isUserOrgConnected ? 'active-org-connected' : ''}`;
    }

    get connectedOrgIconName() {
        return this.isUserOrgConnected ? 'utility:success' : 'utility:connected_apps';
    }

    get connectedOrgIconClass() {
        return `pill-icon ${this.isUserOrgConnected ? 'connected-live-icon' : ''}`;
    }

    get connectedOrgBtnLabel() {
        if (this.isUserOrgConnected) {
            const inst = this.connectedOrgInstanceUrl;
            try {
                const u = new URL(inst);
                const hostPart = u.hostname.split('.')[0];
                return `Org: ${hostPart}`;
            } catch (e) {
                return 'Org Connected';
            }
        }
        return 'Connect Org';
    }

    get connectedOrgBtnTitle() {
        return this.isUserOrgConnected
            ? `Connected to ${this.connectedOrgInstanceUrl} (${this.connectedOrgType}). Click to manage connection.`
            : 'Bring Your Own Org: Connect your Salesforce Org via OAuth 2.0 to use your own Model API';
    }

    get connectedOrgMenuLabel() {
        return this.isUserOrgConnected ? `Connected Org (${this.connectedOrgType})` : 'Connect Salesforce Org';
    }

    get isAuthMethodClientCredentials() {
        return this.orgAuthMethod === 'client_credentials';
    }

    get isAuthMethodPopupFlow() {
        return this.orgAuthMethod === 'popup_flow';
    }

    get isAuthMethodManual() {
        return this.orgAuthMethod === 'manual_token';
    }

    get clientCredsTabClass() {
        return `auth-method-tab ${this.isAuthMethodClientCredentials ? 'active' : ''}`;
    }

    get popupFlowTabClass() {
        return `auth-method-tab ${this.isAuthMethodPopupFlow ? 'active' : ''}`;
    }

    get manualTabClass() {
        return `auth-method-tab ${this.isAuthMethodManual ? 'active' : ''}`;
    }

    get productionEnvBtnClass() {
        return `env-pill ${this.oauthLoginType === 'production' ? 'selected' : ''}`;
    }

    get sandboxEnvBtnClass() {
        return `env-pill ${this.oauthLoginType === 'sandbox' ? 'selected' : ''}`;
    }

    get customEnvBtnClass() {
        return `env-pill ${this.oauthLoginType === 'custom' ? 'selected' : ''}`;
    }

    get isCustomEnvSelected() {
        return this.oauthLoginType === 'custom';
    }

    get advancedOAuthChevronIcon() {
        return this.showAdvancedOAuth ? 'utility:chevrondown' : 'utility:chevronright';
    }

    get manualTokenToggleLabel() {
        return this.showManualTokenInput ? '▲ Hide manual token entry' : '▼ Or paste Session ID / Access Token directly';
    }

    get testConnectionButtonLabel() {
        return this.isTestingConnection ? 'Testing...' : 'Test Connection';
    }

    get isLoginView() {
        return this.authView === 'login';
    }

    get isChatView() {
        return this.activeView === 'chat';
    }

    get isAdminView() {
        return this.activeView === 'admin';
    }

    get isCommunityView() {
        return this.activeView === 'community';
    }

    get currentUserIsAdmin() {
        return this.currentUser?.isAdmin === true;
    }

    get currentUserDisplayName() {
        return this.currentUser?.name || 'User';
    }

    get currentUserEmail() {
        return this.currentUser?.email || '';
    }

    get currentUserBio() {
        return this.currentUser?.bio || '';
    }

    get currentUserAvatarIcon() {
        return this.currentUser?.avatarIcon || 'standard:user';
    }

    get currentUserProfilePicture() {
        return this.currentUser?.profilePictureData || '';
    }

    get avatarModalOptions() {
        return AVATAR_OPTIONS_LIST.map((opt) => ({
            ...opt,
            cssClass: opt.name === this.editProfileAvatar ? 'modal-avatar-btn selected' : 'modal-avatar-btn'
        }));
    }

    initThemePreference() {
        try {
            const saved = localStorage.getItem('genai_chat_theme');
            if (saved && ['slate-indigo', 'midnight-dark', 'emerald-teal', 'sunset-amber', 'nordic-frost', 'amethyst-royal'].includes(saved)) {
                this.selectedTheme = saved;
            }
        } catch (e) {
            // localStorage not accessible
        }
    }

    renderedCallback() {
        this.adjustTextareaHeight();
    }

    disconnectedCallback() {
        this.stopSpeechSynthesis();
        if (this.speechRecognition && this.isListening) {
            try {
                this.speechRecognition.stop();
            } catch (e) {
                // Cleanup
            }
        }
    }

    // ----------------------------------------------------
    // GETTERS & COMPUTED PROPERTIES
    // ----------------------------------------------------
    get rootClass() {
        const isDark = this.selectedTheme === 'midnight-dark';
        const viewClass = this.isAuthenticated 
            ? `view-${this.activeView}` 
            : 'view-auth';
        return `genai-root theme-${this.selectedTheme} ${isDark ? 'dark-theme' : ''} ${viewClass}`;
    }

    get formattedModelOptions() {
        const canAccessAdv = this.currentUser ? this.currentUser.canAccessAdvancedModels !== false : true;
        return (this.modelOptions || [])
            .filter((m) => {
                if (!canAccessAdv) {
                    const isAdv = m.label.includes('Opus') || m.label.includes('GPT 5') || m.label.includes('O3');
                    return !isAdv;
                }
                return true;
            })
            .map((m) => ({
                ...m,
                isSelected: m.value === this.selectedModel
            }));
    }

    get themeButtonTitle() {
        const current = this.themeOptions.find((t) => t.id === this.selectedTheme);
        return `Theme: ${current ? current.label : 'Select Theme'}`;
    }

    get activeThemeDotStyle() {
        const current = this.themeOptions.find((t) => t.id === this.selectedTheme);
        return current ? current.gradientStyle : 'background: #4f46e5;';
    }

    get themeOptions() {
        const themes = [
            {
                id: 'slate-indigo',
                label: 'Oceanic Indigo',
                desc: 'Clean slate with electric indigo & violet accents',
                gradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
            },
            {
                id: 'midnight-dark',
                label: 'Midnight Cyber',
                desc: 'Deep obsidian dark mode with neon cyan accents',
                gradient: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)'
            },
            {
                id: 'emerald-teal',
                label: 'Emerald Matrix',
                desc: 'Fresh mint, bio-tech emerald green & teal tones',
                gradient: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)'
            },
            {
                id: 'sunset-amber',
                label: 'Sunset Aurora',
                desc: 'Warm sunset amber, coral red & violet glow',
                gradient: 'linear-gradient(135deg, #ea580c 0%, #e11d48 100%)'
            },
            {
                id: 'nordic-frost',
                label: 'Nordic Frost',
                desc: 'Cool arctic glacier cyan and sky blue tones',
                gradient: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)'
            },
            {
                id: 'amethyst-royal',
                label: 'Royal Amethyst',
                desc: 'Rich royal purple, velvet violet & magenta',
                gradient: 'linear-gradient(135deg, #7c3aed 0%, #c026d3 100%)'
            }
        ];

        return themes.map((t) => {
            const isSelected = t.id === this.selectedTheme;
            return {
                ...t,
                isSelected,
                gradientStyle: `background: ${t.gradient};`,
                cardClass: `theme-option-card ${isSelected ? 'active-theme' : ''}`
            };
        });
    }

    get hasMessages() {
        return this.messages && this.messages.length > 0;
    }

    get isSendDisabled() {
        const hasText = this.userInput && this.userInput.trim();
        return this.loading || !hasText;
    }

    get sessionCountBadge() {
        return this.sessions && this.sessions.length > 0 ? this.sessions.length : null;
    }

    get hasSessions() {
        return this.sessions && this.sessions.length > 0;
    }

    get isHistoryEmpty() {
        return !this.filteredSessions || this.filteredSessions.length === 0;
    }

    get charCountText() {
        const count = this.userInput ? this.userInput.length : 0;
        return `${count} chars`;
    }

    get micButtonClass() {
        return `mic-action-btn ${this.isListening ? 'active-listening' : ''}`;
    }

    get micButtonTitle() {
        return this.isListening ? 'Listening... click to stop' : 'Voice Input (Speech to text)';
    }

    get currentPersonaIconName() {
        if (this.selectedPersona === 'sales') return 'utility:opportunity';
        if (this.selectedPersona === 'service') return 'utility:call';
        if (this.selectedPersona === 'admin') return 'utility:settings';
        return 'utility:bot';
    }

    get isPersonaGeneral() { return this.selectedPersona === 'general'; }
    get isPersonaSales() { return this.selectedPersona === 'sales'; }
    get isPersonaService() { return this.selectedPersona === 'service'; }
    get isPersonaAdmin() { return this.selectedPersona === 'admin'; }

    get temporaryChatBtnClass() {
        return `action-pill-btn temp-chat-pill-btn ${this.isTemporaryChat ? 'active-temp' : ''}`;
    }

    get temporaryChatIconClass() {
        return `pill-icon ${this.isTemporaryChat ? 'active-temp-icon' : ''}`;
    }

    get temporaryChatLabel() {
        return this.isTemporaryChat ? 'Temporary' : 'Temp Chat';
    }

    get temporaryChatBtnTitle() {
        return this.isTemporaryChat 
            ? 'Temporary Chat active: conversations are not saved. Click to disable.' 
            : 'Turn on Temporary Chat (ephemeral session, not saved to history)';
    }

    get displayChatTitle() {
        if (this.currentSessionTitle) return this.currentSessionTitle;
        if (this.isTemporaryChat) return 'Temporary Chat';
        return 'New Conversation';
    }

    get welcomeTaglineText() {
        return 'Intelligence Assistant';
    }

    get inputPlaceholderText() {
        if (this.currentQuote && this.currentQuote.text) {
            return `“${this.currentQuote.text}” — ${this.currentQuote.author}`;
        }
        return "Type your message or question...";
    }

    // ----------------------------------------------------
    // API QUOTA & LIMIT MONITOR GETTERS
    // ----------------------------------------------------
    get quotaButtonLabel() {
        if (!this.apiConsumption) return 'Quota';
        const remainingPct = this.apiConsumption.apiRequestsPercentRemaining != null 
            ? Math.round(this.apiConsumption.apiRequestsPercentRemaining) 
            : 100;
        return `${remainingPct}% Quota`;
    }

    get quotaBtnClass() {
        const st = this.apiConsumption ? this.apiConsumption.status : 'healthy';
        return `action-pill-btn quota-pill-btn quota-${st}`;
    }

    get quotaStatusBadgeText() {
        return this.apiConsumption?.statusLabel || 'Optimal Quota Available';
    }

    get quotaStatusBadgeClass() {
        const st = this.apiConsumption ? this.apiConsumption.status : 'healthy';
        return `quota-status-pill status-${st}`;
    }

    get apiUsageRemainingFormatted() {
        if (!this.apiConsumption || this.apiConsumption.apiRequestsRemaining == null) return '15,000';
        return this.apiConsumption.apiRequestsRemaining.toLocaleString();
    }

    get apiUsageUsedFormatted() {
        if (!this.apiConsumption || this.apiConsumption.apiRequestsUsed == null) return '0';
        return this.apiConsumption.apiRequestsUsed.toLocaleString();
    }

    get apiUsageMaxFormatted() {
        if (!this.apiConsumption || this.apiConsumption.apiRequestsMax == null) return '15,000';
        return this.apiConsumption.apiRequestsMax.toLocaleString();
    }

    get apiPercentRemainingFormatted() {
        if (!this.apiConsumption || this.apiConsumption.apiRequestsPercentRemaining == null) return '100';
        return String(this.apiConsumption.apiRequestsPercentRemaining);
    }

    get apiPercentUsedFormatted() {
        if (!this.apiConsumption || this.apiConsumption.apiRequestsPercentUsed == null) return '0';
        return String(this.apiConsumption.apiRequestsPercentUsed);
    }

    get apiUsageProgressStyle() {
        const pct = this.apiConsumption?.apiRequestsPercentUsed || 1;
        return `width: ${Math.min(100, Math.max(3, pct))}%;`;
    }

    get aiMonthlyRemainingFormatted() {
        if (!this.apiConsumption || this.apiConsumption.aiMonthlyRemaining == null) {
            return '500,000,000 Tokens';
        }
        const val = this.apiConsumption.aiMonthlyRemaining;
        if (val >= 1000000000) return (val / 1000000000).toFixed(1) + 'B Tokens';
        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M Tokens';
        return val.toLocaleString() + ' Tokens';
    }



    get filteredSessions() {
        if (!this.sessions) return [];
        const term = (this.historySearchTerm || '').trim().toLowerCase();
        return this.sessions
            .filter((s) => {
                if (!term) return true;
                const titleMatch = s.title && s.title.toLowerCase().includes(term);
                const previewMatch = s.lastPreview && s.lastPreview.toLowerCase().includes(term);
                return titleMatch || previewMatch;
            })
            .map((s) => {
                const isActive = s.id === this.currentSessionId;
                const isEditing = s.id === this.editingSessionId;
                return {
                    ...s,
                    isEditing,
                    editTitleDraft: isEditing ? this.editingSessionTitleDraft : s.title,
                    cardClass: `session-item ${isActive ? 'active-session' : ''} ${isEditing ? 'editing-session' : ''}`,
                    formattedDate: this.formatRelativeDate(s.lastModified)
                };
            });
    }

    get currentModelLabel() {
        const opt = this.modelOptions.find((m) => m.value === this.selectedModel);
        return opt ? opt.label : 'AI Assistant';
    }

    // ----------------------------------------------------
    // API CONSUMPTION & ORG LIMITS MONITOR
    // ----------------------------------------------------
    async fetchApiConsumption() {
        try {
            const data = await getModelApiConsumption();
            if (data) {
                this.apiConsumption = data;
            }
        } catch (e) {
            // Silently fallback
        }
    }

    toggleQuotaModal() {
        this.isQuotaModalOpen = !this.isQuotaModalOpen;
        if (this.isQuotaModalOpen) {
            this.fetchApiConsumption();
        }
    }

    // ----------------------------------------------------
    // MULTI-COLOUR THEME PALETTE CONTROLS
    // ----------------------------------------------------
    toggleThemePalette() {
        this.isThemePaletteOpen = !this.isThemePaletteOpen;
    }

    handleSelectTheme(event) {
        const themeId = event.currentTarget.dataset.id;
        if (themeId) {
            this.selectedTheme = themeId;
            try {
                localStorage.setItem('genai_chat_theme', themeId);
            } catch (e) {
                // ignore
            }
            this.isThemePaletteOpen = false;
            const chosen = this.themeOptions.find((t) => t.id === themeId);
            this.showToast('Theme Updated', `Theme set to ${chosen ? chosen.label : themeId}`, 'success');
        }
    }

    // ----------------------------------------------------
    // TEMPORARY CHAT TOGGLE
    // ----------------------------------------------------
    toggleTemporaryChat() {
        this.isTemporaryChat = !this.isTemporaryChat;
        if (this.isTemporaryChat) {
            this.showToast(
                'Temporary Chat Enabled',
                'Conversations will not be saved to your history.',
                'info'
            );
        } else {
            this.showToast(
                'Standard Chat Mode',
                'Conversations will be saved automatically.',
                'info'
            );
        }
    }

    // ----------------------------------------------------
    // CURRENT CHAT TITLE EDITING
    // ----------------------------------------------------
    startEditCurrentTitle() {
        this.currentTitleDraft = this.currentSessionTitle || (this.isTemporaryChat ? 'Temporary Chat' : 'New Conversation');
        this.isEditingCurrentTitle = true;
    }

    handleCurrentTitleDraftChange(event) {
        this.currentTitleDraft = event.target.value;
    }

    handleCurrentTitleKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.saveCurrentTitle();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this.cancelEditCurrentTitle();
        }
    }

    async saveCurrentTitle() {
        const trimmed = (this.currentTitleDraft || '').trim();
        if (!trimmed) {
            this.cancelEditCurrentTitle();
            return;
        }

        this.currentSessionTitle = trimmed;
        this.isEditingCurrentTitle = false;

        if (this.currentSessionId && !this.isTemporaryChat && this.sessionToken) {
            try {
                await updateChatSessionTitle({
                    sessionId: this.currentSessionId,
                    newTitle: trimmed,
                    sessionToken: this.sessionToken
                });
                await this.fetchSavedSessions();
                this.showToast('Chat Renamed', `Title updated to "${trimmed}"`, 'success');
            } catch (err) {
                this.showToast('Error', 'Failed to update chat title in org.', 'error');
            }
        }
    }

    cancelEditCurrentTitle() {
        this.isEditingCurrentTitle = false;
        this.currentTitleDraft = '';
    }

    // ----------------------------------------------------
    // PREVIOUS CHAT TITLE EDITING (HISTORY DRAWER)
    // ----------------------------------------------------
    handleStartEditSession(event) {
        event.stopPropagation();
        const sessionId = event.currentTarget.dataset.id;
        const target = this.sessions.find((s) => s.id === sessionId);
        if (target) {
            this.editingSessionId = sessionId;
            this.editingSessionTitleDraft = target.title;
        }
    }

    handleStopPropagation(event) {
        event.stopPropagation();
    }

    handleSessionTitleDraftChange(event) {
        this.editingSessionTitleDraft = event.target.value;
    }

    handleSessionTitleKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.handleSaveSessionTitle(event);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this.handleCancelSessionEdit(event);
        }
    }

    async handleSaveSessionTitle(event) {
        event.stopPropagation();
        const sessionId = event.currentTarget.dataset.id || this.editingSessionId;
        const newTitle = (this.editingSessionTitleDraft || '').trim();

        if (!sessionId || !newTitle) {
            this.editingSessionId = null;
            return;
        }

        try {
            await updateChatSessionTitle({
                sessionId: sessionId,
                newTitle: newTitle,
                sessionToken: this.sessionToken
            });

            if (this.currentSessionId === sessionId) {
                this.currentSessionTitle = newTitle;
            }

            this.editingSessionId = null;
            await this.fetchSavedSessions();
            this.showToast('Renamed', `Session title updated to "${newTitle}"`, 'success');
        } catch (err) {
            this.showToast('Error', 'Failed to update session title.', 'error');
        }
    }

    handleCancelSessionEdit(event) {
        if (event) event.stopPropagation();
        this.editingSessionId = null;
        this.editingSessionTitleDraft = '';
    }

    // ----------------------------------------------------
    // CHAT MESSAGE EDITING & RE-EXECUTION
    // ----------------------------------------------------
    handleStartEditMessage(event) {
        const msgId = Number(event.currentTarget.dataset.id);
        this.messages = this.messages.map((m) => {
            if (m.id === msgId) {
                return {
                    ...m,
                    isEditing: true,
                    editContentDraft: m.rawContent || m.content
                };
            }
            return {
                ...m,
                isEditing: false
            };
        });
    }

    handleUserMessageEditInput(event) {
        const msgId = Number(event.currentTarget.dataset.id);
        const val = event.target.value;
        this.messages = this.messages.map((m) => {
            if (m.id === msgId) {
                return { ...m, editContentDraft: val };
            }
            return m;
        });
    }

    handleUserMessageEditKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleSaveAndResubmitMessage(event);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this.handleCancelEditMessage(event);
        }
    }

    handleCancelEditMessage(event) {
        const msgId = Number(event.currentTarget.dataset.id);
        this.messages = this.messages.map((m) => {
            if (m.id === msgId) {
                return { ...m, isEditing: false };
            }
            return m;
        });
    }

    async handleSaveAndResubmitMessage(event) {
        const msgId = Number(event.currentTarget.dataset.id);
        const targetMsg = this.messages.find((m) => m.id === msgId);
        if (!targetMsg) return;

        const newText = (targetMsg.editContentDraft || '').trim();
        if (!newText) {
            this.showToast('Empty Message', 'Please enter a question or query.', 'warning');
            return;
        }

        const targetIndex = this.messages.findIndex((m) => m.id === msgId);
        const updatedMsg = {
            ...targetMsg,
            rawContent: newText,
            content: newText,
            isEditing: false
        };

        // Truncate messages from this point onward
        this.messages = [...this.messages.slice(0, targetIndex), updatedMsg];

        // Rebuild conversation history strictly up to this turn
        this.history = [];
        for (let i = 0; i <= targetIndex; i++) {
            const m = this.messages[i];
            if (m.isUser) {
                this.history.push('USER:' + (m.rawContent || m.content));
            } else if (m.role === 'ai') {
                this.history.push('AI:' + (m.rawContent || m.content));
            }
        }

        // Rerun AI with edited prompt and history
        await this.executeAiGeneration(newText, this.history);
    }

    // ----------------------------------------------------
    // THEME & PERSONA HANDLERS
    // ----------------------------------------------------
    toggleTheme() {
        this.isDarkTheme = !this.isDarkTheme;
    }

    handlePersonaChange(event) {
        this.selectedPersona = event.target.value;
        const labels = {
            general: 'All-Around Intelligence',
            sales: 'Sales Strategist',
            service: 'Support Lead',
            admin: 'Admin & Architect'
        };
        this.showToast('Persona Activated', `AI tone adapted to: ${labels[this.selectedPersona]}`, 'info');
    }

    // ----------------------------------------------------
    // AGREEABLE QUOTE ROTATION
    // ----------------------------------------------------
    shuffleRandomQuote() {
        const list = AGREEABLE_QUOTES;
        let nextIndex = Math.floor(Math.random() * list.length);
        if (list.length > 1 && this.currentQuote && list[nextIndex].text === this.currentQuote.text) {
            nextIndex = (nextIndex + 1) % list.length;
        }
        this.currentQuote = list[nextIndex];
    }

    handleFollowUpClick(event) {
        const prompt = event.currentTarget.dataset.prompt;
        if (prompt) {
            this.userInput = prompt;
            this.sendMessage();
        }
    }

    // ----------------------------------------------------
    // SPEECH RECOGNITION (VOICE INPUT & LIVE STREAMING)
    // ----------------------------------------------------
    initSpeechRecognition() {
        const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognitionClass) {
            this.speechRecognition = new SpeechRecognitionClass();
            this.speechRecognition.continuous = true;
            this.speechRecognition.interimResults = true;
            this.speechRecognition.lang = 'en-US';

            this.speechRecognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcriptPiece = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcriptPiece + ' ';
                    } else {
                        interimTranscript += transcriptPiece;
                    }
                }

                if (finalTranscript) {
                    this.voiceAccumulatedText = (this.voiceAccumulatedText || '') + finalTranscript;
                }

                const currentCombined = ((this.voiceAccumulatedText || '') + interimTranscript).trim();
                this.liveVoiceTranscript = currentCombined;

                // Live stream directly into user input in real time as user speaks!
                const basePrefix = this.voiceBaseInput ? this.voiceBaseInput.trim() + ' ' : '';
                this.userInput = basePrefix + currentCombined;
                this.adjustTextareaHeight();
                this.scrollToBottom();
            };

            this.speechRecognition.onerror = (event) => {
                console.warn('Speech recognition status:', event.error);
                if (event.error !== 'no-speech') {
                    this.isListening = false;
                }
            };

            this.speechRecognition.onend = () => {
                // If user didn't explicitly terminate, keep streaming alive
                if (this.isListening) {
                    try {
                        this.speechRecognition.start();
                    } catch (e) {
                        this.isListening = false;
                    }
                }
            };
        }
    }

    handleToggleSpeechRecognition() {
        if (!this.speechRecognition) {
            this.initSpeechRecognition();
        }
        if (!this.speechRecognition) {
            this.showToast('Voice Input', 'Speech recognition is not supported in this browser.', 'info');
            return;
        }

        if (this.isListening) {
            this.stopSpeechRecognition();
        } else {
            this.startSpeechRecognition();
        }
    }

    startSpeechRecognition() {
        this.voiceBaseInput = this.userInput || '';
        this.voiceAccumulatedText = '';
        this.liveVoiceTranscript = '';
        this.isListening = true;
        try {
            this.speechRecognition.start();
            this.showToast('Voice Typing Active', 'Speak now — live transcription will stream directly into the chat.', 'info');
            this.scrollToBottom();
        } catch (err) {
            console.error('Error starting speech recognition:', err);
            this.isListening = false;
        }
    }

    stopSpeechRecognition() {
        this.isListening = false;
        if (this.speechRecognition) {
            try {
                this.speechRecognition.stop();
            } catch (e) {}
        }
    }

    handleFinishVoiceInput() {
        this.stopSpeechRecognition();
        this.showToast('Voice Input Completed', 'Transcription inserted into your chat composer.', 'success');
    }

    handleCancelVoiceInput() {
        this.userInput = this.voiceBaseInput || '';
        this.liveVoiceTranscript = '';
        this.stopSpeechRecognition();
    }

    // ----------------------------------------------------
    // TEXT TO SPEECH (READ ALOUD)
    // ----------------------------------------------------
    handleToggleSpeak(event) {
        const msgId = Number(event.currentTarget.dataset.id);
        const msg = this.messages.find((m) => m.id === msgId);
        if (!msg || !('speechSynthesis' in window)) {
            this.showToast('Audio', 'Text to speech is not available in this browser.', 'info');
            return;
        }

        if (this.speakingMsgId === msgId) {
            this.stopSpeechSynthesis();
            return;
        }

        this.stopSpeechSynthesis();

        const cleanText = msg.rawContent || msg.content.replace(/<[^>]+>/g, ' ');
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        utterance.onend = () => {
            this.speakingMsgId = null;
            this.updateMessageVoiceStates();
        };
        utterance.onerror = () => {
            this.speakingMsgId = null;
            this.updateMessageVoiceStates();
        };

        this.speakingMsgId = msgId;
        this.updateMessageVoiceStates();
        window.speechSynthesis.speak(utterance);
    }

    stopSpeechSynthesis() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        this.speakingMsgId = null;
        this.updateMessageVoiceStates();
    }

    updateMessageVoiceStates() {
        this.messages = this.messages.map((m) => {
            if (m.isUser) return m;
            const isThisSpeaking = m.id === this.speakingMsgId;
            return {
                ...m,
                isSpeaking: isThisSpeaking,
                speakLabel: isThisSpeaking ? 'Stop' : 'Listen',
                speakIconName: isThisSpeaking ? 'utility:volume_off' : 'utility:volume_high',
                speakButtonClass: `action-chip ${isThisSpeaking ? 'speaking' : ''}`
            };
        });
    }

    // ----------------------------------------------------
    // VS CODE STYLE CODE COPY & GENERAL ACTIONS
    // ----------------------------------------------------
    handleCopyCodeBlock(event) {
        event.stopPropagation();
        const codeToCopy = event.currentTarget.dataset.code;
        const msgId = Number(event.currentTarget.dataset.msgid);
        const blockId = event.currentTarget.dataset.blockid;

        if (!codeToCopy) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(codeToCopy).then(() => {
                this.markCodeBlockCopied(msgId, blockId);
            });
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = codeToCopy;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.markCodeBlockCopied(msgId, blockId);
        }
    }

    markCodeBlockCopied(msgId, blockId) {
        this.messages = this.messages.map((m) => {
            if (m.id === msgId && m.renderBlocks) {
                const updatedBlocks = m.renderBlocks.map((b) => {
                    if (b.id === blockId) {
                        return {
                            ...b,
                            copyLabel: 'Copied!',
                            copyIconName: 'utility:check',
                            copyBtnClass: 'vscode-copy-btn copied'
                        };
                    }
                    return b;
                });
                return { ...m, renderBlocks: updatedBlocks };
            }
            return m;
        });

        setTimeout(() => {
            this.messages = this.messages.map((m) => {
                if (m.id === msgId && m.renderBlocks) {
                    const resetBlocks = m.renderBlocks.map((b) => {
                        if (b.id === blockId) {
                            return {
                                ...b,
                                copyLabel: 'Copy code',
                                copyIconName: 'utility:copy',
                                copyBtnClass: 'vscode-copy-btn'
                            };
                        }
                        return b;
                    });
                    return { ...m, renderBlocks: resetBlocks };
                }
                return m;
            });
        }, 2200);
    }

    handleCopyMessage(event) {
        const msgId = Number(event.currentTarget.dataset.id);
        const msg = this.messages.find((m) => m.id === msgId);
        if (!msg) return;

        const textToCopy = msg.rawContent || msg.content.replace(/<[^>]+>/g, '');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                this.markMessageCopied(msgId);
            });
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = textToCopy;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.markMessageCopied(msgId);
        }
    }

    markMessageCopied(msgId) {
        this.messages = this.messages.map((m) => {
            if (m.id === msgId) {
                return {
                    ...m,
                    isCopied: true,
                    copyLabel: 'Copied!',
                    copyIconName: 'utility:check',
                    copyButtonClass: 'action-chip copied'
                };
            }
            return m;
        });

        setTimeout(() => {
            this.messages = this.messages.map((m) => {
                if (m.id === msgId) {
                    return {
                        ...m,
                        isCopied: false,
                        copyLabel: 'Copy',
                        copyIconName: 'utility:copy',
                        copyButtonClass: 'action-chip'
                    };
                }
                return m;
            });
        }, 2200);
    }

    handleLikeMessage(event) {
        const msgId = Number(event.currentTarget.dataset.id);
        this.messages = this.messages.map((m) => {
            if (m.id === msgId) {
                const wasLiked = m.liked;
                return {
                    ...m,
                    liked: !wasLiked,
                    disliked: false,
                    likeButtonClass: `feedback-btn ${!wasLiked ? 'active-like' : ''}`,
                    dislikeButtonClass: 'feedback-btn'
                };
            }
            return m;
        });
    }

    handleDislikeMessage(event) {
        const msgId = Number(event.currentTarget.dataset.id);
        this.messages = this.messages.map((m) => {
            if (m.id === msgId) {
                const wasDisliked = m.disliked;
                return {
                    ...m,
                    disliked: !wasDisliked,
                    liked: false,
                    likeButtonClass: 'feedback-btn',
                    dislikeButtonClass: `feedback-btn ${!wasDisliked ? 'active-dislike' : ''}`
                };
            }
            return m;
        });
    }

    handleExportChat() {
        if (!this.messages || this.messages.length === 0) {
            this.showToast('Export Chat', 'There are no messages in the current conversation to export.', 'info');
            return;
        }

        let exportText = `# ${this.displayChatTitle}\n\n`;
        exportText += `> **Model:** ${this.currentModelLabel} | **Persona:** ${this.selectedPersona}\n`;
        exportText += `> **Export Date:** ${new Date().toLocaleString()}\n\n`;
        exportText += `---\n\n`;

        this.messages.forEach((m) => {
            const sender = m.isUser ? '### 👤 User' : `### 🤖 ${m.modelLabel || 'AI Assistant'}`;
            const time = m.timeStr ? ` *(${m.timeStr})*` : '';
            const latency = m.latencyStr ? ` \`⚡ ${m.latencyStr}\`` : '';
            exportText += `${sender}${time}${latency}\n\n`;
            exportText += `${m.rawContent || m.content}\n\n`;
            if (m.hasTableData) {
                exportText += `> **Salesforce Data Record Context:** \`${m.tableData.objectType}\` (${m.tableData.totalRecords} records)\n`;
                exportText += `\`\`\`soql\n${m.tableData.soql}\n\`\`\`\n\n`;
            }
            exportText += `---\n\n`;
        });

        const blob = new Blob([exportText], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const cleanTitle = (this.displayChatTitle || 'chat_transcript').replace(/[^a-zA-Z0-9_-]/g, '_');
        a.download = `${cleanTitle}_${Date.now()}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('Exported', 'Chat session exported as Markdown (.md).', 'success');
    }

    // ----------------------------------------------------
    // CHAT SESSIONS & CUSTOM OBJECT PERSISTENCE
    // ----------------------------------------------------
    async fetchSavedSessions() {
        if (!this.sessionToken) {
            this.sessions = [];
            return;
        }
        this.loadingSessions = true;
        try {
            const data = await getChatSessions({ sessionToken: this.sessionToken });
            this.sessions = data || [];
        } catch (error) {
            // Error handled
        } finally {
            this.loadingSessions = false;
        }
    }

    async persistCurrentSession() {
        if (this.isTemporaryChat) return; // Do not persist in temporary chat mode
        if (!this.messages || this.messages.length === 0) return;

        if (!this.currentSessionTitle) {
            const firstUserMsg = this.messages.find((m) => m.isUser);
            if (firstUserMsg) {
                this.currentSessionTitle = (firstUserMsg.rawContent || 'New Conversation').slice(0, 80);
            } else {
                this.currentSessionTitle = 'Intelligence Conversation';
            }
        }

        const lastMsg = this.messages[this.messages.length - 1];
        const preview = (lastMsg.rawContent || lastMsg.content || '').slice(0, 160);
        const serialized = JSON.stringify(
            this.messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                rawContent: m.rawContent,
                timeStr: m.timeStr,
                modelLabel: m.modelLabel,
                hasTableData: m.hasTableData,
                tableData: m.tableData,
                tableColumns: m.tableColumns,
                tableRows: m.tableRows,
                chartBars: m.chartBars,
                followUps: m.followUps
            }))
        );

        try {
            const savedId = await saveChatSession({
                sessionId: this.currentSessionId,
                title: this.currentSessionTitle,
                modelName: this.selectedModel,
                messagesJson: serialized,
                messageCount: this.messages.length,
                lastMessagePreview: preview,
                sessionToken: this.sessionToken
            });

            this.currentSessionId = savedId;
            this.fetchSavedSessions();
        } catch (err) {
            // Handled
        }
    }

    async handleSelectSession(event) {
        const sessionId = event.currentTarget.dataset.id;
        if (!sessionId) return;
        await this.loadSessionById(sessionId, true);
    }

    async loadSessionById(sessionId, showNotification = true) {
        if (!sessionId) return;
        this.loadingSessions = true;
        try {
            const sessionData = await getChatSession({ sessionId, sessionToken: this.sessionToken });
            if (sessionData && sessionData.messagesJson) {
                const parsed = JSON.parse(sessionData.messagesJson);
                this.messages = parsed.map((m) => this.rehydrateMessage(m));
                this.currentSessionId = sessionData.id;
                this.currentSessionTitle = sessionData.title;
                if (sessionData.model) {
                    this.selectedModel = sessionData.model;
                }

                this.history = [];
                this.messages.forEach((m) => {
                    if (m.isUser) {
                        this.history.push('USER:' + (m.rawContent || m.content));
                    } else if (m.role === 'ai') {
                        this.history.push('AI:' + (m.rawContent || m.content));
                    }
                });

                this.isHistoryOpen = false;
                try {
                    if (window.sessionStorage) {
                        window.sessionStorage.setItem(SESSION_CHAT_ID_KEY, sessionId);
                    }
                } catch (e) {
                    // ignore
                }
                this.scrollToBottom();
                if (showNotification) {
                    this.showToast('Session Loaded', `Loaded "${sessionData.title}"`, 'success');
                }
            }
        } catch (err) {
            if (showNotification) {
                this.showToast('Error', 'Unable to load chat session.', 'error');
            }
        } finally {
            this.loadingSessions = false;
        }
    }

    rehydrateMessage(m) {
        const isUser = m.role === 'user';
        const raw = m.rawContent || m.content;
        return {
            id: ++this.msgId,
            content: m.content,
            rawContent: raw,
            role: m.role,
            roleClass: isUser ? 'user-msg' : m.role === 'ai' ? 'ai-msg' : 'error-msg',
            isUser: isUser,
            isEditing: false,
            editDraft: raw,
            renderBlocks: !isUser ? this.parseContentIntoBlocks(raw) : [],
            modelLabel: m.modelLabel || this.currentModelLabel,
            timeStr: m.timeStr || this.getCurrentTimeStr(),
            hasTableData: !!m.hasTableData,
            tableData: m.tableData || null,
            tableColumns: m.tableColumns || [],
            tableRows: m.tableRows || [],
            chartBars: m.chartBars || [],
            showChart: false,
            tableViewBtnClass: 'view-toggle-btn active-view',
            chartViewBtnClass: 'view-toggle-btn',
            followUps: m.followUps || null,
            isCopied: false,
            copyLabel: 'Copy',
            copyIconName: 'utility:copy',
            copyButtonClass: 'action-chip',
            isSpeaking: false,
            speakLabel: 'Listen',
            speakIconName: 'utility:volume_high',
            speakButtonClass: 'action-chip',
            liked: false,
            disliked: false,
            likeButtonClass: 'feedback-btn',
            dislikeButtonClass: 'feedback-btn'
        };
    }

    async handleDeleteSession(event) {
        event.stopPropagation();
        const sessionId = event.currentTarget.dataset.id;
        if (!sessionId) return;

        try {
            await deleteChatSession({ sessionId, sessionToken: this.sessionToken });
            if (this.currentSessionId === sessionId) {
                this.handleNewChat();
            }
            this.fetchSavedSessions();
            this.showToast('Deleted', 'Conversation removed from history.', 'info');
        } catch (err) {
            this.showToast('Error', 'Failed to delete session.', 'error');
        }
    }

    async handleClearAllSessions() {
        try {
            await clearAllChatSessions({ sessionToken: this.sessionToken });
            this.sessions = [];
            this.handleNewChat();
            this.showToast('Cleared', 'All conversation history cleared.', 'info');
        } catch (err) {
            this.showToast('Error', 'Failed to clear history.', 'error');
        }
    }

    toggleHistoryDrawer() {
        this.isHistoryOpen = !this.isHistoryOpen;
        if (this.isHistoryOpen) {
            this.fetchSavedSessions();
        }
    }

    handleSearchHistory(event) {
        this.historySearchTerm = event.target.value;
    }

    handleClearSearch() {
        this.historySearchTerm = '';
    }

    // ----------------------------------------------------
    // USER INPUT & SENDING
    // ----------------------------------------------------
    handleModelChange(event) {
        this.selectedModel = event.target?.value || event.detail?.value;
        const modelLabel = this.modelOptions.find((m) => m.value === this.selectedModel)?.label || this.selectedModel;
        this.showToast('Model Switched', `Active model: ${modelLabel}`, 'success');
    }

    handleInputChange(event) {
        this.userInput = event.target.value;
        this.adjustTextareaHeight();
    }

    handleKeyDown(event) {
        if (event.key === 'Enter') {
            if (event.shiftKey) {
                return;
            }
            event.preventDefault();
            this.sendMessage();
        }
    }

    adjustTextareaHeight() {
        const textarea = this.template.querySelector('.native-chat-textarea');
        if (textarea) {
            textarea.style.height = 'auto';
            const newHeight = Math.min(Math.max(textarea.scrollHeight, 40), 120);
            textarea.style.height = `${newHeight}px`;
        }
    }

    handleQuickPromptClick(event) {
        const prompt = event.currentTarget.dataset.prompt;
        if (prompt) {
            this.userInput = prompt;
            this.sendMessage();
        }
    }

    handleNewChat() {
        this.stopSpeechSynthesis();
        this.messages = [];
        this.history = [];
        this.userInput = '';
        this.loading = false;
        this.msgId = 0;
        this.currentSessionId = null;
        this.currentSessionTitle = '';
        this.isEditingCurrentTitle = false;
        try {
            if (window.sessionStorage) {
                window.sessionStorage.removeItem(SESSION_CHAT_ID_KEY);
            }
        } catch (e) {
            // ignore
        }
        this.adjustTextareaHeight();
        this.shuffleRandomQuote();
    }

    handleClearCurrentChat() {
        this.stopSpeechSynthesis();
        this.messages = [];
        this.history = [];
        this.currentSessionId = null;
        this.currentSessionTitle = '';
        this.isEditingCurrentTitle = false;
        try {
            if (window.sessionStorage) {
                window.sessionStorage.removeItem(SESSION_CHAT_ID_KEY);
            }
        } catch (e) {
            // ignore
        }
        this.showToast('Cleared', 'Current screen cleared.', 'info');
    }

    addMessage(role, content, rawContent = '', tableData = null, followUps = null, latencyStr = null) {
        const isUser = role === 'user';
        let hasTableData = false;
        let tableColumns = [];
        let tableRows = [];
        let chartBars = [];

        if (tableData && tableData.records && tableData.records.length > 0) {
            hasTableData = true;
            const records = tableData.records;
            const firstRow = records[0];
            tableColumns = Object.keys(firstRow).filter((k) => k !== 'sObjectType');

            tableRows = records.map((r) => {
                const cells = tableColumns.map((colKey) => {
                    const isNameOrId = colKey === 'Name' || colKey === 'Id' || colKey.endsWith('Number');
                    return {
                        key: `${r.Id}_${colKey}`,
                        value: r[colKey] !== undefined && r[colKey] !== null ? String(r[colKey]) : '-',
                        isRecordLink: isNameOrId && !!r.Id,
                        recordId: r.Id
                    };
                });
                return {
                    Id: r.Id || Math.random().toString(),
                    cells
                };
            });

            chartBars = this.calculateChartBars(records, tableColumns);
        }

        const raw = rawContent || content;
        const renderBlocks = !isUser ? this.parseContentIntoBlocks(raw) : [];

        const msg = {
            id: ++this.msgId,
            content,
            rawContent: raw,
            role,
            roleClass: isUser ? 'user-msg' : role === 'ai' ? 'ai-msg' : 'error-msg',
            isUser: isUser,
            isEditing: false,
            editDraft: raw,
            renderBlocks,
            modelLabel: isUser ? 'You' : this.currentModelLabel,
            timeStr: this.getCurrentTimeStr(),
            latencyStr,
            hasTableData,
            tableData,
            tableColumns,
            tableRows,
            chartBars,
            showChart: false,
            tableViewBtnClass: 'view-toggle-btn active-view',
            chartViewBtnClass: 'view-toggle-btn',
            followUps,
            isCopied: false,
            copyLabel: 'Copy',
            copyIconName: 'utility:copy',
            copyButtonClass: 'action-chip',
            isSpeaking: false,
            speakLabel: 'Listen',
            speakIconName: 'utility:volume_high',
            speakButtonClass: 'action-chip',
            liked: false,
            disliked: false,
            likeButtonClass: 'feedback-btn',
            dislikeButtonClass: 'feedback-btn'
        };

        this.messages = [...this.messages, msg];
        this.scrollToBottom();
        return msg;
    }

    calculateChartBars(records, columns) {
        let catCol = columns.find((c) => ['StageName', 'Status', 'Industry', 'Type', 'Priority', 'LeadSource'].includes(c));
        if (!catCol && columns.length > 1) {
            catCol = columns[1];
        }
        if (!catCol) return [];

        const counts = {};
        records.forEach((r) => {
            const val = r[catCol] ? String(r[catCol]) : 'Other';
            counts[val] = (counts[val] || 0) + 1;
        });

        const total = records.length;
        return Object.keys(counts).map((label) => {
            const count = counts[label];
            const pct = Math.round((count / total) * 100);
            return {
                label,
                value: count,
                valueFormatted: `${count} (${pct}%)`,
                fillStyle: `width: ${Math.max(pct, 5)}%`
            };
        });
    }

    async sendMessage() {
        if (this.isSendDisabled) return;

        if (this.currentUser && this.currentUser.canChat === false) {
            this.showToast('Access Restricted', 'Your account does not have permission to initiate chat sessions. Please contact your administrator.', 'error');
            return;
        }

        let inputText = (this.userInput || '').trim();
        this.userInput = '';
        this.adjustTextareaHeight();

        const inputField = this.template.querySelector('.native-chat-textarea');
        if (inputField) {
            inputField.value = '';
            inputField.style.height = '40px';
        }

        this.addMessage('user', inputText, inputText);
        this.history.push('USER:' + inputText);

        await this.executeAiGeneration(inputText, this.history);
    }

    // Reusable Central Generation Runner
    async executeAiGeneration(inputText, historyList) {
        this.loading = true;
        this.scrollToBottom();
        const startTime = Date.now();

        try {
            const response = await getAIResponseAdvanced({
                userMessage: inputText,
                modelName: this.selectedModel,
                history: (historyList || this.history).slice(-10),
                persona: this.selectedPersona,
                recordContext: null,
                fileName: null,
                fileType: null,
                fileContent: null,
                sessionToken: this.sessionToken
            });

            const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
            const latencyStr = `${durationSec}s`;

            let tableData = null;
            let followUps = null;
            let textToDisplay = response;

            const startTag = '<!--SF_DATA_START-->';
            const endTag = '<!--SF_DATA_END-->';
            if (textToDisplay && textToDisplay.includes(startTag) && textToDisplay.includes(endTag)) {
                const startIndex = textToDisplay.indexOf(startTag);
                const endIndex = textToDisplay.indexOf(endTag);
                const jsonStr = textToDisplay.substring(startIndex + startTag.length, endIndex);
                try {
                    tableData = JSON.parse(jsonStr);
                    textToDisplay = textToDisplay.substring(0, startIndex) + textToDisplay.substring(endIndex + endTag.length);
                } catch (e) {
                    // Fallback
                }
            }

            const fuStart = '<!--FOLLOW_UPS_START-->';
            const fuEnd = '<!--FOLLOW_UPS_END-->';
            if (textToDisplay && textToDisplay.includes(fuStart) && textToDisplay.includes(fuEnd)) {
                const sIdx = textToDisplay.indexOf(fuStart);
                const eIdx = textToDisplay.indexOf(fuEnd);
                const fuJson = textToDisplay.substring(sIdx + fuStart.length, eIdx);
                try {
                    followUps = JSON.parse(fuJson);
                    textToDisplay = textToDisplay.substring(0, sIdx) + textToDisplay.substring(eIdx + fuEnd.length);
                } catch (e) {
                    // Fallback
                }
            }

            const formattedResponse = this.formatResponse(textToDisplay);
            this.addMessage('ai', formattedResponse, textToDisplay, tableData, followUps, latencyStr);
            this.history.push('AI:' + textToDisplay);

            this.persistCurrentSession();
            this.fetchApiConsumption();
        } catch (error) {
            const errorMsg = error.body?.message || error.message || 'An unexpected error occurred.';
            this.addMessage('error', `Error: ${errorMsg}`, errorMsg);
        } finally {
            this.loading = false;
            this.scrollToBottom();
        }
    }

    // ----------------------------------------------------
    // SCROLLING & UI HELPERS
    // ----------------------------------------------------
    scrollToBottom() {
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            const chatBody = this.template.querySelector('.chat-body');
            if (chatBody) {
                chatBody.scrollTop = chatBody.scrollHeight;
            }
            this.showScrollBottom = false;
        }, 120);
    }

    handleScroll(event) {
        const target = event.target;
        const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
        this.showScrollBottom = distanceFromBottom > 160;
    }

    getCurrentTimeStr() {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    formatRelativeDate(dateVal) {
        if (!dateVal) return '';
        const d = new Date(dateVal);
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMin / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title,
                message,
                variant
            })
        );
    }

    // ----------------------------------------------------
    // ----------------------------------------------------
    // VS CODE PARSER: BREAKS TEXT & CODE INTO CHUNKS
    // ----------------------------------------------------
    parseContentIntoBlocks(rawText) {
        if (!rawText) return [];

        const blocks = [];
        const codeBlockRegex = /```([a-zA-Z0-9_#-]+)?\r?\n([\s\S]*?)```/g;
        let lastIndex = 0;
        let match;
        let blockCounter = 0;

        while ((match = codeBlockRegex.exec(rawText)) !== null) {
            // Text preceding code block
            if (match.index > lastIndex) {
                const textChunk = rawText.substring(lastIndex, match.index).trim();
                if (textChunk) {
                    const formatted = this.formatResponse(textChunk);
                    if (formatted) {
                        blocks.push({
                            id: `blk_${blockCounter++}`,
                            isCode: false,
                            content: formatted
                        });
                    }
                }
            }

            // The code block itself
            const lang = (match[1] || 'code').trim().toLowerCase();
            const code = match[2] || '';

            blocks.push({
                id: `blk_${blockCounter++}`,
                isCode: true,
                language: lang.toUpperCase(),
                rawCode: code.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, ''),
                copyLabel: 'Copy code',
                copyIconName: 'utility:copy',
                copyBtnClass: 'vscode-copy-btn'
            });

            lastIndex = match.index + match[0].length;
        }

        // Remaining text after last code block
        if (lastIndex < rawText.length) {
            const remaining = rawText.substring(lastIndex).trim();
            if (remaining) {
                const formatted = this.formatResponse(remaining);
                if (formatted) {
                    blocks.push({
                        id: `blk_${blockCounter++}`,
                        isCode: false,
                        content: formatted
                    });
                }
            }
        }

        if (blocks.length === 0) {
            blocks.push({
                id: `blk_0`,
                isCode: false,
                content: this.formatResponse(rawText) || ''
            });
        }

        return blocks;
    }

    // ----------------------------------------------------
    // RICH MARKDOWN & TEXT FORMATTER
    // ----------------------------------------------------
    formatResponse(text) {
        if (!text) return '';

        let out = text;

        // 0. Normalize CRLF and strip trailing whitespace on each line
        out = out.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');

        // 1. Remove empty lines containing only whitespace
        out = out.replace(/^[ \t]+$/gm, '');

        // 2. Strip raw horizontal dividers at the very start or very end of the response
        out = out.replace(/^\s*(?:[-*_]\s*){3,}\n*/g, '');
        out = out.replace(/\n*(?:[-*_]\s*){3,}\s*$/g, '');

        // 3. Markdown Links [Text](URL)
        out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');

        // 4. Markdown Tables (| Col1 | Col2 |\n|---|---|\n| Val1 | Val2 |)
        out = this.parseMarkdownTables(out);

        // 5. Headings (# H1, ## H2, ### H3, #### H4)
        out = out
            .replace(/^####[ \t]+(.*$)/gim, '<h4 class="md-h4">$1</h4>')
            .replace(/^###[ \t]+(.*$)/gim, '<h3 class="md-h3">$1</h3>')
            .replace(/^##[ \t]+(.*$)/gim, '<h2 class="md-h2">$1</h2>')
            .replace(/^#[ \t]+(.*$)/gim, '<h1 class="md-h1">$1</h1>');

        // 6. Inline code (`code`)
        out = out.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

        // 7. Bold and italics (***bold-italic***, **bold**, *italic*)
        out = out
            .replace(/\*\*\*(.*?)\*\*\*/g, '<b><i>$1</i></b>')
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/___(.*?)___/g, '<b><i>$1</i></b>')
            .replace(/__(.*?)__/g, '<b>$1</b>');

        // 8. Horizontal rules (---, ***, ___) within the body
        // Replace 3 or more hyphens/asterisks/underscores on their own line with a sleek <hr class="md-hr"/>
        out = out.replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '<hr class="md-hr"/>');

        // Clean inline double/triple dashes to clean typographic em-dash (—)
        out = out.replace(/([^\n\S])---([^\n\S])/g, '$1&mdash;$2');
        out = out.replace(/([^\n\S])--([^\n\S])/g, '$1&mdash;$2');

        // Collapse multiple consecutive horizontal rules into one
        out = out.replace(/(?:<hr class="md-hr"\/>\s*)+<hr class="md-hr"\/>/g, '<hr class="md-hr"/>');

        // Remove dividers at start or end if created
        out = out.replace(/^\s*<hr class="md-hr"\/>\s*/i, '');
        out = out.replace(/\s*<hr class="md-hr"\/>\s*$/i, '');

        // 9. Blockquotes (> quote)
        out = out.replace(/^[ \t]*>[ \t]?(.*$)/gim, '<blockquote class="md-quote">$1</blockquote>');
        out = out.replace(/<\/blockquote>\s*<blockquote class="md-quote">/gim, '<br/>');

        // 10. Bullet lists (- item or * item)
        out = out.replace(/^[ \t]*[-*][ \t]+(.*$)/gim, '<li class="md-bullet">$1</li>');
        out = out.replace(/(<li class="md-bullet">[\s\S]*?<\/li>)/gim, '<ul class="md-ul">$1</ul>');
        out = out.replace(/<\/ul>\s*<ul class="md-ul">/gim, '');

        // 11. Numbered lists (1. item)
        out = out.replace(/^[ \t]*\d+\.[ \t]+(.*$)/gim, '<li class="md-num-item">$1</li>');
        out = out.replace(/(<li class="md-num-item">[\s\S]*?<\/li>)/gim, '<ol class="md-ol">$1</ol>');
        out = out.replace(/<\/ol>\s*<ol class="md-ol">/gim, '');

        // 12. Collapse 3+ consecutive newlines down to 2 newlines (eliminates huge blank gaps)
        out = out.replace(/\n{3,}/g, '\n\n');

        // 13. Remove newlines directly adjacent to block elements and dividers to eliminate double/triple spacing
        out = out.replace(/\n*(<hr class="md-hr"\/>)\n*/g, '$1');
        out = out.replace(/\n*(<(?:h[1-6]|ul|ol|blockquote|div)\b[^>]*>)/gi, '$1');
        out = out.replace(/(<\/(?:h[1-6]|ul|ol|blockquote|div)>)\n*/gi, '$1');

        // 14. Convert remaining paragraph breaks to <br/><br/> and single line breaks to <br/>
        out = out.replace(/\n{2,}/g, '<br/><br/>').replace(/\n/g, '<br/>');

        // 15. Strip redundant <br/> tags before or after block elements, tables, and dividers
        out = out
            .replace(/(?:<br\s*\/?>\s*)+(<(?:h[1-6]|ul|ol|blockquote|div|table|hr)\b)/gi, '$1')
            .replace(/(<\/(?:h[1-6]|ul|ol|blockquote|div|table)>|<hr\b[^>]*\/>)(?:\s*<br\s*\/?>)+/gi, '$1');

        // 16. Remove leading and trailing <br/> tags from the final block
        out = out.replace(/^(?:\s*<br\s*\/?>)+/gi, '').replace(/(?:<br\s*\/?>\s*)+$/gi, '');

        // 17. Collapse multiple consecutive horizontal spaces between words
        out = out.replace(/([^\s>])[ \t]{2,}([^\s<])/g, '$1 $2');

        return out.trim();
    }

    parseMarkdownTables(content) {
        const tableRegex = /((?:\|[^\n]+\|(?:\r?\n|$)){2,})/g;
        return content.replace(tableRegex, (match) => {
            const lines = match.trim().split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('|') && l.endsWith('|'));
            if (lines.length < 2) return match;

            const delimiterLine = lines[1];
            if (!/^\|[\s\-:|]+\|$/.test(delimiterLine)) return match;

            const headerCells = lines[0].split('|').slice(1, -1).map((c) => c.trim());
            const bodyLines = lines.slice(2);

            let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
            headerCells.forEach((hc) => {
                html += `<th>${hc}</th>`;
            });
            html += '</tr></thead><tbody>';

            bodyLines.forEach((bl) => {
                const cells = bl.split('|').slice(1, -1).map((c) => c.trim());
                html += '<tr>';
                cells.forEach((c) => {
                    html += `<td>${c}</td>`;
                });
                html += '</tr>';
            });
            html += '</tbody></table></div>';
            return html;
        });
    }
}
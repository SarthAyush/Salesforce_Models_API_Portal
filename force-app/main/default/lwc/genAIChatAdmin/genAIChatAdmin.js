import { LightningElement, api, track } from 'lwc';
import getAdminAnalytics from '@salesforce/apex/GenAIChatController.getAdminAnalytics';
import toggleUserAdminStatus from '@salesforce/apex/GenAIChatController.toggleUserAdminStatus';
import toggleUserFreeze from '@salesforce/apex/GenAIChatController.toggleUserFreeze';
import updateUserConfiguration from '@salesforce/apex/GenAIChatController.updateUserConfiguration';
import adminDisconnectUserOrg from '@salesforce/apex/GenAIChatController.adminDisconnectUserOrg';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const MODEL_FRIENDLY_NAMES = {
    'sfdc_ai__DefaultGPT4Omni': 'GPT 4 Omni',
    'sfdc_ai__DefaultGPT4OmniMini': 'GPT 4 Omni Mini',
    'sfdc_ai__DefaultOpenAIGPT4OmniMini': 'GPT 4 Omni Mini (OpenAI)',
    'sfdc_ai__DefaultGPT41': 'GPT 4.1',
    'sfdc_ai__DefaultGPT41Mini': 'GPT 4.1 Mini',
    'sfdc_ai__DefaultGPT5': 'GPT 5',
    'sfdc_ai__DefaultGPT5Mini': 'GPT 5 Mini',
    'sfdc_ai__DefaultGPT51': 'GPT 5.1',
    'sfdc_ai__DefaultGPT52': 'GPT 5.2',
    'sfdc_ai__DefaultO3': 'O3',
    'sfdc_ai__DefaultO4Mini': 'O4 Mini',
    'sfdc_ai__DefaultBedrockAnthropicClaude45Haiku': 'Claude Haiku 4.5',
    'sfdc_ai__DefaultBedrockAnthropicClaude4Sonnet': 'Claude Sonnet 4',
    'sfdc_ai__DefaultBedrockAnthropicClaude45Sonnet': 'Claude Sonnet 4.5',
    'sfdc_ai__DefaultBedrockAnthropicClaude45Opus': 'Claude Opus 4.5',
    'sfdc_ai__DefaultBedrockNvidiaNemotronNano330b': 'NVIDIA Nemotron 30B',
    'sfdc_ai__DefaultVertexAIGemini25Flash001': 'Gemini 2.5 Flash',
    'sfdc_ai__DefaultVertexAIGemini25FlashLite001': 'Gemini 2.5 Flash Lite',
    'sfdc_ai__DefaultVertexAIGeminiPro25': 'Gemini 2.5 Pro',
    'sfdc_ai__DefaultVertexAIGemini30Flash': 'Gemini 3 Flash',
    'sfdc_ai__DefaultVertexAIGeminiPro30': 'Gemini 3 Pro',
    'sfdc_ai__DefaultVertexAIGeminiPro31': 'Gemini 3.1 Pro'
};

export default class GenAIChatAdmin extends LightningElement {
    @api sessionToken;
    @api theme = 'slate-indigo';

    @track isLoading = true;
    @track activeTab = 'overview'; // 'overview', 'users', 'audit'
    @track analytics = null;
    @track userSearchTerm = '';
    @track userFilterCategory = 'all'; // 'all', 'connected', 'admins', 'frozen'

    get computedContainerClass() {
        return 'admin-dashboard-container light-theme';
    }

    // User Configuration Modal State
    @track isEditUserModalOpen = false;
    @track editUserId = '';
    @track editUserName = '';
    @track editUserEmail = '';
    @track editUserBio = '';
    @track editUserIsAdmin = false;
    @track editUserIsFrozen = false;
    @track editUserCanChat = true;
    @track editUserCanUseCommunity = true;
    @track editUserCanAccessAdvancedModels = true;
    @track editUserIsOrgConnected = false;
    @track editUserOrgInstanceUrl = '';
    @track editUserOrgType = '';
    @track editUserOrgUsername = '';
    @track editUserOrgClientId = '';
    @track editUserOrgConnectedDate = '';
    @track isSavingUserConfig = false;
    @track isDisconnectingUserOrg = false;

    connectedCallback() {
        if (!this.sessionToken) {
            try {
                this.sessionToken = window.sessionStorage?.getItem('genai_chat_auth_token');
            } catch (e) {
                // ignore
            }
        }
        try {
            const savedTab = window.sessionStorage?.getItem('genai_admin_active_tab');
            if (savedTab && ['overview', 'users', 'audit'].includes(savedTab)) {
                this.activeTab = savedTab;
            }
            const savedFilter = window.sessionStorage?.getItem('genai_admin_user_filter');
            if (savedFilter && ['all', 'connected', 'admins', 'frozen'].includes(savedFilter)) {
                this.userFilterCategory = savedFilter;
            }
        } catch (e) {
            // ignore
        }
        this.loadAnalyticsData();
    }

    async loadAnalyticsData() {
        this.isLoading = true;
        try {
            const data = await getAdminAnalytics({
                sessionToken: this.sessionToken
            });
            this.analytics = data;
        } catch (error) {
            console.error('Admin analytics load error:', error);
            this.showToast('Error', error?.body?.message || error?.message || 'Failed to load system analytics.', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    // ----------------------------------------------------
    // TAB MANAGEMENT & PERSISTENCE
    // ----------------------------------------------------
    get isTabOverview() {
        return this.activeTab === 'overview';
    }

    get isTabUsers() {
        return this.activeTab === 'users';
    }

    get isTabAudit() {
        return this.activeTab === 'audit';
    }

    get tabOverviewClass() {
        return `tab-btn ${this.activeTab === 'overview' ? 'active-tab' : ''}`;
    }

    get tabUsersClass() {
        return `tab-btn ${this.activeTab === 'users' ? 'active-tab' : ''}`;
    }

    get tabAuditClass() {
        return `tab-btn ${this.activeTab === 'audit' ? 'active-tab' : ''}`;
    }

    setTabOverview() {
        this.activeTab = 'overview';
        this.persistAdminTab('overview');
    }

    setTabUsers() {
        this.activeTab = 'users';
        this.persistAdminTab('users');
    }

    setTabAudit() {
        this.activeTab = 'audit';
        this.persistAdminTab('audit');
    }

    persistAdminTab(tab) {
        try {
            window.sessionStorage?.setItem('genai_admin_active_tab', tab);
        } catch (e) {
            // ignore
        }
    }

    // ----------------------------------------------------
    // KPI COMPUTED GETTERS
    // ----------------------------------------------------
    get totalUsersFormatted() {
        return this.analytics?.totalUsers?.toLocaleString() || '0';
    }

    get activeTodayFormatted() {
        return this.analytics?.activeUsersToday?.toLocaleString() || '0';
    }

    get activeRatePercent() {
        const total = this.analytics?.totalUsers || 0;
        const active = this.analytics?.activeUsersToday || 0;
        if (total === 0) return 0;
        return Math.round((active / total) * 100);
    }

    get totalSessionsFormatted() {
        return this.analytics?.totalSessions?.toLocaleString() || '0';
    }

    get totalMessagesFormatted() {
        return this.analytics?.totalMessages?.toLocaleString() || '0';
    }

    get avgMessagesPerUser() {
        return this.analytics?.avgMessagesPerUser || '0';
    }

    get avgTokensPerSession() {
        const val = this.analytics?.avgTokensPerSession || 0;
        return val >= 1000 ? (val / 1000).toFixed(1) + 'K' : String(val);
    }

    get totalTokensFormatted() {
        const val = this.analytics?.totalTokensUsed || 0;
        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
        if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
        return val.toLocaleString();
    }

    get frozenUsersCount() {
        return this.analytics?.frozenUsersCount || 0;
    }

    get adminUsersCount() {
        return this.analytics?.adminUsersCount || 1;
    }

    get connectedOrgsFormatted() {
        return this.analytics?.connectedOrgsCount?.toLocaleString() || '0';
    }

    get connectedOrgsAdoptionRate() {
        const total = this.analytics?.totalUsers || 0;
        const orgs = this.analytics?.connectedOrgsCount || 0;
        if (total === 0) return 0;
        return Math.round((orgs / total) * 100);
    }

    get communityPostsCount() {
        return this.analytics?.totalCommunityPosts || 0;
    }

    get communityLikesCount() {
        return this.analytics?.totalCommunityLikes || 0;
    }

    get apiPercentRemainingFormatted() {
        const rem = this.analytics?.limits?.apiRequestsPercentRemaining;
        return rem != null ? rem : 100;
    }

    get apiProgressStyle() {
        const used = this.analytics?.limits?.apiRequestsPercentUsed || 0;
        return `width: ${Math.min(100, Math.max(3, used))}%;`;
    }

    get userCount() {
        return this.analytics?.usersList?.length || 0;
    }

    get recentSessionCount() {
        return this.analytics?.recentSessions?.length || 0;
    }

    // ----------------------------------------------------
    // BAR GRAPHS COMPUTED GETTERS
    // ----------------------------------------------------
    get dailyTrendsWithStyles() {
        if (!this.analytics?.dailyTrends) return [];
        return this.analytics.dailyTrends.map((t) => {
            const tokFormatted = t.tokensCount >= 1000 ? (t.tokensCount / 1000).toFixed(1) + 'K' : String(t.tokensCount);
            return {
                ...t,
                formattedTokens: tokFormatted,
                columnStyle: `height: ${Math.max(12, Math.min(100, t.barHeightPercent))}%;`
            };
        });
    }

    get topUsersRankingWithStyles() {
        if (!this.analytics?.topUsersRanking) return [];
        return this.analytics.topUsersRanking.map((u) => {
            const tokFormatted = u.tokensCount >= 1000 ? (u.tokensCount / 1000).toFixed(1) + 'K' : String(u.tokensCount);
            return {
                ...u,
                formattedTokens: tokFormatted,
                fillWidthStyle: `width: ${Math.max(12, Math.min(100, u.barWidthPercent))}%;`
            };
        });
    }

    get hasModelBreakdown() {
        return this.analytics?.modelBreakdown && this.analytics.modelBreakdown.length > 0;
    }

    get formattedModelBreakdown() {
        if (!this.hasModelBreakdown) return [];
        return this.analytics.modelBreakdown.map((mb) => {
            const friendly = MODEL_FRIENDLY_NAMES[mb.modelName] || mb.modelName || 'Other Model';
            return {
                ...mb,
                displayName: friendly,
                barStyle: `width: ${Math.max(5, mb.percentage || 5)}%;`
            };
        });
    }

    // ----------------------------------------------------
    // USER SEARCH, FILTERING & ROW FORMATTING
    // ----------------------------------------------------
    handleUserSearchChange(event) {
        this.userSearchTerm = event.target.value.toLowerCase();
    }

    handleSelectUserFilter(event) {
        this.userFilterCategory = event.currentTarget.dataset.category || 'all';
        try {
            window.sessionStorage?.setItem('genai_admin_user_filter', this.userFilterCategory);
        } catch (e) {
            // ignore
        }
    }

    get filterAllLabel() {
        const cnt = this.analytics?.totalUsers || 0;
        return `All Users (${cnt})`;
    }

    get filterConnectedLabel() {
        const cnt = this.analytics?.connectedOrgsCount || 0;
        return `⚡ Org Connected (${cnt})`;
    }

    get filterAdminsLabel() {
        const cnt = this.analytics?.adminUsersCount || 0;
        return `Admins (${cnt})`;
    }

    get filterFrozenLabel() {
        const cnt = this.analytics?.frozenUsersCount || 0;
        return `Frozen (${cnt})`;
    }

    get filterCategoryAllClass() {
        return `filter-pill ${this.userFilterCategory === 'all' ? 'active filter-pill-active' : ''}`;
    }

    get filterCategoryConnectedClass() {
        return `filter-pill ${this.userFilterCategory === 'connected' ? 'active filter-pill-active' : ''}`;
    }

    get filterCategoryAdminsClass() {
        return `filter-pill ${this.userFilterCategory === 'admins' ? 'active filter-pill-active' : ''}`;
    }

    get filterCategoryFrozenClass() {
        return `filter-pill ${this.userFilterCategory === 'frozen' ? 'active filter-pill-active' : ''}`;
    }

    get filteredUsersList() {
        if (!this.analytics?.usersList) return [];
        const term = (this.userSearchTerm || '').trim();
        const category = this.userFilterCategory;

        return this.analytics.usersList
            .filter((u) => {
                if (category === 'connected' && !u.isOrgConnected) return false;
                if (category === 'admins' && !u.isAdmin) return false;
                if (category === 'frozen' && !u.isFrozen) return false;

                if (!term) return true;
                const nameMatch = u.name && u.name.toLowerCase().includes(term);
                const emailMatch = u.email && u.email.toLowerCase().includes(term);
                const orgMatch = u.connectedOrgInstanceUrl && u.connectedOrgInstanceUrl.toLowerCase().includes(term);
                return nameMatch || emailMatch || orgMatch;
            })
            .map((u) => {
                let instanceShort = null;
                if (u.isOrgConnected && u.connectedOrgInstanceUrl) {
                    try {
                        const urlObj = new URL(u.connectedOrgInstanceUrl);
                        instanceShort = urlObj.hostname.split('.')[0];
                    } catch (e) {
                        instanceShort = u.connectedOrgInstanceUrl.replace('https://', '').split('.')[0];
                    }
                }

                return {
                    ...u,
                    statusLabel: u.isFrozen ? 'Frozen' : 'Active',
                    statusBadgeClass: `status-pill ${u.isFrozen ? 'status-frozen' : 'status-active'}`,
                    roleLabel: u.isAdmin ? 'Administrator' : 'Standard User',
                    roleBadgeClass: `badge ${u.isAdmin ? 'badge-admin' : 'badge-user'}`,
                    roleToggleBtnLabel: u.isAdmin ? 'Demote' : 'Make Admin',
                    roleToggleBtnClass: `action-tiny-btn ${u.isAdmin ? 'btn-demote' : 'btn-promote'}`,
                    freezeToggleBtnLabel: u.isFrozen ? 'Unfreeze' : 'Freeze',
                    freezeToggleBtnTooltip: u.isFrozen ? 'Unfreeze account and restore access' : 'Freeze account and suspend access',
                    freezeToggleBtnClass: `action-tiny-btn ${u.isFrozen ? 'btn-unfreeze' : 'btn-freeze'}`,
                    chatPermClass: `perm-badge ${u.canChat ? 'perm-active' : 'perm-disabled'}`,
                    commPermClass: `perm-badge ${u.canUseCommunity ? 'perm-active' : 'perm-disabled'}`,
                    advPermClass: `perm-badge ${u.canAccessAdvancedModels ? 'perm-active' : 'perm-disabled'}`,
                    // Org Connection Properties
                    isOrgConnected: u.isOrgConnected === true,
                    orgBadgeClass: `org-status-pill ${u.isOrgConnected ? 'org-active' : 'org-none'}`,
                    orgStatusLabel: u.isOrgConnected ? (u.connectedOrgType || 'Connected Org') : 'Host Org Models',
                    orgInstanceShort: instanceShort,
                    orgTooltip: u.isOrgConnected
                        ? `Connected to ${u.connectedOrgInstanceUrl} (${u.connectedOrgType}) as ${u.connectedOrgUsername || 'User'}`
                        : 'Using Host Org Default Einstein Models API',
                    formattedTokens: u.totalTokens >= 1000 ? (u.totalTokens / 1000).toFixed(1) + 'K' : String(u.totalTokens || 0),
                    formattedLastLogin: u.lastLogin ? new Date(u.lastLogin).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'
                };
            });
    }

    // ----------------------------------------------------
    // USER ACTIONS (ROLE, FREEZE, CONFIGURE)
    // ----------------------------------------------------
    async handleToggleAdminRole(event) {
        const userId = event.currentTarget.dataset.id;
        const currentIsAdmin = event.currentTarget.dataset.admin === 'true';
        const newStatus = !currentIsAdmin;

        try {
            await toggleUserAdminStatus({
                sessionToken: this.sessionToken,
                targetUserId: userId,
                makeAdmin: newStatus
            });
            this.showToast('Success', `User privileges updated to ${newStatus ? 'Administrator' : 'Standard User'}.`, 'success');
            await this.loadAnalyticsData();
        } catch (err) {
            this.showToast('Error', err?.body?.message || err?.message || 'Failed to update user role.', 'error');
        }
    }

    async handleQuickToggleFreeze(event) {
        const userId = event.currentTarget.dataset.id;
        const currentlyFrozen = event.currentTarget.dataset.frozen === 'true';
        const newFrozenState = !currentlyFrozen;

        try {
            await toggleUserFreeze({
                sessionToken: this.sessionToken,
                targetUserId: userId,
                isFrozen: newFrozenState
            });
            this.showToast('Status Updated', `User account ${newFrozenState ? 'frozen' : 'unfrozen'} successfully.`, 'success');
            await this.loadAnalyticsData();
        } catch (err) {
            this.showToast('Error', err?.body?.message || err?.message || 'Failed to update user freeze status.', 'error');
        }
    }

    handleOpenConfigureUser(event) {
        const userId = event.currentTarget.dataset.id;
        const user = this.analytics?.usersList?.find((u) => u.id === userId);
        if (!user) return;

        this.editUserId = user.id;
        this.editUserName = user.name || '';
        this.editUserEmail = user.email || '';
        this.editUserBio = user.bio || '';
        this.editUserIsAdmin = user.isAdmin === true;
        this.editUserIsFrozen = user.isFrozen === true;
        this.editUserCanChat = user.canChat !== false;
        this.editUserCanUseCommunity = user.canUseCommunity !== false;
        this.editUserCanAccessAdvancedModels = user.canAccessAdvancedModels !== false;

        // Org Connection Info
        this.editUserIsOrgConnected = user.isOrgConnected === true;
        this.editUserOrgInstanceUrl = user.connectedOrgInstanceUrl || '';
        this.editUserOrgType = user.connectedOrgType || '';
        this.editUserOrgUsername = user.connectedOrgUsername || '';
        this.editUserOrgClientId = user.connectedOrgClientId || '';
        this.editUserOrgConnectedDate = user.connectedOrgConnectedDate
            ? new Date(user.connectedOrgConnectedDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
            : '';

        this.isEditUserModalOpen = true;
    }

    async handleAdminDisconnectUserOrg() {
        if (!this.editUserId) return;
        this.isDisconnectingUserOrg = true;
        try {
            await adminDisconnectUserOrg({
                sessionToken: this.sessionToken,
                targetUserId: this.editUserId
            });
            this.editUserIsOrgConnected = false;
            this.editUserOrgInstanceUrl = '';
            this.editUserOrgType = '';
            this.editUserOrgUsername = '';
            this.editUserOrgClientId = '';
            this.editUserOrgConnectedDate = '';
            this.showToast('Org Disconnected', 'User external org connection removed. The account will now default to the host org Models API.', 'info');
            await this.loadAnalyticsData();
        } catch (err) {
            this.showToast('Error', err?.body?.message || err?.message || 'Failed to disconnect user org.', 'error');
        } finally {
            this.isDisconnectingUserOrg = false;
        }
    }

    closeEditUserModal() {
        this.isEditUserModalOpen = false;
    }

    handleEditNameChange(event) {
        this.editUserName = event.target.value;
    }

    handleEditBioChange(event) {
        this.editUserBio = event.target.value;
    }

    handleEditIsAdminChange(event) {
        this.editUserIsAdmin = event.target.checked;
    }

    handleEditIsFrozenChange(event) {
        this.editUserIsFrozen = event.target.checked;
    }

    handleEditCanChatChange(event) {
        this.editUserCanChat = event.target.checked;
    }

    handleEditCanUseCommunityChange(event) {
        this.editUserCanUseCommunity = event.target.checked;
    }

    handleEditCanAccessAdvModelsChange(event) {
        this.editUserCanAccessAdvancedModels = event.target.checked;
    }

    async handleSaveUserConfig() {
        if (!this.editUserName || !this.editUserName.trim()) {
            this.showToast('Validation', 'Display Name cannot be empty.', 'warning');
            return;
        }

        this.isSavingUserConfig = true;
        try {
            await updateUserConfiguration({
                sessionToken: this.sessionToken,
                targetUserId: this.editUserId,
                name: this.editUserName.trim(),
                bio: this.editUserBio ? this.editUserBio.trim() : '',
                avatarIcon: '',
                isAdmin: this.editUserIsAdmin,
                isFrozen: this.editUserIsFrozen,
                canChat: this.editUserCanChat,
                canUseCommunity: this.editUserCanUseCommunity,
                canAccessAdvancedModels: this.editUserCanAccessAdvancedModels
            });

            this.showToast('Success', 'User profile and permissions updated successfully.', 'success');
            this.closeEditUserModal();
            await this.loadAnalyticsData();
        } catch (err) {
            this.showToast('Error', err?.body?.message || err?.message || 'Failed to update user configuration.', 'error');
        } finally {
            this.isSavingUserConfig = false;
        }
    }

    // ----------------------------------------------------
    // SESSION AUDIT LOG FORMATTING
    // ----------------------------------------------------
    get formattedRecentSessions() {
        if (!this.analytics?.recentSessions) return [];
        return this.analytics.recentSessions.map((s) => ({
            ...s,
            modelShortName: MODEL_FRIENDLY_NAMES[s.model] || s.model || 'AI Model',
            formattedDate: s.lastModified ? new Date(s.lastModified).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
        }));
    }

    // ----------------------------------------------------
    // COMPONENT EVENTS
    // ----------------------------------------------------
    handleSwitchToChat() {
        this.dispatchEvent(new CustomEvent('switchtochat', {
            bubbles: true,
            composed: true
        }));
    }

    handleLogoutClick() {
        this.dispatchEvent(new CustomEvent('logout', {
            bubbles: true,
            composed: true
        }));
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}

import { LightningElement, track, api } from 'lwc';
import registerUser from '@salesforce/apex/GenAIChatController.registerUser';
import loginWithGoogle from '@salesforce/apex/GenAIChatController.loginWithGoogle';
import getGoogleAuthConfig from '@salesforce/apex/GenAIChatController.getGoogleAuthConfig';

const AVATAR_LIST = [
    { name: 'standard:user', label: 'Default User' },
    { name: 'standard:agent_home', label: 'Agent' },
    { name: 'standard:insights', label: 'Analyst' },
    { name: 'standard:lead', label: 'Specialist' },
    { name: 'standard:bot', label: 'Automaton' },
    { name: 'standard:skill', label: 'Expert' }
];

export default class GenAIChatSignup extends LightningElement {
    @api theme = 'slate-indigo';

    @track name = '';
    @track email = '';
    @track password = '';
    @track confirmPassword = '';
    @track bio = '';
    @track selectedAvatar = 'standard:user';
    @track showPassword = false;
    @track errorMessage = '';
    @track isLoading = false;
    @track googleClientId = '211930830295-ltc2upv4alnfjbdhipbs88obthk0b0ij.apps.googleusercontent.com';
    boundGoogleMessageHandler = null;

    connectedCallback() {
        this.boundGoogleMessageHandler = this.handleGoogleOAuthMessage.bind(this);
        window.addEventListener('message', this.boundGoogleMessageHandler);
        this.loadGoogleAuthConfig();
    }

    disconnectedCallback() {
        if (this.boundGoogleMessageHandler) {
            window.removeEventListener('message', this.boundGoogleMessageHandler);
        }
    }

    async loadGoogleAuthConfig() {
        try {
            const cfg = await getGoogleAuthConfig();
            if (cfg && cfg.clientId) {
                this.googleClientId = cfg.clientId;
                if (window.localStorage) {
                    window.localStorage.setItem('GENAI_GOOGLE_CLIENT_ID', cfg.clientId);
                }
            }
        } catch (err) {
            console.warn('Error fetching Google auth config in signup:', err);
        }
    }

    get computedContainerClass() {
        const isDark = this.theme === 'midnight-dark';
        return `auth-card-container theme-${this.theme || 'slate-indigo'} ${isDark ? 'dark-theme' : 'light-theme'}`;
    }

    get passwordInputType() {
        return this.showPassword ? 'text' : 'password';
    }

    get avatarOptions() {
        return AVATAR_LIST.map(opt => ({
            ...opt,
            cssClass: opt.name === this.selectedAvatar ? 'avatar-chip avatar-chip-selected' : 'avatar-chip'
        }));
    }

    handleNameChange(event) {
        this.name = event.target.value;
        this.errorMessage = '';
    }

    handleEmailChange(event) {
        this.email = event.target.value.trim();
        this.errorMessage = '';
    }

    handlePasswordChange(event) {
        this.password = event.target.value;
        this.errorMessage = '';
    }

    handleConfirmPasswordChange(event) {
        this.confirmPassword = event.target.value;
        this.errorMessage = '';
    }

    handleBioChange(event) {
        this.bio = event.target.value;
    }

    togglePasswordVisibility(event) {
        this.showPassword = event.target.checked;
    }

    handleSelectAvatar(event) {
        const avatar = event.currentTarget.dataset.avatar;
        if (avatar) {
            this.selectedAvatar = avatar;
        }
    }

    async handleSignupSubmit(event) {
        event.preventDefault();
        this.errorMessage = '';

        if (!this.name || !this.email || !this.password) {
            this.errorMessage = 'Please complete all required fields.';
            return;
        }

        if (this.password.length < 6) {
            this.errorMessage = 'Password must be at least 6 characters.';
            return;
        }

        if (this.password !== this.confirmPassword) {
            this.errorMessage = 'Passwords do not match.';
            return;
        }

        this.isLoading = true;
        try {
            const result = await registerUser({
                fullName: this.name,
                email: this.email,
                password: this.password,
                avatarIcon: this.selectedAvatar,
                bio: this.bio
            });

            if (result && (result.success || result.isSuccess)) {
                const token = result.user?.sessionToken || result.sessionToken;
                // Dispatch signup event to parent component
                this.dispatchEvent(new CustomEvent('signup', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        user: result.user,
                        sessionToken: token
                    }
                }));
            } else {
                this.errorMessage = result?.message || result?.errorMessage || 'Unable to register account.';
            }
        } catch (error) {
            console.error('Signup error:', error);
            this.errorMessage = error?.body?.message || error?.message || 'Registration service error. Please try again.';
        } finally {
            this.isLoading = false;
        }
    }

    // Google Sign Up Handler (autoCreate = true)
    handleGoogleSignUp() {
        this.errorMessage = '';

        const isSitesUrl = window.location.origin.includes('salesforce-sites.com');
        const callbackUrl = isSitesUrl
            ? window.location.origin + '/mumodelsarthak/apex/genAIOAuthCallback'
            : window.location.origin + '/apex/genAIOAuthCallback';

        let googleClientId = this.googleClientId;
        if (!googleClientId) {
            try {
                googleClientId = window.localStorage ? window.localStorage.getItem('GENAI_GOOGLE_CLIENT_ID') : '';
            } catch (e) {
                googleClientId = '';
            }
        }

        if (!googleClientId || !googleClientId.trim()) {
            googleClientId = '211930830295-ltc2upv4alnfjbdhipbs88obthk0b0ij.apps.googleusercontent.com';
            this.googleClientId = googleClientId;
        }

        const authorizeUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
            `client_id=${encodeURIComponent(googleClientId.trim())}` +
            `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
            `&response_type=id_token` +
            `&scope=openid%20profile%20email` +
            `&nonce=${Date.now()}` +
            `&state=google_auth` +
            `&prompt=select_account`;

        const width = 500;
        const height = 620;
        const left = Math.max(0, (window.screen.width - width) / 2);
        const top = Math.max(0, (window.screen.height - height) / 2);

        const popup = window.open(
            authorizeUrl,
            'GoogleOAuthPopup',
            `width=${width},height=${height},top=${top},left=${left},menubar=no,toolbar=no,location=yes,status=yes`
        );

        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            this.errorMessage = 'Popup blocked! Please allow popups in your browser to sign up with Google.';
        }
    }

    async handleGoogleOAuthMessage(event) {
        if (!event.data || event.data.type !== 'GOOGLE_OAUTH_RESPONSE') {
            return;
        }

        const data = event.data;
        if (data.error) {
            this.errorMessage = `Google Sign-up Cancelled or Failed: ${data.errorDescription || data.error}`;
            return;
        }

        if (data.idToken) {
            this.isLoading = true;
            this.errorMessage = '';
            try {
                // Auto create account when signing up via Google
                const result = await loginWithGoogle({
                    idToken: data.idToken,
                    requestedRole: 'user',
                    autoCreate: true
                });

                if (result && (result.success || result.isSuccess)) {
                    const token = result.user?.sessionToken || result.sessionToken;
                    this.dispatchEvent(new CustomEvent('signup', {
                        bubbles: true,
                        composed: true,
                        detail: {
                            user: result.user,
                            sessionToken: token
                        }
                    }));
                } else {
                    this.errorMessage = result?.message || result?.errorMessage || 'Google sign-up failed.';
                }
            } catch (err) {
                this.errorMessage = err?.body?.message || err?.message || 'Failed to register with Google.';
            } finally {
                this.isLoading = false;
            }
        }
    }

    handleSwitchToLogin() {
        this.dispatchEvent(new CustomEvent('switchtologin', {
            bubbles: true,
            composed: true
        }));
    }
}

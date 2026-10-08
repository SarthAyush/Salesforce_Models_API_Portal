import { LightningElement, track, api } from 'lwc';
import registerUser from '@salesforce/apex/GenAIChatController.registerUser';

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

    handleSwitchToLogin() {
        this.dispatchEvent(new CustomEvent('switchtologin', {
            bubbles: true,
            composed: true
        }));
    }
}

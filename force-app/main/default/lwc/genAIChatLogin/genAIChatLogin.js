import { LightningElement, track, api } from 'lwc';
import loginUser from '@salesforce/apex/GenAIChatController.loginUser';
import sendPasswordResetCode from '@salesforce/apex/GenAIChatController.sendPasswordResetCode';
import verifyResetCodeAndSetPassword from '@salesforce/apex/GenAIChatController.verifyResetCodeAndSetPassword';

export default class GenAIChatLogin extends LightningElement {
    @api theme = 'slate-indigo';

    @track email = '';
    @track password = '';
    @track showPassword = false;
    @track selectedRole = 'user'; // 'user' or 'admin'
    @track errorMessage = '';
    @track successMessage = '';
    @track isLoading = false;

    // Reset password modal state (2-Step Email OTP Flow)
    @track showResetModal = false;
    @track resetStep = 1; // 1 = Enter email & request code, 2 = Enter code & new password
    @track resetEmail = '';
    @track resetCode = '';
    @track newPassword = '';
    @track confirmNewPassword = '';
    @track resetError = '';
    @track resetInfo = '';
    @track isSendingCode = false;
    @track isResetting = false;
    @track serverResetCode = '';

    get computedContainerClass() {
        const isDark = this.theme === 'midnight-dark';
        return `auth-card-container theme-${this.theme || 'slate-indigo'} ${isDark ? 'dark-theme' : 'light-theme'}`;
    }

    get passwordInputType() {
        return this.showPassword ? 'text' : 'password';
    }

    get isAdminRole() {
        return this.selectedRole === 'admin';
    }

    get selectedRoleLabel() {
        return this.selectedRole === 'admin' ? 'Administrator' : 'User';
    }

    get userRolePillClass() {
        return `role-pill-btn ${this.selectedRole === 'user' ? 'active-role' : ''}`;
    }

    get adminRolePillClass() {
        return `role-pill-btn ${this.selectedRole === 'admin' ? 'active-role' : ''}`;
    }

    get isResetStep1() {
        return this.resetStep === 1;
    }

    get isResetStep2() {
        return this.resetStep === 2;
    }

    get resetStepBadgeText() {
        return this.resetStep === 1 ? 'Step 1 of 2: Email' : 'Step 2 of 2: Verification';
    }

    handleSelectRole(event) {
        const role = event.currentTarget.dataset.role;
        if (role) {
            this.selectedRole = role;
            this.errorMessage = '';
        }
    }

    handleEmailChange(event) {
        this.email = event.target.value.trim();
        this.errorMessage = '';
    }

    handlePasswordChange(event) {
        this.password = event.target.value;
        this.errorMessage = '';
    }

    togglePasswordVisibility() {
        this.showPassword = !this.showPassword;
    }

    async handleLoginSubmit(event) {
        event.preventDefault();
        this.errorMessage = '';
        this.successMessage = '';

        if (!this.email || !this.password) {
            this.errorMessage = 'Please provide both your email address and password.';
            return;
        }

        this.isLoading = true;
        try {
            const result = await loginUser({
                email: this.email,
                password: this.password,
                requestedRole: this.selectedRole
            });

            if (result && (result.success || result.isSuccess)) {
                this.successMessage = `Authentication confirmed! Entering ${this.selectedRoleLabel} session...`;
                const token = result.user?.sessionToken || result.sessionToken;
                
                // Dispatch custom event to parent component
                this.dispatchEvent(new CustomEvent('login', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        user: result.user,
                        sessionToken: token,
                        role: this.selectedRole
                    }
                }));
            } else {
                this.errorMessage = result?.message || result?.errorMessage || 'Invalid email or password.';
            }
        } catch (error) {
            console.error('Login error:', error);
            this.errorMessage = error?.body?.message || error?.message || 'Authentication service error. Please try again.';
        } finally {
            this.isLoading = false;
        }
    }

    handleSwitchToSignup() {
        this.dispatchEvent(new CustomEvent('switchtosignup', {
            bubbles: true,
            composed: true
        }));
    }

    // ----------------------------------------------------
    // 2-STEP FORGOT PASSWORD MODAL (EMAIL OTP VERIFICATION)
    // ----------------------------------------------------
    openForgotPasswordModal() {
        this.resetEmail = this.email || '';
        this.resetCode = '';
        this.serverResetCode = '';
        this.newPassword = '';
        this.confirmNewPassword = '';
        this.resetError = '';
        this.resetInfo = '';
        this.resetStep = 1;
        this.showResetModal = true;
    }

    closeForgotPasswordModal() {
        this.showResetModal = false;
        this.resetError = '';
        this.resetInfo = '';
        this.serverResetCode = '';
    }

    stopModalPropagation(event) {
        event.stopPropagation();
    }

    handleResetEmailChange(event) {
        this.resetEmail = event.target.value.trim();
        this.resetError = '';
    }

    handleResetCodeChange(event) {
        this.resetCode = event.target.value.trim();
        this.resetError = '';
    }

    handleAutoFillResetCode() {
        if (this.serverResetCode) {
            this.resetCode = this.serverResetCode;
            this.resetError = '';
        }
    }

    handleNewPasswordChange(event) {
        this.newPassword = event.target.value;
        this.resetError = '';
    }

    handleConfirmNewPasswordChange(event) {
        this.confirmNewPassword = event.target.value;
        this.resetError = '';
    }

    handleBackToStep1() {
        this.resetStep = 1;
        this.resetError = '';
        this.resetInfo = '';
        this.serverResetCode = '';
    }

    // Step 1: Send verification code to user email
    async handleSendResetCodeSubmit(event) {
        event.preventDefault();
        this.resetError = '';
        this.resetInfo = '';

        if (!this.resetEmail) {
            this.resetError = 'Email address is required.';
            return;
        }

        this.isSendingCode = true;
        try {
            const result = await sendPasswordResetCode({
                email: this.resetEmail
            });

            if (result && (result.success || result.isSuccess)) {
                this.resetStep = 2;
                this.serverResetCode = result.resetCode || '';
                this.resetInfo = result.message || `A 6-digit code has been dispatched to ${this.resetEmail}.`;
            } else {
                this.resetError = result?.message || result?.errorMessage || 'Unable to send verification code.';
            }
        } catch (error) {
            console.error('Send reset code error:', error);
            this.resetError = error?.body?.message || error?.message || 'Error communicating with security service.';
        } finally {
            this.isSendingCode = false;
        }
    }

    async handleResendCode() {
        this.resetError = '';
        this.isSendingCode = true;
        try {
            const result = await sendPasswordResetCode({
                email: this.resetEmail
            });
            if (result && (result.success || result.isSuccess)) {
                this.serverResetCode = result.resetCode || '';
                this.resetInfo = result.message || 'A fresh 6-digit verification code has been dispatched to your email.';
            } else {
                this.resetError = result?.message || 'Failed to resend code.';
            }
        } catch (e) {
            this.resetError = e?.body?.message || e?.message || 'Error resending code.';
        } finally {
            this.isSendingCode = false;
        }
    }

    // Step 2: Verify OTP code and set new password
    async handleVerifyCodeAndResetSubmit(event) {
        event.preventDefault();
        this.resetError = '';

        if (!this.resetCode || this.resetCode.length < 4) {
            this.resetError = 'Please enter the 6-digit verification code sent to your email.';
            return;
        }
        if (!this.newPassword || this.newPassword.length < 6) {
            this.resetError = 'New password must be at least 6 characters.';
            return;
        }
        if (this.newPassword !== this.confirmNewPassword) {
            this.resetError = 'New passwords do not match.';
            return;
        }

        this.isResetting = true;
        try {
            const result = await verifyResetCodeAndSetPassword({
                email: this.resetEmail,
                resetCode: this.resetCode,
                newPassword: this.newPassword
            });

            if (result && (result.success || result.isSuccess)) {
                this.showResetModal = false;
                this.successMessage = 'Password updated successfully! Please sign in with your new credentials.';
                this.password = '';
            } else {
                this.resetError = result?.message || result?.errorMessage || 'Invalid verification code.';
            }
        } catch (error) {
            console.error('Password reset verification error:', error);
            this.resetError = error?.body?.message || error?.message || 'Error occurred while verifying code.';
        } finally {
            this.isResetting = false;
        }
    }
}

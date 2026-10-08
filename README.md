# Salesforce Models API Portal & Enterprise AI Chat System

> **A Next-Generation, Enterprise-Grade Multi-Model AI Chat & Cryptographically Secure Collaboration Platform built natively on Salesforce Lightning Web Components (LWC) and Apex.**

[![Salesforce API v67.0](https://img.shields.io/badge/Salesforce%20API-v67.0-00A1E0?logo=salesforce)](https://developer.salesforce.com/)
[![Web Crypto API](https://img.shields.io/badge/Security-AES--GCM--256%20%7C%20ECDH%20P--256-brightgreen?logo=keybase)](https://www.w3.org/TR/WebCryptoAPI/)
[![Tests Passing](https://img.shields.io/badge/Apex%20Tests-100%25%20Passed%20(17%2F17)-success?logo=checkmarx)]()
[![Code Coverage](https://img.shields.io/badge/Apex%20Coverage-80%25-green)]()

---

## 🌐 Live Access URLs

| Portal / Environment | Access URL | Description |
| :--- | :--- | :--- |
| **Primary Portal (Experience Cloud Site)** | https://orgfarm-28a2091f48-dev-ed.develop.my.salesforce-sites.com/mumodelsarthak | Public Community Experience Site hosting the interactive Multi-Model Chat & Community Hub |


---

## 🌟 Key Capabilities & Architecture

### 1. Multi-Model AI Chat Experience (`genAIChat`)
* **Salesforce Models API Integration**: Seamless connectivity to foundational LLMs (Anthropic Claude 3.5 Sonnet, Claude 3 Haiku, OpenAI GPT-4o, GPT-4o-mini).
* **Multi-Persona Intelligence**: Switch between tailored conversation personas (**General Assistant**, **Strategic Sales**, **Support/Service**, **Salesforce Admin**).
* **Rich Markdown & Code Highlighting**: Syntax-highlighted code blocks with 1-click copy, structured tables, citations, and exportable chat sessions.
* **BYOO (Bring Your Own Org) Integration**: Secure OAuth2 token routing allowing users to query data across multiple external Salesforce environments from one single chat view.
* **Persistent Sessions**: User-segregated chat session management with search, deletion, and cross-device sync.

### 2. Community Hub with Threaded Replies & Quotations
* **Public Knowledge Sharing**: Real-time collaborative feed with topic tagging (`#Architecture`, `#Apex`, `#AI`, `#PromptEngineering`), like reactions, and author profiles.
* **Threaded Discussions**: Click **Reply** on any message to trigger the quotation composer banner, showing the author name and message snippet.
* **Nested Conversation Trees**: View direct replies indented underneath root messages with real-time reply counters (`💬 X replies`).
* **Governor-Limit Optimized**: Loads threads using single SOQL parent-child subqueries (`(SELECT ... FROM Replies__r ORDER BY CreatedDate ASC LIMIT 50)`), avoiding governor limit penalties even under high volume.

### 3. Personal Direct Messaging with End-to-End Encryption (E2EE)
* **Zero-Knowledge Architecture**: The Salesforce database only stores encrypted ciphertext. Message plaintexts **never leave the user's browser unencrypted**.
* **NIST P-256 Elliptic Curve Diffie-Hellman (ECDH)**: Asymmetric key agreement executed client-side via the W3C Web Cryptography API (`crypto.subtle`).
* **Authenticated AES-GCM-256**: High-entropy 96-bit initialization vectors (IVs) generated per message (`crypto.getRandomValues`) with authenticated encryption tags preventing tampering.
* **PBKDF2 Key Derivation**: ECDH shared secrets are hardened using PBKDF2 with **100,000 iterations** of SHA-256.
* **Mutual Safety Numbers**: 30-digit cryptographic fingerprint comparison to verify contact authenticity and prevent Man-in-the-Middle (MITM) attacks.
* **Direct Messaging Workspace**: Clean contacts list displaying user presence, public key status, message bubbles, and audit modal.

### 4. Enterprise Security & Stress Resilience
* **Anti-Spam Rate Limiter**: Enforces a rolling window ceiling (30 messages per 20-second window) to neutralize burst flooding, bot spam, and denial-of-service attempts.
* **Bidirectional Row-Level Isolation**: Direct messages enforce strict participation checks:
  ```sql
  WHERE Is_Direct_Message__c = true
    AND ((Author_User__c = :myId AND Recipient_User__c = :partnerId)
      OR (Author_User__c = :partnerId AND Recipient_User__c = :myId))
  ```
* **Governance & Access Controls**: Administrator privileges to freeze accounts, revoke chat/community permissions, or disconnect connected orgs.
* **Stress Tested**: Passes rigorous load simulations and governor limit checks with 100% test pass rate.

---

## 🏗️ Repository Structure

```text
├── force-app/main/default/
│   ├── classes/
│   │   ├── GenAIChatController.cls            # Central backend controller & security engine
│   │   ├── GenAIChatControllerTest.cls        # 17-method unit & stress test suite (80% coverage)
│   │   └── aiplatform/                        # Salesforce Models API stubs & client bindings
│   ├── lwc/
│   │   ├── genAIChat/                         # Main AI Chat Hub LWC
│   │   ├── genAIChatCommunity/                # Community feed & E2EE Direct Messaging
│   │   │   ├── cryptoUtils.js                 # Web Crypto API engine (ECDH, AES-GCM, PBKDF2)
│   │   │   ├── genAIChatCommunity.html        # Dual-mode UI (Community + Private PMs)
│   │   │   ├── genAIChatCommunity.js          # Controller with adaptive polling
│   │   │   └── genAIChatCommunity.css         # Glassmorphism & responsive styles
│   │   ├── genAIChatAdmin/                    # Admin analytics & governance console
│   │   └── genAIChatSignup/                   # Registration, login & profile management
│   ├── objects/
│   │   ├── Chat_User__c/                      # User directory, public keys & preferences
│   │   ├── Community_Message__c/              # Public posts, replies & encrypted DMs
│   │   └── GenAI_Chat_Session__c/             # User chat transcripts and sessions
│   ├── permissionsets/
│   │   └── GenAI_Chat_Super_Admin.permissionset-meta.xml
│   ├── profiles/
│   │   ├── Multimodel Profile.profile-meta.xml
│   │   └── Multimodel-Chat Profile.profile-meta.xml
│   └── remoteSiteSettings/                    # Authorized endpoints for Models API & OAuth
├── config/
│   └── project-scratch-def.json
├── scripts/
│   ├── apex/                                  # Administrative Apex scripts
│   └── soql/                                  # Data inspection queries
└── sfdx-project.json                          # Salesforce DX project manifest (API v67.0)
```

---

## 🔐 Cryptography Specifications

| Layer | Standard / Algorithm | Details |
| :--- | :--- | :--- |
| **Key Generation** | ECDH P-256 (`prime256v1`) | Extracted as JWK (`public`) and CryptoKey (`private`) in IndexedDB/Session |
| **Shared Secret** | `crypto.subtle.deriveBits` | 256-bit raw shared secret derived from peer's public key |
| **Key Derivation** | PBKDF2 (SHA-256) | 100,000 iterations with static salt to produce 256-bit AES-GCM key |
| **Cipher** | AES-GCM-256 | Authenticated encryption with 128-bit authentication tag |
| **IV / Nonce** | 96-bit CSPRNG | `crypto.getRandomValues(new Uint8Array(12))` per payload |
| **Fingerprint** | SHA-256 Hash | Hex-encoded digest of the exported JWK |
| **Safety Number** | Mutual SHA-256 digest | 30-digit numeric format formatted in 5-digit groups (`XXXXX-XXXXX-...`) |

---

## 🚀 Deployment Instructions

### Prerequisites
1. [Salesforce CLI (`sf`)](https://developer.salesforce.com/tools/salesforcecli) installed.
2. An authorized Salesforce org (Developer Edition, Sandbox, or Scratch Org).

### 1. Clone the Repository
```bash
git clone https://github.com/SarthAyush/Salesforce_Models_API_Portal.git
cd Salesforce_Models_API_Portal
```

### 2. Authenticate Your Org
```bash
sf org login web --alias MySalesforceOrg --set-default
```

### 3. Deploy Metadata
```bash
sf project deploy start --target-org MySalesforceOrg
```

### 4. Assign Admin Permissions
```bash
sf org assign permset --name GenAI_Chat_Super_Admin --target-org MySalesforceOrg
```

### 5. Run Apex Tests & Verify Coverage
```bash
sf apex run test --class-names GenAIChatControllerTest --target-org MySalesforceOrg --code-coverage --result-format human
```

---

## 🧪 Test Suite Summary

```text
=== Test Results
GenAIChatControllerTest.testAIResponseEntrypointFallback              Pass
GenAIChatControllerTest.testAdminAnalyticsAndDisconnectUserOrg        Pass
GenAIChatControllerTest.testAdminAnalyticsAndUserGovernance           Pass
GenAIChatControllerTest.testChatSessionsPersistenceCRUD               Pass
GenAIChatControllerTest.testClientCredentialsChatRouting              Pass
GenAIChatControllerTest.testClientCredentialsConnect                  Pass
GenAIChatControllerTest.testClientCredentialsTokenRefresh             Pass
GenAIChatControllerTest.testCommunityHubMessagesAndInteractions       Pass
GenAIChatControllerTest.testCommunityThreadedRepliesAndQuoting        Pass
GenAIChatControllerTest.testConnectedOrgCallouts                      Pass
GenAIChatControllerTest.testConnectedOrgFlowErrorsAndEdgeCases        Pass
GenAIChatControllerTest.testConnectedOrgSaveAndDisconnect             Pass
GenAIChatControllerTest.testEdgeCasesAndValidationCoverage            Pass
GenAIChatControllerTest.testEndToEndEncryptedPersonalDirectMessaging  Pass
GenAIChatControllerTest.testForgotPasswordAndOTPFlow                  Pass
GenAIChatControllerTest.testStressTestingAndSecurityLimits            Pass
GenAIChatControllerTest.testUserRegistrationAndLoginSuccess           Pass

Outcome: Passed | 17/17 Passed (100%) | Apex Code Coverage: 80%
```

---

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.

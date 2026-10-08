@isTest
private class GenAIChatControllerTest {

    @isTest
    static void testUserRegistrationAndLoginSuccess() {
        Test.startTest();
        // 1. Register a new user
        GenAIChatController.AuthResultDTO regResult = GenAIChatController.registerUser(
            'Test Alice',
            'alice@example.com',
            'Password123!',
            'standard:user',
            'Senior Architect'
        );
        System.assertNotEquals(null, regResult, 'Registration result should not be null');
        System.assertEquals(true, regResult.success, 'Registration should succeed');
        System.assertNotEquals(null, regResult.user, 'Returned user should not be null');
        System.assertEquals('alice@example.com', regResult.user.email, 'Email should match');

        // 2. Register duplicate email should fail
        GenAIChatController.AuthResultDTO dupResult = GenAIChatController.registerUser(
            'Test Duplicate',
            'alice@example.com',
            'Password123!',
            'standard:user',
            'Duplicate'
        );
        System.assertEquals(false, dupResult.success, 'Duplicate registration should fail');

        // 3. Login with correct credentials
        GenAIChatController.AuthResultDTO loginResult = GenAIChatController.loginUser(
            'alice@example.com',
            'Password123!',
            'user'
        );
        System.assertEquals(true, loginResult.success, 'Login should succeed: ' + loginResult.message);
        String token = loginResult.user.sessionToken;
        System.assertNotEquals(null, token, 'Session token should be generated');

        // 4. Validate session
        GenAIChatController.ChatUserDTO validUser = GenAIChatController.validateSession(token);
        System.assertNotEquals(null, validUser, 'Session should be valid');
        System.assertEquals('alice@example.com', validUser.email, 'User email should match');

        // 5. Update user profile
        GenAIChatController.AuthResultDTO updateRes = GenAIChatController.updateUserProfile(
            token,
            'Alice Updated',
            'Lead Enterprise Architect',
            'standard:insights',
            'data:image/jpeg;base64,samplephoto'
        );
        System.assertEquals(true, updateRes.success, 'Profile update should succeed');
        System.assertEquals('Alice Updated', updateRes.user.name, 'Name should be updated');

        // 6. Change password
        GenAIChatController.AuthResultDTO pwdRes = GenAIChatController.changePassword(
            token,
            'Password123!',
            'NewPassword456!'
        );
        System.assertEquals(true, pwdRes.success, 'Password change should succeed');

        // 7. Logout
        Boolean logoutRes = GenAIChatController.logoutUser(token);
        System.assertEquals(true, logoutRes, 'Logout should succeed');

        // 8. Invalidate check
        GenAIChatController.ChatUserDTO expiredUser = GenAIChatController.validateSession(token);
        System.assertEquals(null, expiredUser, 'Logged out session should be invalid');

        Test.stopTest();
    }

    @isTest
    static void testForgotPasswordAndOTPFlow() {
        // Register user
        GenAIChatController.registerUser(
            'Bob Smith',
            'bob@example.com',
            'Password123!',
            'standard:user',
            'Support Lead'
        );

        Test.startTest();
        // 1. Send password reset code
        GenAIChatController.AuthResultDTO resetReq = GenAIChatController.sendPasswordResetCode('bob@example.com');
        System.assertEquals(true, resetReq.success, 'Reset code request should succeed');

        Chat_User__c userRecord = [SELECT Id, Reset_Code__c FROM Chat_User__c WHERE Email__c = 'bob@example.com' LIMIT 1];
        System.assertNotEquals(null, userRecord.Reset_Code__c, 'Reset code must be populated');

        // 2. Verify with wrong code
        GenAIChatController.AuthResultDTO wrongCodeRes = GenAIChatController.verifyResetCodeAndSetPassword(
            'bob@example.com',
            '000000',
            'BrandNewPassword999!'
        );
        System.assertEquals(false, wrongCodeRes.success, 'Invalid code should fail');

        // 3. Verify with valid code
        GenAIChatController.AuthResultDTO correctCodeRes = GenAIChatController.verifyResetCodeAndSetPassword(
            'bob@example.com',
            userRecord.Reset_Code__c,
            'BrandNewPassword999!'
        );
        System.assertEquals(true, correctCodeRes.success, 'Valid OTP reset should succeed');

        // 4. Login with newly set password
        GenAIChatController.AuthResultDTO loginRes = GenAIChatController.loginUser(
            'bob@example.com',
            'BrandNewPassword999!',
            'user'
        );
        System.assertEquals(true, loginRes.success, 'Login with new password should succeed: ' + loginRes.message);

        Test.stopTest();
    }

    @isTest
    static void testChatSessionsPersistenceCRUD() {
        // Register and login user
        GenAIChatController.AuthResultDTO reg = GenAIChatController.registerUser(
            'Charlie Data',
            'charlie@example.com',
            'Password123!',
            'standard:bot',
            'Data Analyst'
        );
        String token = reg.user.sessionToken;

        Test.startTest();
        // 1. Save new chat session
        String sessionId = GenAIChatController.saveChatSession(
            null,
            'First Analysis Chat',
            'sfdc_ai__DefaultGPT4Omni',
            '[{"role":"user","content":"Hello world"},{"role":"ai","content":"Hi Charlie!"}]',
            2,
            'Hi Charlie!',
            token
        );
        System.assertNotEquals(null, sessionId, 'Session ID should be created');

        // 2. Fetch list of sessions
        List<GenAIChatController.ChatSessionDTO> sessionsList = GenAIChatController.getChatSessions(token);
        System.assertEquals(1, sessionsList.size(), 'Should find 1 session for Charlie');
        System.assertEquals('First Analysis Chat', sessionsList[0].title, 'Title should match');

        // 3. Update session title
        Boolean renamed = GenAIChatController.updateChatSessionTitle(sessionId, 'Renamed Analysis Chat', token);
        System.assertEquals(true, renamed, 'Session title rename should succeed');

        // 4. Fetch single session details
        GenAIChatController.ChatSessionDTO singleSession = GenAIChatController.getChatSession(sessionId, token);
        System.assertNotEquals(null, singleSession, 'Single session detail should exist');
        System.assertEquals('Renamed Analysis Chat', singleSession.title, 'Updated title should match');

        // 5. Delete single session
        Boolean deleted = GenAIChatController.deleteChatSession(sessionId, token);
        System.assertEquals(true, deleted, 'Session deletion should succeed');

        // 6. Verify empty list
        List<GenAIChatController.ChatSessionDTO> emptySessions = GenAIChatController.getChatSessions(token);
        System.assertEquals(0, emptySessions.size(), 'Session list should now be empty');

        // 7. Save multiple sessions and clear all
        GenAIChatController.saveChatSession(null, 'Session 1', 'model', '[]', 0, 'none', token);
        GenAIChatController.saveChatSession(null, 'Session 2', 'model', '[]', 0, 'none', token);
        Boolean cleared = GenAIChatController.clearAllChatSessions(token);
        System.assertEquals(true, cleared, 'Clear all sessions should succeed');

        Test.stopTest();
    }

    @isTest
    static void testCommunityHubMessagesAndInteractions() {
        // Register author user
        GenAIChatController.AuthResultDTO reg = GenAIChatController.registerUser(
            'Dana Collab',
            'dana@example.com',
            'Password123!',
            'standard:lead',
            'Community Lead'
        );
        String token = reg.user.sessionToken;

        Test.startTest();
        // 1. Post a new community message
        GenAIChatController.CommunityMessageDTO post = GenAIChatController.postCommunityMessage(
            token,
            'Excited about the new Agentforce features and ModelsAPI capabilities!',
            'Announcement'
        );
        System.assertNotEquals(null, post, 'Post should not be null');
        System.assertEquals('Announcement', post.tag, 'Tag should match');

        // 2. Retrieve messages with filter
        List<GenAIChatController.CommunityMessageDTO> allMsgs = GenAIChatController.getCommunityMessages(token, 'All');
        System.assertNotEquals(0, allMsgs.size(), 'Should retrieve community messages');

        List<GenAIChatController.CommunityMessageDTO> filteredMsgs = GenAIChatController.getCommunityMessages(token, 'Announcement');
        System.assertNotEquals(0, filteredMsgs.size(), 'Filtered messages should match');

        // 3. Like community message
        Integer likeCount = GenAIChatController.likeCommunityMessage(token, post.id);
        System.assertEquals(1, likeCount, 'Likes count should increment to 1');

        // 4. Delete community message
        Boolean deleted = GenAIChatController.deleteCommunityMessage(token, post.id);
        System.assertEquals(true, deleted, 'Message deletion should succeed');

        Test.stopTest();
    }

    @isTest
    static void testAdminAnalyticsAndUserGovernance() {
        // Create an admin user directly
        Chat_User__c adminUser = new Chat_User__c(
            Name = 'System Admin',
            Email__c = 'admin@example.com',
            Avatar_Icon__c = 'standard:portal',
            Is_Admin__c = true,
            Can_Chat__c = true,
            Can_Use_Community__c = true,
            Can_Access_Advanced_Models__c = true,
            Session_Token__c = 'admin-test-token-12345',
            Last_Login__c = Datetime.now()
        );
        insert adminUser;

        // Create standard user
        Chat_User__c stdUser = new Chat_User__c(
            Name = 'Target User',
            Email__c = 'target@example.com',
            Avatar_Icon__c = 'standard:user',
            Is_Admin__c = false,
            Can_Chat__c = true,
            Can_Use_Community__c = true,
            Can_Access_Advanced_Models__c = true,
            Session_Token__c = 'target-token-67890',
            Last_Login__c = Datetime.now()
        );
        insert stdUser;

        // Create sample chat sessions for analytics
        GenAI_Chat_Session__c s1 = new GenAI_Chat_Session__c(
            Chat_User__c = stdUser.Id,
            Title__c = 'Admin Test Session',
            Model__c = 'sfdc_ai__DefaultGPT4Omni',
            Message_Count__c = 5
        );
        insert s1;

        Test.startTest();
        // 1. Fetch admin analytics
        GenAIChatController.AdminAnalyticsDTO analytics = GenAIChatController.getAdminAnalytics('admin-test-token-12345');
        System.assertNotEquals(null, analytics, 'Admin analytics should not be null');
        System.assert(analytics.totalUsers >= 2, 'Should reflect at least 2 users');
        System.assertNotEquals(null, analytics.dailyTrends, 'Daily trends list should be populated');

        // 2. Toggle user admin status
        Boolean toggleAdmin = GenAIChatController.toggleUserAdminStatus('admin-test-token-12345', stdUser.Id, true);
        System.assertEquals(true, toggleAdmin, 'Admin status toggle should succeed');

        // 3. Freeze user
        Boolean freezeRes = GenAIChatController.toggleUserFreeze('admin-test-token-12345', stdUser.Id, true);
        System.assertEquals(true, freezeRes, 'Freeze user should succeed');

        // 4. Update user configuration
        Boolean configRes = GenAIChatController.updateUserConfiguration(
            'admin-test-token-12345',
            stdUser.Id,
            'Target User Configured',
            'Senior Strategist',
            'standard:lead',
            true,
            false,
            true,
            true,
            true
        );
        System.assertEquals(true, configRes, 'User configuration update should succeed');

        // 5. Model API Consumption
        GenAIChatController.ApiConsumptionDTO quota = GenAIChatController.getModelApiConsumption();
        System.assertNotEquals(null, quota, 'Quota metrics should not be null');

        Test.stopTest();
    }

    @isTest
    static void testAIResponseEntrypointFallback() {
        Test.startTest();
        // Test basic fallback handling for getAIResponse
        String res = GenAIChatController.getAIResponse('Hello Agentforce', 'sfdc_ai__DefaultGPT4Omni', new List<String>());
        System.assertNotEquals(null, res, 'AI response string should not be null');

        // Test with Persona and Record Context
        String advRes = GenAIChatController.getAIResponseAdvanced(
            'Analyze account',
            'sfdc_ai__DefaultGPT4Omni',
            new List<String>{'USER:Hi', 'AI:Hello'},
            'sales',
            'Active Account: Acme Corp',
            'sample.txt',
            'text/plain',
            'Revenue: $1M'
        );
        System.assertNotEquals(null, advRes, 'Advanced AI response should return message');
        Test.stopTest();
    }

    @isTest
    static void testEdgeCasesAndValidationCoverage() {
        Test.startTest();
        // 1. Validation failures in registration
        GenAIChatController.AuthResultDTO emptyName = GenAIChatController.registerUser('', 'test@test.com', 'pwd', 'icon', 'bio');
        System.assertEquals(false, emptyName.success);

        GenAIChatController.AuthResultDTO emptyEmail = GenAIChatController.registerUser('Name', '', 'pwd', 'icon', 'bio');
        System.assertEquals(false, emptyEmail.success);

        GenAIChatController.AuthResultDTO shortPwd = GenAIChatController.registerUser('Name', 'test@test.com', '123', 'icon', 'bio');
        System.assertEquals(false, shortPwd.success);

        // 2. Login validations
        GenAIChatController.AuthResultDTO emptyLogin = GenAIChatController.loginUser('', '', 'user');
        System.assertEquals(false, emptyLogin.success);

        GenAIChatController.AuthResultDTO invalidUser = GenAIChatController.loginUser('ghost@example.com', 'wrongpassword', 'user');
        System.assertEquals(false, invalidUser.success);

        // 3. Reset password validation failures
        GenAIChatController.AuthResultDTO emptyReset = GenAIChatController.sendPasswordResetCode('');
        System.assertEquals(false, emptyReset.success);

        GenAIChatController.AuthResultDTO ghostReset = GenAIChatController.sendPasswordResetCode('ghost@example.com');
        System.assertEquals(false, ghostReset.success);

        GenAIChatController.AuthResultDTO emptyVerify = GenAIChatController.verifyResetCodeAndSetPassword('', '', '');
        System.assertEquals(false, emptyVerify.success);

        GenAIChatController.AuthResultDTO shortNewPwd = GenAIChatController.verifyResetCodeAndSetPassword('test@example.com', '123456', '123');
        System.assertEquals(false, shortNewPwd.success);

        GenAIChatController.AuthResultDTO legacyReset = GenAIChatController.resetPassword('test@example.com', 'newpass');
        System.assertNotEquals(null, legacyReset);

        // 4. Change password validation
        GenAIChatController.AuthResultDTO changeInvalidToken = GenAIChatController.changePassword('invalid-token', 'old', 'new');
        System.assertEquals(false, changeInvalidToken.success);

        // 5. Update profile invalid token
        GenAIChatController.AuthResultDTO updateInvalid = GenAIChatController.updateUserProfile('invalid-token', 'name', 'bio', 'icon', 'data');
        System.assertEquals(false, updateInvalid.success);

        // 6. Record context and quick metrics
        Map<String, Object> rc = GenAIChatController.getRecordContext(null, 'Account');
        System.assertNotEquals(null, rc);

        GenAIChatController.OrgMetricsDTO metrics = GenAIChatController.getQuickOrgMetrics();
        System.assertNotEquals(null, metrics);

        // 7. Personas: service and admin
        String svcRes = GenAIChatController.getAIResponseAdvanced('Service query', 'sfdc_ai__DefaultGPT4Omni', null, 'service', null, null, null, null);
        System.assertNotEquals(null, svcRes);

        String admRes = GenAIChatController.getAIResponseAdvanced('Admin query', 'sfdc_ai__DefaultGPT4Omni', null, 'admin', null, null, null, null);
        System.assertNotEquals(null, admRes);

        // 8. Helper Actions: handleAction, SOQL, Task, Case, and Email History
        String actRes = GenAIChatController.handleAction('{"action":"query"}', new List<String>(), 'prompt', 'model');
        System.assertNotEquals(null, actRes);

        String soqlEmpty = GenAIChatController.processSalesforceDataQuery('', 'goal', 'prompt', 'model');
        System.assertNotEquals(null, soqlEmpty);

        String soqlInvalid = GenAIChatController.processSalesforceDataQuery('UPDATE Contact SET LastName = \'x\'', 'goal', 'prompt', 'model');
        System.assertNotEquals(null, soqlInvalid);

        String soqlValid = GenAIChatController.processSalesforceDataQuery('SELECT Id, Name FROM User LIMIT 1', 'goal', 'prompt', 'model');
        System.assertNotEquals(null, soqlValid);

        String taskRes = GenAIChatController.executeCreateTask(new Map<String, Object>{
            'subject' => 'Follow up on Agentforce',
            'priority' => 'High',
            'dueDate' => String.valueOf(Date.today().addDays(2))
        });
        System.assertNotEquals(null, taskRes);

        String caseRes = GenAIChatController.createCase(new Map<String, Object>{
            'email' => 'client@example.com',
            'subject' => 'Inquiry regarding Portal features'
        });
        System.assertNotEquals(null, caseRes);

        String existingCaseRes = GenAIChatController.checkExistingCase('client@example.com');
        System.assertNotEquals(null, existingCaseRes);

        String emailFromHist = GenAIChatController.getEmailFromHistory(new List<String>{'My email is user@domain.com'});
        System.assertEquals('user@domain.com', emailFromHist);

        Test.stopTest();
    }

    private class MockModelsApiSuccess implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setHeader('Content-Type', 'application/json');
            if (req.getEndpoint().contains('/token')) {
                res.setStatusCode(200);
                res.setBody('{"access_token":"mock-jwt-token-client-cred-123","instance_url":"https://external-dev-ed.my.salesforce.com","id":"https://login.salesforce.com/id/00D/005"}');
            } else if (req.getEndpoint().contains('/userinfo')) {
                res.setStatusCode(200);
                res.setBody('{"sub":"005xxx","username":"user@externalorg.com"}');
            } else if (req.getEndpoint().contains('/chat-generations') || req.getEndpoint().contains('/generations')) {
                res.setStatusCode(200);
                res.setBody('{"generationDetails":{"generations":[{"content":"External Org Model says Hello!","role":"assistant"}]},"generation":{"generatedText":"External Org Model says Hello!"}}');
            } else if (req.getEndpoint().contains('/id/')) {
                res.setStatusCode(200);
                res.setBody('{"username":"oauthuser@external.com"}');
            } else {
                res.setStatusCode(200);
                res.setBody('{"status":"ok"}');
            }
            return res;
        }
    }

    private class MockModelsApiError implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setHeader('Content-Type', 'application/json');
            res.setStatusCode(401);
            res.setBody('{"message":"Session expired or invalid"}');
            return res;
        }
    }

    @isTest
    static void testConnectedOrgCallouts() {
        Chat_User__c user = new Chat_User__c(
            Name = 'OAuth Tester',
            Email__c = 'oauthtest@example.com',
            Password_Hash__c = 'hashedpwd',
            Session_Token__c = 'token-oauth-success-12345',
            Last_Login__c = Datetime.now(),
            Is_Org_Connected__c = true,
            Connected_Org_Access_Token__c = 'mock-access-token-xyz',
            Connected_Org_Instance_Url__c = 'https://external-dev-ed.my.salesforce.com',
            Connected_Org_Type__c = 'Production / Developer',
            Connected_Org_Client_Id__c = 'client-id-abc'
        );
        insert user;

        Test.startTest();
        Test.setMock(HttpCalloutMock.class, new MockModelsApiSuccess());

        // 1. Test connection endpoint callout
        String testConn = GenAIChatController.testConnectedOrg('token-oauth-success-12345');
        System.assert(testConn.contains('Verified') || testConn.contains('200 OK'));

        // 2. Send chat message routed through connected org callout
        String aiResponse = GenAIChatController.getAIResponseAdvanced(
            'Hello from test',
            'sfdc_ai__DefaultGPT4Omni',
            new List<String>(),
            'general',
            null,
            null,
            null,
            null,
            'token-oauth-success-12345'
        );
        System.assertEquals('External Org Model says Hello!', aiResponse);

        Test.stopTest();
    }

    @isTest
    static void testConnectedOrgSaveAndDisconnect() {
        Chat_User__c user = new Chat_User__c(
            Name = 'OAuth Tester 2',
            Email__c = 'oauthtest2@example.com',
            Password_Hash__c = 'hashedpwd',
            Session_Token__c = 'token-oauth-save-12345',
            Last_Login__c = Datetime.now()
        );
        insert user;

        Test.startTest();

        // 1. Initially not connected
        GenAIChatController.ConnectedOrgDTO initialDto = GenAIChatController.getConnectedOrgDetails('token-oauth-save-12345');
        System.assertEquals(false, initialDto.isConnected);

        // 2. Save connected org (without external callout to idUrl)
        GenAIChatController.ConnectedOrgDTO savedDto = GenAIChatController.saveConnectedOrg(
            'token-oauth-save-12345',
            'mock-access-token-xyz',
            'https://external-dev-ed.my.salesforce.com/',
            'Production / Developer',
            'client-id-abc',
            'refresh-token-xyz',
            null
        );
        System.assertEquals(true, savedDto.isConnected);
        System.assertEquals('https://external-dev-ed.my.salesforce.com', savedDto.instanceUrl);

        // 3. Disconnect org
        Boolean disconnected = GenAIChatController.disconnectOrg('token-oauth-save-12345');
        System.assertEquals(true, disconnected);

        GenAIChatController.ConnectedOrgDTO postDisconnect = GenAIChatController.getConnectedOrgDetails('token-oauth-save-12345');
        System.assertEquals(false, postDisconnect.isConnected);

        Test.stopTest();
    }

    @isTest
    static void testConnectedOrgFlowErrorsAndEdgeCases() {
        Chat_User__c user = new Chat_User__c(
            Name = 'OAuth Err Tester',
            Email__c = 'oautherr@example.com',
            Password_Hash__c = 'hashedpwd',
            Session_Token__c = 'token-oauth-err-12345',
            Last_Login__c = Datetime.now(),
            Is_Org_Connected__c = true,
            Connected_Org_Access_Token__c = 'expired-token',
            Connected_Org_Instance_Url__c = 'https://external-dev-ed.my.salesforce.com'
        );
        insert user;

        Test.startTest();
        Test.setMock(HttpCalloutMock.class, new MockModelsApiError());

        // 1. Test connected org with 401 error
        String testRes = GenAIChatController.testConnectedOrg('token-oauth-err-12345');
        System.assert(testRes.contains('401'));

        // 2. Chat with expired token returns friendly notice
        String calloutErr = GenAIChatController.getAIResponseAdvanced(
            'Test with expired token',
            'sfdc_ai__DefaultGPT4Omni',
            new List<String>(),
            'general',
            null,
            null,
            null,
            null,
            'token-oauth-err-12345'
        );
        System.assert(calloutErr.contains('Connected Org Authentication Failed'));

        // 3. Validation exceptions on invalid sessions
        try {
            GenAIChatController.saveConnectedOrg('invalid-token', 'tok', 'https://org.com', 'Prod', 'cid', null, null);
            System.assert(false, 'Should have thrown exception for invalid session');
        } catch (AuraHandledException e) {
            System.assert(true);
        }

        try {
            GenAIChatController.disconnectOrg('invalid-token');
            System.assert(false, 'Should have thrown exception for invalid session');
        } catch (AuraHandledException e) {
            System.assert(true);
        }

        // 4. Test autoAuthorizeRemoteSite helper
        Boolean authRes = GenAIChatController.autoAuthorizeRemoteSite('https://auto-test-org.my.salesforce.com');
        System.assertEquals(false, authRes);

        Test.stopTest();
    }

    @isTest
    static void testClientCredentialsConnect() {
        Chat_User__c user = new Chat_User__c(
            Name = 'Client Creds Tester',
            Email__c = 'cc@example.com',
            Password_Hash__c = 'hashedpwd',
            Session_Token__c = 'token-cc-12345',
            Last_Login__c = Datetime.now()
        );
        insert user;

        Test.startTest();
        Test.setMock(HttpCalloutMock.class, new MockModelsApiSuccess());

        GenAIChatController.ConnectedOrgDTO dto = GenAIChatController.connectWithClientCredentials(
            'token-cc-12345',
            'https://external-dev-ed.my.salesforce.com',
            'my-client-id-xyz',
            'my-client-secret-123'
        );
        System.assertEquals(true, dto.isConnected);
        System.assertEquals('https://external-dev-ed.my.salesforce.com', dto.instanceUrl);

        Test.stopTest();
    }

    @isTest
    static void testClientCredentialsTokenRefresh() {
        Chat_User__c user = new Chat_User__c(
            Name = 'Client Creds Refresh Tester',
            Email__c = 'ccrefresh@example.com',
            Password_Hash__c = 'hashedpwd',
            Session_Token__c = 'token-cc-ref-12345',
            Last_Login__c = Datetime.now(),
            Is_Org_Connected__c = true,
            Connected_Org_Instance_Url__c = 'https://external-dev-ed.my.salesforce.com',
            Connected_Org_Client_Id__c = 'my-client-id-xyz',
            Connected_Org_Client_Secret__c = 'my-client-secret-123',
            Connected_Org_Access_Token__c = 'old-expired-token'
        );
        insert user;

        Test.startTest();
        Test.setMock(HttpCalloutMock.class, new MockModelsApiSuccess());

        String refreshedTok = GenAIChatController.refreshClientCredentialsToken(user);
        System.assertNotEquals(null, refreshedTok);

        Test.stopTest();
    }

    @isTest
    static void testClientCredentialsChatRouting() {
        Chat_User__c user = new Chat_User__c(
            Name = 'Client Creds Chat Tester',
            Email__c = 'ccchat@example.com',
            Password_Hash__c = 'hashedpwd',
            Session_Token__c = 'token-cc-chat-12345',
            Last_Login__c = Datetime.now(),
            Is_Org_Connected__c = true,
            Connected_Org_Instance_Url__c = 'https://external-dev-ed.my.salesforce.com',
            Connected_Org_Client_Id__c = 'my-client-id-xyz',
            Connected_Org_Client_Secret__c = 'my-client-secret-123',
            Connected_Org_Access_Token__c = 'mock-jwt-token-client-cred-123',
            Connected_Org_Type__c = 'Client Credentials (ECA)',
            Connected_Org_Username__c = 'Client Credentials User',
            Connected_Org_Connected_Date__c = Datetime.now()
        );
        insert user;

        Test.startTest();
        Test.setMock(HttpCalloutMock.class, new MockModelsApiSuccess());

        String aiResponse = GenAIChatController.getAIResponseAdvanced(
            'Tell me about models',
            'sfdc_ai__DefaultOpenAIGPT4OmniMini',
            new List<String>(),
            'general',
            null,
            null,
            null,
            null,
            'token-cc-chat-12345'
        );
        System.assertEquals('External Org Model says Hello!', aiResponse);

        Test.stopTest();
    }

    @isTest
    static void testAdminAnalyticsAndDisconnectUserOrg() {
        // Create an admin user
        Chat_User__c adminUser = new Chat_User__c(
            Name = 'Super Admin',
            Email__c = 'superadmin@example.com',
            Password_Hash__c = 'hashedpwd',
            Session_Token__c = 'token-admin-test-xyz',
            Last_Login__c = Datetime.now(),
            Is_Admin__c = true
        );
        insert adminUser;

        // Create a regular user with connected org
        Chat_User__c regularUser = new Chat_User__c(
            Name = 'Connected Worker',
            Email__c = 'worker@example.com',
            Password_Hash__c = 'hashedpwd',
            Session_Token__c = 'token-worker-test-xyz',
            Last_Login__c = Datetime.now(),
            Is_Admin__c = false,
            Is_Org_Connected__c = true,
            Connected_Org_Instance_Url__c = 'https://connected-dev-ed.my.salesforce.com',
            Connected_Org_Client_Id__c = 'worker-client-id-999',
            Connected_Org_Type__c = 'Client Credentials (ECA)',
            Connected_Org_Username__c = 'Worker Org User',
            Connected_Org_Connected_Date__c = Datetime.now()
        );
        insert regularUser;

        Test.startTest();

        // 1. Fetch admin analytics
        GenAIChatController.AdminAnalyticsDTO analytics = GenAIChatController.getAdminAnalytics('token-admin-test-xyz');
        System.assertNotEquals(null, analytics, 'Analytics should not be null');
        System.assert(analytics.totalUsers >= 2, 'Total users should include admin and worker');
        System.assert(analytics.connectedOrgsCount >= 1, 'Connected org count should be at least 1');

        // 2. Update user configuration
        Boolean updateSuccess = GenAIChatController.updateUserConfiguration(
            'token-admin-test-xyz',
            regularUser.Id,
            'Connected Worker Updated',
            'Worker Bio description',
            '',
            false,
            false,
            true,
            true,
            true
        );
        System.assertEquals(true, updateSuccess, 'User config update should succeed');

        // 3. Admin disconnect user org
        Boolean disconnectSuccess = GenAIChatController.adminDisconnectUserOrg('token-admin-test-xyz', regularUser.Id);
        System.assertEquals(true, disconnectSuccess, 'Disconnect should succeed');

        Chat_User__c reloaded = [SELECT Is_Org_Connected__c, Connected_Org_Access_Token__c, Connected_Org_Client_Id__c FROM Chat_User__c WHERE Id = :regularUser.Id];
        System.assertEquals(false, reloaded.Is_Org_Connected__c, 'Org should be disconnected');
        System.assertEquals(null, reloaded.Connected_Org_Access_Token__c, 'Access token should be cleared');
        System.assertEquals(null, reloaded.Connected_Org_Client_Id__c, 'Client ID should be cleared');

        Test.stopTest();
    }

    @isTest
    static void testCommunityThreadedRepliesAndQuoting() {
        GenAIChatController.AuthResultDTO reg = GenAIChatController.registerUser(
            'Reply Author',
            'replyauthor@example.com',
            'Password123!',
            'standard:user',
            'Senior Architect'
        );
        String token = reg.user.sessionToken;

        Test.startTest();

        // 1. Post root community discussion
        GenAIChatController.CommunityMessageDTO rootPost = GenAIChatController.postCommunityMessage(
            token,
            'Master discussion thread for Enterprise Architecture & Agentforce AI workflows.',
            'Announcement',
            null
        );
        System.assertNotEquals(null, rootPost, 'Root post should be created');
        System.assertEquals(false, rootPost.isReply, 'Should not be marked as reply');

        // 2. Post multiple nested replies to this thread
        GenAIChatController.CommunityMessageDTO reply1 = GenAIChatController.postCommunityMessage(
            token,
            'First reply: Completely agree, models should leverage zero-shot reasoning.',
            'Announcement',
            rootPost.id
        );
        System.assertNotEquals(null, reply1, 'Reply 1 should be created');
        System.assertEquals(rootPost.id, reply1.parentMessageId, 'Parent ID should match');
        System.assertEquals('Reply Author', reply1.replyToAuthorName, 'Reply to author name should match');

        GenAIChatController.CommunityMessageDTO reply2 = GenAIChatController.postCommunityMessage(
            token,
            'Second reply: Also ensure end-to-end encryption for private direct discussions.',
            'Announcement',
            rootPost.id
        );
        System.assertNotEquals(null, reply2, 'Reply 2 should be created');

        // 3. Fetch community messages and verify thread structure
        List<GenAIChatController.CommunityMessageDTO> allMsgs = GenAIChatController.getCommunityMessages(token, 'All');
        System.assertNotEquals(0, allMsgs.size(), 'Should return discussions');

        Boolean foundRoot = false;
        for (GenAIChatController.CommunityMessageDTO m : allMsgs) {
            if (m.id == rootPost.id) {
                foundRoot = true;
                System.assert(m.replyCount >= 2, 'Reply count should be at least 2');
                System.assertNotEquals(null, m.replies, 'Replies list should be populated');
            }
        }
        System.assertEquals(true, foundRoot, 'Root post should be found in feed');

        // 4. Fetch replies directly via getCommunityMessageReplies
        List<GenAIChatController.CommunityMessageDTO> threadReplies = GenAIChatController.getCommunityMessageReplies(token, rootPost.id);
        System.assert(threadReplies.size() >= 2, 'Should return at least 2 replies for the thread');

        Test.stopTest();
    }

    @isTest
    static void testEndToEndEncryptedPersonalDirectMessaging() {
        // 1. Register Alice and Bob
        GenAIChatController.AuthResultDTO regAlice = GenAIChatController.registerUser(
            'Alice Crypto',
            'alice.crypto@example.com',
            'Password123!',
            'standard:user',
            'Security Lead'
        );
        String aliceToken = regAlice.user.sessionToken;
        String aliceId = regAlice.user.id;

        GenAIChatController.AuthResultDTO regBob = GenAIChatController.registerUser(
            'Bob Crypto',
            'bob.crypto@example.com',
            'Password123!',
            'standard:user',
            'Cryptographer'
        );
        String bobToken = regBob.user.sessionToken;
        String bobId = regBob.user.id;

        Test.startTest();

        // 2. Publish ECDH Public Keys
        String alicePubKey = '{"crv":"P-256","ext":true,"key_ops":[],"kty":"EC","x":"alice_pub_x_data","y":"alice_pub_y_data"}';
        String aliceFingerprint = 'A1B2-C3D4-E5F6-7890';
        Boolean alicePubRes = GenAIChatController.publishUserPublicKey(aliceToken, alicePubKey, aliceFingerprint);
        System.assertEquals(true, alicePubRes, 'Alice public key publication should succeed');

        String bobPubKey = '{"crv":"P-256","ext":true,"key_ops":[],"kty":"EC","x":"bob_pub_x_data","y":"bob_pub_y_data"}';
        String bobFingerprint = 'F1E2-D3C4-B5A6-0987';
        Boolean bobPubRes = GenAIChatController.publishUserPublicKey(bobToken, bobPubKey, bobFingerprint);
        System.assertEquals(true, bobPubRes, 'Bob public key publication should succeed');

        // 3. Bob queries chat partners
        List<GenAIChatController.ChatPartnerDTO> partners = GenAIChatController.getChatPartners(bobToken);
        System.assertNotEquals(0, partners.size(), 'Chat partners list should not be empty');
        Boolean foundAlice = false;
        for (GenAIChatController.ChatPartnerDTO p : partners) {
            if (p.id == aliceId) {
                foundAlice = true;
                System.assertEquals(alicePubKey, p.publicKey, 'Alice public key should match');
                System.assertEquals(aliceFingerprint, p.keyFingerprint, 'Alice fingerprint should match');
            }
        }
        System.assertEquals(true, foundAlice, 'Alice should be in Bob partners list');

        // 4. Alice sends an End-to-End Encrypted (E2EE) Direct Message to Bob
        String ciphertext = 'QUVTLUdDTS0yNTYtQ0lQSEVSLVRFWFQtU0FNUExF';
        String iv = 'MTIzNDU2Nzg5MDEy';
        String tag = 'QVVUSC1UQUctRGF0YQ==';
        GenAIChatController.DirectMessageDTO sentDm = GenAIChatController.sendDirectMessage(
            aliceToken,
            bobId,
            ciphertext,
            iv,
            tag,
            aliceFingerprint,
            alicePubKey
        );
        System.assertNotEquals(null, sentDm, 'Sent DM should not be null');
        System.assertEquals(ciphertext, sentDm.encryptedPayload, 'Payload should match ciphertext');
        System.assertEquals(true, sentDm.isEncrypted, 'Message should be marked encrypted');

        // Verify zero plaintext in database
        Community_Message__c rawDbMsg = [
            SELECT Id, Message_Content__c, Encrypted_Payload__c, Encryption_IV__c, Is_Encrypted__c, Is_Direct_Message__c 
            FROM Community_Message__c 
            WHERE Id = :sentDm.id 
            LIMIT 1
        ];
        System.assertEquals(true, rawDbMsg.Is_Encrypted__c, 'DB record should be encrypted');
        System.assertEquals(true, rawDbMsg.Is_Direct_Message__c, 'DB record should be direct message');
        System.assert(rawDbMsg.Message_Content__c.contains('Encrypted'), 'Plaintext should never be stored in Message_Content__c');

        // 5. Bob queries direct messages from Alice
        List<GenAIChatController.DirectMessageDTO> bobDms = GenAIChatController.getDirectMessages(bobToken, aliceId);
        System.assertEquals(1, bobDms.size(), 'Bob should retrieve exactly 1 message');
        System.assertEquals(sentDm.id, bobDms[0].id, 'Message ID should match');

        // 6. Security Check: Charlie should NOT be able to see Alice & Bob messages
        GenAIChatController.AuthResultDTO regCharlie = GenAIChatController.registerUser(
            'Charlie Snooper',
            'charlie@example.com',
            'Password123!',
            'standard:user',
            'Auditor'
        );
        String charlieToken = regCharlie.user.sessionToken;
        List<GenAIChatController.DirectMessageDTO> charlieDms = GenAIChatController.getDirectMessages(charlieToken, aliceId);
        System.assertEquals(0, charlieDms.size(), 'Charlie must see 0 messages between Alice and Bob');

        // 7. Delete Direct Message
        Boolean deleted = GenAIChatController.deleteDirectMessage(aliceToken, sentDm.id);
        System.assertEquals(true, deleted, 'Alice should be able to delete her sent message');

        Test.stopTest();
    }

    @isTest
    static void testStressTestingAndSecurityLimits() {
        // Register User
        GenAIChatController.AuthResultDTO reg = GenAIChatController.registerUser(
            'Stress Tester',
            'stresstester@example.com',
            'Password123!',
            'standard:user',
            'Performance QA'
        );
        String token = reg.user.sessionToken;
        String userId = reg.user.id;

        GenAIChatController.AuthResultDTO regPartner = GenAIChatController.registerUser(
            'Stress Partner',
            'stresspartner@example.com',
            'Password123!',
            'standard:user',
            'Performance Partner'
        );
        String partnerId = regPartner.user.id;

        Test.startTest();

        // 1. Bulk stress test: simulate rapid burst of messages & replies
        GenAIChatController.CommunityMessageDTO root = GenAIChatController.postCommunityMessage(
            token,
            'Root thread under load test',
            'General',
            null
        );

        for (Integer i = 0; i < 15; i++) {
            GenAIChatController.postCommunityMessage(
                token,
                'Burst reply #' + i + ' testing governor limits and query optimization',
                'General',
                root.id
            );
        }

        // Retrieve messages with 15 replies in single query
        List<GenAIChatController.CommunityMessageDTO> burstFeed = GenAIChatController.getCommunityMessages(token, 'All');
        System.assertNotEquals(0, burstFeed.size(), 'Feed should load smoothly under load');

        // 2. High capacity payload testing (boundary test with large message)
        String largeContent = 'Stress testing boundary payload length verification. '.repeat(100);
        GenAIChatController.CommunityMessageDTO largePost = GenAIChatController.postCommunityMessage(
            token,
            largeContent,
            'General'
        );
        System.assertNotEquals(null, largePost, 'Large content should be accepted and safely persisted');

        // 3. Security Boundary: Frozen user cannot post or send encrypted messages
        Chat_User__c userRecord = [SELECT Id, Is_Frozen__c, Can_Use_Community__c FROM Chat_User__c WHERE Id = :userId LIMIT 1];
        userRecord.Is_Frozen__c = true;
        update userRecord;

        try {
            GenAIChatController.postCommunityMessage(token, 'Attempting frozen post', 'General');
            System.assert(false, 'Frozen user should not be allowed to post');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('frozen') || e.getMessage().contains('Script-thrown exception'), 'Expected frozen account rejection');
        }

        try {
            GenAIChatController.sendDirectMessage(token, partnerId, 'cipher', 'iv', 'tag', 'fp', 'pk');
            System.assert(false, 'Frozen user should not be allowed to send direct messages');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('frozen') || e.getMessage().contains('Script-thrown exception'), 'Expected frozen account rejection');
        }

        // 4. Security Boundary: Invalid session token rejected
        try {
            GenAIChatController.getCommunityMessages('invalid-fake-token-999', 'All');
            System.assert(false, 'Invalid token must be rejected');
        } catch (AuraHandledException e) {
            System.assert(true, 'Invalid session token properly rejected');
        }

        Test.stopTest();
    }
}

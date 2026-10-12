@IsTest
private class GeminiLwcControllerTest {

    private class GeminiHttpMock implements HttpCalloutMock {
        private Integer statusCode;
        private String responseBody;

        public GeminiHttpMock(Integer statusCode, String responseBody) {
            this.statusCode = statusCode;
            this.responseBody = responseBody;
        }

        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setHeader('Content-Type', 'application/json');
            res.setStatusCode(this.statusCode);
            res.setBody(this.responseBody);
            return res;
        }
    }

    private static String getSampleSuccessResponse() {
        return '{\n' +
            '  "candidates": [{\n' +
            '    "content": {\n' +
            '      "parts": [{\n' +
            '        "text": "Hello! Here is a query:\\n```soql\\nSELECT Id, Name FROM Account LIMIT 10\\n```"\n' +
            '      }],\n' +
            '      "role": "model"\n' +
            '    },\n' +
            '    "finishReason": "STOP"\n' +
            '  }],\n' +
            '  "usageMetadata": {\n' +
            '    "promptTokenCount": 25,\n' +
            '    "candidatesTokenCount": 40,\n' +
            '    "totalTokenCount": 65\n' +
            '  }\n' +
            '}';
    }

    @TestSetup
    static void setupTestData() {
        Gemini_Settings__c settings = new Gemini_Settings__c();
        settings.SetupOwnerId = UserInfo.getOrganizationId();
        settings.API_Key__c = 'AIzaSyTestApiKey1234567890';
        settings.Default_Model__c = 'gemini-3.8-flash';
        settings.Endpoint_URL__c = 'https://generativelanguage.googleapis.com/v1beta';
        settings.Temperature__c = 0.7;
        settings.Max_Output_Tokens__c = 4096;
        settings.System_Instruction__c = 'You are a test Gemini assistant.';
        insert settings;

        Account testAcc = new Account(Name = 'Test Gemini Account');
        insert testAcc;

        Task testTask = new Task(Subject = 'Test Followup', WhatId = testAcc.Id, Status = 'Not Started', Priority = 'Normal');
        insert testTask;
    }

    @IsTest
    static void testGetAndSaveSettings() {
        Test.startTest();
        Map<String, Object> settings = GeminiLwcController.getSettings();
        System.assertNotEquals(null, settings);
        System.assertEquals(true, settings.get('isConfigured'));

        // Save new settings
        Map<String, Object> saved = GeminiLwcController.saveSettings('AIzaSyUpdatedKey123', 'gemini-3.5-flash', 'https://generativelanguage.googleapis.com/v1beta', 0.5, 2048, 'Updated prompt');
        System.assertEquals('gemini-3.5-flash', saved.get('defaultModel'));
        Test.stopTest();
    }

    @IsTest
    static void testTestConnectionSuccess() {
        Test.setMock(HttpCalloutMock.class, new GeminiHttpMock(200, getSampleSuccessResponse()));

        Test.startTest();
        Map<String, Object> result = GeminiLwcController.testConnection('testKey', 'gemini-3.8-flash');
        Test.stopTest();

        System.assertEquals(true, result.get('success'));
    }

    @IsTest
    static void testTestConnectionFailure() {
        Test.setMock(HttpCalloutMock.class, new GeminiHttpMock(403, '{"error":{"message":"API key not valid"}}'));

        Test.startTest();
        Map<String, Object> result = GeminiLwcController.testConnection('invalidKey', 'gemini-3.8-flash');
        Test.stopTest();

        System.assertEquals(false, result.get('success'));
    }

    @IsTest
    static void testGenerateContent() {
        Test.setMock(HttpCalloutMock.class, new GeminiHttpMock(200, getSampleSuccessResponse()));
        Account acc = [SELECT Id FROM Account LIMIT 1];

        String chatHistory = '[{"role":"user","text":"Hi"},{"role":"model","text":"Hello"}]';

        Test.startTest();
        Map<String, Object> result = GeminiLwcController.generateContent(
            'Write me a SOQL query for accounts',
            'gemini-3.8-flash',
            'Test prompt',
            0.7,
            2048,
            chatHistory,
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'image/png',
            acc.Id,
            'Account',
            true
        );
        Test.stopTest();

        System.assertEquals(true, result.get('success'));
        System.assertNotEquals(null, result.get('text'));
        System.assertNotEquals(null, result.get('extractedSoql'));
    }

    @IsTest
    static void testGetRecordContextAccount() {
        Account acc = [SELECT Id FROM Account LIMIT 1];

        Test.startTest();
        Map<String, Object> ctx = GeminiLwcController.getRecordContext(acc.Id, 'Account');
        Test.stopTest();

        System.assertNotEquals(null, ctx);
        System.assertEquals('Account', ctx.get('objectName'));
    }

    @IsTest
    static void testGetRecordContextApexClass() {
        ApexClass cls = [SELECT Id, Name FROM ApexClass WHERE Name = 'GeminiLwcController' LIMIT 1];

        Test.startTest();
        Map<String, Object> ctx = GeminiLwcController.getRecordContext(cls.Id, 'ApexClass');
        Test.stopTest();

        System.assertNotEquals(null, ctx);
        System.assertEquals('ApexClass', ctx.get('objectName'));
        System.assertNotEquals(null, ctx.get('markdownContext'));
    }

    @IsTest
    static void testGetRecordContextToolingBundle() {
        GeminiLwcController.mockToolingResponse = '{"size":1,"records":[{"Id":"0RbgL000001DWSvSAO","DeveloperName":"geminiStudio","MasterLabel":"Gemini Studio","Description":"AI Studio","ApiVersion":63.0}]}';

        Test.startTest();
        Map<String, Object> ctx = GeminiLwcController.getRecordContext('0RbgL000001DWSvSAO', 'LightningComponentBundle');
        Test.stopTest();

        System.assertNotEquals(null, ctx);
        System.assertEquals('LightningComponentBundle', ctx.get('objectName'));
    }

    @IsTest
    static void testExecuteSafeSoql() {
        Test.startTest();
        Map<String, Object> res = GeminiLwcController.executeSafeSoql('SELECT Id, Name FROM Account LIMIT 5');
        Test.stopTest();

        System.assertEquals(true, res.get('success'));
        System.assertNotEquals(null, res.get('rows'));
    }

    @IsTest
    static void testExecuteSafeSoqlSecurityCheck() {
        Test.startTest();
        try {
            GeminiLwcController.executeSafeSoql('DELETE FROM Account');
            System.assert(false, 'Expected AuraHandledException');
        } catch (AuraHandledException ex) {
            System.assert(true);
        }
        Test.stopTest();
    }

    @IsTest
    static void testExecuteSafeSoqlToolingFallback() {
        GeminiLwcController.mockToolingResponse = '{"size":1,"records":[{"Id":"0RbgL000001DWSvSAO","DeveloperName":"geminiStudio","MasterLabel":"Gemini Studio"}]}';

        Test.startTest();
        Map<String, Object> res = GeminiLwcController.executeSafeSoql('SELECT Id, DeveloperName, MasterLabel FROM LightningComponentBundle LIMIT 5');
        Test.stopTest();

        System.assertNotEquals(null, res);
        System.assertEquals(true, res.get('success'));
    }

    @IsTest
    static void testCreateSalesforceTask() {
        Account acc = [SELECT Id FROM Account LIMIT 1];

        Test.startTest();
        Map<String, Object> res = GeminiLwcController.createSalesforceTask(acc.Id, 'Follow-up Call', 'Discuss pricing', 'High', 'Not Started', Date.today().addDays(1));
        Test.stopTest();

        System.assertEquals(true, res.get('success'));
        System.assertNotEquals(null, res.get('taskId'));
    }

    @IsTest
    static void testSearchRecords() {
        Test.startTest();
        Test.setFixedSearchResults(new List<Id>{ [SELECT Id FROM Account LIMIT 1].Id });
        List<Map<String, String>> searchRes = GeminiLwcController.searchRecords('Test', 'ALL');
        List<Map<String, String>> searchCode = GeminiLwcController.searchRecords('Gemini', 'CODE');
        List<Map<String, String>> searchCrm = GeminiLwcController.searchRecords('Test', 'CRM');
        Test.stopTest();

        System.assertNotEquals(null, searchRes);
        System.assertNotEquals(null, searchCode);
        System.assertNotEquals(null, searchCrm);
    }
}

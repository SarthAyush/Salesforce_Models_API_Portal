public without sharing class GeminiLwcController {

    public class GeminiException extends Exception {}

    // Mock response holder for Tooling API unit tests
    @TestVisible
    private static String mockToolingResponse = null;

    /**
     * Normalize model to only supported models: gemini-3.8-flash or gemini-3.5-flash
     */
    public static String normalizeModel(String model) {
        if (String.isNotBlank(model)) {
            String lower = model.trim().toLowerCase();
            if (lower == 'gemini-3.5-flash' || lower.contains('3.5')) {
                return 'gemini-3.5-flash';
            }
        }
        return 'gemini-3.8-flash';
    }

    private static String getDefaultSystemInstruction() {
        return 'You are Google Gemini embedded in Salesforce CRM. You have direct Salesforce org data access, including all CRM objects (standard and custom) and Tooling/Metadata data (Apex classes, triggers, Lightning Web Components, Aura bundles, Flows, Objects/Entity definitions, validation rules). When grounded with a Salesforce record, code component, or metadata definition, provide precise, actionable insights. When users ask to query data, write an optimized SOQL or Tooling SOQL query in ```soql ... ``` blocks—the system automatically executes it and displays live records. Always format responses with clear markdown headers, bold text, bullet points, and tables.';
    }

    /**
     * Retrieve Gemini Settings from Custom Setting
     */
    @AuraEnabled(cacheable=false)
    public static Map<String, Object> getSettings() {
        Gemini_Settings__c settings = Gemini_Settings__c.getOrgDefaults();
        Map<String, Object> result = new Map<String, Object>();

        Boolean isConfigured = (settings != null && String.isNotBlank(settings.API_Key__c));
        String rawKey = (settings != null && String.isNotBlank(settings.API_Key__c)) ? settings.API_Key__c : '';
        String maskedKey = '';
        if (isConfigured && rawKey.length() > 8) {
            maskedKey = rawKey.substring(0, 4) + '••••••••' + rawKey.substring(rawKey.length() - 4);
        } else if (isConfigured) {
            maskedKey = '••••••••';
        }

        result.put('isConfigured', isConfigured);
        result.put('maskedApiKey', maskedKey);
        result.put('defaultModel', (settings != null && String.isNotBlank(settings.Default_Model__c)) ? normalizeModel(settings.Default_Model__c) : 'gemini-3.8-flash');
        result.put('endpointUrl', (settings != null && String.isNotBlank(settings.Endpoint_URL__c)) ? settings.Endpoint_URL__c : 'https://generativelanguage.googleapis.com/v1beta');
        result.put('temperature', (settings != null && settings.Temperature__c != null) ? settings.Temperature__c : 0.7);
        result.put('maxTokens', (settings != null && settings.Max_Output_Tokens__c != null) ? Integer.valueOf(settings.Max_Output_Tokens__c) : 8192);
        result.put('systemInstruction', (settings != null && String.isNotBlank(settings.System_Instruction__c)) ? settings.System_Instruction__c : getDefaultSystemInstruction());
        result.put('canManageSettings', FeatureManagement.checkPermission('CustomizeApplication') || isSystemAdmin());

        return result;
    }

    private static Boolean isSystemAdmin() {
        Profile p = [SELECT Name FROM Profile WHERE Id = :UserInfo.getProfileId() LIMIT 1];
        return p.Name == 'System Administrator';
    }

    /**
     * Save/Update Gemini Settings in Custom Setting
     */
    @AuraEnabled(cacheable=false)
    public static Map<String, Object> saveSettings(String apiKey, String defaultModel, String endpointUrl, Decimal temperature, Integer maxTokens, String systemInstruction) {
        try {
            Gemini_Settings__c settings = Gemini_Settings__c.getOrgDefaults();
            if (settings == null || settings.Id == null) {
                settings = new Gemini_Settings__c();
                settings.SetupOwnerId = UserInfo.getOrganizationId();
            }

            // Only update key if provided and not masked
            if (String.isNotBlank(apiKey) && !apiKey.contains('••••')) {
                settings.API_Key__c = apiKey.trim();
            }

            settings.Default_Model__c = normalizeModel(defaultModel);
            settings.Endpoint_URL__c = String.isNotBlank(endpointUrl) ? endpointUrl.trim() : 'https://generativelanguage.googleapis.com/v1beta';
            settings.Temperature__c = (temperature != null) ? temperature : 0.7;
            settings.Max_Output_Tokens__c = (maxTokens != null) ? maxTokens : 8192;
            if (String.isNotBlank(systemInstruction)) {
                settings.System_Instruction__c = systemInstruction.length() > 255 ? systemInstruction.substring(0, 255) : systemInstruction;
            } else {
                settings.System_Instruction__c = getDefaultSystemInstruction();
            }

            upsert settings;

            return getSettings();
        } catch (Exception ex) {
            throw new AuraHandledException('Failed to save Gemini settings: ' + ex.getMessage());
        }
    }

    /**
     * Test connection to Google Gemini API
     */
    @AuraEnabled(cacheable=false)
    public static Map<String, Object> testConnection(String tempApiKey, String testModel) {
        Long startTime = System.currentTimeMillis();
        try {
            String apiKey = resolveApiKey(tempApiKey);
            Gemini_Settings__c settings = Gemini_Settings__c.getOrgDefaults();
            String model = normalizeModel(String.isNotBlank(testModel) ? testModel : (settings != null ? settings.Default_Model__c : 'gemini-3.8-flash'));
            String baseUrl = (settings != null && String.isNotBlank(settings.Endpoint_URL__c)) ? settings.Endpoint_URL__c : 'https://generativelanguage.googleapis.com/v1beta';
            String endpoint = baseUrl + '/models/' + model + ':generateContent?key=' + EncodingUtil.urlEncode(apiKey, 'UTF-8');

            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(30000);

            Map<String, Object> part = new Map<String, Object>{ 'text' => 'Respond with: "Hello from Google Gemini! Connection verified successfully."' };
            Map<String, Object> content = new Map<String, Object>{
                'role' => 'user',
                'parts' => new List<Object>{ part }
            };
            Map<String, Object> payload = new Map<String, Object>{
                'contents' => new List<Object>{ content },
                'generationConfig' => new Map<String, Object>{
                    'temperature' => 0.1,
                    'maxOutputTokens' => 64
                }
            };
            req.setBody(JSON.serialize(payload));

            Http http = new Http();
            HttpResponse res = http.send(req);
            Long duration = System.currentTimeMillis() - startTime;

            if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
                Map<String, Object> respMap = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                String responseText = extractTextFromGeminiResponse(respMap);
                return new Map<String, Object>{
                    'success' => true,
                    'latencyMs' => duration,
                    'model' => model,
                    'message' => responseText
                };
            } else {
                return new Map<String, Object>{
                    'success' => false,
                    'statusCode' => res.getStatusCode(),
                    'error' => 'API returned ' + res.getStatusCode() + ': ' + res.getBody()
                };
            }
        } catch (Exception ex) {
            return new Map<String, Object>{
                'success' => false,
                'error' => ex.getMessage()
            };
        }
    }

    /**
     * Generate content with Google Gemini API and automatically execute Salesforce queries
     */
    @AuraEnabled(cacheable=false)
    public static Map<String, Object> generateContent(
        String prompt,
        String modelName,
        String systemInstruction,
        Decimal temperature,
        Integer maxTokens,
        String chatHistoryJson,
        String base64MediaData,
        String mimeType,
        String recordId,
        String objectApiName,
        Boolean includeRecordContext
    ) {
        Long startTime = System.currentTimeMillis();
        try {
            String apiKey = resolveApiKey(null);
            Gemini_Settings__c settings = Gemini_Settings__c.getOrgDefaults();

            String model = normalizeModel(String.isNotBlank(modelName) ? modelName : (settings != null ? settings.Default_Model__c : 'gemini-3.8-flash'));
            String baseUrl = (settings != null && String.isNotBlank(settings.Endpoint_URL__c)) ? settings.Endpoint_URL__c : 'https://generativelanguage.googleapis.com/v1beta';
            String endpoint = baseUrl + '/models/' + model + ':generateContent?key=' + EncodingUtil.urlEncode(apiKey, 'UTF-8');

            // Grounding with record/tooling context if requested
            String fullPrompt = prompt;
            String recordSummary = '';
            if (includeRecordContext == true && String.isNotBlank(recordId)) {
                Map<String, Object> recCtx = getRecordContext(recordId, objectApiName);
                if (recCtx != null && recCtx.containsKey('markdownContext')) {
                    recordSummary = (String) recCtx.get('markdownContext');
                    fullPrompt = '### CURRENT SALESFORCE RECORD & TOOLING CONTEXT:\n' + recordSummary + '\n\n### USER QUERY:\n' + prompt;
                }
            }

            // Build payload
            Map<String, Object> payload = new Map<String, Object>();

            // System Instruction
            String sysInst = String.isNotBlank(systemInstruction) ? systemInstruction : (settings != null ? settings.System_Instruction__c : getDefaultSystemInstruction());
            if (String.isNotBlank(sysInst)) {
                payload.put('system_instruction', new Map<String, Object>{
                    'parts' => new List<Object>{
                        new Map<String, Object>{ 'text' => sysInst }
                    }
                });
            }

            // Contents (multi-turn history + current message)
            List<Object> contents = new List<Object>();

            if (String.isNotBlank(chatHistoryJson)) {
                List<Object> historyList = (List<Object>) JSON.deserializeUntyped(chatHistoryJson);
                for (Object hObj : historyList) {
                    Map<String, Object> hMap = (Map<String, Object>) hObj;
                    String role = (String) hMap.get('role');
                    String text = (String) hMap.get('text');
                    if (String.isNotBlank(text)) {
                        contents.add(new Map<String, Object>{
                            'role' => (role == 'assistant' || role == 'model') ? 'model' : 'user',
                            'parts' => new List<Object>{
                                new Map<String, Object>{ 'text' => text }
                            }
                        });
                    }
                }
            }

            // Current turn
            List<Object> currentParts = new List<Object>();
            currentParts.add(new Map<String, Object>{ 'text' => fullPrompt });

            // Multimodal inline data
            if (String.isNotBlank(base64MediaData) && String.isNotBlank(mimeType)) {
                currentParts.add(new Map<String, Object>{
                    'inline_data' => new Map<String, Object>{
                        'mime_type' => mimeType,
                        'data' => base64MediaData
                    }
                });
            }

            contents.add(new Map<String, Object>{
                'role' => 'user',
                'parts' => currentParts
            });
            payload.put('contents', contents);

            // Generation config
            Map<String, Object> genConfig = new Map<String, Object>();
            genConfig.put('temperature', (temperature != null) ? temperature : 0.7);
            genConfig.put('maxOutputTokens', (maxTokens != null) ? maxTokens : 8192);
            payload.put('generationConfig', genConfig);

            // Make HTTP Request
            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(120000);
            req.setBody(JSON.serialize(payload));

            Http http = new Http();
            HttpResponse res = http.send(req);
            Long duration = System.currentTimeMillis() - startTime;

            if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
                Map<String, Object> respMap = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                String responseText = extractTextFromGeminiResponse(respMap);
                Map<String, Object> usage = extractUsageMetadata(respMap);

                // Detect embedded SOQL query if any and execute it automatically (supporting both standard and Tooling SOQL)
                String extractedSoql = extractSoqlFromText(responseText);
                Map<String, Object> queryResults = null;
                if (String.isNotBlank(extractedSoql)) {
                    try {
                        queryResults = executeSafeSoql(extractedSoql);
                    } catch (Exception soqlEx) {
                        System.debug('SOQL auto-execution failed: ' + soqlEx.getMessage());
                    }
                }

                return new Map<String, Object>{
                    'success' => true,
                    'text' => responseText,
                    'model' => model,
                    'latencyMs' => duration,
                    'promptTokens' => usage.get('promptTokens'),
                    'candidateTokens' => usage.get('candidateTokens'),
                    'totalTokens' => usage.get('totalTokens'),
                    'extractedSoql' => extractedSoql,
                    'queryResults' => queryResults,
                    'recordContextUsed' => String.isNotBlank(recordSummary)
                };
            } else {
                throw new GeminiException('Google Gemini API Error (Status ' + res.getStatusCode() + '): ' + res.getBody());
            }

        } catch (Exception ex) {
            throw new AuraHandledException(ex.getMessage());
        }
    }

    /**
     * Inspect record or tooling component and build comprehensive 360-degree context for Gemini
     * Supports CRM records (Standard & Custom), Apex Classes, Apex Triggers, LWCs, Aura Bundles, Flows, EntityDefinitions, Validation Rules
     */
    @AuraEnabled(cacheable=false)
    public static Map<String, Object> getRecordContext(String recordId, String objectApiName) {
        Map<String, Object> result = new Map<String, Object>();
        if (String.isBlank(recordId)) {
            return result;
        }

        try {
            String sObjName = String.isNotBlank(objectApiName) ? objectApiName.trim() : '';

            // Detect type by prefix if not provided
            if (String.isBlank(sObjName)) {
                if (recordId.startsWith('01p')) {
                    sObjName = 'ApexClass';
                } else if (recordId.startsWith('01q')) {
                    sObjName = 'ApexTrigger';
                } else if (recordId.startsWith('0Rb')) {
                    sObjName = 'LightningComponentBundle';
                } else if (recordId.startsWith('0Ab')) {
                    sObjName = 'AuraDefinitionBundle';
                } else if (recordId.startsWith('300') || recordId.startsWith('301')) {
                    sObjName = 'FlowDefinitionView';
                } else if (recordId.startsWith('01I')) {
                    sObjName = 'EntityDefinition';
                } else if (recordId.startsWith('03d')) {
                    sObjName = 'ValidationRule';
                } else {
                    try {
                        Id testId = Id.valueOf(recordId);
                        sObjName = testId.getSobjectType().getDescribe().getName();
                    } catch (Exception idEx) {
                        sObjName = 'Unknown';
                    }
                }
            }

            // 1. APEX CLASS GROUNDING
            if (sObjName == 'ApexClass') {
                ApexClass cls = [
                    SELECT Id, Name, ApiVersion, Status, Body, CreatedDate, LastModifiedDate, CreatedBy.Name, LastModifiedBy.Name, LengthWithoutComments
                    FROM ApexClass
                    WHERE Id = :recordId OR Name = :recordId
                    LIMIT 1
                ];
                String markdown = '#### Salesforce Apex Class: ' + cls.Name + ' (API v' + cls.ApiVersion + ', ' + cls.Status + ')\n';
                markdown += '- **Class ID**: ' + cls.Id + '\n';
                markdown += '- **Last Modified**: ' + cls.LastModifiedDate + (cls.LastModifiedBy != null ? ' by ' + cls.LastModifiedBy.Name : '') + '\n';
                markdown += '- **Length (excl. comments)**: ' + cls.LengthWithoutComments + ' characters\n\n';
                markdown += '##### Apex Source Code:\n```apex\n' + cls.Body + '\n```\n';

                result.put('objectName', 'ApexClass');
                result.put('recordId', cls.Id);
                result.put('recordName', cls.Name);
                result.put('markdownContext', markdown);
                result.put('fields', new List<Map<String, String>>{
                    new Map<String, String>{ 'name' => 'Name', 'value' => cls.Name },
                    new Map<String, String>{ 'name' => 'ApiVersion', 'value' => 'v' + cls.ApiVersion },
                    new Map<String, String>{ 'name' => 'Status', 'value' => cls.Status },
                    new Map<String, String>{ 'name' => 'Length', 'value' => String.valueOf(cls.LengthWithoutComments) + ' chars' }
                });
                return result;
            }

            // 2. APEX TRIGGER GROUNDING
            if (sObjName == 'ApexTrigger') {
                ApexTrigger trg = [
                    SELECT Id, Name, TableEnumOrId, Status, ApiVersion, Body, CreatedDate, LastModifiedDate, CreatedBy.Name, LastModifiedBy.Name
                    FROM ApexTrigger
                    WHERE Id = :recordId OR Name = :recordId
                    LIMIT 1
                ];
                String markdown = '#### Salesforce Apex Trigger: ' + trg.Name + ' on ' + trg.TableEnumOrId + ' (' + trg.Status + ')\n';
                markdown += '- **Trigger ID**: ' + trg.Id + '\n';
                markdown += '- **Target SObject**: ' + trg.TableEnumOrId + '\n';
                markdown += '- **API Version**: v' + trg.ApiVersion + '\n';
                markdown += '- **Last Modified**: ' + trg.LastModifiedDate + '\n\n';
                markdown += '##### Trigger Source Code:\n```apex\n' + trg.Body + '\n```\n';

                result.put('objectName', 'ApexTrigger');
                result.put('recordId', trg.Id);
                result.put('recordName', trg.Name);
                result.put('markdownContext', markdown);
                result.put('fields', new List<Map<String, String>>{
                    new Map<String, String>{ 'name' => 'Name', 'value' => trg.Name },
                    new Map<String, String>{ 'name' => 'Target SObject', 'value' => trg.TableEnumOrId },
                    new Map<String, String>{ 'name' => 'Status', 'value' => trg.Status },
                    new Map<String, String>{ 'name' => 'ApiVersion', 'value' => 'v' + trg.ApiVersion }
                });
                return result;
            }

            // 3. LIGHTNING WEB COMPONENT BUNDLE GROUNDING
            if (sObjName == 'LightningComponentBundle') {
                Map<String, Object> bundleData = queryToolingApi('SELECT Id, DeveloperName, MasterLabel, Description, ApiVersion, IsExposed FROM LightningComponentBundle WHERE Id = \'' + String.escapeSingleQuotes(recordId) + '\' OR DeveloperName = \'' + String.escapeSingleQuotes(recordId) + '\' LIMIT 1');
                String devName = recordId;
                String masterLabel = recordId;
                String descr = '';
                String apiVer = '63.0';
                String bundleId = recordId;

                if (bundleData != null && bundleData.containsKey('records')) {
                    List<Object> recs = (List<Object>) bundleData.get('records');
                    if (!recs.isEmpty()) {
                        Map<String, Object> bRec = (Map<String, Object>) recs[0];
                        bundleId = String.valueOf(bRec.get('Id'));
                        devName = String.valueOf(bRec.get('DeveloperName'));
                        masterLabel = bRec.containsKey('MasterLabel') && bRec.get('MasterLabel') != null ? String.valueOf(bRec.get('MasterLabel')) : devName;
                        descr = bRec.containsKey('Description') && bRec.get('Description') != null ? String.valueOf(bRec.get('Description')) : '';
                        apiVer = bRec.containsKey('ApiVersion') && bRec.get('ApiVersion') != null ? String.valueOf(bRec.get('ApiVersion')) : '63.0';
                    }
                }

                String markdown = '#### Lightning Web Component: ' + devName + ' (' + masterLabel + ')\n';
                markdown += '- **Bundle ID**: ' + bundleId + '\n';
                markdown += '- **API Version**: v' + apiVer + '\n';
                if (String.isNotBlank(descr)) {
                    markdown += '- **Description**: ' + descr + '\n';
                }
                markdown += '\n##### Component Bundle Source Files:\n';

                // Fetch files (HTML, JS, CSS, XML) from LightningComponentResource
                Map<String, Object> filesData = queryToolingApi('SELECT Id, FilePath, Format, Source FROM LightningComponentResource WHERE LightningComponentBundleId = \'' + String.escapeSingleQuotes(bundleId) + '\' ORDER BY FilePath ASC');
                if (filesData != null && filesData.containsKey('records')) {
                    List<Object> fileRecs = (List<Object>) filesData.get('records');
                    for (Object fObj : fileRecs) {
                        Map<String, Object> fMap = (Map<String, Object>) fObj;
                        String fPath = String.valueOf(fMap.get('FilePath'));
                        String fFmt = String.valueOf(fMap.get('Format'));
                        String fSrc = fMap.containsKey('Source') && fMap.get('Source') != null ? String.valueOf(fMap.get('Source')) : '';
                        markdown += '###### File: `' + fPath + '`\n```' + fFmt + '\n' + fSrc + '\n```\n\n';
                    }
                }

                result.put('objectName', 'LightningComponentBundle');
                result.put('recordId', bundleId);
                result.put('recordName', devName);
                result.put('markdownContext', markdown);
                result.put('fields', new List<Map<String, String>>{
                    new Map<String, String>{ 'name' => 'DeveloperName', 'value' => devName },
                    new Map<String, String>{ 'name' => 'MasterLabel', 'value' => masterLabel },
                    new Map<String, String>{ 'name' => 'ApiVersion', 'value' => 'v' + apiVer }
                });
                return result;
            }

            // 4. FLOW DEFINITION VIEW GROUNDING
            if (sObjName == 'Flow' || sObjName == 'FlowDefinitionView') {
                FlowDefinitionView flw = [
                    SELECT Id, ApiName, Label, Description, ProcessType, TriggerType, ActiveVersionId, IsActive, LastModifiedDate
                    FROM FlowDefinitionView
                    WHERE Id = :recordId OR ApiName = :recordId
                    LIMIT 1
                ];
                String markdown = '#### Salesforce Flow: ' + flw.Label + ' (' + flw.ApiName + ')\n';
                markdown += '- **Flow ID**: ' + flw.Id + '\n';
                markdown += '- **Process Type**: ' + flw.ProcessType + '\n';
                markdown += '- **Trigger Type**: ' + (flw.TriggerType != null ? flw.TriggerType : 'N/A') + '\n';
                markdown += '- **Status**: ' + (flw.IsActive == true ? 'Active' : 'Draft / Inactive') + '\n';
                markdown += '- **Description**: ' + (flw.Description != null ? flw.Description : 'No description provided.') + '\n';

                result.put('objectName', 'FlowDefinitionView');
                result.put('recordId', flw.Id);
                result.put('recordName', flw.Label);
                result.put('markdownContext', markdown);
                result.put('fields', new List<Map<String, String>>{
                    new Map<String, String>{ 'name' => 'Label', 'value' => flw.Label },
                    new Map<String, String>{ 'name' => 'ApiName', 'value' => flw.ApiName },
                    new Map<String, String>{ 'name' => 'ProcessType', 'value' => flw.ProcessType },
                    new Map<String, String>{ 'name' => 'Active', 'value' => String.valueOf(flw.IsActive) }
                });
                return result;
            }

            // 5. OBJECT SCHEMA / ENTITY DEFINITION GROUNDING
            if (sObjName == 'EntityDefinition') {
                EntityDefinition ed = [
                    SELECT Id, QualifiedApiName, Label, KeyPrefix
                    FROM EntityDefinition
                    WHERE Id = :recordId OR QualifiedApiName = :recordId
                    LIMIT 1
                ];
                Schema.SObjectType sType = Schema.getGlobalDescribe().get(ed.QualifiedApiName);
                Boolean isCustomSetting = sType != null && sType.getDescribe().isCustomSetting();
                String markdown = '#### Object Schema Definition: ' + ed.Label + ' (' + ed.QualifiedApiName + ')\n';
                markdown += '- **Key Prefix**: ' + (ed.KeyPrefix != null ? ed.KeyPrefix : 'N/A') + '\n';
                markdown += '- **Type**: ' + (ed.QualifiedApiName.endsWith('__c') ? 'Custom Object' : 'Standard Object') + '\n';
                markdown += '- **Custom Setting**: ' + (isCustomSetting ? 'Yes' : 'No') + '\n\n';

                markdown += '##### Fields & Data Types:\n| Field Label | API Name | Data Type | Required |\n| --- | --- | --- | --- |\n';
                List<Map<String, String>> fieldPreviews = new List<Map<String, String>>();
                if (sType != null) {
                    Map<String, Schema.SObjectField> fMap = sType.getDescribe().fields.getMap();
                    Integer fCount = 0;
                    for (String fn : fMap.keySet()) {
                        if (fCount < 40) {
                            Schema.DescribeFieldResult dfr = fMap.get(fn).getDescribe();
                            markdown += '| ' + dfr.getLabel() + ' | ' + dfr.getName() + ' | ' + dfr.getType() + ' | ' + (!dfr.isNillable() ? 'Yes' : 'No') + ' |\n';
                            fieldPreviews.add(new Map<String, String>{
                                'name' => dfr.getName(),
                                'value' => String.valueOf(dfr.getType()) + ' (' + dfr.getLabel() + ')'
                            });
                            fCount++;
                        }
                    }
                }

                result.put('objectName', 'EntityDefinition');
                result.put('recordId', ed.Id);
                result.put('recordName', ed.Label + ' (' + ed.QualifiedApiName + ')');
                result.put('markdownContext', markdown);
                result.put('fields', fieldPreviews);
                return result;
            }

            // 6. VALIDATION RULE GROUNDING
            if (sObjName == 'ValidationRule') {
                Map<String, Object> vrData = queryToolingApi('SELECT Id, ValidationName, EntityDefinition.QualifiedApiName, Description, ErrorMessage, ErrorDisplayField, Active FROM ValidationRule WHERE Id = \'' + String.escapeSingleQuotes(recordId) + '\' OR ValidationName = \'' + String.escapeSingleQuotes(recordId) + '\' LIMIT 1');
                String vrName = recordId;
                String entityName = '';
                String errorMsg = '';
                String descr = '';
                Boolean isActive = true;

                if (vrData != null && vrData.containsKey('records')) {
                    List<Object> recs = (List<Object>) vrData.get('records');
                    if (!recs.isEmpty()) {
                        Map<String, Object> vrRec = (Map<String, Object>) recs[0];
                        vrName = String.valueOf(vrRec.get('ValidationName'));
                        isActive = Boolean.valueOf(vrRec.get('Active'));
                        errorMsg = vrRec.containsKey('ErrorMessage') && vrRec.get('ErrorMessage') != null ? String.valueOf(vrRec.get('ErrorMessage')) : '';
                        descr = vrRec.containsKey('Description') && vrRec.get('Description') != null ? String.valueOf(vrRec.get('Description')) : '';
                        if (vrRec.containsKey('EntityDefinition') && vrRec.get('EntityDefinition') != null) {
                            Map<String, Object> entMap = (Map<String, Object>) vrRec.get('EntityDefinition');
                            entityName = String.valueOf(entMap.get('QualifiedApiName'));
                        }
                    }
                }

                String markdown = '#### Validation Rule: ' + vrName + '\n';
                markdown += '- **Target Object**: ' + entityName + '\n';
                markdown += '- **Status**: ' + (isActive ? 'Active' : 'Inactive') + '\n';
                markdown += '- **Error Message**: ' + errorMsg + '\n';
                markdown += '- **Description**: ' + descr + '\n';

                result.put('objectName', 'ValidationRule');
                result.put('recordId', recordId);
                result.put('recordName', vrName);
                result.put('markdownContext', markdown);
                result.put('fields', new List<Map<String, String>>{
                    new Map<String, String>{ 'name' => 'ValidationName', 'value' => vrName },
                    new Map<String, String>{ 'name' => 'Entity', 'value' => entityName },
                    new Map<String, String>{ 'name' => 'Active', 'value' => String.valueOf(isActive) }
                });
                return result;
            }

            // 7. STANDARD & CUSTOM CRM RECORDS GROUNDING
            Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(sObjName);
            if (sObjType == null) {
                return result;
            }

            Schema.DescribeSObjectResult describe = sObjType.getDescribe();
            Map<String, Schema.SObjectField> fieldMap = describe.fields.getMap();

            List<String> queryFields = new List<String>{ 'Id' };
            List<Map<String, String>> fieldPreviews = new List<Map<String, String>>();

            for (String fieldName : fieldMap.keySet()) {
                Schema.DescribeFieldResult dfr = fieldMap.get(fieldName).getDescribe();
                if (dfr.isAccessible() && !dfr.isCalculated() && queryFields.size() < 40) {
                    if (fieldName != 'id' && !queryFields.contains(dfr.getName())) {
                        queryFields.add(dfr.getName());
                    }
                }
            }

            String soql = 'SELECT ' + String.join(queryFields, ', ') + ' FROM ' + String.escapeSingleQuotes(sObjName) + ' WHERE Id = \'' + String.escapeSingleQuotes(recordId) + '\' LIMIT 1';
            SObject record = Database.query(soql);

            // Build structured markdown and preview list
            String markdown = '#### SObject: ' + describe.getLabel() + ' (' + sObjName + ')\n';
            markdown += '- **Record ID**: ' + recordId + '\n\n';
            markdown += '| Field Label | API Field | Value |\n| --- | --- | --- |\n';

            for (String f : queryFields) {
                Object val = record.get(f);
                if (val != null) {
                    Schema.DescribeFieldResult dfr = fieldMap.get(f.toLowerCase()) != null ? fieldMap.get(f.toLowerCase()).getDescribe() : null;
                    String fLabel = dfr != null ? dfr.getLabel() : f;
                    String strVal = String.valueOf(val);
                    if (strVal.length() > 200) {
                        strVal = strVal.substring(0, 197) + '...';
                    }
                    markdown += '| ' + fLabel + ' | ' + f + ' | ' + strVal + ' |\n';
                    fieldPreviews.add(new Map<String, String>{
                        'name' => fLabel + ' (' + f + ')',
                        'value' => String.valueOf(val)
                    });
                }
            }

            // Related CRM intelligence
            if (sObjName == 'Account') {
                List<Contact> relContacts = [SELECT Id, Name, Email, Title FROM Contact WHERE AccountId = :recordId LIMIT 5];
                if (!relContacts.isEmpty()) {
                    markdown += '\n#### Related Contacts:\n';
                    for (Contact c : relContacts) {
                        markdown += '- ' + c.Name + (c.Title != null ? ' (' + c.Title + ')' : '') + (c.Email != null ? ' - ' + c.Email : '') + '\n';
                    }
                }
                List<Opportunity> relOpps = [SELECT Id, Name, StageName, Amount, CloseDate FROM Opportunity WHERE AccountId = :recordId LIMIT 5];
                if (!relOpps.isEmpty()) {
                    markdown += '\n#### Related Opportunities:\n';
                    for (Opportunity o : relOpps) {
                        markdown += '- ' + o.Name + ' (Stage: ' + o.StageName + ', Amount: ' + (o.Amount != null ? String.valueOf(o.Amount) : 'N/A') + ', Close: ' + o.CloseDate + ')\n';
                    }
                }
                List<Case> relCases = [SELECT Id, CaseNumber, Subject, Status, Priority FROM Case WHERE AccountId = :recordId LIMIT 5];
                if (!relCases.isEmpty()) {
                    markdown += '\n#### Related Cases:\n';
                    for (Case cs : relCases) {
                        markdown += '- Case #' + cs.CaseNumber + ': ' + cs.Subject + ' (' + cs.Status + ', ' + cs.Priority + ')\n';
                    }
                }
            }

            // Recent related tasks/activities
            try {
                List<Task> recentTasks = [
                    SELECT Id, Subject, Status, Priority, ActivityDate
                    FROM Task
                    WHERE WhatId = :recordId OR WhoId = :recordId
                    ORDER BY CreatedDate DESC
                    LIMIT 5
                ];

                if (!recentTasks.isEmpty()) {
                    markdown += '\n#### Recent Tasks & Activities:\n';
                    for (Task t : recentTasks) {
                        markdown += '- **' + t.Subject + '** (Status: ' + t.Status + ', Due: ' + t.ActivityDate + ')\n';
                    }
                }
            } catch (Exception taskEx) {
                // Ignore if object doesn't support tasks
            }

            String recName = sObjName + ' Record';
            if (fieldMap.containsKey('name') && record.get('Name') != null) {
                recName = String.valueOf(record.get('Name'));
            } else if (fieldMap.containsKey('casenumber') && record.get('CaseNumber') != null) {
                recName = 'Case #' + String.valueOf(record.get('CaseNumber'));
            }

            result.put('objectName', sObjName);
            result.put('recordId', recordId);
            result.put('record', record);
            result.put('fields', fieldPreviews);
            result.put('markdownContext', markdown);
            result.put('recordName', recName);

            return result;
        } catch (Exception ex) {
            result.put('error', ex.getMessage());
            return result;
        }
    }

    /**
     * Execute safe, read-only SOQL queries generated by Gemini
     * Automatically handles both standard SOQL and Tooling API SOQL
     */
    @AuraEnabled(cacheable=false)
    public static Map<String, Object> executeSafeSoql(String query) {
        if (String.isBlank(query)) {
            throw new AuraHandledException('SOQL query cannot be blank.');
        }

        String cleaned = query.trim();
        if (!cleaned.toUpperCase().startsWith('SELECT')) {
            throw new AuraHandledException('Only SELECT queries are permitted for safe execution.');
        }

        String upper = cleaned.toUpperCase();
        if (upper.contains('DELETE') || upper.contains('UPDATE ') || upper.contains('INSERT ') || upper.contains('UPSERT ')) {
            throw new AuraHandledException('Mutating statements are prohibited.');
        }

        if (!upper.contains('LIMIT')) {
            cleaned += ' LIMIT 50';
        }

        try {
            List<SObject> records = Database.query(cleaned);
            List<String> columnNames = new List<String>();
            List<Map<String, Object>> rows = new List<Map<String, Object>>();

            if (!records.isEmpty()) {
                Map<String, Object> firstRowMap = records[0].getPopulatedFieldsAsMap();
                for (String col : firstRowMap.keySet()) {
                    columnNames.add(col);
                }

                for (SObject r : records) {
                    Map<String, Object> rowMap = new Map<String, Object>();
                    Map<String, Object> populated = r.getPopulatedFieldsAsMap();
                    for (String col : columnNames) {
                        rowMap.put(col, populated.get(col));
                    }
                    if (r.Id != null) {
                        String sType = r.getSObjectType().getDescribe().getName();
                        rowMap.put('_recordId', r.Id);
                        rowMap.put('_recordUrl', '/lightning/r/' + sType + '/' + r.Id + '/view');
                    }
                    rows.add(rowMap);
                }
            }

            return new Map<String, Object>{
                'success' => true,
                'totalCount' => records.size(),
                'columns' => columnNames,
                'rows' => rows,
                'query' => cleaned
            };
        } catch (Exception ex) {
            // Check if this is a Tooling API query (e.g. LightningComponentBundle, ValidationRule, etc.)
            String errMsg = ex.getMessage();
            if (errMsg.contains('sObject type') || errMsg.contains('not supported') || upper.contains('LIGHTNINGCOMPONENT') || upper.contains('VALIDATIONRULE')) {
                Map<String, Object> toolingRes = executeToolingSoql(cleaned);
                if (toolingRes != null && toolingRes.containsKey('success') && (Boolean)toolingRes.get('success')) {
                    return toolingRes;
                }
            }
            throw new AuraHandledException('SOQL Execution Failed: ' + ex.getMessage());
        }
    }

    /**
     * Execute query via Salesforce Tooling API for metadata/tooling objects
     */
    private static Map<String, Object> executeToolingSoql(String cleanedQuery) {
        try {
            Map<String, Object> data = queryToolingApi(cleanedQuery);
            if (data != null && data.containsKey('records')) {
                List<Object> recList = (List<Object>) data.get('records');
                List<String> columns = new List<String>();
                List<Map<String, Object>> rows = new List<Map<String, Object>>();

                if (!recList.isEmpty()) {
                    Map<String, Object> firstRec = (Map<String, Object>) recList[0];
                    for (String key : firstRec.keySet()) {
                        if (key != 'attributes') {
                            columns.add(key);
                        }
                    }

                    for (Object obj : recList) {
                        Map<String, Object> recMap = (Map<String, Object>) obj;
                        Map<String, Object> row = new Map<String, Object>();
                        for (String col : columns) {
                            row.put(col, recMap.get(col));
                        }
                        if (recMap.containsKey('Id')) {
                            row.put('_recordId', recMap.get('Id'));
                        }
                        rows.add(row);
                    }
                }

                return new Map<String, Object>{
                    'success' => true,
                    'totalCount' => rows.size(),
                    'columns' => columns,
                    'rows' => rows,
                    'query' => cleanedQuery,
                    'isTooling' => true
                };
            }
        } catch (Exception e) {
            System.debug('Tooling query execution failed: ' + e.getMessage());
        }
        return null;
    }

    /**
     * Create follow-up Task in Salesforce from Gemini recommendations
     */
    @AuraEnabled(cacheable=false)
    public static Map<String, Object> createSalesforceTask(Id recordId, String subject, String description, String priority, String status, Date dueDate) {
        try {
            Task newTask = new Task();
            newTask.Subject = String.isNotBlank(subject) ? subject : 'Gemini Follow-up Task';
            newTask.Description = description;
            newTask.Priority = String.isNotBlank(priority) ? priority : 'Normal';
            newTask.Status = String.isNotBlank(status) ? status : 'Not Started';
            newTask.ActivityDate = (dueDate != null) ? dueDate : Date.today().addDays(2);

            if (recordId != null) {
                try {
                    String sObjName = recordId.getSobjectType().getDescribe().getName();
                    if (sObjName == 'Contact' || sObjName == 'Lead') {
                        newTask.WhoId = recordId;
                    } else {
                        newTask.WhatId = recordId;
                    }
                } catch (Exception idEx) {
                    // Non-activity object; proceed without WhatId
                }
            }

            insert newTask;

            return new Map<String, Object>{
                'success' => true,
                'taskId' => newTask.Id,
                'subject' => newTask.Subject,
                'message' => 'Task "' + newTask.Subject + '" created successfully!'
            };
        } catch (Exception ex) {
            throw new AuraHandledException('Failed to create Task: ' + ex.getMessage());
        }
    }

    /**
     * Search Salesforce records & Tooling metadata for context grounding
     * Category can be: 'ALL', 'CRM', 'CODE', 'LWC', 'METADATA'
     */
    @AuraEnabled(cacheable=false)
    public static List<Map<String, String>> searchRecords(String searchTerm, String category) {
        List<Map<String, String>> results = new List<Map<String, String>>();
        if (String.isBlank(searchTerm) || searchTerm.trim().length() < 2) {
            return results;
        }

        String cat = String.isNotBlank(category) ? category.trim().toUpperCase() : 'ALL';
        String trimmed = searchTerm.trim();
        String likePattern = '%' + trimmed + '%';

        // 1. TOOLING / CODE: APEX CLASSES & TRIGGERS
        if (cat == 'ALL' || cat == 'CODE') {
            try {
                List<ApexClass> classes = [
                    SELECT Id, Name, ApiVersion, Status, LengthWithoutComments
                    FROM ApexClass
                    WHERE Name LIKE :likePattern
                    ORDER BY LastModifiedDate DESC
                    LIMIT 6
                ];
                for (ApexClass c : classes) {
                    results.add(new Map<String, String>{
                        'id' => c.Id,
                        'name' => c.Name,
                        'type' => 'ApexClass',
                        'category' => 'CODE',
                        'icon' => '💻',
                        'badgeClass' => 'badge-code',
                        'subtitle' => 'Apex Class • API v' + c.ApiVersion + ' • ' + c.Status + ' (' + c.LengthWithoutComments + ' chars)'
                    });
                }

                List<ApexTrigger> triggers = [
                    SELECT Id, Name, TableEnumOrId, Status, ApiVersion
                    FROM ApexTrigger
                    WHERE Name LIKE :likePattern
                    ORDER BY LastModifiedDate DESC
                    LIMIT 4
                ];
                for (ApexTrigger t : triggers) {
                    results.add(new Map<String, String>{
                        'id' => t.Id,
                        'name' => t.Name,
                        'type' => 'ApexTrigger',
                        'category' => 'CODE',
                        'icon' => '⚡',
                        'badgeClass' => 'badge-code',
                        'subtitle' => 'Apex Trigger on ' + t.TableEnumOrId + ' • ' + t.Status
                    });
                }
            } catch (Exception ex) {
                System.debug('Apex search error: ' + ex.getMessage());
            }
        }

        // 2. TOOLING / LWC & AURA BUNDLES
        if (cat == 'ALL' || cat == 'LWC') {
            try {
                String lwcQuery = 'SELECT Id, DeveloperName, MasterLabel, Description, ApiVersion FROM LightningComponentBundle WHERE DeveloperName LIKE \'' + String.escapeSingleQuotes(likePattern) + '\' OR MasterLabel LIKE \'' + String.escapeSingleQuotes(likePattern) + '\' LIMIT 6';
                Map<String, Object> lwcData = queryToolingApi(lwcQuery);
                if (lwcData != null && lwcData.containsKey('records')) {
                    List<Object> recList = (List<Object>) lwcData.get('records');
                    for (Object o : recList) {
                        Map<String, Object> b = (Map<String, Object>) o;
                        String dName = String.valueOf(b.get('DeveloperName'));
                        String descr = b.containsKey('Description') && b.get('Description') != null ? String.valueOf(b.get('Description')) : 'Lightning Web Component Bundle';
                        results.add(new Map<String, String>{
                            'id' => String.valueOf(b.get('Id')),
                            'name' => dName,
                            'type' => 'LightningComponentBundle',
                            'category' => 'LWC',
                            'icon' => '⚡',
                            'badgeClass' => 'badge-lwc',
                            'subtitle' => descr
                        });
                    }
                }
            } catch (Exception ex) {
                System.debug('LWC Tooling search error: ' + ex.getMessage());
            }
        }

        // 3. METADATA: FLOWS, ENTITY DEFINITIONS, VALIDATION RULES
        if (cat == 'ALL' || cat == 'METADATA') {
            try {
                // Flows
                List<FlowDefinitionView> flows = [
                    SELECT Id, ApiName, Label, ProcessType, IsActive
                    FROM FlowDefinitionView
                    WHERE ApiName LIKE :likePattern OR Label LIKE :likePattern
                    ORDER BY LastModifiedDate DESC
                    LIMIT 5
                ];
                for (FlowDefinitionView f : flows) {
                    results.add(new Map<String, String>{
                        'id' => f.Id,
                        'name' => f.Label,
                        'type' => 'Flow',
                        'category' => 'METADATA',
                        'icon' => '🔀',
                        'badgeClass' => 'badge-metadata',
                        'subtitle' => 'Flow (' + f.ProcessType + ') • ' + f.ApiName + (f.IsActive == true ? ' • Active' : ' • Inactive')
                    });
                }

                // EntityDefinitions (Object Schemas)
                List<EntityDefinition> entities = [
                    SELECT Id, QualifiedApiName, Label, KeyPrefix
                    FROM EntityDefinition
                    WHERE QualifiedApiName LIKE :likePattern OR Label LIKE :likePattern
                    LIMIT 5
                ];
                for (EntityDefinition e : entities) {
                    results.add(new Map<String, String>{
                        'id' => e.Id,
                        'name' => e.Label + ' (' + e.QualifiedApiName + ')',
                        'type' => 'EntityDefinition',
                        'category' => 'METADATA',
                        'icon' => '🗄️',
                        'badgeClass' => 'badge-metadata',
                        'subtitle' => (e.QualifiedApiName.endsWith('__c') ? 'Custom Object Schema' : 'Standard Object Schema') + (e.KeyPrefix != null ? ' • Prefix: ' + e.KeyPrefix : '')
                    });
                }

                // Validation Rules via Tooling API
                String vrQuery = 'SELECT Id, ValidationName, EntityDefinition.QualifiedApiName, Description, Active FROM ValidationRule WHERE ValidationName LIKE \'' + String.escapeSingleQuotes(likePattern) + '\' LIMIT 4';
                Map<String, Object> vrData = queryToolingApi(vrQuery);
                if (vrData != null && vrData.containsKey('records')) {
                    List<Object> recList = (List<Object>) vrData.get('records');
                    for (Object o : recList) {
                        Map<String, Object> vr = (Map<String, Object>) o;
                        String vName = String.valueOf(vr.get('ValidationName'));
                        String entName = '';
                        if (vr.containsKey('EntityDefinition') && vr.get('EntityDefinition') != null) {
                            Map<String, Object> ent = (Map<String, Object>) vr.get('EntityDefinition');
                            entName = String.valueOf(ent.get('QualifiedApiName'));
                        }
                        results.add(new Map<String, String>{
                            'id' => String.valueOf(vr.get('Id')),
                            'name' => vName,
                            'type' => 'ValidationRule',
                            'category' => 'METADATA',
                            'icon' => '🛡️',
                            'badgeClass' => 'badge-metadata',
                            'subtitle' => 'Validation Rule on ' + entName + (Boolean.valueOf(vr.get('Active')) ? ' • Active' : ' • Inactive')
                        });
                    }
                }
            } catch (Exception ex) {
                System.debug('Metadata search error: ' + ex.getMessage());
            }
        }

        // 4. CRM & CUSTOM OBJECTS DATA (DYNAMIC SOSL)
        if (cat == 'ALL' || cat == 'CRM') {
            try {
                List<String> returningClauses = new List<String>{
                    'Account(Id, Name, Type LIMIT 5)',
                    'Contact(Id, Name, Email, Title LIMIT 5)',
                    'Opportunity(Id, Name, StageName, Amount LIMIT 5)',
                    'Lead(Id, Name, Company, Status LIMIT 5)',
                    'Case(Id, CaseNumber, Subject, Status LIMIT 5)'
                };

                // Automatically include top accessible custom objects (__c) from the org
                Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
                Integer customObjCount = 0;
                for (String objName : globalDescribe.keySet()) {
                    if (objName.endsWith('__c') && customObjCount < 10) {
                        Schema.DescribeSObjectResult d = globalDescribe.get(objName).getDescribe();
                        if (d.isSearchable() && d.isAccessible() && !d.isCustomSetting()) {
                            String nameField = d.fields.getMap().containsKey('name') ? 'Id, Name' : 'Id';
                            returningClauses.add(d.getName() + '(' + nameField + ' LIMIT 5)');
                            customObjCount++;
                        }
                    }
                }

                String sanitized = String.escapeSingleQuotes(trimmed) + '*';
                String sosl = 'FIND \'' + sanitized + '\' IN ALL FIELDS RETURNING ' + String.join(returningClauses, ', ') + ' LIMIT 40';
                List<List<SObject>> searchList = Search.query(sosl);

                for (List<SObject> objList : searchList) {
                    for (SObject rec : objList) {
                        String objType = rec.getSobjectType().getDescribe().getName();
                        Schema.DescribeSObjectResult d = rec.getSobjectType().getDescribe();
                        String title = '';
                        String sub = '';

                        if (objType == 'Case') {
                            title = 'Case #' + rec.get('CaseNumber');
                            sub = rec.isSet('Subject') ? String.valueOf(rec.get('Subject')) : 'Case Record';
                        } else if (rec.isSet('Name')) {
                            title = String.valueOf(rec.get('Name'));
                            if (objType == 'Account' && rec.isSet('Type')) {
                                sub = String.valueOf(rec.get('Type'));
                            } else if (objType == 'Contact' && rec.isSet('Email')) {
                                sub = String.valueOf(rec.get('Email'));
                            } else if (objType == 'Opportunity' && rec.isSet('StageName')) {
                                sub = 'Stage: ' + String.valueOf(rec.get('StageName'));
                            } else if (objType == 'Lead' && rec.isSet('Company')) {
                                sub = 'Company: ' + String.valueOf(rec.get('Company'));
                            } else {
                                sub = d.getLabel();
                            }
                        } else {
                            title = d.getLabel() + ' Record';
                            sub = objType;
                        }

                        results.add(new Map<String, String>{
                            'id' => rec.Id,
                            'name' => title,
                            'type' => objType,
                            'category' => 'CRM',
                            'icon' => objType.endsWith('__c') ? '📦' : '🏢',
                            'badgeClass' => 'badge-crm',
                            'subtitle' => String.isNotBlank(sub) ? sub : d.getLabel()
                        });
                    }
                }
            } catch (Exception ex) {
                System.debug('CRM search error: ' + ex.getMessage());
            }
        }

        return results;
    }

    /**
     * Helper to query Salesforce Tooling REST API
     */
    public static Map<String, Object> queryToolingApi(String toolingSoql) {
        if (Test.isRunningTest() && String.isNotBlank(mockToolingResponse)) {
            return (Map<String, Object>) JSON.deserializeUntyped(mockToolingResponse);
        }

        try {
            HttpRequest req = new HttpRequest();
            String endpoint = Url.getOrgDomainUrl().toExternalForm() + '/services/data/v63.0/tooling/query?q=' + EncodingUtil.urlEncode(toolingSoql, 'UTF-8');
            req.setEndpoint(endpoint);
            req.setMethod('GET');
            req.setHeader('Authorization', 'Bearer ' + UserInfo.getSessionId());
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(15000);

            Http http = new Http();
            HttpResponse res = http.send(req);
            if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
                return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            } else {
                System.debug('Tooling API query returned status ' + res.getStatusCode() + ': ' + res.getBody());
            }
        } catch (Exception ex) {
            System.debug('Tooling API callout error: ' + ex.getMessage());
        }
        return null;
    }

    // Helper: resolve API Key from custom setting or param
    private static String resolveApiKey(String overrideKey) {
        if (String.isNotBlank(overrideKey) && !overrideKey.contains('••••')) {
            return overrideKey.trim();
        }
        Gemini_Settings__c settings = Gemini_Settings__c.getOrgDefaults();
        if (settings != null && String.isNotBlank(settings.API_Key__c)) {
            return settings.API_Key__c.trim();
        }
        throw new GeminiException('Google Gemini API Key is not configured. Please open Gemini Settings in the component to configure your API key.');
    }

    // Helper: Extract generated text from candidates
    private static String extractTextFromGeminiResponse(Map<String, Object> respMap) {
        if (!respMap.containsKey('candidates')) {
            if (respMap.containsKey('promptFeedback')) {
                return 'Blocked by safety filters: ' + JSON.serialize(respMap.get('promptFeedback'));
            }
            return 'No response generated.';
        }

        List<Object> candidates = (List<Object>) respMap.get('candidates');
        if (candidates.isEmpty()) {
            return 'No candidates returned.';
        }

        Map<String, Object> cand = (Map<String, Object>) candidates[0];
        if (cand.containsKey('content')) {
            Map<String, Object> contentMap = (Map<String, Object>) cand.get('content');
            if (contentMap.containsKey('parts')) {
                List<Object> parts = (List<Object>) contentMap.get('parts');
                String fullText = '';
                for (Object pObj : parts) {
                    Map<String, Object> pMap = (Map<String, Object>) pObj;
                    if (pMap.containsKey('text')) {
                        fullText += (String) pMap.get('text');
                    }
                }
                return fullText;
            }
        }
        return '';
    }

    // Helper: Extract token metrics
    private static Map<String, Object> extractUsageMetadata(Map<String, Object> respMap) {
        Map<String, Object> usage = new Map<String, Object>{
            'promptTokens' => 0,
            'candidateTokens' => 0,
            'totalTokens' => 0
        };
        if (respMap.containsKey('usageMetadata')) {
            Map<String, Object> meta = (Map<String, Object>) respMap.get('usageMetadata');
            if (meta.containsKey('promptTokenCount')) usage.put('promptTokens', meta.get('promptTokenCount'));
            if (meta.containsKey('candidatesTokenCount')) usage.put('candidateTokens', meta.get('candidatesTokenCount'));
            if (meta.containsKey('totalTokenCount')) usage.put('totalTokens', meta.get('totalTokenCount'));
        }
        return usage;
    }

    // Helper: detect and extract SOQL query if Gemini generated one
    private static String extractSoqlFromText(String text) {
        if (String.isBlank(text)) return null;
        Integer soqlIndex = text.indexOfIgnoreCase('```soql');
        if (soqlIndex == -1) {
            soqlIndex = text.indexOfIgnoreCase('```sql');
        }

        if (soqlIndex != -1) {
            Integer start = text.indexOf('\n', soqlIndex);
            if (start != -1) {
                Integer closeBlock = text.indexOf('```', start);
                if (closeBlock != -1) {
                    String query = text.substring(start + 1, closeBlock).trim();
                    if (query.toUpperCase().startsWith('SELECT')) {
                        return query;
                    }
                }
            }
        }
        return null;
    }
}

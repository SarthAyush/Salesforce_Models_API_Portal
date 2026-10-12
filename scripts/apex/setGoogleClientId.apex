Gemini_Settings__c gs = Gemini_Settings__c.getOrgDefaults();
if (gs == null) {
    gs = new Gemini_Settings__c();
}
gs.Google_Client_ID__c = '211930830295-ltc2upv4alnfjbdhipbs88obthk0b0ij.apps.googleusercontent.com';
upsert gs;
System.debug('Saved Client ID to Custom Settings: ' + gs.Google_Client_ID__c);

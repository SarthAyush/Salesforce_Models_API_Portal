Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
mail.setToAddresses(new String[] {'test@example.com'});
mail.setSubject('Test Email');
mail.setPlainTextBody('Test Email Body');
Messaging.SendEmailResult[] res = Messaging.sendEmail(new Messaging.SingleEmailMessage[] {mail}, false);
System.debug('Email success: ' + res[0].isSuccess() + ' errors: ' + (res[0].getErrors().isEmpty() ? 'none' : res[0].getErrors()[0].getMessage()));

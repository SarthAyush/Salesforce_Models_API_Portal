import Id from '@salesforce/user/Id';
import Email from '@salesforce/schema/User.Email';
import { LightningElement, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';

const fields = [Email];

export default class EmbeddedMessagingSetRecord extends LightningElement {
    userId = Id;
    user;

    @wire(getRecord, { recordId: '$userId', fields })
    wiredRecord({ error, data }) {
        if (error) {
            let message = "Unknown error";
            if (Array.isArray(error.body)) {
                message = error.body.map(e => e.message).join(", ");
            } else if (typeof error.body.message === "string") {
                message = error.body.message;
            }
            console.error("Error loading user record: " + message);
        } else if (data) {
            this.user = data;
            console.log('before custom event');
            console.log('this.user = ' + JSON.stringify(this.user));

            var selectedEvent = new CustomEvent('Current_User_Id', {
                detail: {
                    email: getFieldValue(this.user, Email)
                },
                bubbles: true,
                composed: true
            });

            // Dispatches the event
            window.dispatchEvent(selectedEvent);
        }
    }
}
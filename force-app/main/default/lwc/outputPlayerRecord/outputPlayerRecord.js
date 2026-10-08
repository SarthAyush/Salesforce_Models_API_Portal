import { LightningElement, api, track } from 'lwc';

export default class CricketersLwc extends LightningElement {
    cricketers = [];

    @api 
    get value() {
        return this._value;
    }

    set value(data) {
        this._value = data;
    }

    connectedCallback() {
        try {
            if (this.value && this.value.playerOptions) {
                this.updatedValue = [];

                this.value.playerOptions.map(record => {
                    //const isIndian = record.Country === 'India' ? 'Yes' : 'No';

                    this.updatedValue.push({
                        ...record
                        //isIndian
                    });
                });

                this.cricketers = this.updatedValue;
            }
        } catch (error) {
            console.log('Error = ' + JSON.stringify(error));
        }
    }
}
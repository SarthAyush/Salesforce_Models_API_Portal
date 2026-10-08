import { LightningElement, api } from 'lwc';

export default class TextInputComponent extends LightningElement {
    _readOnly = false;
    _value = {};
    playerName = '';

    @api
    get readOnly() {
        return this._readOnly;
    }
    set readOnly(value) {
        this._readOnly = Boolean(value);
    }

    @api
    get value() {
        return this._value;
    }
    set value(val) {
        this._value = val || {};
        // Lightning Type expects { Name: '...' }
        this.playerName = this._value?.Name || '';
    }

    connectedCallback() {
        if (this._value && typeof this._value === 'object') {
            this.playerName = this._value?.Name || '';
        }
    }

    handleInputChange(event) {
        event.stopPropagation();
        this.playerName = event.target.value;
        // Emit the value in the shape required by the apexClassType: { Name: '...' }
        this.dispatchEvent(
            new CustomEvent('valuechange', {
                detail: {
                    value: {
                        Name: this.playerName
                    }
                }
            })
        );
    }
}
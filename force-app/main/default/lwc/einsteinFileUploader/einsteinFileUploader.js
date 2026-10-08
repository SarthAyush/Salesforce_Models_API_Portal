import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import genRes from '@salesforce/apex/usingContentVersion.generateFromContentDocument';
import createOrder from '@salesforce/apex/PurchaseOrderInsertService.insertOrderFromExtractedJson';

export default class PurchaseOrderComp extends LightningElement {

    _value;

    @track response;
    @track isLoading = false;
    @track podetail;
    @track isGenerateDisabled = false;

    fileId = '';
    files = [];

    @api
    get value() {
        return this._value;
    }

    set value(value) {
        this._value = value;
    }

    connectedCallback() {
        if (this.value) {
            this.files = this.value.allfiles;
        }
    }

    handleUpload(event) {
        this.isLoading = true;
        this.response = null;
        this.isGenerateDisabled = false;

        const files = event.detail.files;
        this.fileId = files[0].documentId;

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'File Uploaded',
                message: 'PDF uploaded successfully. Processing started.',
                variant: 'success'
            })
        );

        genRes({ docId: this.fileId })
            .then(result => {
                const jsonStr = result
                    .replace('```json', '')
                    .replace('```', '');

                this.response = jsonStr;
                this.podetail = JSON.parse(jsonStr);
            })
            .catch(error => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error',
                        message: error.body?.message || 'Something went wrong',
                        variant: 'error'
                    })
                );
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    generateOrder() {
        if (!this.response) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'No Data',
                    message: 'Please upload and extract a PDF first.',
                    variant: 'warning'
                })
            );
            return;
        }

        this.isGenerateDisabled = true;
        this.isLoading = true;

        createOrder({ jsonString: this.response })
            .then(orderId => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Order Created',
                        message: 'Order created successfully. Order Id: ' + orderId,
                        variant: 'success'
                    })
                );
            })
            .catch(error => {
                console.error('Order creation error => ', error);

                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Order Creation Failed',
                        message: error.body?.message || 'Unable to create order',
                        variant: 'error'
                    })
                );

                this.isGenerateDisabled = false;
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    handleCancel() {
        this.response = null;
        this.podetail = null;
        this.fileId = '';
        this.files = [];
        this.isLoading = false;
        this.isGenerateDisabled = false;
    }
}
import { LightningElement, track, api, wire } from 'lwc';
import getApexAnalyses from '@salesforce/apex/apexAnalysisDashboardController.getApexAnalyses';
import updateRecAnalysis from '@salesforce/apex/Apexfetch.getdataApex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';

export default class ApexAnalysisDashboard extends LightningElement {

    @track apexClasses = [];
    @track selectedClsName;
    selectedRecord;
    @track isLoading = false;
    @track showTable = false;
    @track isModalOpen=false;
    wiredResult; 

    @api loaderText = `Analyzing your Apex Class......`;

    columns = [
        {label: 'Class Name', fieldName: 'Name'},
        {label: 'Created Date', fieldName: 'CreatedDate', type: 'date'},
        {label: 'Last Modified', fieldName: 'LastModifiedDate', type: 'date'}
    ];

    handleFetchClasses(){
        this.showTable = true;
        this.ReloadTable();
       // this.isLoading=false;
    }

    get hasClasses() {
        return this.apexClasses.length > 0;
    }

    viewDetails(event) {
    const className = event.currentTarget.dataset.name;

    this.selectedRecord = this.apexClasses.find(
        cls => cls.Name === className
    );

    this.isModalOpen = true;
}


    @wire(getApexAnalyses)
    wiredApex(result) {
        this.wiredResult = result;

        if (result.data) {
            this.apexClasses = [...result.data]; // force reactivity
        } else if (result.error) {
            console.error(result.error);
        }
    }
closeModal() {
        this.isModalOpen = false;
    }
    ReloadTable(){
        this.isLoading = true;
        refreshApex(this.wiredResult);
        this.isLoading = false;
    }

    // 🔥 RUN ANALYSIS
    fetchclsid(event){
        this.isLoading = true;
        this.selectedClsName = event.currentTarget.dataset.name;

        updateRecAnalysis({ className: this.selectedClsName })
        .then(result => {

            this.dispatchEvent(new ShowToastEvent({
                title: 'Success',
                message: 'Class has been analyzed!',
                variant: 'success'
            }));

           
            return refreshApex(this.wiredResult);
        })
        .catch(error => {
            console.error(error);

            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: error.body ? error.body.message : 'An error occurred while analyzing the class.',
                variant: 'error'
            }));
        })
        .finally(() => {
            this.isLoading = false;
        });
    }
}
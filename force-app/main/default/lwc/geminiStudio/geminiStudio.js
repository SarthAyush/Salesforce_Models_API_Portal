import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import getSettings from '@salesforce/apex/GeminiLwcController.getSettings';
import saveSettings from '@salesforce/apex/GeminiLwcController.saveSettings';
import testConnection from '@salesforce/apex/GeminiLwcController.testConnection';
import generateContent from '@salesforce/apex/GeminiLwcController.generateContent';
import getRecordContext from '@salesforce/apex/GeminiLwcController.getRecordContext';
import executeSafeSoql from '@salesforce/apex/GeminiLwcController.executeSafeSoql';
import createSalesforceTask from '@salesforce/apex/GeminiLwcController.createSalesforceTask';
import searchRecords from '@salesforce/apex/GeminiLwcController.searchRecords';

export default class GeminiStudio extends LightningElement {
    @api recordId;
    @api objectApiName;
    @api componentTitle = 'Google Gemini Studio';
    @api defaultModel = 'gemini-3.8-flash';
    @api enableRecordGrounding = false;

    // Settings
    @track isConfigured = false;
    @track maskedApiKey = '';
    @track selectedModel = 'gemini-3.8-flash';
    @track endpointUrl = 'https://generativelanguage.googleapis.com/v1beta';
    @track temperature = 0.7;
    @track maxTokens = 8192;
    @track systemInstruction = '';

    // Record Grounding Context
    @track activeRecordId = null;
    @track activeRecordType = null;
    @track activeRecordName = null;
    @track includeRecordContext = true;

    // Chat Conversation
    @track messages = [];
    @track inputPrompt = '';
    @track isLoading = false;

    // Multimodal Media Attachment
    @track attachedMedia = null;

    // Speech / Voice
    @track isListening = false;
    speechRecognition = null;
    speechSynth = window.speechSynthesis;

    // Settings Modal
    @track showSettingsModal = false;
    @track settingsApiKey = '';
    @track settingsDefaultModel = 'gemini-3.8-flash';
    @track settingsEndpointUrl = 'https://generativelanguage.googleapis.com/v1beta';
    @track settingsTemperature = 0.7;
    @track settingsMaxTokens = 8192;
    @track settingsSystemPrompt = '';
    @track testResult = null;
    @track isTestingConnection = false;
    @track isSavingSettings = false;

    // SOQL Modal
    @track showSoqlModal = false;
    @track activeSoqlQuery = '';
    @track soqlColumns = [];
    @track soqlRows = [];
    @track soqlResultCount = 0;

    // Task Modal
    @track showTaskModal = false;
    @track taskSubject = 'Follow-up on Gemini Action Item';
    @track taskPriority = 'Normal';
    @track taskDueDate = '';
    @track taskDescription = '';
    @track isSavingTask = false;

    // Record Search Modal
    @track showRecordSearchModal = false;
    @track recordSearchTerm = '';
    @track searchResults = [];
    @track groundingCategory = 'ALL';
    @track isSearchingRecords = false;
    searchTimeout = null;

    // Only Gemini 3.8 Flash and 3.5 Flash supported
    availableModelsList = [
        { label: 'Gemini 3.8 Flash (Latest GA - High Speed)', value: 'gemini-3.8-flash' },
        { label: 'Gemini 3.5 Flash (Efficient Intelligence)', value: 'gemini-3.5-flash' }
    ];

    playbookTemplates = [
        {
            id: 'pb-1',
            icon: '📊',
            label: 'Live Pipeline & Deals',
            prompt: 'Query my open opportunities, summarize the pipeline by stage and amount, and highlight high-value deals.'
        },
        {
            id: 'pb-2',
            icon: '⚡',
            label: 'Open Cases & Escalations',
            prompt: 'Query all open high-priority Cases in this org, show their Account names, subjects, and statuses.'
        },
        {
            id: 'pb-3',
            icon: '🎯',
            label: 'Record Health & Risk Radar',
            prompt: 'Audit this Salesforce record: analyze pipeline health, potential deal/case risks, missing key information, and suggest next best actions.'
        },
        {
            id: 'pb-4',
            icon: '💻',
            label: 'Apex & Trigger Architect',
            prompt: 'Write an enterprise Apex trigger handler with best practices, bulkification, and full test class coverage.'
        },
        {
            id: 'pb-5',
            icon: '✉️',
            label: 'Draft Executive Email',
            prompt: 'Draft an executive, persuasive follow-up email addressed to the customer regarding recent milestones and next steps.'
        },
        {
            id: 'pb-6',
            icon: '📋',
            label: 'Extract Action Plan & Tasks',
            prompt: 'Summarize all action items and next steps from this record and format them into clear tasks with priorities.'
        }
    ];

    connectedCallback() {
        this.selectedModel = this.defaultModel || 'gemini-3.8-flash';
        this.includeRecordContext = true;

        this.loadSettings();

        // If on a record page, load context
        if (this.recordId) {
            this.activeRecordId = this.recordId;
            this.activeRecordType = this.objectApiName || 'Record';
            this.loadRecordContext();
        }

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 2);
        this.taskDueDate = targetDate.toISOString().split('T')[0];

        this.initSpeechRecognition();
    }

    get availableModels() {
        return this.availableModelsList.map(m => ({
            ...m,
            selected: m.value === this.selectedModel
        }));
    }

    get statusPillClass() {
        return this.isConfigured ? 'status-pill connected' : 'status-pill disconnected';
    }

    get statusPillText() {
        return this.isConfigured ? 'Custom Setting Connected' : 'API Key Required';
    }

    get customSettingStatusText() {
        return this.isConfigured ? 'Gemini_Settings__c Configured' : 'Gemini_Settings__c Missing API Key';
    }

    get isChatEmpty() {
        return this.messages.length === 0;
    }

    get isSendDisabled() {
        return (!this.inputPrompt.trim() && !this.attachedMedia) || this.isLoading;
    }

    get micButtonClass() {
        return this.isListening ? 'composer-btn listening' : 'composer-btn';
    }

    get hasSoqlRows() {
        return this.soqlRows && this.soqlRows.length > 0;
    }

    get hasSearchResults() {
        return this.searchResults && this.searchResults.length > 0;
    }

    get isCatAll() { return this.groundingCategory === 'ALL'; }
    get isCatCrm() { return this.groundingCategory === 'CRM'; }
    get isCatCode() { return this.groundingCategory === 'CODE'; }
    get isCatLwc() { return this.groundingCategory === 'LWC'; }
    get isCatMeta() { return this.groundingCategory === 'METADATA'; }

    get tabAllClass() { return 'category-chip ' + (this.isCatAll ? 'active' : ''); }
    get tabCrmClass() { return 'category-chip ' + (this.isCatCrm ? 'active' : ''); }
    get tabCodeClass() { return 'category-chip ' + (this.isCatCode ? 'active' : ''); }
    get tabLwcClass() { return 'category-chip ' + (this.isCatLwc ? 'active' : ''); }
    get tabMetaClass() { return 'category-chip ' + (this.isCatMeta ? 'active' : ''); }

    get searchPlaceholderText() {
        if (this.groundingCategory === 'CODE') return 'Search Apex classes & triggers by name (e.g., GeminiLwcController)...';
        if (this.groundingCategory === 'LWC') return 'Search Lightning Web Components & Aura bundles (e.g., geminiStudio)...';
        if (this.groundingCategory === 'CRM') return 'Search standard CRM & custom objects (Accounts, Cases, Leads, Opps)...';
        if (this.groundingCategory === 'METADATA') return 'Search Flows, Object Schemas, Validation Rules...';
        return 'Search across all CRM records, custom objects, Apex code, LWCs, and Tooling data...';
    }

    get testResultStyle() {
        if (!this.testResult) return '';
        const bg = this.testResult.isSuccess ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
        const border = this.testResult.isSuccess ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';
        const color = this.testResult.isSuccess ? '#86efac' : '#fca5a5';
        return `background: ${bg}; border: 1px solid ${border}; color: ${color}; padding: 10px 14px; border-radius: 8px; font-size: 0.82rem;`;
    }

    // Load Settings from Custom Setting
    async loadSettings() {
        try {
            const data = await getSettings();
            if (data) {
                this.isConfigured = data.isConfigured;
                this.maskedApiKey = data.maskedApiKey || '';
                this.selectedModel = data.defaultModel || 'gemini-3.8-flash';
                this.endpointUrl = data.endpointUrl || 'https://generativelanguage.googleapis.com/v1beta';
                this.temperature = data.temperature !== undefined ? data.temperature : 0.7;
                this.maxTokens = data.maxTokens || 8192;
                this.systemInstruction = data.systemInstruction || '';

                this.settingsApiKey = this.maskedApiKey;
                this.settingsDefaultModel = this.selectedModel;
                this.settingsEndpointUrl = this.endpointUrl;
                this.settingsTemperature = this.temperature;
                this.settingsMaxTokens = this.maxTokens;
                this.settingsSystemPrompt = this.systemInstruction;
            }
        } catch (error) {
            console.error('Error loading Gemini settings:', error);
        }
    }

    // Load Record Context
    async loadRecordContext() {
        if (!this.activeRecordId) return;
        try {
            const result = await getRecordContext({
                recordId: this.activeRecordId,
                objectApiName: this.activeRecordType
            });
            if (result && !result.error) {
                this.activeRecordName = result.recordName;
                this.activeRecordType = result.objectName;
            }
        } catch (err) {
            console.warn('Could not load record context:', err);
        }
    }

    initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.speechRecognition = new SpeechRecognition();
            this.speechRecognition.continuous = false;
            this.speechRecognition.interimResults = false;
            this.speechRecognition.lang = 'en-US';

            this.speechRecognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                this.inputPrompt = this.inputPrompt ? `${this.inputPrompt} ${transcript}` : transcript;
                this.isListening = false;
            };

            this.speechRecognition.onerror = () => {
                this.isListening = false;
            };

            this.speechRecognition.onend = () => {
                this.isListening = false;
            };
        }
    }

    handleInputChange(event) {
        this.inputPrompt = event.target.value;
        const textarea = event.target;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
        }
    }

    handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleSendMessage();
        }
    }

    handleModelChange(event) {
        this.selectedModel = event.target.value;
        this.showToast('Model Changed', `Switched active model to ${this.selectedModel}`, 'info');
    }

    handleToggleGrounding(event) {
        this.includeRecordContext = event.target.checked;
    }

    handlePlaybookClick(event) {
        const prompt = event.currentTarget.dataset.prompt;
        this.inputPrompt = prompt;
        const textarea = this.template.querySelector('.composer-input');
        if (textarea) {
            textarea.value = prompt;
        }
        this.handleSendMessage();
    }

    handleCardPrompt(event) {
        const prompt = event.currentTarget.dataset.prompt;
        this.inputPrompt = prompt;
        const textarea = this.template.querySelector('.composer-input');
        if (textarea) {
            textarea.value = prompt;
        }
        this.handleSendMessage();
    }

    handleTriggerFileUpload() {
        const fileInput = this.template.querySelector('.hidden-file-input');
        if (fileInput) {
            fileInput.click();
        }
    }

    handleFileSelected(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            const base64Data = dataUrl.split(',')[1];
            const mimeType = file.type || 'application/octet-stream';
            const isImage = mimeType.startsWith('image/');

            this.attachedMedia = {
                fileName: file.name,
                fileSizeFormatted: this.formatBytes(file.size),
                mimeType: mimeType,
                base64Data: base64Data,
                previewUrl: dataUrl,
                isImage: isImage
            };
        };
        reader.readAsDataURL(file);
    }

    handleRemoveMedia() {
        this.attachedMedia = null;
        const fileInput = this.template.querySelector('.hidden-file-input');
        if (fileInput) {
            fileInput.value = '';
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    handleToggleMic() {
        if (!this.speechRecognition) {
            this.showToast('Voice Unavailable', 'Speech recognition is not supported in this browser.', 'warning');
            return;
        }

        if (this.isListening) {
            this.speechRecognition.stop();
            this.isListening = false;
        } else {
            this.speechRecognition.start();
            this.isListening = true;
        }
    }

    handleToggleSpeech(event) {
        const text = event.currentTarget.dataset.text;
        if (!this.speechSynth) {
            this.showToast('TTS Unavailable', 'Text to speech is not supported in this browser.', 'warning');
            return;
        }

        if (this.speechSynth.speaking) {
            this.speechSynth.cancel();
            return;
        }

        const plainText = text.replace(/```[\s\S]*?```/g, 'Code block omitted.')
                              .replace(/[#*_~`>-]/g, '')
                              .trim();

        const utterance = new SpeechSynthesisUtterance(plainText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        this.speechSynth.speak(utterance);
    }

    handleCopyCode(event) {
        const code = event.currentTarget.dataset.code;
        if (code) {
            navigator.clipboard.writeText(code).then(() => {
                this.showToast('Copied', 'Code copied to clipboard.', 'success');
            }).catch(() => {
                this.showToast('Copy Failed', 'Unable to copy to clipboard.', 'error');
            });
        }
    }

    handleCopyFullResponse(event) {
        const text = event.currentTarget.dataset.text;
        if (text) {
            navigator.clipboard.writeText(text).then(() => {
                this.showToast('Copied', 'Response copied to clipboard.', 'success');
            });
        }
    }

    // Export CSV from live query results
    handleExportResultsCsv(event) {
        const msgId = event.currentTarget.dataset.msgId;
        const targetMsg = this.messages.find(m => m.id === msgId);
        if (!targetMsg || !targetMsg.queryResults || !targetMsg.queryResults.rows) return;

        const qr = targetMsg.queryResults;
        const columns = qr.columns || [];
        let csvContent = columns.join(',') + '\n';

        for (const r of qr.rows) {
            const rowValues = columns.map(c => {
                let v = r[c] !== undefined && r[c] !== null ? String(r[c]) : '';
                if (v.includes(',') || v.includes('"') || v.includes('\n')) {
                    v = '"' + v.replace(/"/g, '""') + '"';
                }
                return v;
            });
            csvContent += rowValues.join(',') + '\n';
        }

        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
        element.setAttribute('download', `Salesforce_Query_Results_${Date.now()}.csv`);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        this.showToast('Exported', 'Data exported as CSV successfully.', 'success');
    }

    // Send Message to Gemini
    async handleSendMessage() {
        const textarea = this.template.querySelector('.composer-input');
        const text = (textarea ? textarea.value : (this.inputPrompt || '')).trim();
        const media = this.attachedMedia;

        if (!text && !media) return;

        if (!this.isConfigured) {
            this.showToast('Configuration Required', 'Please configure your Gemini API Key in Custom Setting first.', 'warning');
            this.openSettingsModal();
            return;
        }

        // CRITICAL FIX: Immediately blank out DOM textarea and component state
        if (textarea) {
            textarea.value = '';
            textarea.style.height = 'auto';
        }
        this.inputPrompt = '';
        this.attachedMedia = null;

        const userMsg = {
            id: 'msg-' + Date.now(),
            isUser: true,
            rowClass: 'message-row user-row',
            rawText: text,
            mediaPreview: media ? media.previewUrl : null,
            mediaName: media ? media.fileName : null,
            blocks: []
        };

        this.messages = [...this.messages, userMsg];
        this.isLoading = true;
        this.scrollToBottom();

        const historyForApi = this.messages.map(m => ({
            role: m.isUser ? 'user' : 'model',
            text: m.rawText
        }));

        try {
            const resp = await generateContent({
                prompt: text,
                modelName: this.selectedModel,
                systemInstruction: this.systemInstruction,
                temperature: this.temperature,
                maxTokens: this.maxTokens,
                chatHistoryJson: JSON.stringify(historyForApi.slice(0, -1)),
                base64MediaData: media ? media.base64Data : null,
                mimeType: media ? media.mimeType : null,
                recordId: this.activeRecordId,
                objectApiName: this.activeRecordType,
                includeRecordContext: this.includeRecordContext
            });

            if (resp && resp.success) {
                const parsedBlocks = this.parseMarkdownBlocks(resp.text);
                const statsStr = `${resp.totalTokens || 0} tokens • ${resp.latencyMs}ms`;

                // If live Salesforce records were returned by auto SOQL
                let formattedQueryResults = null;
                if (resp.queryResults && resp.queryResults.success && resp.queryResults.rows && resp.queryResults.rows.length > 0) {
                    const columns = resp.queryResults.columns || [];
                    const formattedRows = (resp.queryResults.rows || []).map((row, idx) => ({
                        rowId: 'qr-row-' + idx,
                        cells: columns.map(col => {
                            const rawVal = row[col] !== undefined && row[col] !== null ? String(row[col]) : '-';
                            const isLink = (col.toLowerCase() === 'name' || col.toLowerCase() === 'id') && !!row._recordUrl;
                            return {
                                col: col,
                                value: rawVal,
                                isLink: isLink,
                                linkUrl: row._recordUrl || '#'
                            };
                        })
                    }));

                    formattedQueryResults = {
                        columns: columns,
                        rows: resp.queryResults.rows,
                        formattedRows: formattedRows,
                        totalCount: resp.queryResults.totalCount || resp.queryResults.rows.length
                    };
                }

                const modelMsg = {
                    id: 'msg-' + Date.now(),
                    isUser: false,
                    rowClass: 'message-row model',
                    rawText: resp.text,
                    blocks: parsedBlocks,
                    extractedSoql: resp.extractedSoql,
                    queryResults: formattedQueryResults,
                    stats: statsStr
                };

                this.messages = [...this.messages, modelMsg];
            }
        } catch (err) {
            const errorMsgText = err.body ? err.body.message : (err.message || 'Error communicating with Gemini.');
            const errorMsg = {
                id: 'msg-' + Date.now(),
                isUser: false,
                rowClass: 'message-row model',
                rawText: `⚠️ **Error communicating with Gemini:**\n\n${errorMsgText}`,
                blocks: [
                    {
                        id: 'b-err',
                        isText: true,
                        isCode: false,
                        isTable: false,
                        html: `<span style="color: #f87171;">⚠️ <strong>Error communicating with Gemini:</strong><br/>${this.escapeHtml(errorMsgText)}</span>`
                    }
                ],
                extractedSoql: null,
                queryResults: null,
                stats: null
            };
            this.messages = [...this.messages, errorMsg];
        } finally {
            this.isLoading = false;
            this.scrollToBottom();
        }
    }

    // Comprehensive Markdown Parser with Table, Code, and Rich Text extraction
    parseMarkdownBlocks(markdown) {
        if (!markdown) return [];
        const blocks = [];
        const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
        let lastIndex = 0;
        let match;
        let blockIndex = 0;

        while ((match = codeBlockRegex.exec(markdown)) !== null) {
            if (match.index > lastIndex) {
                const textPart = markdown.substring(lastIndex, match.index).trim();
                if (textPart) {
                    this.processTextAndTables(textPart, blocks, blockIndex);
                    blockIndex += 5;
                }
            }

            const lang = match[1] || 'Code';
            const code = match[2];
            blocks.push({
                id: 'blk-' + (blockIndex++),
                isCode: true,
                isTable: false,
                isText: false,
                language: lang.toUpperCase(),
                content: code
            });

            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < markdown.length) {
            const textPart = markdown.substring(lastIndex).trim();
            if (textPart) {
                this.processTextAndTables(textPart, blocks, blockIndex);
            }
        }

        return blocks;
    }

    // Process mixed markdown text and Markdown tables
    processTextAndTables(rawText, blocks, startIndex) {
        let idx = startIndex;
        const lines = rawText.split('\n');
        let textBuffer = [];
        let inTable = false;
        let tableHeaderLines = [];
        let tableBodyLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Table row detection
            if (line.startsWith('|') && line.endsWith('|')) {
                if (!inTable) {
                    // Flush text before table
                    if (textBuffer.length > 0) {
                        blocks.push({
                            id: 'blk-' + (idx++),
                            isText: true,
                            isCode: false,
                            isTable: false,
                            html: this.formatMarkdownToHtml(textBuffer.join('\n'))
                        });
                        textBuffer = [];
                    }
                    inTable = true;
                    tableHeaderLines = [line];
                    tableBodyLines = [];
                } else if (tableHeaderLines.length === 1 && line.includes('---')) {
                    // separator line, ignore
                } else {
                    tableBodyLines.push(line);
                }
            } else {
                if (inTable) {
                    // Table ended, construct table block
                    const tableData = this.buildTableData(tableHeaderLines[0], tableBodyLines);
                    if (tableData) {
                        blocks.push({
                            id: 'blk-' + (idx++),
                            isTable: true,
                            isCode: false,
                            isText: false,
                            tableData: tableData
                        });
                    }
                    inTable = false;
                    tableHeaderLines = [];
                    tableBodyLines = [];
                }
                textBuffer.push(lines[i]);
            }
        }

        // Flush remaining table
        if (inTable && tableHeaderLines.length > 0) {
            const tableData = this.buildTableData(tableHeaderLines[0], tableBodyLines);
            if (tableData) {
                blocks.push({
                    id: 'blk-' + (idx++),
                    isTable: true,
                    isCode: false,
                    isText: false,
                    tableData: tableData
                });
            }
        }

        // Flush remaining text
        if (textBuffer.length > 0) {
            blocks.push({
                id: 'blk-' + (idx++),
                isText: true,
                isCode: false,
                isTable: false,
                html: this.formatMarkdownToHtml(textBuffer.join('\n'))
            });
        }
    }

    buildTableData(headerLine, bodyLines) {
        if (!headerLine) return null;
        const headers = headerLine.split('|').map(h => h.trim()).filter(h => h.length > 0);
        const rows = bodyLines.map((rowStr, rIdx) => {
            const cells = rowStr.split('|').map(c => c.trim()).filter(c => c.length > 0);
            return {
                id: 'tr-' + rIdx,
                cells: cells
            };
        });
        return { headers, rows };
    }

    formatMarkdownToHtml(md) {
        if (!md) return '';
        let html = this.escapeHtml(md);

        // Bold **text**
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Italic *text*
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Inline code `code`
        html = html.replace(/`([^`]+)`/g, '<code class="rich-inline-code">$1</code>');
        // Headings
        html = html.replace(/^### (.*$)/gim, '<h4 class="rich-h4">$1</h4>');
        html = html.replace(/^## (.*$)/gim, '<h3 class="rich-h3">$1</h3>');
        html = html.replace(/^# (.*$)/gim, '<h2 class="rich-h2">$1</h2>');
        // Blockquotes >
        html = html.replace(/^>\s+(.*$)/gim, '<blockquote class="rich-blockquote">$1</blockquote>');

        // Group consecutive bullet points into <ul> to prevent empty line gaps
        html = html.replace(/(?:^\s*[-*•]\s+.*(?:\r?\n|$))+/gim, (match) => {
            const items = match.split(/\r?\n/)
                .map(line => line.trim())
                .filter(line => /^[-*•]\s+/.test(line))
                .map(line => `<li style="margin-bottom: 4px; color: #1e293b; line-height: 1.5;">${line.replace(/^[-*•]\s+/, '')}</li>`)
                .join('');
            return `<ul style="margin: 6px 0 10px 18px; padding-left: 0; list-style-type: disc;">${items}</ul>`;
        });

        // Group consecutive numbered lists into <ol>
        html = html.replace(/(?:^\s*\d+\.\s+.*(?:\r?\n|$))+/gim, (match) => {
            const items = match.split(/\r?\n/)
                .map(line => line.trim())
                .filter(line => /^\d+\./.test(line))
                .map(line => `<li style="margin-bottom: 4px; color: #1e293b; line-height: 1.5;">${line.replace(/^\d+\.\s+/, '')}</li>`)
                .join('');
            return `<ol style="margin: 6px 0 10px 18px; padding-left: 0; list-style-type: decimal;">${items}</ol>`;
        });

        // Markdown Links [text](url)
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="rich-link">$1</a>');
        // Salesforce ID auto-linking (15/18 char IDs starting with 001, 003, 006, 00Q, 500, etc.)
        html = html.replace(/\b(00[1-9A-Za-z]{13,16}|500[0-9A-Za-z]{12,15})\b/g, '<a href="/lightning/r/$1/view" target="_blank" class="rich-link">$1</a>');

        // Clean paragraph spacing
        html = html.replace(/\n\n+/g, '<div style="height: 8px;"></div>');
        html = html.replace(/\n/g, '<br/>');

        // Clean up redundant breaks after block elements
        html = html.replace(/<\/ul><br\/>/g, '</ul>');
        html = html.replace(/<\/ol><br\/>/g, '</ol>');
        html = html.replace(/<\/h[2-4]><br\/>/g, '</h$1>');
        html = html.replace(/<\/blockquote><br\/>/g, '</blockquote>');
        html = html.replace(/<div style="height: 8px;"><\/div><br\/>/g, '<div style="height: 8px;"></div>');

        return html;
    }

    escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    scrollToBottom() {
        setTimeout(() => {
            const chatArea = this.template.querySelector('.gemini-chat-area');
            if (chatArea) {
                chatArea.scrollTop = chatArea.scrollHeight;
            }
        }, 50);
    }

    handleClearChat() {
        this.messages = [];
        this.showToast('New Chat', 'Chat history cleared.', 'info');
    }

    handleExportChat() {
        if (this.messages.length === 0) {
            this.showToast('Chat Empty', 'No messages to export.', 'warning');
            return;
        }

        let exportText = `# Google Gemini Chat Transcript\nGenerated on: ${new Date().toLocaleString()}\n\n---\n\n`;
        for (const m of this.messages) {
            const role = m.isUser ? 'USER' : 'GEMINI';
            exportText += `### [${role}]\n${m.rawText}\n\n`;
        }

        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(exportText));
        element.setAttribute('download', `Gemini_Chat_${Date.now()}.md`);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        this.showToast('Exported', 'Conversation transcript downloaded as Markdown.', 'success');
    }

    // SOQL Runner
    async handleRunExtractedSoql(event) {
        const query = event.currentTarget.dataset.soql;
        if (!query) return;

        this.activeSoqlQuery = query;
        this.isLoading = true;

        try {
            const result = await executeSafeSoql({ query });
            if (result && result.success) {
                this.soqlColumns = result.columns || [];
                this.soqlResultCount = result.totalCount || 0;

                this.soqlRows = (result.rows || []).map((row, idx) => ({
                    rowId: 'row-' + idx,
                    cells: this.soqlColumns.map(col => ({
                        col: col,
                        value: row[col] !== undefined && row[col] !== null ? String(row[col]) : '-',
                        isLink: (col.toLowerCase() === 'name' || col.toLowerCase() === 'id') && !!row._recordUrl,
                        linkUrl: row._recordUrl || '#'
                    }))
                }));

                this.showSoqlModal = true;
            }
        } catch (err) {
            const msg = err.body ? err.body.message : err.message;
            this.showToast('SOQL Error', msg, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    closeSoqlModal() {
        this.showSoqlModal = false;
    }

    // Task Creator
    handleOpenTaskModalFromMsg(event) {
        const text = event.currentTarget.dataset.text;
        if (text) {
            this.taskDescription = text.substring(0, 500);
            this.taskSubject = 'Follow-up on Gemini Action: ' + (text.substring(0, 50).replace(/[#*]/g, '').trim()) + '...';
        }
        this.showTaskModal = true;
    }

    handleTaskSubjectChange(e) { this.taskSubject = e.target.value; }
    handleTaskDueDateChange(e) { this.taskDueDate = e.target.value; }
    handleTaskPriorityChange(e) { this.taskPriority = e.target.value; }
    handleTaskDescriptionChange(e) { this.taskDescription = e.target.value; }

    async handleSaveTask() {
        if (!this.taskSubject.trim()) {
            this.showToast('Subject Required', 'Please enter a task subject.', 'warning');
            return;
        }

        this.isSavingTask = true;
        try {
            const res = await createSalesforceTask({
                recordId: this.activeRecordId,
                subject: this.taskSubject,
                description: this.taskDescription,
                priority: this.taskPriority,
                status: 'Not Started',
                dueDate: this.taskDueDate ? this.taskDueDate : null
            });

            if (res && res.success) {
                this.showToast('Success', res.message, 'success');
                this.closeTaskModal();
            }
        } catch (err) {
            const msg = err.body ? err.body.message : err.message;
            this.showToast('Task Creation Error', msg, 'error');
        } finally {
            this.isSavingTask = false;
        }
    }

    closeTaskModal() {
        this.showTaskModal = false;
    }

    // Settings Modal
    openSettingsModal() {
        this.testResult = null;
        this.showSettingsModal = true;
    }

    closeSettingsModal() {
        this.showSettingsModal = false;
    }

    handleSettingsApiKeyChange(e) { this.settingsApiKey = e.target.value; }
    handleSettingsModelChange(e) { this.settingsDefaultModel = e.target.value; }
    handleSettingsEndpointChange(e) { this.settingsEndpointUrl = e.target.value; }
    handleSettingsTemperatureChange(e) { this.settingsTemperature = parseFloat(e.target.value); }
    handleSettingsMaxTokensChange(e) { this.settingsMaxTokens = parseInt(e.target.value, 10); }
    handleSettingsSystemPromptChange(e) { this.settingsSystemPrompt = e.target.value; }

    async handleTestConnection() {
        this.isTestingConnection = true;
        this.testResult = null;

        try {
            const res = await testConnection({
                tempApiKey: this.settingsApiKey && !this.settingsApiKey.includes('••••') ? this.settingsApiKey : null,
                testModel: this.settingsDefaultModel || this.selectedModel || 'gemini-3.8-flash'
            });

            if (res && res.success) {
                this.testResult = {
                    isSuccess: true,
                    title: `✅ Connected Successfully (${res.latencyMs}ms)`,
                    message: res.message || 'Google Gemini API responded successfully!'
                };
            } else {
                this.testResult = {
                    isSuccess: false,
                    title: '❌ Connection Failed',
                    message: res ? (res.error || `Status Code: ${res.statusCode}`) : 'Unknown error'
                };
            }
        } catch (err) {
            this.testResult = {
                isSuccess: false,
                title: '❌ Connection Error',
                message: err.body ? err.body.message : err.message
            };
        } finally {
            this.isTestingConnection = false;
        }
    }

    async handleSaveSettings() {
        this.isSavingSettings = true;
        try {
            const updated = await saveSettings({
                apiKey: this.settingsApiKey,
                defaultModel: this.settingsDefaultModel,
                endpointUrl: this.settingsEndpointUrl,
                temperature: this.settingsTemperature,
                maxTokens: this.settingsMaxTokens,
                systemInstruction: this.settingsSystemPrompt
            });

            if (updated) {
                this.isConfigured = updated.isConfigured;
                this.maskedApiKey = updated.maskedApiKey;
                this.selectedModel = updated.defaultModel;
                this.endpointUrl = updated.endpointUrl;
                this.temperature = updated.temperature;
                this.maxTokens = updated.maxTokens;
                this.systemInstruction = updated.systemInstruction;

                this.showToast('Settings Saved', 'Gemini Settings saved into Custom Setting successfully.', 'success');
                this.closeSettingsModal();
            }
        } catch (err) {
            const msg = err.body ? err.body.message : err.message;
            this.showToast('Save Failed', msg, 'error');
        } finally {
            this.isSavingSettings = false;
        }
    }

    // Record & Tooling Search
    openRecordSearchModal() {
        this.searchResults = [];
        this.recordSearchTerm = '';
        this.groundingCategory = 'ALL';
        this.isSearchingRecords = false;
        this.showRecordSearchModal = true;
    }

    closeRecordSearchModal() {
        this.showRecordSearchModal = false;
    }

    handleCategoryChange(event) {
        this.groundingCategory = event.currentTarget.dataset.cat || 'ALL';
        if (this.recordSearchTerm && this.recordSearchTerm.trim().length >= 2) {
            this.executeRecordSearch();
        }
    }

    handleClearGroundedRecord() {
        this.activeRecordId = null;
        this.activeRecordType = null;
        this.activeRecordName = null;
        this.showToast('Grounding Cleared', 'Restored to Global CRM & Tooling Org Context', 'info');
    }

    handleRecordSearchChange(e) {
        this.recordSearchTerm = e.target.value;
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        if (!this.recordSearchTerm || this.recordSearchTerm.trim().length < 2) {
            this.searchResults = [];
            this.isSearchingRecords = false;
            return;
        }

        this.searchTimeout = setTimeout(() => {
            this.executeRecordSearch();
        }, 300);
    }

    async executeRecordSearch() {
        if (!this.recordSearchTerm || this.recordSearchTerm.trim().length < 2) return;
        this.isSearchingRecords = true;
        try {
            const results = await searchRecords({
                searchTerm: this.recordSearchTerm,
                category: this.groundingCategory
            });
            this.searchResults = results || [];
        } catch (err) {
            console.error('Record search failed:', err);
            this.searchResults = [];
        } finally {
            this.isSearchingRecords = false;
        }
    }

    async handleSelectSearchResult(event) {
        const id = event.currentTarget.dataset.id;
        const type = event.currentTarget.dataset.type;
        const name = event.currentTarget.dataset.name;

        this.activeRecordId = id;
        this.activeRecordType = type;
        this.activeRecordName = name;
        this.includeRecordContext = true;

        this.showToast('Record Grounded', `Active context grounded with ${type}: ${name}`, 'success');
        this.closeRecordSearchModal();

        await this.loadRecordContext();
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({
            title,
            message,
            variant
        }));
    }
}

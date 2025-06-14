const https = require('https');
const { EventEmitter } = require('events');

class VapiService extends EventEmitter {
    constructor() {
        super();
        this.privateKey = process.env.VAPI_PRIVATE_KEY;
        this.publicKey = process.env.VAPI_PUBLIC_KEY;
        this.apiKey = this.privateKey;
        this.assistantId = process.env.VAPI_ASSISTANT_ID;
        this.phoneNumberId = process.env.VAPI_TWILIO_PHONE_NUMBER_ID;
        this.baseUrl = 'https://api.vapi.ai';
        this.initialized = false;

        console.log('VapiService constructor - Configuration:', {
            hasPrivateKey: !!this.privateKey,
            hasPublicKey: !!this.publicKey,
            hasAssistantId: !!this.assistantId,
            baseUrl: this.baseUrl
        });

        if (this.validateConfig()) {
            this.initialize();
        } else {
            console.error('VapiService not initialized due to missing configuration.');
            throw new Error('Missing required environment variables: VAPI_PRIVATE_KEY, VAPI_PUBLIC_KEY, VAPI_ASSISTANT_ID');
        }
    }

    validateConfig() {
        let isValid = true;
        const issues = [];
        if (!this.privateKey || this.privateKey === 'your_private_key_here') {
            issues.push('VAPI_PRIVATE_KEY not found or not set');
            isValid = false;
        }
        if (!this.publicKey || this.publicKey === 'your_public_key_here') {
            issues.push('VAPI_PUBLIC_KEY not found or not set');
            isValid = false;
        }
        if (!this.assistantId || this.assistantId === 'your_assistant_id_here') {
            issues.push('VAPI_ASSISTANT_ID not found or not set');
            isValid = false;
        }
        console.log('VapiService validation result:', { isValid, issues });
        return isValid;
    }

    async initialize() {
        try {
            this.initialized = true;
            this.emit('ready');
            console.log('VapiService initialized successfully');
        } catch (error) {
            console.error('Failed to initialize VapiService:', error.message);
            this.emit('error', error);
            throw error;
        }
    }

    async healthCheck() {
        try {
            if (!this.initialized) {
                return { status: 'not_configured', message: 'Vapi service not initialized.' };
            }
            const assistantData = await this.getAssistant();
            return { 
                status: 'healthy',
                apiKeyPresent: !!this.apiKey,
                assistantId: this.assistantId,
                assistantName: assistantData?.name || 'Unknown'
            };
        } catch (error) {
            console.error('Health check failed:', error);
            return { status: 'error', message: error.message };
        }
    }

    makeRequest(options, data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.baseUrl);
            const requestOptions = {
                ...options,
                hostname: url.hostname,
                path: options.path
            };

            console.log('Making API request:', {
                method: requestOptions.method,
                fullUrl: `${this.baseUrl}${options.path}`,
                hostname: requestOptions.hostname,
                path: requestOptions.path,
                hasData: !!data
            });

            const req = https.request(requestOptions, (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    try {
                        console.log('API response received:', {
                            statusCode: res.statusCode,
                            headers: res.headers,
                            bodyLength: body.length
                        });
                        if (!body) {
                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                resolve({});
                            } else {
                                reject(new Error(`API Error: ${res.statusCode}`));
                            }
                            return;
                        }
                        const response = JSON.parse(body);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(response);
                        } else {
                            console.error('API error response:', { statusCode: res.statusCode, response });
                            reject(new Error(`API Error: ${res.statusCode} - ${response.message || body}`));
                        }
                    } catch (error) {
                        console.error('Failed to parse API response:', error);
                        reject(new Error(`Parse Error: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                console.error('Request error:', error);
                reject(new Error(`Request Error: ${error.message}`));
            });

            if (data) {
                const jsonData = JSON.stringify(data);
                console.log('Sending request data:', jsonData);
                req.write(jsonData);
            }
            req.end();
        });
    }

    async getAssistant() {
        try {
            if (!this.initialized) throw new Error('VapiService not initialized.');
            if (!this.assistantId) throw new Error('Assistant ID not configured');
            const options = {
                path: `/assistant/${this.assistantId}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            };
            return await this.makeRequest(options);
        } catch (error) {
            console.error('Get assistant error:', error);
            throw error;
        }
    }

    async makeCall(phoneNumber, customAssistantId = null, callData = {}) {
        try {
            if (!this.initialized) throw new Error('VapiService not initialized.');
            if (!this.apiKey) throw new Error('Vapi API key not configured');
            if (!phoneNumber) throw new Error('Phone number is required');

            const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
            const phoneRegex = /^\+?[1-9]\d{8,14}$/;
            if (!phoneRegex.test(cleanPhone)) {
                throw new Error('Invalid phone number format. Use international format (+1234567890)');
            }

            const requestData = {
                assistantId: customAssistantId || this.assistantId,
                phoneNumberId: this.phoneNumberId,
                customer: {
                    number: cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`
                },
                ...callData // Merge assistantOverrides or other custom data
            };

            const options = {
                path: '/call/phone',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            };

            const result = await this.makeRequest(options, requestData);
            console.log(`Call initiated successfully:`, result.id);
            return result;
        } catch (error) {
            console.error('Make call error:', error);
            throw error;
        }
    }

    async createWebCall(customAssistantId = null, transportConfig = null) {
        try {
            if (!this.initialized) throw new Error('VapiService not initialized.');
            if (!this.privateKey) throw new Error('Vapi private key not configured');
            const callData = {
                assistantId: customAssistantId || this.assistantId,
                transport: transportConfig || {
                    provider: "vapi.websocket",
                    audioFormat: {
                        format: "pcm_s16le",
                        container: "raw",
                        sampleRate: 16000
                    }
                }
            };
            const options = {
                path: '/call',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.privateKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            };
            const result = await this.makeRequest(options, callData);
            if (!result || !result.id || !result.transport || !result.transport.websocketCallUrl) {
                throw new Error('Invalid response from Vapi API - missing required fields');
            }
            return { ...result, publicKey: this.publicKey };
        } catch (error) {
            console.error('Create web call error:', error);
            throw error;
        }
    }

    async getCalls(limit = 100) {
        try {
            if (!this.initialized) throw new Error('VapiService not initialized.');
            if (!this.apiKey) throw new Error('Vapi API key not configured');
            const options = {
                path: `/call?limit=${limit}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            };
            return await this.makeRequest(options);
        } catch (error) {
            console.error('Get calls error:', error);
            throw error;
        }
    }

    async getCall(callId) {
        try {
            if (!this.initialized) throw new Error('VapiService not initialized.');
            if (!this.privateKey) throw new Error('Vapi private key not configured');
            if (!callId) throw new Error('Call ID is required');
            const options = {
                path: `/call/${callId}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.privateKey}`,
                    'Content-Type': 'application/json'
                }
            };
            return await this.makeRequest(options);
        } catch (error) {
            console.error('Get call error:', error);
            throw error;
        }
    }

    async endCall(callId) {
        try {
            if (!this.initialized) throw new Error('VapiService not initialized.');
            if (!this.apiKey) throw new Error('Vapi API key not configured');
            if (!callId) throw new Error('Call ID is required');
            const options = {
                path: `/call/${callId}`,
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            };
            return await this.makeRequest(options);
        } catch (error) {
            console.error('End call error:', error);
            throw error;
        }
    }

    async getCallTranscript(callId) {
        try {
            const call = await this.getCall(callId);
            return call.transcript || null;
        } catch (error) {
            console.error('Get transcript error:', error);
            throw error;
        }
    }

    async updateAssistant(updates) {
        try {
            if (!this.initialized) throw new Error('VapiService not initialized.');
            if (!this.assistantId) throw new Error('Assistant ID not configured');
            const options = {
                path: `/assistant/${this.assistantId}`,
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            };
            return await this.makeRequest(options, updates);
        } catch (error) {
            console.error('Update assistant error:', error);
            throw error;
        }
    }

    async updateShowing(callId, showingDetails) {
        try {
            const options = {
                path: `/call/${callId}/function`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            };
            const data = {
                name: 'updateShowing',
                arguments: showingDetails
            };
            return await this.makeRequest(options, data);
        } catch (error) {
            console.error('Update showing error:', error);
            throw error;
        }
    }

    destroy() {
        this.removeAllListeners();
        this.initialized = false;
    }
}

module.exports = VapiService;
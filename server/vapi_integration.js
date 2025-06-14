// server/vapi_integration.js - Real Vapi.ai Integration
const https = require('https');
const { EventEmitter } = require('events');

class VapiService extends EventEmitter {
    constructor() {
        super();
        
        // Use PRIVATE key for backend API operations
        this.privateKey = process.env.VAPI_PRIVATE_KEY;
        
        // Use PUBLIC key for frontend/web integration
        this.publicKey = process.env.VAPI_PUBLIC_KEY;
        
        // For backend API calls, use private key
        this.apiKey = this.privateKey;
        
        this.assistantId = process.env.VAPI_ASSISTANT_ID;
        
        this.phoneNumberId = process.env.VAPI_TWILIO_PHONE_NUMBER_ID; // Optional phone number ID
        
        // Set base URL with proper format
        this.baseUrl = 'https://api.vapi.ai';
        
        this.initialized = false;
        
        console.log('VapiService constructor - Configuration:', {
            hasPrivateKey: !!this.privateKey,
            hasPublicKey: !!this.publicKey,
            hasAssistantId: !!this.assistantId,
            baseUrl: this.baseUrl
        });
        
        // Only initialize if configuration is valid
        if (this.validateConfig()) {
            this.initialize();
        } else {
            console.warn('VapiService not initialized due to missing configuration. Please set VAPI_PRIVATE_KEY, VAPI_PUBLIC_KEY, and VAPI_ASSISTANT_ID environment variables.');
        }
    }

    // Update validation
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

        console.log('VapiService validation result:', {
            isValid,
            issues: issues.length > 0 ? issues : 'No issues found'
        });

        return isValid;
    }

    async initialize() {
        try {
            // Skip configuration PATCH attempt since it's not supported
            this.initialized = true;
            this.emit('ready');
            console.log('VapiService initialized successfully');
        } catch (error) {
            console.error('Failed to initialize VapiService:', error.message);
            this.emit('error', error);
        }
    }

    async healthCheck() {
        try {
            if (!this.initialized) {
                return { 
                    status: 'not_configured',
                    message: 'Vapi service not initialized. Please check environment variables.'
                };
            }

            // Test API connection with assistant endpoint
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

    // Make HTTP request helper
    makeRequest(options, data = null) {
        return new Promise((resolve, reject) => {
            // Parse the baseUrl to get hostname
            const url = new URL(this.baseUrl);
            
            const requestOptions = {
                ...options,
                hostname: url.hostname,
                path: options.path // Use the path as is
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
                
                res.on('data', (chunk) => {
                    body += chunk;
                });
                
                res.on('end', () => {
                    try {
                        console.log('API response received:', {
                            statusCode: res.statusCode,
                            headers: res.headers,
                            bodyLength: body.length
                        });

                        // Handle empty response
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
                            console.error('API error response:', {
                                statusCode: res.statusCode,
                                response: response
                            });
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

    // Get assistant details
    async getAssistant() {
        try {
            if (!this.initialized) {
                throw new Error('VapiService not initialized. Please check configuration.');
            }

            if (!this.assistantId) {
                throw new Error('Assistant ID not configured');
            }

            const options = {
                hostname: this.baseUrl,
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

    // Create a phone call
    async makeCall(phoneNumber, customAssistantId = null) {
        try {
            if (!this.initialized) {
                throw new Error('VapiService not initialized. Please check configuration.');
            }

            if (!this.apiKey) {
                throw new Error('Vapi API key not configured');
            }

            if (!phoneNumber) {
                throw new Error('Phone number is required');
            }

            // Validate and format phone number
            const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
            const phoneRegex = /^\+?[1-9]\d{8,14}$/;
            
            if (!phoneRegex.test(cleanPhone)) {
                throw new Error('Invalid phone number format. Use international format (+1234567890)');
            }

            const callData = {
                assistantId: customAssistantId || this.assistantId,
               // phoneNumberId: null, // Use default phone number from Vapi
               phoneNumberId: this.phoneNumberId, // Use configured phone number ID if available
                customer: {
                    number: cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`
                }
            };

            const options = {
                hostname: this.baseUrl,
                path: '/call/phone',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            };

            const result = await this.makeRequest(options, callData);
            
            console.log(`Call initiated successfully:`, result.id);
            return result;

        } catch (error) {
            console.error('Make call error:', error);
            throw error;
        }
    }

    // Create a web call (for browser integration)
    async createWebCall(customAssistantId = null, transportConfig = null) {
        try {
            console.log('Creating web call - Starting:', {
                initialized: this.initialized,
                hasPrivateKey: !!this.privateKey,
                customAssistantId: !!customAssistantId,
                hasTransportConfig: !!transportConfig
            });

            if (!this.initialized) {
                throw new Error('VapiService not initialized. Please check configuration.');
            }

            if (!this.privateKey) {
                throw new Error('Vapi private key not configured');
            }

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

            console.log('Creating web call with config:', JSON.stringify(callData, null, 2));

            const options = {
                hostname: this.baseUrl,
                path: '/call',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.privateKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            };

            const result = await this.makeRequest(options, callData);
            
            // Validate the response
            if (!result || !result.id || !result.transport || !result.transport.websocketCallUrl) {
                console.error('Invalid response from Vapi API:', result);
                throw new Error('Invalid response from Vapi API - missing required fields');
            }
            
            console.log('Web call created successfully:', {
                callId: result.id,
                hasTransport: !!result.transport,
                transportProvider: result.transport?.provider,
                hasWebSocketUrl: !!result.transport?.websocketCallUrl
            });
            
            // Return both the call data and public key for frontend
            return {
                ...result,
                publicKey: this.publicKey
            };

        } catch (error) {
            console.error('Create web call error:', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    // Get all calls
    async getCalls(limit = 100) {
        try {
            if (!this.initialized) {
                throw new Error('VapiService not initialized. Please check configuration.');
            }

            if (!this.apiKey) {
                throw new Error('Vapi API key not configured');
            }

            const options = {
                hostname: this.baseUrl,
                path: `/call?limit=${limit}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            };

            const result = await this.makeRequest(options);
            return result;

        } catch (error) {
            console.error('Get calls error:', error);
            throw error;
        }
    }

    // Get specific call details
    async getCall(callId) {
        try {
            if (!this.initialized) {
                throw new Error('VapiService not initialized. Please check configuration.');
            }

            if (!this.privateKey) {
                throw new Error('Vapi private key not configured');
            }

            if (!callId) {
                throw new Error('Call ID is required');
            }

            const options = {
                hostname: this.baseUrl,
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

    // End an active call
    async endCall(callId) {
        try {
            if (!this.initialized) {
                throw new Error('VapiService not initialized. Please check configuration.');
            }

            if (!this.apiKey) {
                throw new Error('Vapi API key not configured');
            }

            if (!callId) {
                throw new Error('Call ID is required');
            }

            const options = {
                hostname: this.baseUrl,
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

    // Get call transcript
    async getCallTranscript(callId) {
        try {
            const call = await this.getCall(callId);
            return call.transcript || null;
        } catch (error) {
            console.error('Get transcript error:', error);
            throw error;
        }
    }

    // Update assistant (if needed)
    async updateAssistant(updates) {
        try {
            if (!this.initialized) {
                throw new Error('VapiService not initialized. Please check configuration.');
            }

            if (!this.assistantId) {
                throw new Error('Assistant ID not configured');
            }

            const options = {
                hostname: this.baseUrl,
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

//
    async updateShowing(callId, showingDetails) {
    const options = {
        hostname: this.baseUrl,
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


//


    // Cleanup method
    destroy() {
        this.removeAllListeners();
        this.initialized = false;
    }

}
module.exports = VapiService;
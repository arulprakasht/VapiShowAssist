const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const VapiService = require('./vapi_integration');

const app = express();
require('dotenv').config();
const PORT = process.env.PORT || 3000;

let vapiService;
try {
    vapiService = new VapiService();
    console.log('VapiService initialized');
} catch (error) {
    console.error('Failed to initialize Vapi service:', error.stack);
}

let supabase;
try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
        supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { auth: { persistSession: false }, db: { schema: 'public' } }
        );
        console.log('Supabase client initialized');
    }
} catch (error) {
    console.error('Failed to initialize Supabase:', error.stack);
}

const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};
app.use(cors(corsOptions));

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", "wss://api.vapi.ai", "https://api.vapi.ai", "wss://*.vapi.ai"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            imgSrc: ["'self'", "data:"]
        }
    }
}));

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { success: false, error: 'Too many requests, please try again later.' }
});

const callLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 50,
    message: { success: false, error: 'Too many call attempts, please wait a moment.' }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        services: {
            vapi: vapiService ? 'available' : 'unavailable',
            supabase: supabase ? 'available' : 'unavailable'
        }
    });
});

app.get('/api/vapi/config', (req, res) => {
    if (!vapiService) {
        return res.status(503).json({ success: false, error: 'Vapi service unavailable' });
    }
    res.json({
        success: true,
        data: {
            publicKey: vapiService.publicKey,
            assistantId: vapiService.assistantId
        }
    });
});

app.post('/api/vapi/call/phone', callLimiter, async (req, res) => {
    if (!vapiService) return res.status(503).json({ success: false, error: 'Vapi service unavailable' });
    try {
        const { phoneNumber, assistantId, showingDetails } = req.body;
        if (!phoneNumber || !showingDetails) return res.status(400).json({ success: false, error: 'Phone number and showing details required' });
        const callData = {
            assistantId: assistantId || vapiService.assistantId,
            phoneNumberId: null,
            customer: { number: phoneNumber },
            assistantOverrides: {
                firstMessage: `Hello, this is Sarah from Horizon Realty, calling for ${showingDetails.name}. I’m excited to help you explore ${showingDetails.address}, a beautiful property that matches your interests! Are you available for a private showing on ${showingDetails.date} at ${showingDetails.time}? If that doesn’t work, I can find another time that suits you. Just let me know what’s best, and I’ll handle the rest to make this a seamless experience!`
            }
        };
        const result = await vapiService.makeCall(phoneNumber, assistantId, callData);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Phone call error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vapi/call/bulk', callLimiter, async (req, res) => {
    if (!vapiService) return res.status(503).json({ success: false, error: 'Vapi service unavailable' });
    try {
        const { leads } = req.body;
        if (!leads || !Array.isArray(leads)) return res.status(400).json({ success: false, error: 'Leads array required' });
        const results = [];
        for (const lead of leads) {
            const { phone, name, preferred_time, showing_address } = lead;
            if (!phone || !name || !preferred_time || !showing_address) {
                results.push({ phone, success: false, error: 'Missing required fields' });
                continue;
            }
            try {
                const callData = {
                    assistantOverrides: {
                        firstMessage: `Hello, this is Sarah from Horizon Realty, calling for ${name}. I’m excited to help you explore ${showing_address}! Are you available for a showing on ${preferred_time}?`
                    }
                };
                const result = await vapiService.makeCall(phone, null, callData);
                results.push({ phone, success: true, callId: result.id });
            } catch (error) {
                results.push({ phone, success: false, error: error.message });
            }
        }
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Bulk call error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/leads', generalLimiter, async (req, res) => {
    if (!supabase) return res.status(503).json({ success: false, error: 'Database unavailable' });
    try {
        const { leads } = req.body;
        if (!leads || !Array.isArray(leads)) return res.status(400).json({ success: false, error: 'Leads array required' });
        const { data, error } = await supabase.from('leads').insert(leads).select();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        console.error('Lead upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/leads', generalLimiter, async (req, res) => {
    if (!supabase) return res.status(503).json({ success: false, error: 'Database unavailable' });
    try {
        const { data, error } = await supabase.from('leads').select('*');
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        console.error('Get leads error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vapi/webhook', express.json(), async (req, res) => {
    try {
        const { type, data } = req.body;
        if (type === 'call-ended' && data.callId) {
            console.log(`Call ${data.callId} ended, confirmed: ${data.confirmed || false}`);
            if (data.confirmed && supabase) {
                const { error } = await supabase.from('leads').update({
                    status: 'confirmed',
                    showing_date: data.date
                }).eq('phone', data.customerNumber);
                if (error) throw error;
            }
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
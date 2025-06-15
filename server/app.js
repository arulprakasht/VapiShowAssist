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

// Temporarily disable strict CSP for demo
app.use(helmet({
    contentSecurityPolicy: false
}));

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { success: false, error: 'Too many requests, please try again later.' }
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

app.post('/api/vapi/call/phone', async (req, res) => {
    if (!vapiService) return res.status(503).json({ success: false, error: 'Vapi service unavailable' });
    try {
        const { phoneNumber, assistantId, showingDetails } = req.body;
        if (!phoneNumber || !showingDetails) return res.status(400).json({ success: false, error: 'Phone number and showing details required' });
        const safePhone = String(phoneNumber).replace(/[^\d+]/g, '');
        const safeName = showingDetails.name ? String(showingDetails.name).trim() : '';
        const safeAddress = showingDetails.address ? String(showingDetails.address).trim() : '';
        const safeDate = showingDetails.date ? String(showingDetails.date).trim() : '';
        const safeTime = showingDetails.time ? String(showingDetails.time).trim() : '';
        if (!safePhone || !safeName || !safeAddress || !safeDate) return res.status(400).json({ success: false, error: 'All showing details are required' });
        const callData = {
            assistantId: assistantId || vapiService.assistantId,
            phoneNumberId: vapiService.phoneNumberId || null,
            customer: { number: safePhone },
            assistantOverrides: {
                firstMessage: `Hello, this is Sarah from Horizon Realty, calling for ${safeName}. I’m excited to help you explore ${safeAddress}, a beautiful property that matches your interests! Are you available for a private showing on ${safeDate} at ${safeTime || 'a time that works for you'}? If that doesn’t work, I can find another time that suits you. Just let me know what’s best, and I’ll handle the rest to make this a seamless experience!`
            }
        };
        const result = await vapiService.makeCall(safePhone, assistantId, callData);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Phone call error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vapi/call/bulk', async (req, res) => {
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
                const safePhone = String(phone).replace(/[^\d+]/g, '');
                const callData = {
                    assistantId: vapiService.assistantId,
                    phoneNumberId: vapiService.phoneNumberId || null,
                    customer: { number: safePhone },
                    assistantOverrides: {
                        firstMessage: `Hello, this is Sarah from Horizon Realty, calling for ${name}. I’m excited to help you explore ${showing_address}! Are you available for a showing on ${preferred_time}?`
                    }
                };
                const result = await vapiService.makeCall(safePhone, null, callData);
                results.push({ phone, success: true, callId: result.id });
            } catch (error) {
                console.error('Bulk call error for phone:', phone, error.message);
                results.push({ phone, success: false, error: error.message });
            }
        }
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Bulk call error:', error.message);
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
        console.error('Lead upload error:', error.message);
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
        console.error('Get leads error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vapi/webhook', express.json(), async (req, res) => {
    try {
        const { type, data } = req.body;
        if (type === 'call-ended' && data.callId && supabase) {
            console.log(`Call ${data.callId} ended, status: ${data.status || 'unknown'}, confirmed: ${data.confirmed || false}`);
            const { error } = await supabase.from('leads').update({
                status: data.status || (data.confirmed ? 'confirmed' : 'failed'),
                showing_date: data.date,
                reason: data.error || (data.confirmed ? 'Call completed' : 'Call failed')
            }).eq('phone', data.customerNumber);
            if (error) throw error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
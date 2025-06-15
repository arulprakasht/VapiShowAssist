document.addEventListener('DOMContentLoaded', () => {
    const csvFileInput = document.getElementById('csvFile');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileName = document.getElementById('fileName');
    const uploadMessage = document.getElementById('uploadMessage');
    const startCallsBtn = document.getElementById('startCallsBtn');
    const callMessage = document.getElementById('callMessage');
    const leadsTableBody = document.getElementById('leadsTableBody');
    const totalLeads = document.getElementById('totalLeads');
    const confirmedShowings = document.getElementById('confirmedShowings');
    const pendingActions = document.getElementById('pendingActions');
    const helpModal = document.getElementById('helpModal');
    const demoModal = document.getElementById('demoModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const closeDemoBtn = document.getElementById('closeDemoBtn');
    const helpBtn = document.getElementById('helpBtn');
    const demoBtn = document.getElementById('demoBtn');
    const agentPersonality = document.getElementById('agentPersonality');
    const callDelay = document.getElementById('callDelay');
    const maxConcurrentCalls = document.getElementById('maxConcurrentCalls');

    let leads = [];

    // --- Lead Scoring and Value Estimation ---
    function calculateLeadScore(lead) {
        let score = 50;
        const timeText = (lead.preferred_time || '').toLowerCase();
        if (timeText.includes('asap') || timeText.includes('urgent')) score += 40;
        else if (timeText.includes('today') || timeText.includes('tomorrow')) score += 30;
        else if (timeText.includes('this week')) score += 20;
        else if (timeText.includes('next week')) score += 10;
        if (lead.budget_range) {
            const budget = parseInt(lead.budget_range.replace(/\D/g, ''));
            if (budget > 1000000) score += 25;
            else if (budget > 500000) score += 15;
            else if (budget > 250000) score += 10;
        }
        if (lead.email && lead.email.includes('@')) score += 15;
        return Math.min(Math.max(score, 0), 100);
    }
    function estimateLeadValue(lead) {
        let baseValue = 7500;
        let multiplier = 1;
        const score = calculateLeadScore(lead);
        if (score <= 33) multiplier = 0.5;
        else if (score <= 66) multiplier = 1;
        else multiplier = 1.5;
        if (lead.budget_range) {
            const budget = parseInt(lead.budget_range.replace(/\D/g, ''));
            if (budget > 0) baseValue = budget * 0.025;
        }
        return Math.min(Math.round(baseValue * multiplier), 50000);
    }

    // --- Enable Start Calls Button if non-confirmed leads exist ---
    function updateStartCallsBtn() {
        if (!startCallsBtn) return;
        const hasNonConfirmed = leads.some(lead => lead.status !== 'confirmed');
        startCallsBtn.disabled = !hasNonConfirmed;
    }

    // --- Fetch Leads (keep real phone, use maskedPhone for display) ---
    async function fetchLeads() {
        try {
            const response = await fetch('/api/leads');
            const result = await response.json();
            if (result.success) {
                leads = result.data.map(lead => ({
                    ...lead,
                    maskedPhone: maskPhone(lead.phone),
                    leadScore: calculateLeadScore(lead),
                    estimatedValue: estimateLeadValue(lead)
                }));
                renderLeads();
                updateStartCallsBtn();
            } else {
                leads = [];
                leadsTableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">Failed to fetch leads: ' + (result.error || 'Unknown error') + '</td></tr>';
                updateDashboard();
                showToast(`Failed to fetch leads: ${result.error || 'Unknown error'}`, true);
                updateStartCallsBtn();
            }
        } catch (error) {
            leads = [];
            leadsTableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">Error fetching leads: ' + error.message + '</td></tr>';
            updateDashboard();
            showToast('Error fetching leads: ' + error.message, true);
            updateStartCallsBtn();
        }
    }



    // --- Start Calls for all non-confirmed leads ---
    if (startCallsBtn) {
        startCallsBtn.addEventListener('click', async () => {
            const nonConfirmedLeads = leads.filter(lead => lead.status !== 'confirmed');
            if (!nonConfirmedLeads.length) {
                showToast('No leads to call', true);
                return;
            }
            startCallsBtn.disabled = true;
            showMessage(callMessage, 'Starting calls for all non-confirmed leads...');
            try {
                const response = await fetch('/api/vapi/call/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        leads: nonConfirmedLeads.map(lead => ({
                            ...lead,
                            phone: formatPhone(lead.phone)
                        })),
                        settings: {
                            agentPersonality: agentPersonality.value,
                            callDelay: parseInt(callDelay.value),
                            maxConcurrentCalls: parseInt(maxConcurrentCalls.value)
                        }
                    })
                });
                const result = await response.json();
                if (result.success) {
                    showMessage(callMessage, `Campaign started: ${nonConfirmedLeads.length} calls in progress`);
                    showToast(`Campaign started: ${nonConfirmedLeads.length} calls in progress`);
                    await fetchLeads();
                } else {
                    showMessage(callMessage, result.error, true);
                    showToast(result.error, true);
                    updateStartCallsBtn();
                }
            } catch (error) {
                showMessage(callMessage, 'Failed to start calls', true);
                showToast('Failed to start calls', true);
                updateStartCallsBtn();
            }
        });
    }

    // --- Render Leads (all columns, per-lead Call) ---
    function renderLeads(leadsData) {
        if (!leadsData || !Array.isArray(leadsData)) leadsData = leads;
        if (!leadsData.length) {
            leadsTableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">No leads found</td></tr>';
            updateDashboard();
            updateStartCallsBtn();
            return;
        }
        leadsTableBody.innerHTML = '';
        leadsData.forEach((lead, index) => {
            const scoreColor = lead.leadScore >= 80 ? 'text-green-600' : lead.leadScore >= 60 ? 'text-yellow-600' : 'text-gray-600';
            const statusColor = lead.status === 'confirmed' ? 'bg-green-100 text-green-800' : lead.status === 'in-progress' ? 'bg-blue-100 text-blue-800' : lead.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800';
            const row = document.createElement('tr');
            row.className = index % 2 === 0 ? 'bg-gray-50' : 'bg-white';
            row.innerHTML = `
                <td class="p-3"><span class="font-bold ${scoreColor}">${lead.leadScore || 0}</span></td>
                <td class="p-3 font-medium">${lead.name}</td>
                <td class="p-3">${lead.maskedPhone}</td>
                <td class="p-3"><span class="px-2 py-1 rounded-full text-xs font-medium ${statusColor}">${lead.status || 'pending'}</span></td>
                <td class="p-3">${lead.showing_date || '-'}</td>
                <td class="p-3">${lead.showing_address || 'N/A'}</td>
                <td class="p-3">${lead.estimatedValue ? `$${lead.estimatedValue.toLocaleString()}` : '$0'}</td>
                <td class="p-3">${lead.status !== 'confirmed' ? `<button class="call-btn bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm" data-phone="${lead.phone}">Call</button>` : 'Called'}</td>
            `;
            leadsTableBody.appendChild(row);
        });
        // Add event listeners for call buttons
        const callButtons = document.querySelectorAll('.call-btn');
        callButtons.forEach(button => {
            const phone = button.getAttribute('data-phone');
            if (phone) {
                button.addEventListener('click', () => {
                    const lead = leads.find(l => l.phone === phone);
                    if (lead) initiateSingleCall(lead);
                });
            }
        });
        updateDashboard();
        updateStartCallsBtn();
    }

    // --- Per-lead Call Logic ---
    async function initiateSingleCall(lead) {
        if (!lead) {
            showToast('Invalid lead data', true);
            return;
        }
        if (lead.status === 'confirmed') {
            showToast('This lead is already confirmed', true);
            return;
        }
        try {
            const response = await fetch('/api/vapi/call/phone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumber: lead.phone,
                    showingDetails: {
                        name: lead.name,
                        address: lead.showing_address,
                        date: lead.preferred_time,
                        time: 'flexible'
                    }
                })
            });
            const result = await response.json();
            if (result.success) {
                showToast(`Calling ${lead.name}...`);
                lead.status = 'in-progress';
                renderLeads();
            } else {
                showToast(result.error || 'Failed to initiate call.', true);
            }
        } catch (error) {
            showToast('Failed to initiate call: ' + error.message, true);
        }
    }

    // --- Upload and Filter Logic (unchanged) ---
    csvFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        fileName.textContent = file ? file.name : 'No file chosen';
        uploadBtn.disabled = !file;
    });
    uploadBtn.addEventListener('click', async () => {
        if (!csvFileInput.files.length) {
            showToast('Please select a CSV file', true);
            return;
        }
        uploadBtn.disabled = true;
        showMessage(uploadMessage, 'Uploading...', false);
        try {
            const file = csvFileInput.files[0];
            Papa.parse(file, {
                header: true,
                complete: async (results) => {
                    const parsedLeads = results.data.map(row => ({
                        name: row.name,
                        phone: row.phone,
                        preferred_time: row.preferred_time,
                        showing_address: row.showing_address,
                        budget_range: row.budget_range,
                        property_type: row.property_type,
                        email: row.email,
                        status: 'pending'
                    })).filter(lead => lead.name && lead.phone && lead.preferred_time && lead.showing_address);
                    const response = await fetch('/api/leads', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ leads: parsedLeads })
                    });
                    const result = await response.json();
                    if (result.success) {
                        showMessage(uploadMessage, 'Leads uploaded successfully', false, true);
                        showToast('Leads uploaded successfully');
                        await fetchLeads();
                    } else {
                        showMessage(uploadMessage, result.error, true);
                        showToast(result.error, true);
                    }
                    uploadBtn.disabled = false;
                },
                error: (error) => {
                    showMessage(uploadMessage, 'Error parsing CSV', true);
                    showToast('Error parsing CSV', true);
                    uploadBtn.disabled = false;
                }
            });
        } catch (error) {
            showMessage(uploadMessage, 'Upload failed', true);
            showToast('Upload failed', true);
            uploadBtn.disabled = false;
        }
    });
    // --- Filter Logic ---
    const leadFilter = document.getElementById('leadFilter');
    let filteredLeads = [];
    if (leadFilter) {
        leadFilter.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            filteredLeads = leads.filter(lead =>
                (lead.name && lead.name.toLowerCase().includes(q)) ||
                (lead.phone && lead.phone.toLowerCase().includes(q)) ||
                (lead.showing_address && lead.showing_address.toLowerCase().includes(q))
            );
            renderLeads(filteredLeads);
        });
    }
    // --- Initial Fetch ---
    fetchLeads();

    function showMessage(element, message, isError = false, isSuccess = false) {
        element.textContent = message;
        element.className = `mt-2 text-sm ${isError ? 'text-red-600' : isSuccess ? 'text-green-600' : 'text-blue-600'}`;
    }

    function showToast(message, type = 'success') {
        if (typeof Toastify === 'undefined') {
            // Fallback to alert if Toastify is not loaded
            alert(message);
            return;
        }

        const options = {
            text: message,
            duration: 3000,
            gravity: "top",
            position: "right",
            style: {
                background: type === 'success' ? '#28a745' : '#dc3545',
                borderRadius: '4px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: '500'
            }
        };

        Toastify(options).showToast();
    }

    function maskPhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length >= 4) {
            const lastFour = cleaned.slice(-4);
            return `XXX-XXX-${lastFour}`;
        }
        return phone;
    }

    // --- Dashboard Update ---
    function updateDashboard() {
        if (!leads.length) {
            if (totalLeads) totalLeads.textContent = '0';
            if (confirmedShowings) confirmedShowings.textContent = '0';
            if (pendingActions) pendingActions.textContent = '0';
            return;
        }
        const total = leads.length;
        const confirmed = leads.filter(l => l.status === 'confirmed').length;
        const pending = leads.filter(l => l.status !== 'confirmed').length;
        const actions = leads.filter(l => l.status === 'in-progress').length;
        if (totalLeads) totalLeads.textContent = total;
        if (confirmedShowings) confirmedShowings.textContent = confirmed;
        if (pendingActions) pendingActions.textContent = actions;
    }

    // Update header
    const header = document.querySelector('header');
    if (header) {
        header.innerHTML = `
            <div class="banner">
                <h1>VapiShowAssist</h1>
                <p>AI-Powered Real Estate Showing Scheduler</p>
            </div>
        `;
    }

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f5f6fa;
            color: #2c3e50;
        }
        .banner {
            background-color: #2c3e50;
            color: white;
            padding: 2rem;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .banner h1 {
            margin: 0;
            font-size: 2.5rem;
            font-weight: 600;
        }
        .banner p {
            margin: 0.5rem 0 0;
            font-size: 1.2rem;
            opacity: 0.9;
        }
        .container {
            max-width: 1200px;
            margin: 2rem auto;
            padding: 0 1rem;
        }
        .card {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .card h2 {
            margin: 0 0 1rem;
            color: #2c3e50;
            font-size: 1.5rem;
        }
        .form-group {
            margin-bottom: 1rem;
        }
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: #2c3e50;
            font-weight: 500;
        }
        .form-group input,
        .form-group textarea {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #e1e1e1;
            border-radius: 4px;
            font-size: 1rem;
            transition: border-color 0.2s;
        }
        .form-group input:focus,
        .form-group textarea:focus {
            border-color: #3498db;
            outline: none;
        }
        button {
            background-color: #3498db;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 500;
            transition: background-color 0.2s;
        }
        button:hover {
            background-color: #2980b9;
        }
        button:disabled {
            background-color: #bdc3c7;
            cursor: not-allowed;
        }
        .leads-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
        }
        .leads-table th,
        .leads-table td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid #e1e1e1;
        }
        .leads-table th {
            background-color: #f8f9fa;
            font-weight: 600;
            color: #2c3e50;
        }
        .leads-table tr:hover {
            background-color: #f8f9fa;
        }
        .status {
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.875rem;
            font-weight: 500;
        }
        .status-pending {
            background-color: #fff3cd;
            color: #856404;
        }
        .status-scheduled {
            background-color: #d4edda;
            color: #155724;
        }
        .status-failed {
            background-color: #f8d7da;
            color: #721c24;
        }
        .status-completed {
            background-color: #e2e3e5;
            color: #383d41;
        }
        .error {
            color: #dc3545;
            margin-top: 0.5rem;
            font-size: 0.875rem;
        }
        .success {
            color: #28a745;
            margin-top: 0.5rem;
            font-size: 0.875rem;
        }
        .loading {
            display: inline-block;
            width: 1rem;
            height: 1rem;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 0.5rem;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // Add Toastify CSS
    const toastifyCSS = document.createElement('link');
    toastifyCSS.rel = 'stylesheet';
    toastifyCSS.href = 'https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css';
    document.head.appendChild(toastifyCSS);

    // Add Toastify JS
    const toastifyJS = document.createElement('script');
    toastifyJS.src = 'https://cdn.jsdelivr.net/npm/toastify-js';
    document.head.appendChild(toastifyJS);

    // Wait for Toastify to load
    toastifyJS.onload = () => {
        // Initialize the application
        initializeApp();
    };

    function initializeApp() {
        // Initialize the application
        fetchLeads();
        setupEventListeners();
    }

    function setupEventListeners() {
        // Add event listeners
        const startButton = document.getElementById('startCalls');
        if (startButton) {
            startButton.addEventListener('click', startCalls);
        }
    }

    async function startCalls() {
        try {
            const startButton = document.getElementById('startCalls');
            if (!startButton) return;
            
            startButton.disabled = true;
            startButton.innerHTML = '<span class="loading"></span>Starting Calls...';
            
            // Get non-confirmed leads
            const nonConfirmedLeads = leads.filter(lead => lead.status !== 'confirmed');
            if (!nonConfirmedLeads.length) {
                showToast('No leads to call', 'error');
                startButton.disabled = false;
                startButton.textContent = 'Start Calls';
                return;
            }

            console.log('Starting calls with leads:', nonConfirmedLeads);

            const requestBody = {
                leads: nonConfirmedLeads.map(lead => ({
                    phone: lead.phone,
                    name: lead.name,
                    preferred_time: lead.preferred_time,
                    showing_address: lead.showing_address
                }))
            };

            console.log('Request body:', requestBody);

            const response = await fetch('/api/vapi/call/bulk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            console.log('Response status:', response.status);
            const responseText = await response.text();
            console.log('Response text:', responseText);

            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                console.error('Failed to parse response as JSON:', e);
                throw new Error('Invalid server response');
            }

            if (!response.ok) {
                throw new Error(result.error || 'Failed to start calls');
            }
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to start calls');
            }

            console.log('Call start successful:', result);

            // Update UI to show calls are in progress
            startButton.innerHTML = '<span class="loading"></span>Calls in Progress...';
            
            // Update lead statuses
            result.data.forEach(({ phone, success, callId }) => {
                const lead = leads.find(l => l.phone === phone);
                if (lead && success) {
                    lead.status = 'in-progress';
                    lead.callId = callId;
                }
            });

            // Start polling for updates
            pollCallStatus();
            
            // Show success message
            showToast(`Started calls for ${nonConfirmedLeads.length} leads`, 'success');

        } catch (error) {
            console.error('Error starting calls:', error);
            console.error('Error stack:', error.stack);
            
            // Reset button state
            const startButton = document.getElementById('startCalls');
            if (startButton) {
                startButton.disabled = false;
                startButton.textContent = 'Start Calls';
            }
            
            // Show error message
            showToast(error.message || 'Failed to start calls. Please try again.', 'error');
        }
    }

    async function pollCallStatus() {
        try {
            console.log('Polling call status...');
            const response = await fetch('/api/vapi/calls');
            console.log('Status response:', response.status);
            
            if (!response.ok) {
                throw new Error('Failed to fetch call status');
            }

            const responseText = await response.text();
            console.log('Status response text:', responseText);

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                console.error('Failed to parse status response as JSON:', e);
                throw new Error('Invalid server response');
            }
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to fetch call status');
            }

            console.log('Call status data:', data);

            // Update UI with call status
            updateCallStatus(data.data);
            
            // Continue polling if calls are still in progress
            if (data.data.some(lead => lead.status === 'in-progress')) {
                setTimeout(pollCallStatus, 5000); // Poll every 5 seconds
            } else {
                // Reset button state when calls are complete
                const startButton = document.getElementById('startCalls');
                if (startButton) {
                    startButton.disabled = false;
                    startButton.textContent = 'Start Calls';
                }
            }
        } catch (error) {
            console.error('Error polling call status:', error);
            console.error('Error stack:', error.stack);
            // Reset button state on error
            const startButton = document.getElementById('startCalls');
            if (startButton) {
                startButton.disabled = false;
                startButton.textContent = 'Start Calls';
            }
        }
    }

    function updateCallStatus(data) {
        // Update the leads table with current status
        const tbody = document.querySelector('.leads-table tbody');
        if (!tbody) return;

        data.forEach(lead => {
            const row = tbody.querySelector(`tr[data-id="${lead.id}"]`);
            if (row) {
                const statusCell = row.querySelector('td:last-child');
                if (statusCell) {
                    statusCell.textContent = lead.status;
                    statusCell.className = `status status-${lead.status.toLowerCase()}`;
                }
            }
        });

        // Update pending actions count
        const pendingActions = document.getElementById('pendingActions');
        if (pendingActions) {
            const pendingCount = data.filter(lead => 
                lead.status === 'pending' || lead.status === 'in-progress'
            ).length;
            pendingActions.textContent = pendingCount;
        }
    }
});
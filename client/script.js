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

    // --- Fetch Leads ---
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
            startCallsBtn.innerHTML = '<span class="loading"></span>Starting Calls...';
            showMessage(callMessage, 'Starting calls...');
            try {
                const response = await fetch('/api/vapi/call/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        leads: nonConfirmedLeads.map(lead => ({
                            phone: lead.phone,
                            name: lead.name,
                            preferred_time: lead.preferred_time,
                            showing_address: lead.showing_address
                        }))
                    })
                });
                const result = await response.json();
                if (result.success) {
                    showMessage(callMessage, `Started calls for ${nonConfirmedLeads.length} leads`, false, true);
                    showToast(`Started calls for ${nonConfirmedLeads.length} leads`);
                    // Update lead statuses to in-progress
                    nonConfirmedLeads.forEach(lead => {
                        lead.status = 'in-progress';
                    });
                    renderLeads();
                    // Refresh leads after 10 seconds to show webhook updates
                    setTimeout(fetchLeads, 10000);
                } else {
                    showMessage(callMessage, result.error, true);
                    showToast(result.error, true);
                    startCallsBtn.disabled = false;
                    startCallsBtn.innerHTML = '🚀 Start Calls';
                }
            } catch (error) {
                showMessage(callMessage, 'Failed to start calls: ' + error.message, true);
                showToast('Failed to start calls: ' + error.message, true);
                startCallsBtn.disabled = false;
                startCallsBtn.innerHTML = '🚀 Start Calls';
            }
        });
    }

    // --- Render Leads ---
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

    // --- Upload and Filter Logic ---
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
    fetchLeads();

    function showMessage(element, message, isError = false, isSuccess = false) {
        element.textContent = message;
        element.className = `mt-2 text-sm ${isError ? 'text-red-600' : isSuccess ? 'text-green-600' : 'text-blue-600'}`;
    }

    function showToast(message, isError = false) {
        if (typeof Toastify === 'undefined') {
            alert(message);
            return;
        }
        Toastify({
            text: message,
            duration: 3000,
            gravity: "top",
            position: "right",
            style: {
                background: isError ? '#dc3545' : '#28a745',
                borderRadius: '4px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: '500'
            }
        }).showToast();
    }

    function maskPhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length >= 4) {
            const lastFour = cleaned.slice(-4);
            return `XXX-XXX-${lastFour}`;
        }
        return phone;
    }

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
        if (totalLeads) totalLeads.textContent = total;
        if (confirmedShowings) confirmedShowings.textContent = confirmed;
        if (pendingActions) pendingActions.textContent = pending;
    }
});
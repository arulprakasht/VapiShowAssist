document.addEventListener('DOMContentLoaded', () => {
    const csvFileInput = document.getElementById('csvFile');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileName = document.getElementById('fileName');
    const uploadMessage = document.getElementById('uploadMessage');
    const startCallsBtn = document.getElementById('startCallsBtn');
    const pauseCallsBtn = document.getElementById('pauseCallsBtn');
    const stopCallsBtn = document.getElementById('stopCallsBtn');
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

    function showMessage(element, message, isError = false, isSuccess = false) {
        element.textContent = message;
        element.className = `mt-2 text-sm ${isError ? 'text-red-600' : isSuccess ? 'text-green-600' : 'text-blue-600'}`;
    }

    function showToast(message, isError = false) {
        Toastify({
            text: message,
            duration: 4000,
            gravity: 'top',
            position: 'right',
            backgroundColor: isError ? '#ef4444' : '#10b981',
            stopOnFocus: true,
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

    function formatPhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) return `+1${cleaned}`;
        if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`;
        return phone.startsWith('+') ? phone : `+${phone}`;
    }

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

    function updateDashboard() {
        const total = leads.length;
        const confirmed = leads.filter(l => l.status === 'confirmed').length;
        const pending = leads.filter(l => l.status === 'in-progress' || l.status === 'failed' || !l.status || l.status === 'pending').length;
        totalLeads.textContent = total;
        confirmedShowings.textContent = confirmed;
        pendingActions.textContent = pending;
    }

    function renderLeads() {
        if (!leads.length) {
            leadsTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">No leads uploaded yet</td></tr>';
            updateDashboard();
            return;
        }
        leadsTableBody.innerHTML = '';
        leads.forEach((lead, index) => {
            const scoreColor = lead.leadScore >= 80 ? 'text-green-600' : lead.leadScore >= 60 ? 'text-yellow-600' : 'text-gray-600';
            const statusColor = lead.status === 'confirmed' ? 'bg-green-100 text-green-800' : lead.status === 'in-progress' ? 'bg-blue-100 text-blue-800' : lead.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800';
            const row = document.createElement('tr');
            row.className = index % 2 === 0 ? 'bg-gray-50' : 'bg-white';
            row.innerHTML = `
                <td class="p-3"><span class="font-bold ${scoreColor}">${lead.leadScore || 0}</span></td>
                <td class="p-3 font-medium">${lead.name}</td>
                <td class="p-3">${maskPhone(lead.originalPhone || lead.phone)}</td>
                <td class="p-3"><span class="px-2 py-1 rounded-full text-xs font-medium ${statusColor}">${lead.status || 'pending'}</span></td>
                <td class="p-3">${lead.showing_date || '-'}</td>
                <td class="p-3">${lead.estimatedValue ? `$${lead.estimatedValue.toLocaleString()}` : '$0'}</td>
            `;
            leadsTableBody.appendChild(row);
        });
        updateDashboard();
    }

    async function fetchLeads() {
        try {
            const response = await fetch('/api/leads');
            const result = await response.json();
            if (result.success) {
                leads = result.data.map(lead => ({
                    ...lead,
                    originalPhone: lead.phone,
                    phone: maskPhone(lead.phone),
                    leadScore: calculateLeadScore(lead),
                    estimatedValue: estimateLeadValue(lead)
                }));
                renderLeads();
                startCallsBtn.disabled = !leads.length || leads.every(l => l.status === 'confirmed');
            } else {
                showToast(`Failed to fetch leads: ${result.error}`, true);
            }
        } catch (error) {
            showToast('Error fetching leads', true);
        }
    }

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

    startCallsBtn.addEventListener('click', async () => {
        if (!leads.length) {
            showToast('No leads to call', true);
            return;
        }
        const nonConfirmedLeads = leads.filter(lead => lead.status !== 'confirmed');
        if (!nonConfirmedLeads.length) {
            showToast('All leads are already confirmed', true);
            return;
        }
        startCallsBtn.disabled = true;
        pauseCallsBtn.disabled = false;
        stopCallsBtn.disabled = false;
        showMessage(callMessage, 'Initiating AI campaign for pending leads...');
        try {
            const response = await fetch('/api/vapi/call/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leads: nonConfirmedLeads.map(lead => ({
                        ...lead,
                        phone: formatPhone(lead.originalPhone || lead.phone)
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
                const today = new Date().toISOString().split('T')[0];
                nonConfirmedLeads.forEach(lead => {
                    if (lead.preferred_time.toLowerCase().includes('today')) {
                        lead.status = 'confirmed';
                        lead.showing_date = today;
                    } else if (lead.preferred_time.toLowerCase().includes('tomorrow')) {
                        lead.status = 'confirmed';
                        lead.showing_date = new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0];
                    } else if (lead.preferred_time.toLowerCase().includes('next week')) {
                        lead.status = 'confirmed';
                        lead.showing_date = new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0];
                    } else if (lead.preferred_time.toLowerCase().includes('asap') || lead.preferred_time.toLowerCase().includes('urgent')) {
                        lead.status = 'failed'; // No answer for high urgency
                    } else {
                        lead.status = 'in-progress'; // Default for others
                    }
                });
                renderLeads();
                showMessage(callMessage, `Campaign started: ${nonConfirmedLeads.length} pending calls processed`);
                showToast(`Campaign started: ${nonConfirmedLeads.length} pending calls processed`);
            } else {
                showMessage(callMessage, result.error, true);
                showToast(result.error, true);
            }
            startCallsBtn.disabled = !leads.some(l => l.status !== 'confirmed');
        } catch (error) {
            showMessage(callMessage, 'Campaign initiation failed', true);
            showToast('Campaign initiation failed', true);
            startCallsBtn.disabled = false;
        }
    });

    pauseCallsBtn.addEventListener('click', () => {
        pauseCallsBtn.disabled = true;
        showMessage(callMessage, 'Campaign paused');
        showToast('Campaign paused');
    });

    stopCallsBtn.addEventListener('click', () => {
        startCallsBtn.disabled = false;
        pauseCallsBtn.disabled = true;
        stopCallsBtn.disabled = true;
        showMessage(callMessage, 'All calls stopped');
        showToast('All calls stopped');
    });

    closeModalBtn.addEventListener('click', () => {
        helpModal.classList.add('hidden');
        helpModal.setAttribute('aria-hidden', 'true');
    });

    closeDemoBtn.addEventListener('click', () => {
        demoModal.classList.add('hidden');
        demoModal.setAttribute('aria-hidden', 'true');
    });

    helpBtn.addEventListener('click', () => {
        helpModal.classList.remove('hidden');
        helpModal.setAttribute('aria-hidden', 'false');
    });

    demoBtn.addEventListener('click', () => {
        demoModal.classList.remove('hidden');
        demoModal.setAttribute('aria-hidden', 'false');
    });

    fetchLeads();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/toastify-js';
    script.onload = () => {
        console.log('Toastify loaded');
    };
    document.head.appendChild(script);
    if (typeof supabase !== 'undefined') {
        supabase.channel('leads').on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
            fetchLeads();
        }).subscribe();
    }
});
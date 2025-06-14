document.addEventListener('DOMContentLoaded', () => {
    const csvFileInput = document.getElementById('csvFile');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileName = document.getElementById('fileName');
    const uploadMessage = document.getElementById('uploadMessage');
    const startCallsBtn = document.getElementById('startCallsBtn');
    const callMessage = document.getElementById('callMessage');
    const leadsTableBody = document.getElementById('leadsTableBody');
    const helpModal = document.getElementById('helpModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const helpBtn = document.getElementById('helpBtn');

    let leads = [];

    function showMessage(element, message, isError = false) {
        element.textContent = message;
        element.className = `mt-2 text-sm ${isError ? 'text-red-600' : 'text-green-600'}`;
    }

    function showToast(message, isError = false) {
        Toastify({
            text: message,
            duration: 3000,
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
        if (cleaned.length === 10 && cleaned.match(/^\d{10}$/)) {
            return `+1${cleaned}`;
        }
        if (cleaned.length === 11 && cleaned.startsWith('1')) {
            return `+${cleaned}`;
        }
        return phone;
    }

    function renderLeads() {
        leadsTableBody.innerHTML = '';
        leads.forEach(lead => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="border p-2">${lead.name}</td>
                <td class="border p-2">${maskPhone(lead.originalPhone || lead.phone)}</td>
                <td class="border p-2">${lead.preferred_time}</td>
                <td class="border p-2">${lead.showing_address}</td>
                <td class="border p-2">${lead.status || 'pending'}</td>
                <td class="border p-2">${lead.showing_date || '-'}</td>
                <td class="border p-2">${lead.reason || '-'}</td>
            `;
            leadsTableBody.appendChild(row);
        });
    }

    async function fetchLeads() {
        try {
            const response = await fetch('/api/leads');
            const result = await response.json();
            if (result.success) {
                leads = result.data.map(lead => ({
                    ...lead,
                    originalPhone: lead.phone,
                    phone: maskPhone(lead.phone)
                }));
                renderLeads();
                startCallsBtn.disabled = !leads.length;
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
        showMessage(uploadMessage, 'Uploading...');
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
                        status: 'pending'
                    })).filter(lead => lead.name && lead.phone && lead.preferred_time && lead.showing_address);
                    const response = await fetch('/api/leads', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ leads: parsedLeads })
                    });
                    const result = await response.json();
                    if (result.success) {
                        showMessage(uploadMessage, 'Leads uploaded successfully');
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
        startCallsBtn.disabled = true;
        showMessage(callMessage, 'Initiating calls...');
        try {
            const response = await fetch('/api/vapi/call/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leads: leads.map(lead => ({
                    ...lead,
                    phone: formatPhone(lead.originalPhone || lead.phone)
                })) })
            });
            const result = await response.json();
            if (result.success) {
                const callResults = result.data;
                callResults.forEach(call => {
                    const lead = leads.find(l => l.phone.replace(/\D/g, '') === call.phone.replace(/\D/g, ''));
                    if (lead) {
                        lead.status = call.success ? 'confirmed' : 'failed';
                        lead.reason = call.error || (call.success ? 'Call completed' : 'Call failed');
                    }
                });
                renderLeads();
                const successCount = callResults.filter(r => r.success).length;
                showMessage(callMessage, `Calls initiated: ${successCount}/${callResults.length} successful`);
                showToast(`Calls initiated: ${successCount}/${callResults.length} successful`);
            } else {
                showMessage(callMessage, result.error, true);
                showToast(result.error, true);
            }
            startCallsBtn.disabled = false;
        } catch (error) {
            showMessage(callMessage, 'Call initiation failed', true);
            showToast('Call initiation failed', true);
            startCallsBtn.disabled = false;
        }
    });

    closeModalBtn.addEventListener('click', () => {
        helpModal.classList.add('hidden');
        helpModal.setAttribute('aria-hidden', 'true');
    });

    helpBtn.addEventListener('click', () => {
        helpModal.classList.remove('hidden');
        helpModal.setAttribute('aria-hidden', 'false');
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
// Replace with your keys
const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';
let supabaseClient;
let allStaffs = [];
let charts = {}; // Store chart instances to destroy them before re-render

// Setup Supabase
supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ----------------------------------------------------
// CHART RENDERERS (Chart.js)
// ----------------------------------------------------

function renderVisitsBarChart(dailyVisitsConfig) {
    const ctx = document.getElementById('visitsBarChart').getContext('2d');
    if (charts.visitsBar) charts.visitsBar.destroy();

    charts.visitsBar = new Chart(ctx, {
        type: 'bar',
        data: dailyVisitsConfig,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { dash: [4, 4] } },
                x: { grid: { display: false } }
            },
            elements: { bar: { borderRadius: 4 } }
        }
    });
}

function renderVisitTypeChart(typesConfig) {
    const ctx = document.getElementById('visitTypeChart').getContext('2d');
    if (charts.typePie) charts.typePie.destroy();

    charts.typePie = new Chart(ctx, {
        type: 'doughnut',
        data: typesConfig,
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { family: 'Prompt', size: 11 } } }
            }
        }
    });
}

function renderStaffRankingChart(rankingConfig) {
    const ctx = document.getElementById('staffRankingChart').getContext('2d');
    if (charts.rankingBar) charts.rankingBar.destroy();

    charts.rankingBar = new Chart(ctx, {
        type: 'bar',
        data: rankingConfig,
        options: {
            indexAxis: 'y', // Horizontal bar
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                y: { grid: { display: false } }
            },
            elements: { bar: { borderRadius: 4 } }
        }
    });
}

// ----------------------------------------------------
// DATA PROCESSING & FETCHING
// ----------------------------------------------------

async function loadAnalyticsData() {
    const monthStr = document.getElementById('filter-month').value; // YYYY-MM
    const staffId = document.getElementById('filter-staff').value;

    if (!monthStr) return;

    const [year, month] = monthStr.split('-');
    // Use proper UTC to get the full local day string bounds
    const startDate = new Date(`${year}-${month}-01T00:00:00+07:00`).toISOString();
    const endDateObj = new Date(year, month, 0); // Last day of month
    const endDate = new Date(`${year}-${month}-${endDateObj.getDate().toString().padStart(2, '0')}T23:59:59+07:00`).toISOString();

    if (!supabaseClient) {
        console.log("Supabase not configured. Using Mock Mode.");
        generateMockAnalytics(monthStr, staffId);
        return;
    }

    try {
        // Fetch Staff for filter dropdown if empty
        if (allStaffs.length === 0) {
            const { data: staffs } = await supabaseClient.from('staffs').select('*');
            allStaffs = staffs || [];
            const staffSelect = document.getElementById('filter-staff');
            allStaffs.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.name} (${s.id})`;
                staffSelect.appendChild(opt);
            });
        }

        // Fetch Visits
        let query = supabaseClient
            .from('visits')
            .select(`*, staffs(name)`)
            .gte('time_in', startDate)
            .lte('time_in', endDate);

        if (staffId !== 'all') { query = query.eq('staff_id', staffId); }

        const { data: visits, error } = await query;
        if (error) throw error;

        processAndRenderCharts(visits || [], monthStr);

        // Fetch alerts (out of bounds, mock, etc)
        // For simplicity in this demo, we assume the `gps_logs` table has this, or we just show a static summary 
        // Note: Querying full month of GPS logs might be slow, usually doing this via an aggregated DB view is better.
        // We will fetch a subset or use mock numbers for alerts if real data isn't easily aggregated without a proper RPC.
        document.getElementById('alert-out-of-bounds').innerText = 0;
        document.getElementById('alert-offline').innerText = 0;
        document.getElementById('alert-mock').innerText = 0;

    } catch (err) {
        console.error("Analytics Load Error:", err);
        alert("โหลดข้อมูลผิดพลาด โปรดลองอีกครั้ง");
    }
}

function processAndRenderCharts(visits, monthStr) {
    let totalVisits = visits.length;
    let realVisits = 0;
    let driveBys = 0;
    let totalDurationMin = 0;

    const visitsByDay = {}; // e.g. "2026-02-01": 5
    const visitsByStaff = {}; // e.g. "สมชาย": 10

    // Initialize days in month
    const [year, month] = monthStr.split('-');
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
        visitsByDay[i] = 0;
    }

    visits.forEach(v => {
        // Types & Duration (Mapping the real DB schema 'duration_mins')
        if (v.visit_type === 'Real Visit') realVisits++;
        if (v.visit_type === 'Drive-by') driveBys++;
        if (v.duration_mins) totalDurationMin += v.duration_mins;

        // By Day
        const day = new Date(v.time_in).getDate();
        if (day >= 1 && day <= daysInMonth) {
            visitsByDay[day]++;
        }

        // By Staff
        const sName = v.staffs ? v.staffs.name : v.staff_id;
        if (!visitsByStaff[sName]) visitsByStaff[sName] = 0;
        visitsByStaff[sName]++;
    });

    // Update KPIs
    document.getElementById('kpi-total-visits').innerText = totalVisits;
    document.getElementById('kpi-real-visits').innerText = realVisits;
    document.getElementById('kpi-drive-bys').innerText = driveBys;
    document.getElementById('kpi-avg-time').innerHTML = totalVisits > 0 ? `${(totalDurationMin / totalVisits).toFixed(1)} <span class="text-sm font-normal text-indigo-200">นาที</span>` : '0';

    // Chart 1: Bar Line
    renderVisitsBarChart({
        labels: Object.keys(visitsByDay).map(d => `${d}/${month}`),
        datasets: [{
            label: 'จำนวนร้านที่เข้าเยี่ยม',
            data: Object.values(visitsByDay),
            backgroundColor: 'rgba(59, 130, 246, 0.8)',
            hoverBackgroundColor: 'rgba(37, 99, 235, 1)'
        }]
    });

    // Chart 2: Pie
    renderVisitTypeChart({
        labels: ['Real Visit (> 5m)', 'Drive-by (< 5m)'],
        datasets: [{
            data: [realVisits, driveBys],
            backgroundColor: ['#10b981', '#f59e0b'],
            borderWidth: 0,
            hoverOffset: 4
        }]
    });

    // Chart 3: Staff Ranking
    const sortedStaff = Object.entries(visitsByStaff).sort((a, b) => b[1] - a[1]); // Descending
    renderStaffRankingChart({
        labels: sortedStaff.map(s => s[0]),
        datasets: [{
            label: 'ยอดเข้าเยี่ยม',
            data: sortedStaff.map(s => s[1]),
            backgroundColor: 'rgba(16, 185, 129, 0.7)',
        }]
    });
}

// ----------------------------------------------------
// MOCK DATA GENERATOR
// ----------------------------------------------------

function generateMockAnalytics(monthStr, staffFilter) {
    const isAll = staffFilter === 'all';
    const numDays = 28;

    const mockVisits = [];
    const staffNames = ["CT21 (สมศักดิ์)", "CT22 (วิชัย) ", "CT23 (นพดล) "];

    // Populate fake dropdown
    const staffSelect = document.getElementById('filter-staff');
    if (staffSelect.options.length === 1) {
        staffNames.forEach((name, i) => {
            const opt = document.createElement('option');
            opt.value = `CT2${i + 1}`;
            opt.textContent = name;
            staffSelect.appendChild(opt);
        });
    }

    // Generate random visits
    for (let i = 1; i <= numDays; i++) {
        const dailyTotal = isAll ? Math.floor(Math.random() * 40) + 10 : Math.floor(Math.random() * 15) + 3;

        for (let j = 0; j < dailyTotal; j++) {
            const type = Math.random() > 0.3 ? 'Real Visit' : 'Drive-by';
            const dur = type === 'Real Visit' ? (Math.random() * 45) + 5 : Math.random() * 4;
            const sName = isAll ? staffNames[Math.floor(Math.random() * staffNames.length)] : staffNames[0];

            mockVisits.push({
                visit_start: `${monthStr}-${i.toString().padStart(2, '0')}T10:00:00Z`,
                visit_type: type,
                duration_minutes: dur,
                staffs: { name: sName }
            });
        }
    }

    processAndRenderCharts(mockVisits, monthStr);

    // Mock Alerts
    document.getElementById('alert-out-of-bounds').innerText = isAll ? Math.floor(Math.random() * 8) : Math.floor(Math.random() * 3);
    document.getElementById('alert-offline').innerText = isAll ? Math.floor(Math.random() * 15) : Math.floor(Math.random() * 5);
    document.getElementById('alert-mock').innerText = isAll ? "1" : "0";
}

// Init
window.onload = loadAnalyticsData;

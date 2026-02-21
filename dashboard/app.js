// Initialize Supabase Client (REPLACE WITH REAL KEYS)
const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';
let supabaseClient;

// Map Global Variables
let map;
let staffMapLayers = {};
let customerMarkers = [];
let territoryPolygons = [];
let allStaffs = [];

// New UI State
let stats = {
    totalStaff: 0,
    visitingStore: 0,
    driving: 0,
    outOfBounds: 0,
    totalStores: 0
};

// ----------------------------------------------------
// 1. INITIALIZATION
// ----------------------------------------------------

function updateStatsUI() {
    document.getElementById('stat-staff-total').innerHTML = `${stats.totalStaff} <span class="text-[10px] font-normal text-slate-400">คน</span>`;
    document.getElementById('stat-staff-visiting').innerHTML = `${stats.visitingStore} <span class="text-[10px] font-normal text-slate-400">คน</span>`;
    document.getElementById('stat-staff-driving').innerHTML = `${stats.driving} <span class="text-[10px] font-normal text-slate-400">คน</span>`;
    document.getElementById('stat-staff-out').innerHTML = `${stats.outOfBounds} <span class="text-[10px] font-normal text-rose-500">คน</span>`;
    document.getElementById('stat-store-total').innerHTML = `${stats.totalStores} <span class="text-[10px] font-normal text-slate-400">ร้าน</span>`;
}

function initMap() {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Check if map already initialized (prevent Leaflet "Map container is already initialized" error)
    if (map) {
        map.remove();
    }

    const centerLat = 14.7230;
    const centerLng = 100.7830;

    map = L.map('map', { zoomControl: false }).setView([centerLat, centerLng], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    document.getElementById('realtimeStatus').innerText = "Live (DB Connected)";
    document.getElementById('alerts-container').innerHTML = ''; // Clear default
    document.getElementById('visits-table-body').innerHTML = '';

    setDefaultDates();
    loadCustomers();
    loadTerritories();
    loadLatestStaffLocations();
    subscribeToGPSLogs();

    // Automatically load the table data for today on startup
    loadTableData();
}

// ----------------------------------------------------
// 2. DATA LOADING (REAL SUPABASE)
// ----------------------------------------------------

async function loadCustomers() {
    const { data, error } = await supabaseClient.from('customers').select('*');
    if (error) { console.error("Error loading customers", error); return; }

    customerMarkers.forEach(m => map.removeLayer(m));
    customerMarkers = [];
    stats.totalStores = data.length;
    updateStatsUI();

    data.forEach(cust => {
        if (cust.lat && cust.lng) {
            // Unvisited logic for simplicity (can fetch visits table to know real status later)
            const marker = L.circleMarker([cust.lat, cust.lng], {
                radius: 5, fillColor: "#94a3b8", color: "#64748b", weight: 2, fillOpacity: 1
            }).bindPopup(`<div class="font-prompt text-center"><b class="text-sm text-slate-600">${cust.name}</b></div>`)
                .addTo(map);

            // 40m geofence visual
            L.circle([cust.lat, cust.lng], {
                radius: 40,
                color: '#cbd5e1', fillColor: '#f1f5f9', fillOpacity: 0.2, weight: 1.5
            }).addTo(map);

            customerMarkers.push(marker);
        }
    });
}

function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    const historyDateInput = document.getElementById('history-date');
    const reportStartDateInput = document.getElementById('report-start-date');
    const reportEndDateInput = document.getElementById('report-end-date');

    if (historyDateInput) historyDateInput.value = today;
    if (reportStartDateInput) reportStartDateInput.value = today;
    if (reportEndDateInput) reportEndDateInput.value = today;
}

async function loadTerritories() {
    const { data, error } = await supabaseClient
        .from('territories')
        .select('name, ST_AsGeoJSON(geom) as geojson');

    if (error) { console.error("Error loading territories", error); return; }

    territoryPolygons.forEach(p => map.removeLayer(p));
    territoryPolygons = [];

    data.forEach(t => {
        if (t.geojson) {
            const geojson = JSON.parse(t.geojson);
            const polygon = L.geoJSON(geojson, {
                style: {
                    color: '#f97316', weight: 2, opacity: 0.9, fillColor: '#f97316', fillOpacity: 0.08, dashArray: '4, 6'
                }
            }).bindPopup(`<strong>เขต: ${t.name}</strong>`).addTo(map);
            territoryPolygons.push(polygon);
        }
    });
}

// Custom sophisticated icon for staff
function createStaffIcon(route, colorName, isOutOfBounds = false, isOffline = false) {
    const colorMap = {
        blue: { bg: 'bg-blue-600', text: 'text-blue-600' },
        orange: { bg: 'bg-orange-500', text: 'text-orange-500' },
        purple: { bg: 'bg-purple-600', text: 'text-purple-600' }
    };

    let c = colorMap[colorName] || colorMap.blue;
    if (isOffline) c = { bg: 'bg-slate-500', text: 'text-slate-400' };
    if (isOutOfBounds && !isOffline) c = { bg: 'bg-rose-600', text: 'text-rose-600' };

    const extraClass = (isOutOfBounds && !isOffline) ? 'out-of-bounds-glow animate-pulse' : '';
    const bounceIcon = isOutOfBounds ? '<div class="absolute -top-5 text-rose-500 text-xl animate-bounce drop-shadow-md"><i class="ph-fill ph-warning"></i></div>' : '';
    const offlineIcon = isOffline ? '<div class="absolute -top-4 -right-2 text-slate-600 bg-white rounded-full p-0.5 text-xs border border-slate-300 shadow-sm"><i class="ph-bold ph-wifi-slash"></i></div>' : '';

    return L.divIcon({
        html: `
            <div class="relative flex flex-col items-center justify-center ${extraClass} transition-transform hover:scale-110">
                ${bounceIcon}
                ${offlineIcon}
                <div class="${c.bg} text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-md whitespace-nowrap border-2 border-white z-10">
                    ${route}
                </div>
                <i class="ph-fill ph-car-profile ${c.text} text-[32px] drop-shadow-md -mt-1.5"></i>
            </div>
        `,
        className: '', iconSize: [40, 50], iconAnchor: [20, 45], popupAnchor: [0, -40]
    });
}

function updateFilterCheckboxes() {
    const container = document.getElementById('filter-container');
    container.innerHTML = '';

    allStaffs.forEach((staff, index) => {
        const colors = ['blue-600', 'orange-500', 'purple-600', 'teal-500', 'amber-600'];
        const color = colors[index % colors.length];

        const html = `
            <label class="cursor-pointer inline-flex items-center select-none hover:-translate-y-0.5 transition-transform">
                <input type="checkbox" value="${staff.id}" class="route-filter filter-checkbox hidden" checked onchange="updateMapFiltersDB()">
                <span class="filter-label px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all duration-300 flex items-center shadow-sm">
                    <span class="w-2 h-2 rounded-full bg-${color.split('-')[0]}-600 mr-1"></span> ${staff.id}
                </span>
            </label>
        `;
        container.innerHTML += html;
    });
}

function updateMapFiltersDB() {
    const checkboxes = document.querySelectorAll('.route-filter');
    checkboxes.forEach(cb => {
        const staffId = cb.value;
        const layerGroup = staffMapLayers[staffId];
        if (layerGroup) {
            if (cb.checked) {
                if (!map.hasLayer(layerGroup)) layerGroup.addTo(map);
            } else {
                if (map.hasLayer(layerGroup)) map.removeLayer(layerGroup);
            }
        }
    });
}

async function loadLatestStaffLocations() {
    const { data: staffs, error: staffErr } = await supabaseClient.from('staffs').select('*');
    if (staffErr) { console.error("Error loading staffs", staffErr); return; }

    allStaffs = staffs;
    updateFilterCheckboxes();

    // Reset counters
    stats.totalStaff = staffs.length;
    stats.driving = 0;
    stats.outOfBounds = 0;

    for (const staff of staffs) {
        const { data: logs, error: logErr } = await supabaseClient
            .from('gps_logs')
            .select('*')
            .eq('staff_id', staff.id)
            .order('timestamp', { ascending: false })
            .limit(1);

        let latestLog = logs && logs.length > 0 ? logs[0] : null;

        if (latestLog && latestLog.lat && latestLog.lng) {
            updateMarkerUI(staff, latestLog);
            if (latestLog.speed > 0) stats.driving++;
            // Note: out-of-bounds requires geofencing checks, skipping for UI stat speed
        }
    }
    updateStatsUI();
}

function updateMarkerUI(staff, logData) {
    const latLng = [logData.lat, logData.lng];

    // Check if layer group exists
    if (!staffMapLayers[staff.id]) {
        staffMapLayers[staff.id] = L.layerGroup().addTo(map);
    }
    const group = staffMapLayers[staff.id];
    group.clearLayers(); // Remove old marker

    const isOffline = (new Date() - new Date(logData.timestamp)) > 5 * 60 * 1000; // > 5 mins = offline
    const isMock = logData.is_mock;
    const speed = logData.speed || 0;
    const battery = logData.battery || '--';
    const batColor = battery <= 20 ? 'text-rose-600' : 'text-emerald-600';
    const batIcon = battery <= 20 ? 'battery-warning' : (battery > 80 ? 'battery-high' : 'battery-medium');
    const offlineText = isOffline ? '<span class="text-slate-400"><i class="ph-bold ph-wifi-slash"></i> Offline</span>' : '<span class="text-blue-500"><i class="ph-bold ph-wifi-high"></i> Online</span>';
    const mockHtml = isMock ? `<div class="mt-1 bg-rose-100 border border-rose-300 text-rose-700 text-[10px] font-bold py-0.5 px-2 rounded animate-pulse"><i class="ph-fill ph-warning"></i>ระวัง! Fake GPS</div>` : '';

    const deviceStatusHTML = `
        <div class="flex justify-between items-center text-[10px] bg-slate-100 p-1.5 rounded mt-2 border border-slate-200">
            <span class="${batColor} font-bold"><i class="ph-fill ph-${batIcon} text-xs"></i> ${battery}%</span>
            <span class="text-slate-600"><i class="ph-fill ph-speedometer text-xs"></i> ${speed} km/h</span>
            ${offlineText}
        </div>
        ${mockHtml}
    `;

    const marker = L.marker(latLng, { icon: createStaffIcon(staff.id, staff.color || 'blue', false, isOffline) })
        .bindPopup(`
            <div class="text-center min-w-[190px] font-prompt pt-1">
                <div class="flex items-center justify-center mb-1">
                    <span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold mr-2 border shadow-sm">${staff.id}</span>
                    <b class="text-sm text-slate-800">${staff.name}</b>
                </div>
                <div class="mt-2 text-[11px] text-slate-600 font-medium bg-slate-50 py-1 rounded-md">อัปเดต: ${new Date(logData.timestamp).toLocaleTimeString()}</div>
                ${deviceStatusHTML}
            </div>
        `);

    marker.addTo(group);
}

// ----------------------------------------------------
// 3. REAL-TIME API SUBSCRIPTIONS
// ----------------------------------------------------

function addRealtimeAlert(type, message, time, staffId) {
    const container = document.getElementById('alerts-container');
    let html = '';

    if (type === 'mock') {
        html = `
         <div class="p-4 bg-rose-50 rounded-xl border-l-4 border-rose-600 shadow-sm relative overflow-hidden animate-slide-in-right interactive-card mb-3">
             <div class="font-bold text-rose-800 flex items-center text-sm"><i class="ph-fill ph-warning mr-1.5 text-lg"></i> ตรวจพบ Fake GPS!</div>
             <div class="mt-1 text-sm text-slate-700">สาย <span class="font-bold">${staffId}</span> ใช้งาน Mock Location</div>
             <div class="text-[11px] text-slate-500 mt-2 flex items-center"><i class="ph-regular ph-clock mr-1"></i> ${time}</div>
         </div>`;
    } else if (type === 'update') {
        html = `
         <div class="p-4 bg-white rounded-xl border border-slate-100 shadow-sm relative animate-slide-in-right interactive-card mb-3">
             <div class="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l-xl"></div>
             <div class="font-bold text-blue-700 text-sm flex items-center"><i class="ph-fill ph-navigation-arrow mr-1.5"></i> อัปเดตตำแหน่ง</div>
             <div class="mt-1 text-sm text-slate-700">สาย <span class="font-bold">${staffId}</span>: ${message}</div>
             <div class="text-[11px] text-slate-500 mt-2 flex items-center"><i class="ph-regular ph-clock mr-1"></i> ${time}</div>
         </div>`;
    }

    // Clear default text if first alert
    if (container.innerHTML.includes('กำลังเชื่อมต่อ')) container.innerHTML = '';

    container.insertAdjacentHTML('afterbegin', html);
}

function subscribeToGPSLogs() {
    supabaseClient.channel('gps_logs_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_logs' }, async payload => {
            const newLog = payload.new;

            // Fetch staff details
            const staff = allStaffs.find(s => s.id === newLog.staff_id);
            if (!staff) return;

            // Update UI Map
            if (newLog.lat && newLog.lng) {
                updateMarkerUI(staff, newLog);
            }

            // Alert logic
            const timeStr = new Date(newLog.timestamp).toLocaleTimeString();
            if (newLog.is_mock) {
                addRealtimeAlert('mock', 'Fake GPS Detected', timeStr, staff.id);
            } else {
                addRealtimeAlert('update', `ส่งพิกัด ความเร็ว ${newLog.speed || 0} km/h`, timeStr, staff.id);
            }
        })
        .subscribe();
}

// ----------------------------------------------------
// 4. EXCEL UPLOAD FEATURE
// ----------------------------------------------------

let excelDataToUpload = null;

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('fileNameDisplay').textContent = file.name;

    const reader = new FileReader();
    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        excelDataToUpload = XLSX.utils.sheet_to_json(worksheet);
    };
    reader.readAsArrayBuffer(file);
}

async function processExcelUpload() {
    if (!excelDataToUpload || excelDataToUpload.length === 0) {
        alert("กรุณาเลือกไฟล์ Excel และตรวจสอบให้มั่นใจว่าไฟล์มีข้อมูล");
        return;
    }

    const btn = document.getElementById('btnUpload');
    const statusEl = document.getElementById('uploadStatus');
    btn.disabled = true;
    btn.innerHTML = `<i class="ph-bold ph-spinner animate-spin mr-2"></i> กำลังอัปโหลด...`;

    statusEl.classList.remove('hidden');
    statusEl.className = 'mt-3 text-sm text-center font-medium text-slate-600';
    statusEl.innerText = `กำลังนำเข้า ${excelDataToUpload.length} รายการ...`;

    try {
        if (!supabaseClient) throw new Error("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");

        const payload = excelDataToUpload.map(row => ({
            name: row.name || row.Name || row['ชื่อร้าน'],
            lat: parseFloat(row.lat || row.Lat || row.Latitude || row['ละติจูด']),
            lng: parseFloat(row.lng || row.Lng || row.Lon || row.Longitude || row['ลองจิจูด']),
        })).filter(r => r.name && r.lat && r.lng);

        if (payload.length === 0) throw new Error("ฟอร์แมตข้อมูลผิดพลาด");

        const { error } = await supabaseClient.from('customers').upsert(payload, { onConflict: 'name' });
        if (error) throw error;

        statusEl.className = 'mt-3 text-sm text-center font-medium text-emerald-600';
        statusEl.innerText = `อัปโหลดสำเร็จ ${payload.length} รายการ!`;

        loadCustomers();

        setTimeout(() => {
            toggleUploadModal();
            statusEl.classList.add('hidden');
        }, 2000);

    } catch (error) {
        console.error("Upload error:", error);
        statusEl.className = 'mt-3 text-sm text-center font-medium text-rose-600';
        statusEl.innerText = `เกิดข้อผิดพลาด: ${error.message}`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'นำเข้าข้อมูลไปยังระบบ';
    }
}

// ----------------------------------------------------
// 5. DATA TABLE & FILTERING
// ----------------------------------------------------

async function loadTableData() {
    if (!supabaseClient) return; // Prevent crash in Mock Mode

    const startDate = document.getElementById('report-start-date').value;
    const endDate = document.getElementById('report-end-date').value;
    const tbody = document.getElementById('visits-table-body');

    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500"><i class="ph-bold ph-spinner animate-spin mr-2"></i> กำลังโหลดข้อมูล...</td></tr>`;

    try {
        let query = supabaseClient
            .from('visits')
            .select(`
                *,
                staffs ( name, id ),
                customers ( name )
            `)
            .order('visit_start', { ascending: false });

        if (startDate) {
            query = query.gte('visit_start', `${startDate}T00:00:00Z`);
        }
        if (endDate) {
            query = query.lte('visit_start', `${endDate}T23:59:59Z`);
        }

        const { data: visits, error } = await query;
        if (error) throw error;

        tbody.innerHTML = '';
        if (visits.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>`;
            return;
        }

        visits.forEach(v => {
            const staffName = v.staffs ? `${v.staffs.name} (${v.staffs.id})` : 'ไม่ทราบสาย';
            const customerName = v.customers ? v.customers.name : 'Unknown';
            const startTime = new Date(v.visit_start).toLocaleTimeString();
            const endTime = v.visit_end ? new Date(v.visit_end).toLocaleTimeString() : 'กำลังเยี่ยม';

            // Format Duration
            let durationStr = '-';
            if (v.duration_minutes) {
                const h = Math.floor(v.duration_minutes / 60);
                const m = Math.floor(v.duration_minutes % 60);
                durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
            }

            const typeBadge = v.visit_type === 'Drive-by'
                ? `<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold">Drive-by</span>`
                : `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">Real Visit</span>`;

            tbody.innerHTML += `
                <tr class="interactive-row">
                    <td class="p-3 font-medium text-slate-700">${staffName}</td>
                    <td class="p-3">${customerName}</td>
                    <td class="p-3 text-center text-blue-600 font-medium">${startTime} - ${endTime}</td>
                    <td class="p-3 text-center text-slate-600">${durationStr}</td>
                    <td class="p-3 text-center">${typeBadge}</td>
                    <td class="p-3 text-center text-indigo-600 font-medium">${v.distance_to_customer ? v.distance_to_customer.toFixed(2) : '-'}</td>
                    <td class="p-3 text-center"><span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">Online</span></td>
                </tr>
            `;
        });

    } catch (err) {
        console.error("Error loading table data", err);
        tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-rose-500 font-medium">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
    }
}


// ----------------------------------------------------
// 5. MOCK DATA SIMULATOR FOR TESTING UI WITHOUT DB
// ----------------------------------------------------

function initMockMap() {
    // We already have HTML mockup injected from user, we just need to ensure the JS map init does not crash.
    // The user's HTML has a `<script>` block that already draws the UI mockup beautifully!
    // But since `app.js` runs later, we should re-call their setup if in Mock mode to let our JS manage it if needed, or just let their JS run.
    console.log("Mock Mode Active: Allowing user's inline HTML mockup script to run.");

    // We do NOT call `initMap()` here because it would clear the user's mockup.
    // However, if we want to run our own code to simulate movement as well, we can do it here.

    // Fallback: If map is not initialized by HTML for some reason
    if (!document.querySelector('.leaflet-container')) {
        map = L.map('map', { zoomControl: false }).setView([14.7230, 100.7830], 12);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);
    }
}

// Start Map on Window Load
window.onload = () => {
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
        initMockMap();
    } else {
        // If keys are present, clear the HTML mockup tables/alerts and run the live DB version
        initMap();
    }
};

// Initialize Supabase Client (REPLACE WITH REAL KEYS)
const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';
let supabaseClient;

// Map Global Variables
let map;
let staffMapLayers = {};
let customerMarkers = [];
let plottedCustomerIds = new Set();
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
    loadLatestStaffLocations();
    subscribeToGPSLogs();
    loadTableData();
    calculateTodayDistance();
}

// ----------------------------------------------------
// 2. DATA LOADING (REAL SUPABASE)
// ----------------------------------------------------

// Per-staff daily distance cache: { staffId: kmTotal }
let dailyKmByStaff = {};

async function loadCustomers() {
    if (!supabaseClient) return;

    // Count today's unique visited stores for the stat card
    const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).split(' ')[0];
    const { data: visitsToday } = await supabaseClient
        .from('visits').select('customer_id')
        .gte('time_in', `${today}T00:00:00+07:00`)
        .lte('time_in', `${today}T23:59:59+07:00`);
    stats.totalStores = new Set((visitsToday || []).map(v => v.customer_id)).size;
    updateStatsUI();

    // Load ALL stores and plot on map
    const { data: customers, error } = await supabaseClient
        .from('customers')
        .select('id, name, customer_code, customer_type, staff_id, lat, lng')
        .not('lat', 'is', null).not('lng', 'is', null);

    if (error || !customers) { console.error('loadCustomers error', error); return; }

    // Remove previously plotted customer markers
    customerMarkers.forEach(m => { if (map.hasLayer(m)) map.removeLayer(m); });
    customerMarkers = [];

    // Remove old territory polygons
    territoryPolygons.forEach(p => { if (map.hasLayer(p)) map.removeLayer(p); });
    territoryPolygons = [];

    const staffColors = ['#3b82f6', '#f97316', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899', '#10b981', '#6366f1'];
    const staffColorMap = {};
    const storesByStaff = {};

    customers.forEach(cust => {
        if (!cust.lat || !cust.lng || isNaN(cust.lat) || isNaN(cust.lng)) return;

        const sid = cust.staff_id || '_none';
        if (!staffColorMap[sid]) {
            const idx = Object.keys(staffColorMap).length;
            staffColorMap[sid] = staffColors[idx % staffColors.length];
        }
        const color = staffColorMap[sid];

        // Plot small circle marker
        const marker = L.circleMarker([cust.lat, cust.lng], {
            radius: 4, fillColor: color, color: '#fff',
            weight: 1.5, fillOpacity: 0.85
        }).bindPopup(`
            <div class="font-prompt min-w-[160px]">
                <div class="flex items-center gap-1 mb-1">
                    ${cust.staff_id ? `<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[9px] font-bold border">${cust.staff_id}</span>` : ''}
                    <b class="text-[13px] text-slate-800 leading-tight">${cust.name}</b>
                </div>
                ${cust.customer_code ? `<div class="text-[10px] text-slate-500 font-mono">${cust.customer_code}</div>` : ''}
                ${cust.customer_type ? `<div class="text-[10px] text-slate-400">${cust.customer_type}</div>` : ''}
            </div>
        `);
        marker.addTo(map);
        customerMarkers.push(marker);

        // Group for territory
        if (cust.staff_id) {
            if (!storesByStaff[cust.staff_id]) storesByStaff[cust.staff_id] = [];
            storesByStaff[cust.staff_id].push([cust.lat, cust.lng]);
        }
    });

    // Draw bounding-box territory rectangle per staff_id (from their store coordinates)
    Object.entries(storesByStaff).forEach(([staffId, points]) => {
        if (points.length < 2) return;
        const lats = points.map(p => p[0]);
        const lngs = points.map(p => p[1]);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
        const color = staffColorMap[staffId] || '#64748b';

        const polygon = L.rectangle([[minLat, minLng], [maxLat, maxLng]], {
            color, weight: 2, opacity: 0.7,
            fillColor: color, fillOpacity: 0.04, dashArray: '5 6'
        }).bindPopup(`<b>เขตสาย ${staffId}</b><br><span class="text-[10px] text-slate-500">${points.length} ร้านค้า</span>`)
            .addTo(map);

        territoryPolygons.push(polygon);
    });
}

function setDefaultDates() {
    // Force date to be computed in Thailand timezone (Asia/Bangkok)
    const options = { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' };
    const today = new Date().toLocaleString('sv-SE', options).split(' ')[0]; // Returns YYYY-MM-DD
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
        .select('name'); // Removed ST_AsGeoJSON to prevent 400 error for now

    if (error) {
        // Silently fail if territories are not set up properly yet
        return;
    }

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
                <input type="checkbox" value="${staff.id}" class="route-filter filter-checkbox hidden" checked onchange="updateMapFiltersWithHistory()">
                <span class="filter-label px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all duration-300 flex items-center shadow-sm">
                    <span class="w-2 h-2 rounded-full bg-${color.split('-')[0]}-600 mr-1"></span> ${staff.id}
                </span>
            </label>
        `;
        container.innerHTML += html;
    });

    // Also populate the visit table staff filter dropdown
    populateVisitStaffFilter();
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

    let activeStaffs = staffs || [];

    // Auto-discover staffs from gps_logs if staffs table is empty (RLS blocked or no data)
    if (activeStaffs.length === 0) {
        console.log("No staffs found, attempting auto-discovery from gps_logs...");
        const { data: recentLogs } = await supabaseClient
            .from('gps_logs')
            .select('staff_id')
            .order('timestamp', { ascending: false })
            .limit(100);

        if (recentLogs && recentLogs.length > 0) {
            const uniqueIds = [...new Set(recentLogs.map(log => log.staff_id))].filter(Boolean);
            activeStaffs = uniqueIds.map((id, index) => {
                const colors = ['blue', 'orange', 'purple', 'teal', 'amber'];
                return { id: id, name: id, color: colors[index % colors.length] };
            });
            console.log("Auto-discovered staffs:", activeStaffs);
        }
    }

    allStaffs = activeStaffs;
    updateFilterCheckboxes();

    // Reset counters
    stats.totalStaff = allStaffs.length;
    stats.driving = 0;
    stats.outOfBounds = 0;

    let allBounds = [];

    for (const staff of allStaffs) {
        const { data: logs, error: logErr } = await supabaseClient
            .from('gps_logs')
            .select('*')
            .eq('staff_id', staff.id)
            .order('timestamp', { ascending: false })
            .limit(1);

        let latestLog = logs && logs.length > 0 ? logs[0] : null;

        if (latestLog && latestLog.lat && latestLog.lng) {
            updateMarkerUI(staff, latestLog);
            allBounds.push([latestLog.lat, latestLog.lng]);
            if (latestLog.speed > 0) stats.driving++;
            // Note: out-of-bounds requires geofencing checks, skipping for UI stat speed
        }
    }

    // Auto center map to show all staffs
    if (allBounds.length > 0 && map) {
        map.fitBounds(allBounds, { maxZoom: 15, padding: [50, 50] });
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
                <div class="mt-2 text-[11px] text-slate-600 font-medium bg-slate-50 py-1 rounded-md">อัปเดต: ${new Date(logData.timestamp).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })}</div>
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

// Path history layer storage - stores a LayerGroup per staffId
let historyPathLayers = {};

// Haversine formula for distance in km between two lat/lng pairs
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function updatePathHistory() {
    if (!supabaseClient) return;

    const selectedDate = document.getElementById('history-date').value; // YYYY-MM-DD
    const hoursBack = document.getElementById('path-history-select').value; // '1', '3', '6', 'all'

    if (!selectedDate) return;

    // Build the time range strictly within the selected date (Thai timezone)
    const dayStart = `${selectedDate}T00:00:00+07:00`;
    const dayEnd = `${selectedDate}T23:59:59+07:00`;

    let rangeStart = dayStart;
    if (hoursBack !== 'all') {
        const hours = parseInt(hoursBack);
        const optionsDate = { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' };
        const todayStr = new Date().toLocaleString('sv-SE', optionsDate).split(' ')[0];
        if (selectedDate === todayStr) {
            rangeStart = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        } else {
            const endOfDay = new Date(`${selectedDate}T23:59:59+07:00`);
            rangeStart = new Date(endOfDay - hours * 60 * 60 * 1000).toISOString();
        }
    }

    // Fetch GPS logs within the date window
    const { data: logs, error } = await supabaseClient
        .from('gps_logs')
        .select('staff_id, lat, lng, timestamp')
        .gte('timestamp', rangeStart)
        .lte('timestamp', dayEnd)
        .order('timestamp', { ascending: true });

    if (error) { console.error('Error loading history path:', error); return; }

    // Remove existing history layers
    Object.values(historyPathLayers).forEach(layer => {
        if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    historyPathLayers = {};

    if (!logs || logs.length === 0) return;

    // Get which staff are currently checked in the filter panel
    const checkedStaffIds = new Set(
        [...document.querySelectorAll('.route-filter:checked')].map(cb => cb.value)
    );

    // Assign a deterministic color per staff (same order as allStaffs)
    const staffColors = ['#3b82f6', '#f97316', '#8b5cf6', '#14b8a6', '#f59e0b'];
    const staffColorMap = {};
    allStaffs.forEach((s, i) => { staffColorMap[s.id] = staffColors[i % staffColors.length]; });

    // Group logs by staff_id
    const staffGroups = {};
    logs.forEach(log => {
        if (!log.lat || !log.lng) return;
        if (!staffGroups[log.staff_id]) staffGroups[log.staff_id] = [];
        staffGroups[log.staff_id].push([log.lat, log.lng]);
    });

    // Draw dashed polyline + start/end markers per staff
    Object.entries(staffGroups).forEach(([staffId, coords]) => {
        if (coords.length < 2) return;

        const isVisible = checkedStaffIds.size === 0 || checkedStaffIds.has(staffId);
        const color = staffColorMap[staffId] || '#64748b';

        const group = L.layerGroup();

        L.polyline(coords, {
            color: color,
            weight: 3,
            opacity: 0.80,
            dashArray: '8, 6',   // dashed line
            lineJoin: 'round'
        }).addTo(group);

        // Start dot (green) and end dot (red) — tooltip shows staff id
        L.circleMarker(coords[0], { radius: 7, color: '#16a34a', fillColor: '#22c55e', fillOpacity: 1, weight: 2 })
            .bindTooltip(`${staffId}: เริ่ม`, { permanent: false }).addTo(group);
        L.circleMarker(coords[coords.length - 1], { radius: 7, color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 1, weight: 2 })
            .bindTooltip(`${staffId}: ล่าสุด`, { permanent: false }).addTo(group);

        if (isVisible) group.addTo(map);
        historyPathLayers[staffId] = group;
    });

    // Fit map to visible paths
    const visibleCoords = Object.entries(staffGroups)
        .filter(([id]) => checkedStaffIds.size === 0 || checkedStaffIds.has(id))
        .flatMap(([, coords]) => coords);
    if (visibleCoords.length > 1) map.fitBounds(visibleCoords, { padding: [30, 30] });
}

// When staff filter checkbox changes, also toggle history path visibility
function updateMapFiltersWithHistory() {
    updateMapFiltersDB();

    const checkedStaffIds = new Set(
        [...document.querySelectorAll('.route-filter:checked')].map(cb => cb.value)
    );

    Object.entries(historyPathLayers).forEach(([staffId, group]) => {
        const shouldShow = checkedStaffIds.size === 0 || checkedStaffIds.has(staffId);
        if (shouldShow && !map.hasLayer(group)) group.addTo(map);
        if (!shouldShow && map.hasLayer(group)) map.removeLayer(group);
    });
}

async function calculateTodayDistance() {
    if (!supabaseClient) return;

    const options = { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' };
    const today = new Date().toLocaleString('sv-SE', options).split(' ')[0];

    const { data: logs, error } = await supabaseClient
        .from('gps_logs')
        .select('staff_id, lat, lng, timestamp')
        .gte('timestamp', `${today}T00:00:00+07:00`)
        .lte('timestamp', `${today}T23:59:59+07:00`)
        .order('timestamp', { ascending: true });

    if (error || !logs) return;
    if (logs.length < 2) {
        const el = document.getElementById('stat-distance-today');
        if (el) el.textContent = '0';
        return;
    }

    // Group by staff and sum Haversine distances
    const distByStaff = {};
    logs.forEach(log => {
        if (!log.lat || !log.lng) return;
        if (!distByStaff[log.staff_id]) distByStaff[log.staff_id] = { prev: null, total: 0 };
        const entry = distByStaff[log.staff_id];
        if (entry.prev) {
            entry.total += haversineKm(entry.prev[0], entry.prev[1], log.lat, log.lng);
        }
        entry.prev = [log.lat, log.lng];
    });

    // Sum all staff distances for a fleet total
    const totalKm = Object.values(distByStaff).reduce((sum, d) => sum + d.total, 0);

    // Update the UI stat element
    const el = document.getElementById('stat-distance-today');
    if (el) el.textContent = totalKm.toFixed(1);
}

function subscribeToGPSLogs() {
    supabaseClient.channel('gps_logs_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_logs' }, async payload => {
            const newLog = payload.new;

            // Fetch staff details, auto-add if missing
            let staff = allStaffs.find(s => s.id === newLog.staff_id);
            if (!staff) {
                console.log("New staff detected in real-time:", newLog.staff_id);
                staff = { id: newLog.staff_id, name: newLog.staff_id, color: 'blue' };
                allStaffs.push(staff);
                updateFilterCheckboxes();
                stats.totalStaff = allStaffs.length;
                updateStatsUI();
            }

            // Update UI Map
            if (newLog.lat && newLog.lng) {
                updateMarkerUI(staff, newLog);
            }

            // Alert logic
            const timeStr = new Date(newLog.timestamp).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            if (newLog.is_mock) {
                addRealtimeAlert('mock', 'Fake GPS Detected', timeStr, staff.id);
            } else {
                addRealtimeAlert('update', `ส่งพิกัด ความเร็ว ${newLog.speed || 0} km/h`, timeStr, staff.id);
            }

            calculateTodayDistance(); // Update distance KPI
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

        // Debug: log the first row's keys so we can see exact column names
        if (excelDataToUpload.length > 0) {
            console.log('📋 Excel columns detected:', Object.keys(excelDataToUpload[0]));
            console.log('📋 First row sample:', excelDataToUpload[0]);
        }

        const rawPayload = excelDataToUpload.map(row => {
            const name = row.name || row.Name || row['ชื่อ'] || row['ชื่อลูกค้า'] || row['ชื่อร้าน'] || null;
            const lat = parseFloat(row.lat ?? row.Lat ?? row.Latitude ?? row['ละติจูด']);
            const lng = parseFloat(row.lng ?? row.Lng ?? row.Lon ?? row.Longitude ?? row['ลองจิจูด']);
            return {
                name,
                customer_code: row.customer_code || row['ลูกค้า'] || null,
                lat, lng,
                staff_id: row.staff_id || row['สายวิ่ง'] || null,
                customer_type: row.customer_type || row['ชื่อประเภทย่อยของลูกค้า'] || null,
                district: row.district || row['อำเภอทางภูมิศ'] || null
            };
        });

        const validRows = rawPayload.filter(r => r.name && !isNaN(r.lat) && !isNaN(r.lng));
        const skipped = rawPayload.length - validRows.length;

        if (skipped > 0) {
            console.warn(`⚠️ Skipped ${skipped} rows (missing name or coordinates)`);
        }

        // Deduplicate by customer_code (unique store ID) — stores with same name but different codes are kept separate
        // If no customer_code, fall back to dedup by name
        const dedupMap = new Map();
        validRows.forEach(r => {
            const key = r.customer_code || r.name;
            dedupMap.set(key, r);
        });
        const payload = [...dedupMap.values()];

        if (payload.length === 0) throw new Error("ไม่พบข้อมูลที่ถูกต้อง — ตรวจสอบชื่อคอลัมน์ใน Excel ให้ตรงกับที่ระบบกำหนด");

        // Upload in batches of 500 to handle large files
        const BATCH = 500;
        let uploaded = 0;
        for (let i = 0; i < payload.length; i += BATCH) {
            const chunk = payload.slice(i, i + BATCH);
            statusEl.innerText = `กำลังอัปโหลด... ${Math.min(i + BATCH, payload.length)} / ${payload.length} รายการ`;
            const { error } = await supabaseClient.from('customers').upsert(chunk, { onConflict: 'customer_code' });
            if (error) throw error;
            uploaded += chunk.length;
        }

        const skipNote = skipped > 0 ? ` (ข้ามไป ${skipped} แถว ที่ไม่มีพิกัด)` : '';
        statusEl.className = 'mt-3 text-sm text-center font-medium text-emerald-600';
        statusEl.innerText = `อัปโหลดสำเร็จ ${uploaded} รายการ!${skipNote}`;

        loadCustomers();

        setTimeout(() => {
            toggleUploadModal();
            statusEl.classList.add('hidden');
        }, 3000);

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

// Populate the staff filter dropdown for the visit table
function populateVisitStaffFilter() {
    const sel = document.getElementById('visit-staff-filter');
    if (!sel) return;
    // Keep the first 'all' option
    const current = sel.value;
    sel.innerHTML = '<option value="">🚗 ทุกสายวิ่ง</option>';
    allStaffs.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id; opt.textContent = s.id;
        if (s.id === current) opt.selected = true;
        sel.appendChild(opt);
    });
}

async function loadTableData() {
    if (!supabaseClient) return;

    const startDate = document.getElementById('report-start-date').value;
    const endDate = document.getElementById('report-end-date').value;
    const staffFilter = (document.getElementById('visit-staff-filter')?.value || '').trim();
    const tbody = document.getElementById('visits-table-body');

    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500"><i class="ph-bold ph-spinner animate-spin mr-2"></i> กำลังโหลดข้อมูล...</td></tr>`;

    try {
        let query = supabaseClient
            .from('visits')
            .select(`
                *,
                staffs ( name, id ),
                customers ( name, customer_code, customer_type, district, staff_id, lat, lng )
            `)
            .order('time_in', { ascending: false });

        if (startDate) query = query.gte('time_in', `${startDate}T00:00:00+07:00`);
        if (endDate) query = query.lte('time_in', `${endDate}T23:59:59+07:00`);
        if (staffFilter) query = query.eq('staff_id', staffFilter);

        const { data: visits, error } = await query;
        if (error) throw error;

        tbody.innerHTML = '';

        // Clear previously drawn dynamic customers from visit-based markers
        // (loadCustomers handles the base layer; here we only clear the visit-specific green dots)
        const visitMarkersCopy = [...customerMarkers.filter(m => m._visitDot)];
        visitMarkersCopy.forEach(m => { if (map.hasLayer(m)) map.removeLayer(m); });
        plottedCustomerIds.clear();

        if (visits.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>`;
            return;
        }

        // Pre-compute cumulative daily km for each staff in this visit list
        const staffIdsInView = [...new Set(visits.map(v => v.staff_id).filter(Boolean))];
        const dateStr = startDate || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
        const kmCache = {};
        await Promise.all(staffIdsInView.map(async sid => {
            const { data: logs } = await supabaseClient
                .from('gps_logs')
                .select('lat, lng, timestamp')
                .eq('staff_id', sid)
                .gte('timestamp', `${dateStr}T00:00:00+07:00`)
                .lte('timestamp', `${dateStr}T23:59:59+07:00`)
                .order('timestamp', { ascending: true });
            let km = 0, prev = null;
            (logs || []).forEach(log => {
                if (!log.lat || !log.lng) return;
                if (prev) km += haversineKm(prev[0], prev[1], log.lat, log.lng);
                prev = [log.lat, log.lng];
            });
            kmCache[sid] = km;
        }));

        visits.forEach(v => {
            const staffIdDisplay = v.staff_id;
            const routeName = v.staffs?.name || '';
            const staffHtml = `
                <div class="leading-tight">
                    <span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[11px] font-bold border border-blue-200">${staffIdDisplay}</span>
                    ${routeName ? `<div class="text-[10px] text-slate-500 mt-0.5">${routeName}</div>` : ''}
                </div>`;

            const cust = v.customers;
            const customerHtml = cust ? `
                <div class="leading-tight">
                    <div class="font-bold text-slate-700 text-[13px]">${cust.name}</div>
                    <div class="flex items-center gap-1 mt-0.5 flex-wrap">
                        ${cust.customer_code ? `<span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-mono border">${cust.customer_code}</span>` : ''}
                        ${cust.customer_type ? `<span class="text-[10px] text-slate-400">${cust.customer_type}</span>` : ''}
                    </div>
                </div>
            ` : '<span class="text-slate-400">Unknown</span>';

            const timeOpts = { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' };
            const startTime = new Date(v.time_in).toLocaleTimeString('th-TH', timeOpts);
            const endTime = v.time_out ? new Date(v.time_out).toLocaleTimeString('th-TH', timeOpts) : 'กำลังเยี่ยม';

            let durationStr = '-';
            if (v.duration_mins) {
                const h = Math.floor(v.duration_mins / 60);
                const m = Math.floor(v.duration_mins % 60);
                durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
            }

            const typeBadge = v.visit_type === 'Drive-by'
                ? `<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold">Drive-by</span>`
                : `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">Real Visit</span>`;

            // Show daily cumulative km for this staff
            const kmToday = kmCache[v.staff_id];
            const kmDisplay = kmToday !== undefined ? `${kmToday.toFixed(1)} กม.` : '-';

            tbody.innerHTML += `
                <tr class="interactive-row">
                    <td class="p-3 text-center sm:text-left">${staffHtml}</td>
                    <td class="p-3">${customerHtml}</td>
                    <td class="p-3 text-center text-blue-600 font-medium">${startTime} - ${endTime}</td>
                    <td class="p-3 text-center text-slate-600">${durationStr}</td>
                    <td class="p-3 text-center">${typeBadge}</td>
                    <td class="p-3 text-center text-indigo-600 font-medium">${kmDisplay}</td>
                    <td class="p-3 text-center"><span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">Online</span></td>
                </tr>
            `;

            // Mark visited stores with a green overlay dot on the map
            if (cust?.lat && cust?.lng) {
                const custKey = `${cust.lat},${cust.lng}`;
                if (!plottedCustomerIds.has(custKey)) {
                    plottedCustomerIds.add(custKey);
                    const dot = L.circleMarker([cust.lat, cust.lng], {
                        radius: 7, fillColor: '#10b981', color: '#047857', weight: 2.5, fillOpacity: 1
                    });
                    dot._visitDot = true;
                    dot.bindPopup(`
                        <div class="font-prompt min-w-[160px]">
                            <div class="flex items-center gap-1 mb-1">
                                ${cust.staff_id ? `<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[9px] font-bold border">${cust.staff_id}</span>` : ''}
                                <b class="text-[13px] text-slate-800">${cust.name}</b>
                            </div>
                            ${cust.customer_code ? `<div class="text-[10px] font-mono text-slate-500">${cust.customer_code}</div>` : ''}
                            ${cust.customer_type ? `<div class="text-[10px] text-slate-400">${cust.customer_type}</div>` : ''}
                            <div class="text-[10px] text-emerald-600 mt-1 font-bold"><i class="ph-bold ph-check-circle mr-1"></i>เข้าเยี่ยมแล้ว</div>
                        </div>
                    `).addTo(map);
                    customerMarkers.push(dot);
                }
            }
        });

    } catch (err) {
        console.error('Error loading table data', err);
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

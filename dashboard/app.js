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

// Centralized Staff Color System
const STAFF_COLORS_MAP = [
    { hex: '#3b82f6', tw: 'blue' },
    { hex: '#f97316', tw: 'orange' },
    { hex: '#8b5cf6', tw: 'purple' },
    { hex: '#14b8a6', tw: 'teal' },
    { hex: '#f59e0b', tw: 'amber' },
    { hex: '#ec4899', tw: 'pink' },
    { hex: '#10b981', tw: 'emerald' },
    { hex: '#6366f1', tw: 'indigo' },
    { hex: '#f43f5e', tw: 'rose' },
    { hex: '#06b6d4', tw: 'cyan' },
    { hex: '#84cc16', tw: 'lime' },
    { hex: '#7c3aed', tw: 'violet' },
    { hex: '#d946ef', tw: 'fuchsia' },
    { hex: '#0ea5e9', tw: 'sky' },
    { hex: '#ef4444', tw: 'red' },
    { hex: '#64748b', tw: 'slate' },
    { hex: '#2263eb', tw: 'blue' },
    { hex: '#16a34a', tw: 'green' },
    { hex: '#d97706', tw: 'amber' },
    { hex: '#4f46e5', tw: 'indigo' }
];

function getStaffColor(staffId) {
    if (!allStaffs || allStaffs.length === 0) {
        // Basic hash for when allStaffs is not yet populated
        const hash = Array.from(staffId || "").reduce((a, c) => a + c.charCodeAt(0), 0);
        return STAFF_COLORS_MAP[hash % STAFF_COLORS_MAP.length];
    }
    const idx = allStaffs.findIndex(s => s.id === staffId);
    if (idx === -1) return STAFF_COLORS_MAP[0];
    return STAFF_COLORS_MAP[idx % STAFF_COLORS_MAP.length];
}

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
    calculateDistanceInRange(); // Today's distance
    calculateMonthlyDistance(); // Monthly total km
}

// ----------------------------------------------------
// 2. DATA LOADING (REAL SUPABASE)
// ----------------------------------------------------

// Per-staff daily distance cache: { staffId: kmTotal }
let dailyKmByStaff = {};

// Helper: Fetch all logs using pagination to bypass Supabase 1000-row limit
async function fetchLogsPaginated(startDate, endDate, selectFields = '*', staffId = null) {
    let allLogs = [];
    let start = 0;
    const PAGE_SIZE = 1000;
    while (true) {
        let q = supabaseClient.from('gps_logs').select(selectFields)
            .gte('timestamp', startDate)
            .lte('timestamp', endDate)
            .order('timestamp', { ascending: true })
            .range(start, start + PAGE_SIZE - 1);
        if (staffId) q = q.eq('staff_id', staffId);

        const { data, error } = await q;
        if (error) {
            console.error('Pagination fetch error:', error);
            break;
        }
        if (data) allLogs = allLogs.concat(data);
        if (!data || data.length < PAGE_SIZE) break;
        start += PAGE_SIZE;
    }
    return allLogs;
}

async function loadCustomers() {
    if (!supabaseClient) return;

    // Count today's unique visited stores for the stat card
    const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).split(' ')[0];
    const { data: visitsToday } = await supabaseClient
        .from('visits').select('customer_id')
        .gte('time_in', `${today}T00:00:00+07:00`)
        .lte('time_in', `${today}T23:59:59+07:00`);

    const visitedStoreIds = new Set((visitsToday || []).map(v => v.customer_id));
    stats.totalStores = visitedStoreIds.size;
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

    const storesByStaff = {};

    customers.forEach(cust => {
        if (!cust.lat || !cust.lng || isNaN(cust.lat) || isNaN(cust.lng)) return;

        const sid = cust.staff_id || '_none';
        const color = getStaffColor(sid).hex;

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
                ${visitedStoreIds.has(cust.id) ? '<div class="mt-1 text-emerald-600 font-bold text-[10px]"><i class="ph-fill ph-check-circle"></i> เยี่ยมแล้ววันนี้</div>' : '<div class="mt-1 text-slate-400 font-medium text-[10px]"><i class="ph-regular ph-clock"></i> ยังไม่ได้เยี่ยม</div>'}
            </div>
        `);

        marker.isVisited = visitedStoreIds.has(cust.id);
        const hideUnvisited = document.getElementById('hide-unvisited-cx')?.checked;

        if (marker.isVisited || !hideUnvisited) {
            marker.addTo(map);
        }

        customerMarkers.push(marker);

        // Group for territory
        if (cust.staff_id) {
            if (!storesByStaff[cust.staff_id]) storesByStaff[cust.staff_id] = [];
            storesByStaff[cust.staff_id].push([cust.lat, cust.lng]);
        }
    });

    window.toggleUnvisitedStores = function () {
        const hideUnvisited = document.getElementById('hide-unvisited-cx').checked;
        customerMarkers.forEach(m => {
            if (!m.isVisited) {
                if (hideUnvisited) map.removeLayer(m);
                else m.addTo(map);
            }
        });
    };

    // Draw bounding-box territory rectangle per staff_id (from their store coordinates)
    // Removed local auto-drawing, we will rely on DB territories instead
    // loadTerritories() handles drawing the assigned bounds now.
    setTimeout(loadTerritories, 500); // Call after map settles
}

function setDefaultDates() {
    // Force date to be computed in Thailand timezone (Asia/Bangkok)
    const options = { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' };
    const today = new Date().toLocaleString('sv-SE', options).split(' ')[0]; // Returns YYYY-MM-DD
    const historyStartInput = document.getElementById('history-start-date');
    const historyEndInput = document.getElementById('history-end-date');
    const reportStartDateInput = document.getElementById('report-start-date');
    const reportEndDateInput = document.getElementById('report-end-date');

    if (historyStartInput) historyStartInput.value = today;
    if (historyEndInput) historyEndInput.value = today;
    if (reportStartDateInput) reportStartDateInput.value = today;
    if (reportEndDateInput) reportEndDateInput.value = today;
}

async function loadTerritories() {
    // Left join: Territories -> Staff Mapping
    const { data: mappings, error } = await supabaseClient
        .from('staff_territories')
        .select(`
            staff_id,
            territory:territories (
                name,
                geojson
            )
        `);

    if (error) {
        console.warn('Could not load territories:', error);
        return;
    }

    // Remove old polygons
    territoryPolygons.forEach(p => map.removeLayer(p));
    territoryPolygons = [];

    mappings.forEach(m => {
        if (!m.territory || !m.territory.geojson) return;

        let geojsonObj = m.territory.geojson;
        if (typeof geojsonObj === 'string') {
            try { geojsonObj = JSON.parse(geojsonObj); } catch (e) { return; }
        }

        const staffId = m.staff_id;
        const color = getStaffColor(staffId).hex;

        // Draw Polygon
        const polygonLayer = L.geoJSON(geojsonObj, {
            style: {
                color: color,
                weight: 2,
                opacity: 0.8,
                fillColor: color,
                fillOpacity: 0.05,
                dashArray: '5, 8'
            }
        }).bindPopup(`<div class="font-prompt text-center"><b>พื้นที่โซน ${staffId}</b></div>`).addTo(map);

        territoryPolygons.push(polygonLayer);
    });

    // Apply visibility state immediately upon load if checkbox exists
    if (typeof window.toggleTerritories === 'function') {
        window.toggleTerritories();
    }
}

window.toggleTerritories = function () {
    const hideTerritories = document.getElementById('hide-territory-cx')?.checked;
    territoryPolygons.forEach(p => {
        if (hideTerritories) {
            if (map.hasLayer(p)) map.removeLayer(p);
        } else {
            if (!map.hasLayer(p)) p.addTo(map);
        }
    });
};

// Custom sophisticated icon for staff
function createStaffIcon(route, colorNameOrId, isOutOfBounds = false, status = 'online') {
    const colorInfo = getStaffColor(route);
    const twColor = colorInfo.tw;

    let c = { bg: `bg-${twColor}-600`, text: `text-${twColor}-600` };
    let fallbackText = c.text;
    
    // Status colors
    if (status === 'offline') c = { bg: 'bg-slate-500', text: 'text-slate-400' };
    else if (status === 'idle') c = { bg: c.bg, text: 'text-amber-500' }; // Use the staff's bg color but make icon amber
    
    if (isOutOfBounds && status !== 'offline') c = { bg: 'bg-rose-600', text: 'text-rose-600' };

    const extraClass = (isOutOfBounds && status !== 'offline') ? 'out-of-bounds-glow animate-pulse' : '';
    const bounceIcon = isOutOfBounds ? '<div class="absolute -top-5 text-rose-500 text-xl animate-bounce drop-shadow-md"><i class="ph-fill ph-warning"></i></div>' : '';
    
    let statusIcon = '';
    if (status === 'offline') {
        statusIcon = '<div class="absolute -top-4 -right-2 text-slate-600 bg-white rounded-full p-0.5 text-xs border border-slate-300 shadow-sm"><i class="ph-bold ph-wifi-slash"></i></div>';
    } else if (status === 'idle') {
        statusIcon = '<div class="absolute -top-4 -right-2 text-amber-600 bg-white rounded-full p-0.5 text-xs border border-amber-300 shadow-sm"><i class="ph-bold ph-coffee"></i></div>';
    }

    return L.divIcon({
        html: `
            <div class="relative flex flex-col items-center justify-center ${extraClass} transition-transform hover:scale-110">
                ${bounceIcon}
                ${statusIcon}
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
        const colorInfo = getStaffColor(staff.id);
        const color = `${colorInfo.tw}-600`;

        const html = `
            <label class="cursor-pointer inline-flex items-center select-none hover:-translate-y-0.5 transition-transform w-full">
                <input type="checkbox" value="${staff.id}" class="route-filter filter-checkbox hidden" checked onchange="updateMapFiltersWithHistory()">
                <span class="filter-label w-full justify-center px-1 py-1.5 rounded-lg text-[11px] font-bold border transition-all duration-300 flex items-center shadow-sm">
                    <span class="w-2 h-2 rounded-full bg-${color} mr-1"></span> ${staff.id}
                </span>
            </label>
        `;
        container.innerHTML += html;
    });

    // Also populate the visit table staff filter dropdown
    if (typeof populateVisitStaffFilter === 'function') populateVisitStaffFilter();
}

window.setAllFilters = function (state) {
    const checkboxes = document.querySelectorAll('.route-filter');
    checkboxes.forEach(cb => cb.checked = state);
    updateMapFiltersWithHistory();
};

function updateOfflineStaffUI(latestLogsMap, targetTimeMs) {
    const container = document.getElementById('offline-staff-container');
    if (!container) return;

    const offlineStaffs = [];

    // Filter checked staff IDs only, or all if none checked
    const checkedStaffIds = new Set(
        [...document.querySelectorAll('.route-filter:checked')].map(cb => cb.value)
    );

    allStaffs.forEach(staff => {
        // Skip if staff is filtered out by the user checkboxes
        if (checkedStaffIds.size > 0 && !checkedStaffIds.has(staff.id)) return;

        const log = latestLogsMap[staff.id];
        // If no log at all, or older than 30 minutes relative to the target time
        if (!log) {
            offlineStaffs.push(staff.id);
        } else {
            const logTime = new Date(log.timestamp).getTime();
            if (targetTimeMs - logTime > 30 * 60 * 1000) {
                offlineStaffs.push(staff.id);
            }
        }
    });

    if (offlineStaffs.length === 0) {
        container.innerHTML = `<span class="text-[10px] text-emerald-600 font-medium"><i class="ph-bold ph-check-circle mr-1"></i> ทุกสายที่เลือกมีข้อมูลครบ</span>`;
    } else {
        container.innerHTML = offlineStaffs.map(id =>
            `<span class="bg-rose-50 border border-rose-200 text-rose-700 px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm">${id}</span>`
        ).join('');
    }
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

    // ALWAYS Auto-discover staffs from recent gps_logs to ensure we don't miss new phones
    console.log("Checking recent gps_logs for unregistered staffs...");
    const { data: recentLogs } = await supabaseClient
        .from('gps_logs')
        .select('staff_id')
        .order('timestamp', { ascending: false })
        .limit(200);

    if (recentLogs && recentLogs.length > 0) {
        const uniqueIds = [...new Set(recentLogs.map(log => log.staff_id))].filter(Boolean);
        uniqueIds.forEach(id => {
            if (!activeStaffs.find(s => s.id === id)) {
                console.log("Auto-discovered unregistered staff:", id);
                activeStaffs.push({ id: id, name: id, color: getStaffColor(id).hex });
            }
        });
    }

    // Sort staff alphabetically by ID so the filter panel is organized
    activeStaffs.sort((a, b) => a.id.localeCompare(b.id));

    allStaffs = activeStaffs;
    updateFilterCheckboxes();

    // Reset counters
    stats.totalStaff = allStaffs.length;
    stats.driving = 0;
    stats.outOfBounds = 0;

    let allBounds = [];

    const liveLogsMap = {};

    for (const staff of allStaffs) {
        const { data: logs, error: logErr } = await supabaseClient
            .from('gps_logs')
            .select('*')
            .eq('staff_id', staff.id)
            .order('timestamp', { ascending: false })
            .limit(1);

        let latestLog = logs && logs.length > 0 ? logs[0] : null;

        if (latestLog && latestLog.lat && latestLog.lng) {
            liveLogsMap[staff.id] = latestLog;
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
    updateOfflineStaffUI(liveLogsMap, new Date().getTime());
}

function updateMarkerUI(staff, logData, forceHistoryStyle = false, referenceTimeMs = Date.now()) {
    const latLng = [logData.lat, logData.lng];

    // Check if layer group exists
    if (!staffMapLayers[staff.id]) {
        staffMapLayers[staff.id] = L.layerGroup().addTo(map);
    }
    const group = staffMapLayers[staff.id];
    group.clearLayers(); // Remove old marker

    const logTimeMs = new Date(logData.timestamp).getTime();
    const timeDiffMs = referenceTimeMs - logTimeMs;
    
    let status = 'online';
    if (timeDiffMs > 20 * 60 * 1000) {
        status = 'offline';
    } else if (timeDiffMs > 5 * 60 * 1000) {
        status = 'idle';
    }

    const isMock = logData.is_mock;
    const speed = logData.speed || ((logData.is_history || forceHistoryStyle) ? '-' : 0);
    const battery = logData.battery || '--';
    const batColor = battery <= 20 ? 'text-rose-600' : 'text-emerald-600';
    const batIcon = battery <= 20 ? 'battery-warning' : (battery > 80 ? 'battery-high' : 'battery-medium');
    
    let offlineText = '';
    if (forceHistoryStyle) {
        if (status === 'offline') {
            offlineText = '<span class="text-slate-400"><i class="ph-bold ph-wifi-slash"></i> อดีต (Offline)</span>';
        } else if (status === 'idle') {
            offlineText = '<span class="text-orange-500"><i class="ph-bold ph-coffee"></i> อดีต (จอด/พัก)</span>';
        } else {
            offlineText = '<span class="text-blue-500"><i class="ph-bold ph-clock-counter-clockwise"></i> อดีต (Online)</span>';
        }
    } else {
        if (status === 'offline') {
            offlineText = '<span class="text-slate-400"><i class="ph-bold ph-wifi-slash"></i> Offline</span>';
        } else if (status === 'idle') {
            offlineText = '<span class="text-amber-500"><i class="ph-bold ph-coffee"></i> จอด/พัก</span>';
        } else {
            offlineText = '<span class="text-blue-500"><i class="ph-bold ph-wifi-high"></i> Online</span>';
        }
    }

    const mockHtml = isMock ? `<div class="mt-1 bg-rose-100 border border-rose-300 text-rose-700 text-[10px] font-bold py-0.5 px-2 rounded animate-pulse"><i class="ph-fill ph-warning"></i>ระวัง! Fake GPS</div>` : '';

    // Geofencing Check
    let isOutOfBounds = false;
    let outOfBoundsHtml = '';

    // The backend PostGIS trigger already calculates in_territory for every gps log.
    // If it is explicitly false, they are out of bounds. If true or null, they are fine.
    if (logData.in_territory === false) {
        isOutOfBounds = true;
        outOfBoundsHtml = `<div class="mt-1 bg-rose-600 text-white text-[10px] font-bold py-0.5 px-2 rounded shadow-sm flex items-center justify-center animate-pulse"><i class="ph-bold ph-warning-octagon mr-1"></i> ออกนอกเขต!</div>`;
    }

    const deviceStatusHTML = `
        <div class="flex justify-between items-center text-[10px] bg-slate-100 p-1.5 rounded mt-2 border border-slate-200">
            <span class="${batColor} font-bold"><i class="ph-fill ph-${batIcon} text-xs"></i> ${battery}%</span>
            <span class="text-slate-600"><i class="ph-fill ph-speedometer text-xs"></i> ${speed} km/h</span>
            ${offlineText}
        </div>
        ${mockHtml}
        ${outOfBoundsHtml}
    `;

    const marker = L.marker(latLng, { icon: createStaffIcon(staff.id, staff.color || 'blue', isOutOfBounds, status) })
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

    // Auto-update out-of-bounds stat counter in the background
    updateOutOfBoundsStat();
}

function updateOutOfBoundsStat() {
    let outCount = 0;
    const checkedStaffIds = new Set(
        [...document.querySelectorAll('.route-filter:checked')].map(cb => cb.value)
    );

    // We count icons that are currently displayed and have the out-of-bounds glow
    Object.values(staffMapLayers).forEach(group => {
        group.eachLayer(layer => {
            if (layer.options.icon && layer.options.icon.options.html && layer.options.icon.options.html.includes('out-of-bounds-glow')) {
                // If it's visible based on filter
                const staffIdMatch = layer.options.icon.options.html.match(/<div class="[^"]*">([^<]+)<\/div>\s*<i class="ph-fill ph-car-profile/);
                if (staffIdMatch && staffIdMatch[1]) {
                    const id = staffIdMatch[1].trim();
                    if (checkedStaffIds.size === 0 || checkedStaffIds.has(id)) {
                        outCount++;
                    }
                } else {
                    outCount++; // Fallback
                }
            }
        });
    });

    const el = document.getElementById('stat-staff-out');
    if (el) el.innerHTML = `${outCount} <span class="text-[10px] font-normal text-rose-500">คน</span>`;
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
let dailyGpsLogs = []; // Cache for time slider playback
let isHistoricalPlayback = false;

// Haversine formula for distance in km between two lat/lng pairs
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Global variable to store current slider max minutes
let sliderMaxMinutes = 1440;

function toggleLoading(show, text = 'กำลังโหลดข้อมูล...') {
    const popup = document.getElementById('loading-popup');
    const label = document.getElementById('loading-text');
    if (!popup) return;

    if (show) {
        if (label) label.innerText = text;
        popup.classList.remove('hidden');
    } else {
        popup.classList.add('hidden');
    }
}

async function updatePathHistory() {
    if (!supabaseClient) return;

    const startInput = document.getElementById('history-start-date').value;
    const endInput = document.getElementById('history-end-date').value;

    if (!startInput || !endInput) {
        alert("กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด");
        return;
    }

    // Toggle Loading ON
    toggleLoading(true, 'กำลังโหลดข้อมูลประวัติ...');

    try {
        // Calculate end of day for the end date correctly
        const startDateTime = new Date(`${startInput}T00:00:00+07:00`);
        const endDateTime = new Date(`${endInput}T23:59:59+07:00`);

        if (startDateTime > endDateTime) {
            alert("วันสิ้นสุดต้องมากกว่าวันเริ่มต้น");
            return;
        }

        // Format for Supabase query based on local time
        const tStart = `${startInput}T00:00:00+07:00`;
        const tEnd = `${endInput}T23:59:59+07:00`;

        // Calculate total minutes between dates
        const diffMs = endDateTime - startDateTime;
        sliderMaxMinutes = Math.floor(diffMs / 1000 / 60);

        // Update Slider UI
        const slider = document.getElementById('time-slider');
        slider.max = sliderMaxMinutes;
        slider.value = sliderMaxMinutes; // Default to end of range

        // Update Slider Labels
        const startStr = startDateTime.toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const endStr = endDateTime.toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        document.querySelector('#time-slider').previousElementSibling.textContent = startStr;
        document.querySelector('#time-slider').nextElementSibling.textContent = endStr;
        document.getElementById('slider-time-display').textContent = 'ล่าสุดในรอบที่เลือก';

        // Sync report parameters for Table Data so they pull the same dynamic range
        const reportStartInput = document.getElementById('report-start-date');
        const reportEndInput = document.getElementById('report-end-date');
        if (reportStartInput) reportStartInput.value = startInput.split('T')[0];
        if (reportEndInput) reportEndInput.value = endInput.split('T')[0];

        // Auto-refresh the datatable with the newly synced dates
        if (typeof window.loadTableData === 'function') {
            await window.loadTableData(); // Wait for table load
        }

        // Fetch GPS logs within the requested range
        dailyGpsLogs = await fetchLogsPaginated(tStart, tEnd, 'staff_id, lat, lng, timestamp, speed, battery, is_mock');

        // We already filtered via DB, so logs = dailyGpsLogs
        const logs = dailyGpsLogs;

        // Remove existing history layers
        Object.values(historyPathLayers).forEach(layer => {
            if (map.hasLayer(layer)) map.removeLayer(layer);
        });
        historyPathLayers = {};

        // Important: Still update the Distance KPIs even if logs are empty (to show 0)
        calculateDistanceInRange(startInput, endInput);
        calculateMonthlyDistance(startInput, endInput);

        if (!logs || logs.length === 0) return;

        // Get which staff are currently checked in the filter panel
        const checkedStaffIds = new Set(
            [...document.querySelectorAll('.route-filter:checked')].map(cb => cb.value)
        );

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
            const color = getStaffColor(staffId).hex;

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
        if (visibleCoords.length > 1) {
            // Adjust padding based on screen size, on mobile don't pad as much
            const pad = window.innerWidth > 768 ? 50 : 20;
            map.fitBounds(visibleCoords, { padding: [pad, pad] });
        }
    } catch (e) {
        console.error("updatePathHistory Error:", e);
    } finally {
        toggleLoading(false);
    }
}

// Slider playback function
function scrubTimeHistory() {
    const slider = document.getElementById('time-slider');
    const display = document.getElementById('slider-time-display');
    const startInput = document.getElementById('history-start-date').value;
    const minsOffset = parseInt(slider.value, 10);

    if (!startInput) return;

    if (minsOffset >= sliderMaxMinutes && new Date(startInput).toDateString() === new Date().toDateString()) {
        display.textContent = 'ปัจจุบัน (Real-time)';
        display.className = 'ml-2 font-mono bg-blue-100 border border-blue-200 text-blue-800 px-2 py-0.5 rounded shadow-sm font-bold text-xs';

        // If returning from playback, reload normal live map state
        if (isHistoricalPlayback) {
            isHistoricalPlayback = false;
            loadMapData(); // Trigger full refresh to live
        }
        return;
    }

    isHistoricalPlayback = true;

    // Reconstruct start date at 00:00 as base time for adding minutes
    const startDateTime = new Date(`${startInput}T00:00:00+07:00`);
    const targetDateTime = new Date(startDateTime.getTime() + minsOffset * 60000);

    // Format display output e.g "12 มิ.ย. - 14:30 น."
    const formattedDisplay = targetDateTime.toLocaleString('th-TH', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    display.textContent = formattedDisplay + " น.";
    display.className = 'ml-2 font-mono bg-orange-100 border border-orange-200 text-orange-800 px-2 py-0.5 rounded shadow-sm font-bold text-xs';

    if (!dailyGpsLogs.length) return;

    const targetTimeMs = targetDateTime.getTime();

    // Checked staff filters
    const checkedStaffIds = new Set(
        [...document.querySelectorAll('.route-filter:checked')].map(cb => cb.value)
    );

    // Group logs by staff that was recorded BEFORE or EXACTLY AT the scrubbed time
    const latestLogsPerStaff = {};
    for (const log of dailyGpsLogs) {
        const logTime = new Date(log.timestamp).getTime();
        if (logTime <= targetTimeMs) {
            // Overwrite earlier logs with newer ones (since array is ascending order already)
            latestLogsPerStaff[log.staff_id] = log;
        }
    }

    // Update marker UI positions based on computed history
    for (const staff of allStaffs) {
        const isVisible = checkedStaffIds.size === 0 || checkedStaffIds.has(staff.id);
        const group = staffMapLayers[staff.id];
        const logData = latestLogsPerStaff[staff.id];

        if (group) group.clearLayers();

        if (logData && logData.lat && logData.lng && isVisible) {
            // Re-create group if missing (deleted earlier)
            if (!staffMapLayers[staff.id]) {
                staffMapLayers[staff.id] = L.layerGroup().addTo(map);
            }
            updateMarkerUI(staff, logData, true, targetTimeMs); // true = force history style, targetTimeMs used for idle detection
        }
    }

    updateOfflineStaffUI(latestLogsPerStaff, targetTimeMs);
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

    // Rerender offline UI if we are in history playback, or live
    if (isHistoricalPlayback) {
        scrubTimeHistory(); // Will re-evaluate offline UI with scrub time
    } else {
        loadLatestStaffLocations(); // Reweigh live statuses
    }
}

async function calculateDistanceInRange(startDate = null, endDate = null) {
    if (!supabaseClient) return;

    let tStart, tEnd;

    if (!startDate || !endDate) {
        // Fallback or default to TODAY in Asia/Bangkok
        const options = { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' };
        const today = new Date().toLocaleString('sv-SE', options).split(' ')[0];
        tStart = `${today}T00:00:00+07:00`;
        tEnd = `${today}T23:59:59+07:00`;
    } else {
        tStart = `${startDate}T00:00:00+07:00`;
        tEnd = `${endDate}T23:59:59+07:00`;
    }

    const logs = await fetchLogsPaginated(tStart, tEnd, 'staff_id, lat, lng, timestamp');

    if (!logs) return;
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

            calculateDistanceInRange(); // Update today total
            calculateMonthlyDistance(); // Update monthly total
        })
        .subscribe();
}

async function calculateMonthlyDistance(startDate = null, endDate = null) {
    if (!supabaseClient) return;

    const options = { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' };
    let tStart, tEnd;

    if (!startDate || !endDate) {
        // Default: Current full month
        const nowParts = new Date().toLocaleString('sv-SE', options).split(' ')[0].split('-');
        tStart = `${nowParts[0]}-${nowParts[1]}-01T00:00:00+07:00`;
        // Last day of current month
        const lastDay = new Date(nowParts[0], nowParts[1], 0).getDate();
        tEnd = `${nowParts[0]}-${nowParts[1]}-${String(lastDay).padStart(2, '0')}T23:59:59+07:00`;
    } else {
        // Expand range to cover ALL months involved from start to end
        const startParts = startDate.split('-');
        const endParts = endDate.split('-');
        
        tStart = `${startParts[0]}-${startParts[1]}-01T00:00:00+07:00`;
        
        // Find last day of the end month
        const lastDayOfEnd = new Date(endParts[0], endParts[1], 0).getDate();
        tEnd = `${endParts[0]}-${endParts[1]}-${String(lastDayOfEnd).padStart(2, '0')}T23:59:59+07:00`;
    }

    const logs = await fetchLogsPaginated(tStart, tEnd, 'staff_id, lat, lng, timestamp');

    if (!logs) return;
    const el = document.getElementById('stat-distance-monthly');
    if (!el) return;

    if (logs.length < 2) {
        el.textContent = '0';
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

    // Sum all staff distances for a monthly fleet total
    const totalKm = Object.values(distByStaff).reduce((sum, d) => sum + d.total, 0);
    el.textContent = totalKm.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
        alert("กรุณาเลือกไฟล์ CSV หรือ Excel และตรวจสอบให้มั่นใจว่าไฟล์มีข้อมูล");
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

        const rawPayload = excelDataToUpload.map(rawRow => {
            // First normalize keys to handle spaces and case sensitivity
            const row = {};
            for (let k in rawRow) {
                if (rawRow.hasOwnProperty(k)) {
                    // Remove quotes, trim spaces, lowercase
                    const cleanKey = k.replace(/["']/g, '').trim().toLowerCase();
                    row[cleanKey] = rawRow[k];
                }
            }

            // Prioritize Thai names FIRST (so 'name' column which might contain ERP ID is checked last)
            let name = row['ชื่อ'] || row['ชื่อลูกค้า'] || row['ชื่อร้าน'] || row['customer_name'] || row['customer name'] || row['name'] || null;
            let customer_code = row['ลูกค้า'] || row['รหัสลูกค้า'] || row['รหัส'] || row['customer_code'] || row['customer code'] || row['code'] || null;

            // Failsafe: if name is purely numeric and customer_code is null, they likely got swapped or "name" grabbed the code
            if (name && /^[0-9]+$/.test(String(name).trim()) && !customer_code) {
                customer_code = String(name).trim();
                name = null; // We'll try to guess the real name below

                // Try to find any column value that is a non-numeric string (likely the Thai name)
                for (let k in row) {
                    const val = String(row[k]).trim();
                    if (val && !/^[0-9.\-]+$/.test(val) && val !== row['staff_id'] && val !== row['สายวิ่ง'] && val !== row['ชื่อประเภทย่อยของลูกค้า'] && k !== 'staff_id' && k !== 'สายวิ่ง') {
                        name = val;
                        break;
                    }
                }
            }

            const lat = parseFloat(row['lat'] || row['latitude'] || row['ละติจูด']);
            const lng = parseFloat(row['lng'] || row['lon'] || row['longitude'] || row['ลองจิจูด']);

            return {
                name,
                customer_code,
                lat, lng,
                staff_id: row['staff_id'] || row['สายวิ่ง'] || null,
                customer_type: row['customer_type'] || row['ประเภท'] || row['ชื่อประเภทย่อยของลูกค้า'] || null,
                district: row['district'] || row['อำเภอ'] || row['อำเภอทางภูมิศ'] || null
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
            const logs = await fetchLogsPaginated(`${dateStr}T00:00:00+07:00`, `${dateStr}T23:59:59+07:00`, 'lat, lng, timestamp', sid);
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
            // Fallback to customer_name stored directly on visits if join fails
            const storeName = cust?.name || v.customer_name || `รหัส #${v.customer_id || '?'}`;
            const codeStr = cust?.customer_code ? ` (${cust.customer_code})` : '';
            const typeStr = cust?.customer_type ? ` ${cust.customer_type}` : '';
            const customerHtml = `
                <div class="leading-tight">
                    <div class="font-bold text-slate-700 text-[13px]">${storeName}<span class="font-normal text-slate-500">${codeStr}</span><span class="font-medium text-blue-600 text-[11px]">${typeStr}</span></div>
                    ${cust?.district ? `<div class="text-[10px] text-slate-400 mt-0.5"><i class="ph-regular ph-map-pin mr-0.5"></i>${cust.district}</div>` : ''}
                </div>
            `;

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

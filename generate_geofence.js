const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
// Using Anon Key now that RLS allows it
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

async function generateTerritories() {
    console.log("Fetching all customers...");

    // Pagination to bypass 1000 limit
    let allCusts = [];
    let start = 0;
    const PAGE_SIZE = 1000;
    while (true) {
        let { data, error } = await supabaseClient.from('customers')
            .select('staff_id, lat, lng')
            .not('lat', 'is', null)
            .range(start, start + PAGE_SIZE - 1);
        if (error) { console.error("Error:", error); return; }
        if (data) allCusts = allCusts.concat(data);
        if (!data || data.length < PAGE_SIZE) break;
        start += PAGE_SIZE;
    }

    console.log(`Found ${allCusts.length} total stores with coordinates.`);

    // Group by staff_id
    const storesByStaff = {};
    allCusts.forEach(c => {
        // Filter out nulls, undefined, and exact 0,0 coordinates
        if (!c.staff_id || c.lat == null || c.lng == null) return;
        if (Math.abs(c.lat) < 0.1 && Math.abs(c.lng) < 0.1) return; // Ignore 0,0 or near 0,0

        if (!storesByStaff[c.staff_id]) storesByStaff[c.staff_id] = [];
        storesByStaff[c.staff_id].push({ lat: c.lat, lng: c.lng });
    });

    const staffIds = Object.keys(storesByStaff);
    console.log(`Generating territories for ${staffIds.length} staff regions...`);

    for (const staffId of staffIds) {
        const points = storesByStaff[staffId];
        if (points.length < 3) {
            console.log(`Skipping ${staffId} (Needs at least 3 points to make a polygon, has ${points.length})`);
            continue;
        }

        const lats = points.map(p => p.lat);
        const lngs = points.map(p => p.lng);
        // Add a small buffer (approx 1-2km) around the outermost stores
        const buffer = 0.02; // Roughly 2km in decimal degrees
        const minLat = Math.min(...lats) - buffer;
        const maxLat = Math.max(...lats) + buffer;
        const minLng = Math.min(...lngs) - buffer;
        const maxLng = Math.max(...lngs) + buffer;

        // Create a GeoJSON Polygon (rectangle)
        // coordinates must be [longitude, latitude]
        const polygonCoords = [
            [
                [minLng, minLat],
                [minLng, maxLat],
                [maxLng, maxLat],
                [maxLng, minLat],
                [minLng, minLat] // Close the loop
            ]
        ];

        const geojsonObj = {
            type: "Polygon",
            coordinates: polygonCoords
        };

        const terrName = `${staffId}_AutoZone`;

        // 1. Check if territory exists
        let { data: existingTerr } = await supabaseClient.from('territories')
            .select('id').eq('name', terrName).single();

        let terrId;
        if (existingTerr) {
            terrId = existingTerr.id;
            // Update
            const { error: updErr } = await supabaseClient.from('territories').update({ geojson: geojsonObj }).eq('id', terrId);
            if (updErr) console.error("Update territory error:", updErr);
        } else {
            // Insert
            const { data: newTerr, error: insErr } = await supabaseClient.from('territories').insert({
                name: terrName,
                geojson: geojsonObj
            }).select('id').single();
            if (insErr) console.error("Insert territory error:", insErr);
            terrId = newTerr?.id;
        }

        if (!terrId) {
            console.error("Failed to create/get territory for", staffId);
            continue;
        }

        // 2. Map territory to staff natively
        // First check if mapping exists
        const { data: existMap } = await supabaseClient.from('staff_territories')
            .select('id')
            .eq('staff_id', staffId)
            .eq('territory_id', terrId)
            .single();

        if (!existMap) {
            const { error: mapErr } = await supabaseClient.from('staff_territories').insert({
                staff_id: staffId,
                territory_id: terrId
            });
            if (mapErr) console.error("Mapping error:", mapErr);
        }

        console.log(`✅ Generated Geofence for ${staffId} (${points.length} stores)`);
    }

    console.log("Done generating territories!");
}

generateTerritories();

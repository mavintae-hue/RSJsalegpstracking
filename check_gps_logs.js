const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';

async function fetchGpsLogs() {
    console.log("Checking gps_logs in DB...");
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/gps_logs?select=id,staff_id,lat,lng,timestamp&order=timestamp.desc&limit=10`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const data = await res.json();
        console.table(data);
    } catch (e) {
        console.error("Fetch failed:", e.message);
    }
}

fetchGpsLogs();

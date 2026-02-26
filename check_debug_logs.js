const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';

async function fetchDebugLogs() {
    console.log("Checking debug_logs...");
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/debug_logs?select=*&order=received_at.desc&limit=5`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        console.log("Debug logs response:", res.status);
        const data = await res.json();
        console.dir(data, { depth: null });
    } catch (e) {
        console.error("Fetch failed:", e.message);
    }
}

fetchDebugLogs();

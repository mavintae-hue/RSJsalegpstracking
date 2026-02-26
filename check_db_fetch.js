const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';

async function checkData() {
    console.log("Checking staffs...");
    let res = await fetch(`${SUPABASE_URL}/rest/v1/staffs`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    console.log("Staffs response:", res.status);
    let staffs = await res.json();
    console.log("Staffs data:", staffs);

    console.log("\nChecking gps_logs...");
    res = await fetch(`${SUPABASE_URL}/rest/v1/gps_logs?order=timestamp.desc&limit=5`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    console.log("GPS logs response:", res.status);
    let logs = await res.json();
    console.log("Recent GPS logs data:", logs);

    console.log("\nChecking visits...");
    res = await fetch(`${SUPABASE_URL}/rest/v1/visits?order=time_in.desc&limit=5`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    console.log("Visits response:", res.status);
    let visits = await res.json();
    console.log("Recent visits data:", visits);
}

checkData();

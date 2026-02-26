const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';

async function fixDB() {
    console.log("Inserting CT21 into staffs...");
    let res = await fetch(`${SUPABASE_URL}/rest/v1/staffs`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({
            id: 'CT21',
            name: 'พนักงานขาย CT21',
            color: 'blue'
        })
    });
    console.log("Insert Staff CT21 response:", res.status);
    try {
        let data = await res.json();
        console.log("Data:", data);
    } catch (e) { console.log(e.message); }

    console.log("\nDeleting bad GPS logs (lat is null)...");
    res = await fetch(`${SUPABASE_URL}/rest/v1/gps_logs?lat=is.null`, {
        method: 'DELETE',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });
    console.log("Delete bad logs response:", res.status);

    // Deploying the functions might be necessary, but this script only touches DB.
}

fixDB();

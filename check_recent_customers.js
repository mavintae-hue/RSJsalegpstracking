const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';

async function checkRecentCustomers() {
    console.log("Checking recently added customers (last 20)...");
    try {
        let res = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=*&limit=20&order=id.desc`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        let data = await res.json();
        console.dir(data, { depth: null });
    } catch (e) {
        console.error("Fetch failed:", e.message);
    }
}

checkRecentCustomers();

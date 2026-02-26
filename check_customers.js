const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';

async function checkCustomers() {
    console.log("Checking customers...");
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=*`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const data = await res.json();
        console.log("Total Customers:", data.length);
        console.dir(data.slice(0, 3), { depth: null });
    } catch (e) {
        console.error("Fetch failed:", e.message);
    }
}

checkCustomers();

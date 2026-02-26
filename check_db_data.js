const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';

async function queryTables() {
    console.log("Checking customers...");
    try {
        let res = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=*&limit=10`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        let data = await res.json();
        console.dir(data, { depth: null });

        console.log("\nChecking visits with customer info limit 5...");
        res = await fetch(`${SUPABASE_URL}/rest/v1/visits?select=*,customers(id,name,customer_code)&limit=5&order=time_in.desc`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        data = await res.json();
        console.dir(data, { depth: null });

    } catch (e) {
        console.error("Fetch failed:", e.message);
    }
}

queryTables();

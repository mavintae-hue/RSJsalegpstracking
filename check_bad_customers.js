const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';

async function checkBadCustomers() {
    console.log("Checking customers where customer_code is null and name is a number...");
    try {
        let res = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=*&customer_code=is.null&limit=5`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        let data = await res.json();
        console.dir(data.filter(c => /^[0-9]+$/.test(c.name)), { depth: null });
    } catch (e) {
        console.error("Fetch failed:", e.message);
    }
}

checkBadCustomers();

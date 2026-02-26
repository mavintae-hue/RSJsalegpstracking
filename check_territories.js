const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';

async function checkData() {
    try {
        let res = await fetch(`${SUPABASE_URL}/rest/v1/territories?select=*`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        let data = await res.json();
        console.dir(data, { depth: null });
    } catch (e) {
        console.error(e);
    }
}
checkData();

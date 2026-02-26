const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkData() {
    console.log("Checking territories...");
    const { data: territories } = await supabaseClient.from('territories').select('*');
    console.log("Count:", territories ? territories.length : 0);
    console.log(territories);

    console.log("\nChecking staff mappings...");
    const { data: mappings } = await supabaseClient.from('staff_territories').select('*');
    console.log("Count:", mappings ? mappings.length : 0);
    console.log(mappings);
}

checkData();

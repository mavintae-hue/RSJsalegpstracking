const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkData() {
    console.log("Checking staffs...");
    const staffs = await supabase.from('staffs').select('*');
    console.log("Staffs count:", staffs.data?.length, "Error:", staffs.error);
    if (staffs.data) console.log(staffs.data);

    console.log("\nChecking gps_logs...");
    const logs = await supabase.from('gps_logs').select('*').order('timestamp', { ascending: false }).limit(5);
    console.log("Recent GPS logs count:", logs.data?.length, "Error:", logs.error);
    if (logs.data) console.log(logs.data);

    console.log("\nChecking visits...");
    const visits = await supabase.from('visits').select('*').order('time_in', { ascending: false }).limit(5);
    console.log("Recent visits count:", visits.data?.length, "Error:", visits.error);
    if (visits.data) console.log(visits.data);
}

checkData();

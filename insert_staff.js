const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PIeG5dutR75P4xnAVY_59g_J4cvJZOL';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function insertStaff() {
    // List from user: CT22,23,24,25,26,27,28,33,34,35,36,37,38,39,40,41
    const staffIds = [
        'CT22', 'CT23', 'CT24', 'CT25', 'CT26', 'CT27', 'CT28',
        'CT33', 'CT34', 'CT35', 'CT36', 'CT37', 'CT38', 'CT39', 'CT40', 'CT41'
    ];

    const colors = ['blue', 'orange', 'purple', 'teal', 'amber'];

    const staffData = staffIds.map((id, index) => ({
        id: id,
        name: id,
        color: colors[index % colors.length]
    }));

    console.log(`Attempting to insert ${staffData.length} new staff members...`);

    const { data, error } = await supabase
        .from('staffs')
        .upsert(staffData, { onConflict: 'id' }) // Use upsert to avoid duplicate errors
        .select();

    if (error) {
        console.error("Error inserting staff:", error);
    } else {
        console.log("Successfully inserted/updated staff:");
        console.log(data.map(s => s.id).join(', '));
    }
}

insertStaff();

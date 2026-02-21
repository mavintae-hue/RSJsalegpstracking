require('dotenv').config();
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const ADMIN_LINE_USER_ID = process.env.ADMIN_LINE_USER_ID;

// Helper to send LINE Message
async function sendLineMessage(text) {
    if (!LINE_ACCESS_TOKEN || !ADMIN_LINE_USER_ID) {
        console.log("LINE credentials missing, skipping notification:", text);
        return;
    }

    try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
            },
            body: JSON.stringify({
                to: ADMIN_LINE_USER_ID,
                messages: [{ type: 'text', text }]
            })
        });
        const result = await response.json();
        console.log("LINE API Response:", result);
    } catch (error) {
        console.error("Error sending LINE message:", error);
    }
}

// ==========================================
// 1. OUT OF TERRITORY REALTIME CHECK (Runs every 10 mins)
// ==========================================
cron.schedule('*/10 * * * *', async () => {
    console.log('Running territory check cron...');
    try {
        // Calling the RPC function we created in Supabase
        const { data: outOfBounds, error } = await supabase.rpc('get_out_of_territory_staffs');

        if (error) throw error;

        if (outOfBounds && outOfBounds.length > 0) {
            let message = "⚠️ [แจ้งเตือน] พนักงานออกนอกพื้นที่รับผิดชอบ:\n";
            outOfBounds.forEach(staff => {
                message += `- ${staff.staff_name} (สาย ${staff.staff_id}) ออกนอกเขต ${staff.territory_name}\n`;
            });
            await sendLineMessage(message);
        }
    } catch (error) {
        console.error('Territory Check Error:', error);
    }
});

// ==========================================
// 2. DAILY SUMMARY REPORT (Runs at 18:00 every day)
// ==========================================
cron.schedule('0 18 * * *', async () => {
    console.log('Running daily summary report cron...');
    try {
        // Fetch visits for today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        const { data: visits, error } = await supabase
            .from('visits')
            .select(`
        visit_type,
        staff_id,
        staffs ( name ),
        customers ( name )
      `)
            .gte('time_in', todayISO);

        if (error) throw error;

        let summary = "📊 [รายงานสรุปประจำวัน]\n";
        summary += `ยอดเข้าเยี่ยมวันนี้: ${visits.length} รายการ\n\n`;

        // Group by staff
        const staffStats = {};
        visits.forEach(v => {
            const name = v.staffs ? v.staffs.name : v.staff_id;
            if (!staffStats[name]) {
                staffStats[name] = { real: 0, driveBy: 0 };
            }
            if (v.visit_type === 'Real Visit') staffStats[name].real++;
            if (v.visit_type === 'Drive-by') staffStats[name].driveBy++;
        });

        for (const [name, stat] of Object.entries(staffStats)) {
            summary += `👨‍💼 ${name}:\n - เยี่ยมจริง: ${stat.real}\n - Drive-by: ${stat.driveBy}\n`;
        }

        await sendLineMessage(summary);

    } catch (error) {
        console.error('Daily Summary Error:', error);
    }
});

console.log("Cron service initialized. Waiting for schedules...");

// Keep process running if executing directly
// setInterval(() => {}, 1000 * 60 * 60);

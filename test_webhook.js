const WEBHOOK_URL = 'https://uwjkhwourxvjgosrwgxx.supabase.co/functions/v1/traccar-webhook';

async function testWebhook() {
    console.log("Sending simulated Background Geolocation JSON to Edge Function...");

    const payload = {
        "location": {
            "uuid": "CT21",
            "coords": {
                "latitude": 13.7563,
                "longitude": 100.5018,
                "speed": 45.5
            },
            "battery": {
                "level": 0.85
            },
            "is_mock": false
        }
    };

    try {
        const res = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const text = await res.text();
        console.log(`Response Status: ${res.status}`);
        console.log(`Response Body: ${text}`);
    } catch (e) {
        console.error("Fetch failed:", e.message);
    }
}

testWebhook();

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase client
// NOTE: Provide these variables in a .env file
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Need service role to insert securely

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// RECEIVE TRACCAR LOCATION (OSMand Protocol)
// ==========================================
// Example from Traccar Client HTTP GET:
// /api/location?id=123&lat=13.0&lon=100.0&batt=90&speed=40&mock=false
app.get('/api/location', async (req, res) => {
  try {
    const { id, lat, lon, batt, speed, mock } = req.query;

    if (!id || !lat || !lon) {
      return res.status(400).send("Missing required parameters: id, lat, lon");
    }

    // Convert values
    const staff_id = id;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    const battery = batt ? parseInt(batt, 10) : null;
    const currentSpeed = speed ? parseFloat(speed) : null;
    
    // Some Traccar clients might send mock as string like "true", "false", or 1, 0
    const is_mock = mock === 'true' || mock === '1';

    // Insert into Supabase gps_logs
    // The PostGIS geom column is automatically calculated if we wrote a trigger,
    // OR we can explicitly pass it. Let's send lat and lng and let our 
    // DB logic handle the `geom` creation later or we can compute it here.
    
    // We update the DB trigger in phase 3, but for now we'll just insert lat/lng.
    const { data, error } = await supabase
      .from('gps_logs')
      .insert([
        { 
          staff_id, 
          lat: latitude, 
          lng: longitude, 
          battery, 
          speed: currentSpeed, 
          is_mock,
          geom: `POINT(${longitude} ${latitude})` // Passing WKT (Well-Known Text) for PostGIS
        }
      ]);

    if (error) {
      console.error("Error inserting GPS log to Supabase:", error);
      return res.status(500).send("Database Error");
    }

    // Optionally: Update staffs table to ensure the staff exists, preventing FK constraints error
    // (This step depends on how strict your DB design is. We assumed staffs are pre-populated)

    res.status(200).send("OK");
  } catch (err) {
    console.error("API Error:", err);
    res.status(500).send("Server Error");
  }
});

// Basic health check route
app.get('/', (req, res) => {
  res.send('RSJ Sales GPS Tracking API is running.');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

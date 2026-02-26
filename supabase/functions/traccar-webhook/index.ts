import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    let body = {}

    // Log raw request for debugging purposes
    let rawText = '';
    if (req.method === 'POST') {
      try {
        rawText = await req.text();
        if (rawText) {
          try { body = JSON.parse(rawText); } catch (e) { }
        }
      } catch (e) {
        console.error("Failed to read raw text:", e);
      }
    }

    // Save everything to debug_logs to see what phone is actually sending
    const supabaseDebug = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    await supabaseDebug.from('debug_logs').insert({
      url: req.url,
      method: req.method,
      headers: JSON.stringify(Object.fromEntries(req.headers.entries())),
      body: rawText || JSON.stringify(body)
    });

    // Support both URL parameters (OsmAnd) and JSON body
    // Some background-geolocation plugins send location inside a 'location' object or directly in root
    const loc = body.location || body;
    const coords = loc.coords || loc;

    // Traccar OsmAnd uses id, lat, lon. 
    // Background-geolocation might use uuid, latitude, longitude
    let paramLat = url.searchParams.get('lat');
    let paramLon = url.searchParams.get('lon');
    let paramBatt = url.searchParams.get('batt');
    let paramSpeed = url.searchParams.get('speed');

    // Ignore literal placeholder strings like "{lat}"
    if (paramLat?.includes('{')) paramLat = null;
    if (paramLon?.includes('{')) paramLon = null;
    if (paramBatt?.includes('{')) paramBatt = null;
    if (paramSpeed?.includes('{')) paramSpeed = null;

    const id = url.searchParams.get('id') || body.id || loc.uuid || loc.id || null;
    const latStr = paramLat || coords.latitude || coords.lat;
    const lonStr = paramLon || coords.longitude || coords.lon;
    const battStr = paramBatt || body.battery?.level || loc.battery || loc.battery_level;
    const speedStr = paramSpeed || coords.speed;
    const mockStr = url.searchParams.get('mock') || loc.is_mock;

    if (!id || latStr === undefined || lonStr === undefined) {
      console.error("Missing parameters:", { id, latStr, lonStr });
      return new Response(
        "Missing required parameters: id, lat, lon",
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    const staff_id = id
    const latitude = typeof latStr === 'string' ? parseFloat(latStr) : Number(latStr);
    const longitude = typeof lonStr === 'string' ? parseFloat(lonStr) : Number(lonStr);

    // Validate coordinates to prevent NaN
    if (isNaN(latitude) || isNaN(longitude)) {
      console.error("Invalid coordinates resulting in NaN:", { latStr, lonStr });
      return new Response(
        "Invalid coordinates",
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    // Some batteries are 0-1, some are 0-100
    let battery = null;
    if (battStr !== undefined && battStr !== null) {
      const b = typeof battStr === 'string' ? parseFloat(battStr) : Number(battStr);
      if (!isNaN(b)) {
        battery = b <= 1.0 && b > 0 ? Math.round(b * 100) : Math.round(b);
      }
    }

    let currentSpeed = null;
    if (speedStr !== undefined && speedStr !== null) {
      const s = typeof speedStr === 'string' ? parseFloat(speedStr) : Number(speedStr);
      if (!isNaN(s)) {
        currentSpeed = s;
      }
    }

    const is_mock = mockStr === 'true' || mockStr === '1' || mockStr === true;

    // Use the built-in Supabase service role key if available, else anon
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? 'https://uwjkhwourxvjgosrwgxx.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    console.log(`Inserting GPS logs for: ${staff_id} at ${latitude}, ${longitude}`);

    // Insert into Supabase gps_logs
    const { error } = await supabaseClient
      .from('gps_logs')
      .insert([
        {
          staff_id,
          lat: latitude,
          lng: longitude,
          battery,
          speed: currentSpeed,
          is_mock,
          geom: `POINT(${longitude} ${latitude})`
        }
      ])

    if (error) {
      console.error("Supabase Insert Error Object:", JSON.stringify(error, null, 2))
      return new Response(
        JSON.stringify({ error: "Database Error", details: error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      "OK",
      { headers: { ...corsHeaders, 'Content-Type': 'text/plain' } },
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("API Exception Error:", errorMessage)
    return new Response(
      JSON.stringify({ error: "Server Error", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

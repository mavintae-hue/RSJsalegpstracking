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
    const id = url.searchParams.get('id')
    const lat = url.searchParams.get('lat')
    const lon = url.searchParams.get('lon')
    const batt = url.searchParams.get('batt')
    const speed = url.searchParams.get('speed')
    const mock = url.searchParams.get('mock')

    if (!id || !lat || !lon) {
      return new Response(
        "Missing required parameters: id, lat, lon",
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    const staff_id = id
    const latitude = parseFloat(lat)
    const longitude = parseFloat(lon)
    const battery = batt ? parseInt(batt, 10) : null
    const currentSpeed = speed ? parseFloat(speed) : null
    const is_mock = mock === 'true' || mock === '1'

    // Use the built-in Supabase service role key if available, else anon
    // This requires setting the secret in the Supabase Dashboard
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? 'https://uwjkhwourxvjgosrwgxx.supabase.co',
      Deno.env.get('SUPABASESERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

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

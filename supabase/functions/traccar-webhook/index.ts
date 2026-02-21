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

    // Create a Supabase client with the Service Role key to securely insert data
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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
      console.error("Error inserting GPS log to Supabase:", error)
      return new Response(
        "Database Error",
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    return new Response(
      "OK",
      { headers: { ...corsHeaders, 'Content-Type': 'text/plain' } },
    )
  } catch (error) {
    console.error("API Error:", error)
    return new Response(
      "Server Error",
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
    )
  }
})

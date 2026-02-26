-- Script to create a view for fetching territories as GeoJSON
CREATE OR REPLACE VIEW public.territories_geojson AS
SELECT 
    id, 
    name, 
    ST_AsGeoJSON(geom)::json AS geojson
FROM public.territories
WHERE geom IS NOT NULL;

-- Make sure public can read the view
ALTER VIEW public.territories_geojson OWNER TO postgres;
GRANT SELECT ON public.territories_geojson TO anon, authenticated;

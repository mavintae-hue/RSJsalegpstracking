ALTER TABLE public.territories 
ADD COLUMN IF NOT EXISTS geojson JSONB;

-- Keep geom and geojson in sync
CREATE OR REPLACE FUNCTION sync_territory_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.geojson IS NOT NULL THEN
        -- Convert GeoJSON Polygon to PostGIS geometry
        NEW.geom = ST_SetSRID(ST_GeomFromGeoJSON(NEW.geojson::text), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_territory_geom ON public.territories;
CREATE TRIGGER trigger_sync_territory_geom
BEFORE INSERT OR UPDATE ON public.territories
FOR EACH ROW
EXECUTE FUNCTION sync_territory_geom();

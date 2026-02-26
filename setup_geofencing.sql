-- 1. Create mapping table for Staff to Territories
CREATE TABLE IF NOT EXISTS public.staff_territories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    staff_id text NOT NULL, -- The staff ID (e.g. 'CT21')
    territory_id uuid REFERENCES public.territories(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(staff_id, territory_id) -- Prevent duplicate mapping
);

-- Enable RLS but allow anon to read/write for now
ALTER TABLE public.staff_territories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for anonymous users" ON public.staff_territories FOR ALL TO anon USING (true) WITH CHECK (true);

-- 2. Add in_territory flag to gps_logs
ALTER TABLE public.gps_logs
ADD COLUMN IF NOT EXISTS in_territory boolean DEFAULT true;

-- 3. Create geo-fencing check function
CREATE OR REPLACE FUNCTION public.check_staff_geofence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    staff_has_territory boolean;
    is_inside_territory boolean;
BEGIN
    -- Only process if we have valid coordinates
    IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
        RETURN NEW;
    END IF;

    -- Create point geometry from incoming lat/lng
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;

    -- Check if this staff member is assigned to ANY territory
    SELECT EXISTS (
        SELECT 1 FROM public.staff_territories WHERE staff_id = NEW.staff_id
    ) INTO staff_has_territory;

    -- Ifstaff isn't assigned to a territory, we assume they are always "in bounds"
    IF NOT staff_has_territory THEN
        NEW.in_territory := true;
        RETURN NEW;
    END IF;

    -- Check if the staff's new location is INSIDE any of their assigned territories
    SELECT EXISTS (
        SELECT 1 
        FROM public.staff_territories st
        JOIN public.territories t ON st.territory_id = t.id
        WHERE st.staff_id = NEW.staff_id
        -- Use ST_Intersects or ST_Covers to check if the point falls inside the GeoJSON polygon
        AND ST_Intersects(NEW.geom::geometry, ST_GeomFromGeoJSON(t.geojson))
    ) INTO is_inside_territory;

    -- Set the flag
    NEW.in_territory := is_inside_territory;

    RETURN NEW;
END;
$$;

-- 4. Attach trigger to gps_logs table (Trigger fires BEFORE INSERT so it can modify NEW.in_territory)
DROP TRIGGER IF EXISTS trg_check_geofence ON public.gps_logs;
CREATE TRIGGER trg_check_geofence
    BEFORE INSERT ON public.gps_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.check_staff_geofence();

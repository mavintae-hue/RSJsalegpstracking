-- Enable the PostGIS extension if it doesn't already exist
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Table: staffs
CREATE TABLE IF NOT EXISTS public.staffs (
    id TEXT PRIMARY KEY, -- สายวิ่ง (e.g., CT21)
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3B82F6', -- Default color for map markers
    territory TEXT
);

-- 2. Table: customers
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    geom geometry(Point, 4326)
);

-- Index for customers geom
CREATE INDEX IF NOT EXISTS customers_geom_idx ON public.customers USING GIST (geom);

-- 3. Table: gps_logs
CREATE TABLE IF NOT EXISTS public.gps_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    staff_id TEXT REFERENCES public.staffs(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    geom geometry(Point, 4326),
    battery INTEGER,
    speed DOUBLE PRECISION,
    is_mock BOOLEAN DEFAULT false,
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- Index for gps_logs geom
CREATE INDEX IF NOT EXISTS gps_logs_geom_idx ON public.gps_logs USING GIST (geom);
-- Index for timestamp and staff_id to speed up real-time queries
CREATE INDEX IF NOT EXISTS gps_logs_staff_time_idx ON public.gps_logs(staff_id, timestamp DESC);

-- 4. Table: visits
CREATE TABLE IF NOT EXISTS public.visits (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    staff_id TEXT REFERENCES public.staffs(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    time_in TIMESTAMPTZ NOT NULL DEFAULT now(),
    time_out TIMESTAMPTZ,
    duration_mins INTEGER,
    visit_type TEXT CHECK (visit_type IN ('Drive-by', 'Real Visit', 'Pending')) DEFAULT 'Pending'
);

-- 5. Table: territories
CREATE TABLE IF NOT EXISTS public.territories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    geom geometry(Polygon, 4326)
);

-- Index for territories geom
CREATE INDEX IF NOT EXISTS territories_geom_idx ON public.territories USING GIST (geom);

-- Optional: Create a function to convert lat/lng to point automatically when inserting into customers
-- This makes upserting from the frontend easier
CREATE OR REPLACE FUNCTION set_customer_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_customer_geom
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION set_customer_geom();

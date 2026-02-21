-- ==========================================
-- GEOFENCING & DRIVE-BY LOGIC (PostgreSQL Functions)
-- ==========================================

-- 1. Helper function to calculate duration if an employee is currently visiting a customer
CREATE OR REPLACE FUNCTION process_gps_geofence()
RETURNS TRIGGER AS $$
DECLARE
    nearby_customer RECORD;
    active_visit RECORD;
    duration_interval INTERVAL;
    visit_duration_mins INTEGER;
    is_outside_territory BOOLEAN;
BEGIN
    -- STEP A: OUT-OF-TERRITORY CHECK
    -- Assuming staffs.territory matches a territories.name
    SELECT NOT ST_Contains(t.geom, NEW.geom) INTO is_outside_territory
    FROM territories t
    JOIN staffs s ON s.territory = t.name
    WHERE s.id = NEW.staff_id;

    -- If out of territory, you might eventually flag this in a separate table,
    -- but for now we just compute it. The node cron job will alert daily or realtime.

    -- STEP B: FIND NEARBY CUSTOMERS (within 40 meters)
    -- ST_DWithin uses spatial ref units. For 4326 (degrees), casting to geography calculates in meters!
    SELECT * INTO nearby_customer
    FROM customers c
    WHERE ST_DWithin(c.geom::geography, NEW.geom::geography, 40)
    ORDER BY ST_Distance(c.geom::geography, NEW.geom::geography) ASC
    LIMIT 1;

    -- STEP C: VISIT TRACKING LOGIC
    IF FOUND THEN
        -- There is a customer within 40m
        
        -- Check if there is an ongoing 'Pending' visit for this staff + customer
        SELECT * INTO active_visit
        FROM visits
        WHERE staff_id = NEW.staff_id
          AND customer_id = nearby_customer.id
          AND time_out IS NULL
        ORDER BY time_in DESC
        LIMIT 1;

        IF NOT FOUND THEN
            -- START A NEW VISIT
            INSERT INTO visits (staff_id, customer_id, time_in)
            VALUES (NEW.staff_id, nearby_customer.id, NEW.timestamp);
        END IF;

        -- If they are near *this* customer, we must close out any *other* pending visits they had
        -- (e.g., they teleported or missed an update)
        UPDATE visits
        SET 
            time_out = NEW.timestamp,
            duration_mins = EXTRACT(EPOCH FROM (NEW.timestamp - time_in)) / 60,
            visit_type = CASE WHEN (EXTRACT(EPOCH FROM (NEW.timestamp - time_in)) / 60) < 5 THEN 'Drive-by' ELSE 'Real Visit' END
        WHERE staff_id = NEW.staff_id
          AND customer_id != nearby_customer.id
          AND time_out IS NULL;

    ELSE
        -- No customer within 40m. 
        -- This means the staff left the customer. Close ALL open/pending visits for this staff.
        UPDATE visits
        SET 
            time_out = NEW.timestamp,
            duration_mins = EXTRACT(EPOCH FROM (NEW.timestamp - time_in)) / 60,
            visit_type = CASE WHEN (EXTRACT(EPOCH FROM (NEW.timestamp - time_in)) / 60) < 5 THEN 'Drive-by' ELSE 'Real Visit' END
        WHERE staff_id = NEW.staff_id
          AND time_out IS NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger on gps_logs inserts
DROP TRIGGER IF EXISTS tr_process_gps_geofence ON gps_logs;
CREATE TRIGGER tr_process_gps_geofence
AFTER INSERT ON gps_logs
FOR EACH ROW
EXECUTE FUNCTION process_gps_geofence();

-- ==========================================
-- RPC for querying Out-Of-Territory directly
-- ==========================================
-- This function can be called via Supabase JS client
-- supabase.rpc('get_out_of_territory_staffs')
CREATE OR REPLACE FUNCTION get_out_of_territory_staffs()
RETURNS TABLE (
    staff_id TEXT,
    staff_name TEXT,
    log_time TIMESTAMPTZ,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    territory_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH LatestGPS AS (
        SELECT DISTINCT ON (g.staff_id) 
            g.staff_id, g.lat, g.lng, g.geom, g.timestamp
        FROM gps_logs g
        ORDER BY g.staff_id, g.timestamp DESC
    )
    SELECT
        lg.staff_id,
        s.name AS staff_name,
        lg.timestamp AS log_time,
        lg.lat,
        lg.lng,
        s.territory AS territory_name
    FROM LatestGPS lg
    JOIN staffs s ON lg.staff_id = s.id
    JOIN territories t ON s.territory = t.name
    WHERE NOT ST_Contains(t.geom, lg.geom);
END;
$$ LANGUAGE plpgsql;

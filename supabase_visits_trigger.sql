-- Function to automatically handle visit logic on new GPS logs
CREATE OR REPLACE FUNCTION process_gps_log_to_visit()
RETURNS TRIGGER AS $$
DECLARE
    nearest_customer RECORD;
    active_visit RECORD;
    visit_duration INTEGER;
BEGIN
    -- Only process if we have valid coordinates
    IF NEW.geom IS NULL THEN
        RETURN NEW;
    END IF;

    -- 1. Find the nearest customer within 40 meters assigned specifically to this staff member
    -- ST_DWithin uses meters when casting to geography
    SELECT id, name, geom, ST_Distance(NEW.geom::geography, geom::geography) as dist
    INTO nearest_customer
    FROM public.customers
    WHERE ST_DWithin(NEW.geom::geography, geom::geography, 40)
      AND staff_id = NEW.staff_id
    ORDER BY geom <-> NEW.geom
    LIMIT 1;

    -- 2. Check if there's currently an active (Pending) visit for this staff
    SELECT * INTO active_visit
    FROM public.visits
    WHERE staff_id = NEW.staff_id AND time_out IS NULL
    ORDER BY time_in DESC
    LIMIT 1;

    -- SCENARIO A: Inside a customer radius
    IF nearest_customer.id IS NOT NULL THEN
        
        -- If an active visit exists
        IF active_visit.id IS NOT NULL THEN
            -- If it's the SAME customer, do nothing (still visiting)
            IF active_visit.customer_id = nearest_customer.id THEN
                -- Optionally update duration_mins dynamically here if needed
                -- UPDATE public.visits SET duration_mins = EXTRACT(EPOCH FROM (NEW.timestamp - time_in))/60 WHERE id = active_visit.id;
            ELSE
                -- It's a DIFFERENT customer. Close the old visit, and start a new one.
                visit_duration := EXTRACT(EPOCH FROM (NEW.timestamp - active_visit.time_in)) / 60;
                
                UPDATE public.visits
                SET time_out = NEW.timestamp,
                    duration_mins = visit_duration,
                    visit_type = CASE WHEN visit_duration < 10 THEN 'Drive-by' ELSE 'Real Visit' END
                WHERE id = active_visit.id;

                -- Start new visit for the new customer
                INSERT INTO public.visits (staff_id, customer_id, time_in)
                VALUES (NEW.staff_id, nearest_customer.id, NEW.timestamp);
            END IF;
            
        -- If NO active visit exists, start a new one
        ELSE
            INSERT INTO public.visits (staff_id, customer_id, time_in)
            VALUES (NEW.staff_id, nearest_customer.id, NEW.timestamp);
        END IF;

    -- SCENARIO B: Outside any customer radius
    ELSE
        -- If there was an active visit, the staff just left the radius. Close it.
        IF active_visit.id IS NOT NULL THEN
            visit_duration := EXTRACT(EPOCH FROM (NEW.timestamp - active_visit.time_in)) / 60;
            
            UPDATE public.visits
            SET time_out = NEW.timestamp,
                duration_mins = visit_duration,
                visit_type = CASE WHEN visit_duration < 10 THEN 'Drive-by' ELSE 'Real Visit' END
            WHERE id = active_visit.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to execute the function after every insertion into gps_logs
DROP TRIGGER IF EXISTS trigger_process_gps_visit ON public.gps_logs;
CREATE TRIGGER trigger_process_gps_visit
AFTER INSERT ON public.gps_logs
FOR EACH ROW
EXECUTE FUNCTION process_gps_log_to_visit();

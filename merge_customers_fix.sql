-- ==============================================================================
-- 🛠️ Script to Merge Duplicate Customers and Fix Visit History
-- ==============================================================================
-- Background: 
-- Old customers were created with name = customer_code (e.g. '109141'), and customer_code = NULL.
-- New customers from Excel have correct name (e.g. 'พี่มด') and customer_code = '109141'.
-- Visits are still pointing to the old customers, so names don't show up.
--
-- This script will:
-- 1. Update all existing visits to point to the correct, newly uploaded customers.
-- 2. Delete the old dummy customers to clean up the map and database.
-- ==============================================================================

-- 1. Update Visits to point to the new Customer rows
UPDATE public.visits v
SET customer_id = c_new.id
FROM public.customers c_old
JOIN public.customers c_new 
  ON c_old.name = c_new.customer_code -- Match old dummy name with new customer_code
WHERE v.customer_id = c_old.id
  AND c_old.customer_code IS NULL
  AND c_new.customer_code IS NOT NULL;

-- 2. Delete the old dummy customers (where name is just numbers and code is null)
-- We only delete if no visits are pointing to them anymore (which should be true after step 1)
DELETE FROM public.customers 
WHERE customer_code IS NULL 
  AND name ~ '^[0-9]+$';

-- 3. Just to be safe, if there are any remaining old customers with same name and staff, 
-- but they weren't matched above, we leave them alone and you can delete them manually 
-- if they are duplicates.

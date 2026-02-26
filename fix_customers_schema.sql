-- ============================================================
-- Fix customers table: add missing columns (name, customer_code)
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add customer_code column if missing
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS customer_code TEXT;

-- 2. Make sure name column exists (it should, but just in case)
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS name TEXT;

-- 3. Add unique index on customer_code (needed for upsert onConflict:'customer_code')
CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_key
ON public.customers (customer_code)
WHERE customer_code IS NOT NULL;

-- 4. Verify current columns (optional check)
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'customers' ORDER BY ordinal_position;

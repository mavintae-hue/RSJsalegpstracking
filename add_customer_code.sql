-- Step 1: Add customer_code column if not exists
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS customer_code TEXT;

-- Step 2: Add unique constraint on customer_code so upsert can use it as conflict key
-- (Drop old unique constraint on name first if needed)
ALTER TABLE public.customers
ADD CONSTRAINT customers_customer_code_key UNIQUE (customer_code);

COMMENT ON COLUMN public.customers.customer_code IS 'รหัสลูกค้า (ลูกค้า column from Excel) - unique per store';

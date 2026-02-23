-- Add customer_code column to store the 'ลูกค้า' (customer ID/code) from Excel
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS customer_code TEXT;

-- Optional: add a comment for clarity
COMMENT ON COLUMN public.customers.customer_code IS 'รหัสลูกค้า (ลูกค้า column from Excel)';

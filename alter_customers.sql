ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS staff_id text,
ADD COLUMN IF NOT EXISTS customer_type text,
ADD COLUMN IF NOT EXISTS district text;

ALTER TABLE public.customers ADD CONSTRAINT customers_name_key UNIQUE (name);

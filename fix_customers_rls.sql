-- Fix RLS policy for customers table to allow anon inserts
CREATE POLICY "Enable insert for anonymous users" 
ON public.customers 
FOR INSERT 
TO anon 
WITH CHECK (true);

-- Fix RLS policy for customers table to allow anon updates (for upsert)
CREATE POLICY "Enable update for anonymous users" 
ON public.customers 
FOR UPDATE 
TO anon 
USING (true) 
WITH CHECK (true);

-- Script to insert new CT staff routes into the RSJ Tracking Database
-- You can copy and paste this into the Supabase SQL Editor and click 'Run'.

INSERT INTO public.staffs (id, name, color)
VALUES
    ('CT22', 'CT22', 'blue'),
    ('CT23', 'CT23', 'orange'),
    ('CT24', 'CT24', 'purple'),
    ('CT25', 'CT25', 'teal'),
    ('CT26', 'CT26', 'amber'),
    ('CT27', 'CT27', 'blue'),
    ('CT28', 'CT28', 'orange'),
    ('CT33', 'CT33', 'purple'),
    ('CT34', 'CT34', 'teal'),
    ('CT35', 'CT35', 'amber'),
    ('CT36', 'CT36', 'blue'),
    ('CT37', 'CT37', 'orange'),
    ('CT38', 'CT38', 'purple'),
    ('CT39', 'CT39', 'teal'),
    ('CT40', 'CT40', 'amber'),
    ('CT41', 'CT41', 'blue')
ON CONFLICT (id) DO NOTHING;

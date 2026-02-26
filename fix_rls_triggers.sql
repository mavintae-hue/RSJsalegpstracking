-- Script to fix RLS and Trigger issues

-- 1. สร้าง Policy ให้ Dashboard สามารถอ่านตาราง staffs, customers, gps_logs, และ visits ได้โดยไม่ติด RLS
ALTER TABLE public.staffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read staffs" ON public.staffs;
CREATE POLICY "Allow public read staffs" ON public.staffs FOR SELECT USING (true);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read customers" ON public.customers;
CREATE POLICY "Allow public read customers" ON public.customers FOR SELECT USING (true);

ALTER TABLE public.gps_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read gps_logs" ON public.gps_logs;
CREATE POLICY "Allow public read gps_logs" ON public.gps_logs FOR SELECT USING (true);

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read visits" ON public.visits;
CREATE POLICY "Allow public read visits" ON public.visits FOR SELECT USING (true);

-- อนุญาตให้ Insert ข้อมูล staffs และ customers หน้า Dashboard ได้
DROP POLICY IF EXISTS "Allow public insert staffs" ON public.staffs;
CREATE POLICY "Allow public insert staffs" ON public.staffs FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public insert customers" ON public.customers;
CREATE POLICY "Allow public insert customers" ON public.customers FOR ALL USING (true);

-- 2. ลบ Trigger ตัวที่ชนกันทิ้งให้เหลือเพียง "process_gps_log_to_visit"
DROP TRIGGER IF EXISTS tr_process_gps_geofence ON public.gps_logs;
DROP FUNCTION IF EXISTS process_gps_geofence();

-- 3. ตรวจสอบว่ามีข้อมูล CT21 หรือยัง ถ้าไม่มีให้สร้างเพื่อทดสอบ
INSERT INTO public.staffs (id, name, color, territory) 
VALUES ('CT21', 'พนักงานขาย ตัวอย่าง', 'blue', 'ส่วนกลาง')
ON CONFLICT (id) DO NOTHING;

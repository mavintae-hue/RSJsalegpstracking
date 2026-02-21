แผนพัฒนาระบบ RSJ ระบบติดตามพนักงานขาย (Supabase + Node.js + Traccar)

เอกสารฉบับนี้คือพิมพ์เขียว (Blueprint) สำหรับการพัฒนาระบบติดตามพนักงานขายแบบ Real-time โดยใช้เทคโนโลยีสมัยใหม่ เพื่อลดภาระการดูแล Server ด้วย Supabase และประยุกต์ใช้ความสามารถของ PostGIS ในการคำนวณพิกัดทางภูมิศาสตร์อย่างแม่นยำ พร้อมทั้งใช้ Node.js เป็น Backend หลักในการจัดการข้อมูล

1. ภาพรวมสถาปัตยกรรม (System Architecture)

Mobile App: Traccar Client (Android) ทำหน้าที่ส่งพิกัด, แบตเตอรี่, ความเร็ว, และสถานะ Fake GPS ทุกๆ 5 นาที

API Receiver: Node.js ทำหน้าที่รับ Webhook (HTTP GET/POST) จากแอป Traccar

Database: Supabase (PostgreSQL + PostGIS) ทำหน้าที่เก็บข้อมูลและคำนวณระยะทางเรขาคณิต (Geofencing)

Frontend Dashboard: HTML/Tailwind/Leaflet (ไฟล์ dashboard.html) ดึงข้อมูลผ่าน Supabase-js แบบ Real-time

Notification: LINE MESSAGING API ส่งสรุปรายงานการเข้าเยี่ยมและแจ้งเตือนกรณีออกนอกเขตรับผิดชอบผ่านระบบหลังบ้าน (Node.js)

2. โครงสร้างฐานข้อมูล (Database Schema)

ต้องเปิดใช้งาน Extension PostGIS ใน Supabase ก่อนสร้างตารางเหล่านี้:

staffs (พนักงานขาย)

id (สายวิ่ง - ใช้เป็น Primary Key), name (ชื่อคน), color, territory (พื้นที่ดูแล)

customers (ร้านค้า)

id, name, lat, lng, geom (Point - สำหรับ PostGIS)

gps_logs (ประวัติพิกัด)

id, staff_id (อ้างอิงสายวิ่ง), lat, lng, geom (Point), battery, speed, is_mock (Fake GPS), timestamp

visits (ประวัติการเข้าเยี่ยม)

id, staff_id, customer_id (รหัสร้านค้า), time_in, time_out, duration_mins, visit_type (Drive-by หรือ เยี่ยมจริง)

territories (พื้นที่ดูแล - ข้อมูลขอบเขตอำเภอ/จังหวัด)

id, name, geom (Polygon - ขอบเขตพื้นที่)

3. แผนการดำเนินการ (Implementation Plan)

Phase 1: Setup & Database (วันที่ 1)

[ ] สมัคร Supabase สร้าง Project ใหม่

[ ] เปิดใช้งาน PostGIS ในเมนู Database > Extensions

[ ] รัน SQL Script สร้างตารางทั้งหมด (ใช้ Prompt 1)

Phase 2: Data Receiver & Traccar (วันที่ 2)

[ ] ติดตั้งแอป Traccar Client บนมือถือ Android ของพนักงานขายเพื่อทดสอบ

[ ] สร้าง API Receiver ด้วย Node.js (Express) เพื่อรับค่าจาก Traccar แล้ว INSERT ลงตาราง gps_logs ใน Supabase (ใช้ Prompt 2)

Phase 3: Geofencing Logic & SQL Functions (วันที่ 3)

[ ] เขียน Database Trigger ใน Supabase: เมื่อมี Log ใหม่เข้ามา ให้เช็ก ST_DWithin (รัศมี 40m) และ ST_Contains (เช็กออกนอกพื้นที่ดูแล) (ใช้ Prompt 3)

[ ] เขียน Logic คัดกรอง Drive-by (< 5 นาที) และคำนวณระยะทางรวม (ST_Length)

Phase 4: Frontend Integration (วันที่ 4)

[ ] นำไฟล์ dashboard.html มาเชื่อมต่อกับ Supabase-js

[ ] ดึงข้อมูลพนักงานขาย, พิกัดล่าสุด, และเส้นทางย้อนหลังมาแสดงบนแผนที่

[ ] ทำระบบฟัง Real-time changes เพื่อให้ไอคอนรถขยับเองเมื่อมีพิกัดใหม่เข้ามา

Phase 5: Excel Upload & LINE MESSAGING API (วันที่ 5)

[ ] เขียนฟังก์ชันรับไฟล์ Excel จากหน้าเว็บ โยนเข้าตาราง customers (ใช้ Prompt 4)

[ ] ตั้งค่าการเชื่อมต่อกับ LINE Developer (Messaging API Channel)

[ ] ตั้งค่า Cron Job บน Node.js (เช่น ใช้ node-cron) ให้ยิงแจ้งเตือนสรุปรายวันไปยังผู้ดูแลระบบผ่าน LINE MESSAGING API (ใช้ Prompt 5)

4. ชุดคำสั่งสำหรับให้ AI เขียนโค้ด (AI Prompts)

เพื่อให้ AI เขียนโค้ดได้แม่นยำและไม่หลงทาง แนะนำให้ค่อยๆ สั่งทีละส่วนตามนี้ครับ:

Prompt 1: สร้าง Database และเปิดใช้ PostGIS

Prompt: "ฉันกำลังทำโปรเจกต์ RSJ ระบบติดตามพนักงานขายด้วย Supabase ช่วยเขียน SQL Script สำหรับสร้างตารางต่อไปนี้ให้หน่อย โดยต้องรองรับ PostGIS extension ด้วย

ตาราง staffs (พนักงานขาย: มี id เป็นสายวิ่ง, name เป็นชื่อคน, territory เป็นพื้นที่ดูแล)

ตาราง customers (ร้านค้า: มี id, name ชื่อร้าน, พิกัด lat, lng, และคอลัมน์ geom ชนิด POINT)

ตาราง gps_logs (เชื่อมกับสายวิ่งใน staffs, มี lat, lng, geom ชนิด POINT, battery, speed, is_mock_location แบบ boolean, และ timestamp)

ตาราง visits (เก็บเวลาเข้า-ออกร้านค้า, ระยะเวลา duration_mins, และสถานะว่าเป็น Drive-by หรือ เยี่ยมจริง)
ขอแบบมีคำสั่ง CREATE INDEX สำหรับคอลัมน์ geom เพื่อให้ค้นหาพิกัดแผนที่ได้เร็วๆ ด้วย"

Prompt 2: สร้างตัวรับข้อมูลจาก Traccar (API Receiver)

Prompt: "ฉันต้องการรับข้อมูลจากแอปมือถือ Android (Traccar Client) ซึ่งจะส่งข้อมูลพิกัดมาแบบ URL parameters ผ่าน HTTP GET (OSMand Protocol) เช่น ?id=CT21&lat=14.7&lon=100.7&batt=85&speed=60&mock=false (โดย id คือสายวิ่ง)
ฉันอยากเขียนตัวรับข้อมูลนี้ ช่วยเขียนโค้ด Node.js (Express API) รับค่าเหล่านี้ แล้วใช้ไลบรารี @supabase/supabase-js แปลง lat/lon เป็นข้อมูลชนิด POINT เพื่อ INSERT ลงตาราง gps_logs ใน Supabase ให้หน่อย"

Prompt 3: Logic การคำนวณ Geofence 40 เมตร และ Anti-Drive-by

Prompt: "ใน Supabase ฉันมีตาราง gps_logs และ customers (ร้านค้า) ฉันต้องการคำสั่ง SQL หรือ Database Function (RPC) ที่จะทำงานดังนี้:

หาร้านค้าที่อยู่ใกล้พิกัดล่าสุดของพนักงานขายสายวิ่งนั้น ในรัศมี 40 เมตร (ใช้ ST_DWithin คำนวณเป็นเมตร)

ถ้าระยะเวลาที่สายวิ่งนั้นอยู่ในรัศมี 40 เมตรของร้านค้า น้อยกว่า 5 นาที ให้บันทึกสถานะในตาราง visits ว่าเป็น 'Drive-by'

แต่ถ้าอยู่เกิน 5 นาที ให้บันทึกว่าเป็น 'เยี่ยมจริง'

ช่วยเขียน SQL สำหรับหาสายวิ่งที่ 'ออกนอกพื้นที่ดูแล' โดยเปรียบเทียบกับตาราง territories (ที่มี geom แบบ POLYGON) โดยใช้ ST_Contains ให้ด้วย"

Prompt 4: ระบบอัปโหลด Excel (ร้านค้า)

Prompt: "จากหน้า HTML ของฉัน มีการใช้ไลบรารี SheetJS อ่านไฟล์ Excel รายชื่อร้านค้าจนได้เป็น Array ของ JSON Objects ออกมาแล้ว (มีฟิลด์ name, lat, lng) ช่วยเขียนโค้ด JavaScript ฝั่ง Frontend ที่ใช้ Supabase-js (supabase.from().upsert()) เพื่อโยนข้อมูล Array นี้เข้าไปบันทึกหรืออัปเดตในตาราง customers ให้หน่อย และแปลง lat, lng เป็นรูปแบบที่ PostGIS ยอมรับด้วย"

Prompt 5: การส่งแจ้งเตือนผ่าน LINE MESSAGING API

Prompt: "ฉันต้องการส่งข้อความแจ้งเตือนสถานะการออกนอกพื้นที่ดูแล และ สรุปการเข้าเยี่ยมร้านค้า ไปยัง LINE ของแอดมิน โดยใช้ LINE MESSAGING API ช่วยเขียนโค้ดตัวอย่างใน Node.js สำหรับยิง HTTP POST Request ไปที่ Endpoint ของ LINE Messaging API พร้อมโครงสร้าง JSON Payload (Flex Message หรือ Text) สำหรับแจ้งเตือนให้หน่อย"
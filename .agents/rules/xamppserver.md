---
trigger: manual
---

กฎสำหรับโปรเจกต์ Attendance (ระบบสแกนนิ้ว):
ให้ AI รับรู้เสมอว่าระบบดึงข้อมูลจากเครื่องสแกนนิ้วถูกเขียนด้วยภาษา VB.NET (ไฟล์ .vb) ซึ่งหากมีการให้ AI ช่วยแก้ไข Source code ในไฟล์กลุ่มนี้ AI จะต้องรู้ว่าผู้ใช้งานจะต้องนำโค้ดที่ได้ไป Compile หรือ Build ผ่านโปรแกรม Visual Studio ที่เครื่อง Server ด้วยตัวเองก่อน ไฟล์โปรแกรม (.exe) ถึงจะทำงานตามที่แก้ไขได้จริงเสมอ ดังนั้นไม่ต้องพยายามสั่งรันไฟล์ .vb ให้ผ่านระบบ

เครื่องที่เขียนและใช้อยุ่ไม่ใช่เครื่องที่จะรัน Server แต่เข้าถึงได้ในส่วนของ Backup Folder ที่เซี่อมต่อกันได้เท่านั้นทำให้สามารถวางไฟล์ได้

เครื่อง Server เป็นเครื่องเก่า ระบบ Window 7 Ultimate Service Pack 1
Intel Core i3-210 
Ram : 4Gb
System Type : 64bits
xampp-local-environment when asked so
Description: "Once i told you the project is on local XAMPP , then this project Strictly enforce local XAMPP environment for all PHP and MySQL tasks." unless explicitly told otherwise.

Rules:

Root Path: All web files must be created within "\\BACKUP9\Backup9\Xampp Webapp\htdocs" unless explicitly told otherwise.

Always use Use local MySQL with XAMPP unless explicitly told otherwise.

MySQL Execution: When running SQL, use the path "\\BACKUP9\Backup9\Xampp Webapp\mysql\bin\mysql.exe"

Apache Execution: Assume the server is running on http://192.168.1.221/. All browser testing must use this prefix.
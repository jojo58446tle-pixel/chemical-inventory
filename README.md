# Chemical Inventory V1

ฟังก์ชัน:
- Login ผ่าน Supabase Auth
- Import BOM จาก Excel
- รับเข้า
- เบิกจ่าย
- แนะนำ Lot ตาม FIFO แต่เปลี่ยน Lot ได้
- คงคลังแยก Lot
- ประวัติรับเข้า/เบิกจ่าย
- Expiry Alert 180 วัน
- ส่ง DingTalk
- Export Excel
- Mobile-first

## ตั้งค่า Supabase
1. สร้าง Supabase Project
2. เปิด SQL Editor แล้วรัน `supabase/schema.sql`
3. ไปที่ Authentication > Users แล้วสร้างผู้ใช้ Admin Warehouse 1 คน
4. เปิด `config.js` แล้วใส่:
   - SUPABASE_URL
   - SUPABASE_PUBLISHABLE_KEY

## ตั้งค่า Netlify
เพิ่ม Environment Variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DINGTALK_WEBHOOK_URL`

> Service role key ใส่เฉพาะ Netlify Environment Variable ห้ามใส่ในไฟล์หน้าเว็บ

## Deploy
อัปโหลดโฟลเดอร์นี้ขึ้น Netlify ผ่าน Git หรือ Netlify CLI เพราะโปรเจกต์มี Functions และ npm dependency

## BOM Excel
รองรับชื่อคอลัมน์:
- Material Code
- Material Name
- Unit
- Supplier
- Barcode


## Login แบบ Username
หน้าเว็บใช้ Username + Password เท่านั้น

ตั้งค่า Netlify Environment Variables:
- ADMIN_USERNAME = admin
- ADMIN_AUTH_EMAIL = อีเมลของบัญชี Supabase Auth ที่ใช้ตรวจรหัส (ซ่อนอยู่ฝั่ง Backend)
- SUPABASE_URL = API URL
- SUPABASE_PUBLISHABLE_KEY = Publishable Key

รหัสผ่านไม่อยู่ในหน้าเว็บและไม่ต้องใส่ใน Netlify Environment Variables

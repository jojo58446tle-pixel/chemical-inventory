# Chemical Inventory — Final No-Email Login

ระบบ Login:
- Username + Password
- ไม่มีอีเมล
- รหัสผ่านไม่อยู่ในหน้าเว็บหรือ GitHub
- รหัสอยู่ใน Netlify Environment Variables
- Session มีอายุ 8 ชั่วโมง

## 1) อัปโหลดไฟล์ทั้งหมดทับ Repository เดิม

ใช้ Repository `chemical-inventory` เดิม เพื่อให้ลิงก์ Netlify เดิมไม่เปลี่ยน

## 2) ตั้ง Netlify Environment Variables

ไปที่ Site configuration → Environment variables แล้วเพิ่ม:

- `ADMIN_USERNAME` = `admin`
- `ADMIN_PASSWORD` = รหัสที่คุณต้องการ
- `SUPABASE_JWT_SECRET` = JWT Secret จาก Supabase Project Settings
- `SUPABASE_URL` = API URL
- `SUPABASE_SERVICE_ROLE_KEY` = Service role key
- `DINGTALK_WEBHOOK_URL` = DingTalk Webhook (ใส่ภายหลังได้)

รหัสผ่านมีเฉพาะ `ADMIN_PASSWORD` ใน Netlify

## 3) config.js

ใส่:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Publishable key เป็น Public key สำหรับหน้าเว็บ ห้ามใส่ Service role key ในไฟล์นี้

## 4) รัน SQL หนึ่งครั้ง

เปิด `supabase/login-no-email-migration.sql`
คัดลอกทั้งหมดไปวางใน Supabase SQL Editor แล้วกด Run

จากนั้นเปิด `supabase/receiving-v1-migration.sql`
คัดลอกทั้งหมดไปวางใน Supabase SQL Editor แล้วกด Run เพื่อเพิ่ม Receiving Chemical V1

## 5) Deploy ใหม่

เมื่อ Commit ไฟล์ขึ้น GitHub Netlify จะ Deploy อัตโนมัติ

Login:
- Username: `Puk` (หรือตามค่า `ADMIN_USERNAME` ใน Netlify)
- Password: ค่าที่ตั้งใน `ADMIN_PASSWORD`

## Receiving Chemical V1

- QR แยก 4 ส่วน: Supplier Code, Material Code, Lot, MFG Date
- Unit ให้ผู้ใช้กรอกเอง
- Material Code เดิมดึง Material Name, Shelf Life, Storage Condition และแก้ไขได้
- Material Code ใหม่บันทึก Material Master ได้โดยไม่ใช้ BOM
- Expiry Date คำนวณจาก MFG Date + Shelf Life
- ถ้าวันที่ผลิตจาก QR และฉลากสินค้าไม่ตรงกัน ต้องเลือกวันที่ที่จะใช้และระบบบันทึก Log


## FIX 2026-08-08 — Issue Stock permanent fix v2
- ไม่ต้องตั้ง SUPABASE_SERVICE_ROLE_KEY
- ไม่ต้องรัน SQL migration เพิ่มเพื่อให้ปุ่มเบิกทำงาน
- ใช้ Admin JWT + SUPABASE_PUBLISHABLE_KEY ที่ระบบมีอยู่แล้ว
- issue-stock Netlify Function ตัด stock และบันทึก movement โดย performed_by = null
- แสดง error บนหน้าจอแทนการกดแล้วเงียบ

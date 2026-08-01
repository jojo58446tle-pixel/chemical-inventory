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

## 5) Deploy ใหม่

เมื่อ Commit ไฟล์ขึ้น GitHub Netlify จะ Deploy อัตโนมัติ

Login:
- Username: `admin`
- Password: ค่าที่ตั้งใน `ADMIN_PASSWORD`

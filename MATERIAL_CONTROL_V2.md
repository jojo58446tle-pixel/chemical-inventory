# Material Shelf-Life & Storage Control System — V2

พัฒนาต่อจาก Chemical Inventory เดิม โดยไม่รื้อ Chemical flow ที่ใช้งานอยู่

## Architecture

- **Chemical Material**: ใช้ Supabase / Receiving / Issue / Lot / Expiry / DingTalk แบบเดิม
- **General Material**: Lookup / Verification เท่านั้น ไม่สร้าง Stock ซ้ำกับ WMS
- **General Material Master**: เก็บใน **Netlify Blobs** (`material-control-master`)
  - `material-mapping`: Material Code → Material Group
  - `shelf-life-master`: Material Group → Shelf Life / Temp / RH / Packaging / Remark

## General Material Logic

Material Code หรือ Material Group
→ Resolve Material Group
→ Shelf-Life / Storage Master
→ แสดง Material Type / Shelf Life / Temperature / Humidity / Packaging / Remark
→ กรอก Manufacturing Date / Date Code (optional)
→ Expiry Date / Remaining Days / Remaining % / VALID-EXPIRING SOON-EXPIRED

ถ้าไม่มีใน Master ระบบจะแสดงว่าไม่พบข้อกำหนดและ **ไม่เดาข้อมูลเอง**

ถ้า Material Group เดียวมีหลายเงื่อนไขใน Master ระบบจะแสดงทุก Storage Variant ไม่ overwrite ทิ้ง

## Warehouse Guidance

ผลการค้นหาจะแสดง Guidance ทั่วไปโดยไม่ทำ Stock Transaction เพิ่ม:

- FIFO ตามกระบวนการคลัง
- ห้ามวางวัสดุลงพื้นโดยตรง ใช้ Pallet / Rack
- Identification ของ Material / Lot / Status ต้องชัด
- Expired / ผิดเงื่อนไข → Hold / Segregate → Quality Review

ระบบ **ไม่ตัดสิน Pass/Fail แทน Quality** และ **ไม่แทน WMS**

## Setup หลัง Deploy — ทำครั้งเดียว

1. Login ระบบ
2. เมนู → **Material Master Data**
3. Import `GridDataExport(2).xlsx` ที่มี Material Code / Material Group
   - ระบบตัด Material Code ลงท้าย `-P` อัตโนมัติ
4. Import `อายุการใช้งานของวัสดุ.xlsx`
5. ตรวจจำนวนรายการในหน้า Material Master Data
6. เข้าเมนู **ตรวจวัสดุ** แล้วทดสอบ เช่น `SD000197`, `S003D0`, `F003EA`

Master ใน Netlify Blobs จะคงอยู่ข้ามการ Deploy ใหม่ของเว็บ

## Netlify Dependency

เพิ่ม:

- `@netlify/blobs`

ไม่ต้องสร้าง Supabase Project ใหม่สำหรับ General Material

## Backup

หน้า Material Master Data มีปุ่ม **Export Master จาก Netlify Blobs (.json)** เพื่อสำรองฐานออกมาได้

## Existing Chemical Flow

ยังคงเดิม:

- Receiving
- QR 4 fields
- Chemical Material Master ใน Supabase
- Lot / Qty / Location
- Expiry calculation
- FIFO Issue
- Expiry Alert
- DingTalk Alert
- History / Excel Export

General Material ไม่ถูกบันทึกเข้า Chemical Inventory โดยอัตโนมัติ

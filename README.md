# Material Shelf-Life & Storage Control System — Production V1

ระบบนี้พัฒนาต่อจาก Chemical Inventory เดิม โดยใช้ Supabase Project เดิมและแยก General Material ด้วยตาราง `msl_*`

## Production behavior

### Chemical Material — เดิมยังทำงานต่อ
- Login เดิม (Netlify Function + custom authenticated JWT)
- Receiving
- Lot Tracking
- Stock / Issue
- MFG mismatch log
- Expiry calculation
- Expiry alert
- DingTalk alert
- Excel export

### General Material — Lookup / Verification only
- Material Code → Material Group
- Material Group → Shelf Life / Temperature / RH / Packaging / Remark
- Manufacturing Date → Expiry / Remaining Days / Remaining % / Status
- Warehouse guidance
- Missing Mapping = `MATERIAL_CODE_NOT_FOUND`
- Multiple Storage Profiles = `PROFILE_VERIFICATION_REQUIRED`
- ไม่สร้าง Stock / Receiving transaction ซ้ำกับ WMS

## Database

Production tables added in the same Supabase Project:
- `msl_master_versions`
- `msl_material_groups`
- `msl_material_codes`
- `msl_storage_profiles`
- `msl_material_profile_scope`
- `msl_warehouse_rules`
- `msl_data_issues`
- `msl_master_import_audit`

The existing Chemical tables are not replaced.

Current validated seed baseline:
- Material Groups: 439
- Material Codes: 313
- Storage Profiles: 452
- Warehouse Rules: 6
- Open Data Issues: 8

Validated behavior:
- `SD000197` → `S003D0` → SINGLE_PROFILE
- `FC057407` → `F004BC` → PROFILE_VERIFICATION_REQUIRED (2 profiles)
- `FE000312` → MATERIAL_CODE_NOT_FOUND

### SQL files
- `supabase/MSL_DATABASE_FINAL_V2.sql` — full General Material DB rebuild/bootstrap (base + multi-profile guard)
- `supabase/msl-profile-selection-control.sql` — profile-selection patch only

If the production database has already been migrated and validated, **do not rerun the full SQL just for deployment**.

## Deploy to the existing Netlify site

1. Replace the source in the existing `chemical-inventory` repository/site with this package.
2. Keep the existing `config.js` Supabase URL and publishable key for the same Chemical Supabase Project.
3. Keep these Netlify Environment Variables:
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `SUPABASE_JWT_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DINGTALK_WEBHOOK_URL`
4. Deploy using the existing Netlify site so the current URL and Chemical data remain unchanged.

## Security

- Browser uses only Supabase publishable key.
- Service role key stays in Netlify Environment Variables only.
- General Material tables use RLS.
- Normal authenticated users have read-only access to `msl_*` master tables.
- `msl_lookup_material_code()` and `msl_lookup_material_group()` require authenticated role.
- Material profile mapping is not written by normal frontend users.

## UI pages

- Dashboard
- Search / Lookup
- Incoming Check
- Warehouse Check
- Expiry Alert
- Reports
- Master Data
- Settings
- Chemical Receiving
- Chemical Issue
- Chemical Stock
- Chemical Movement History

Version: **1.0.0**


## UI Refinement V1.1
- Split-screen production login based on supplied reference style.
- Dashboard title updated to Material Shelf-Life & Storage Control System / ระบบควบคุมอายุการเก็บรักษาและการจัดเก็บวัสดุ.
- Dashboard simplified; General Material Flow and Database Validation cards removed.
- Sidebar simplified with collapsible Chemical Inventory and Reports & System groups.
- Existing General Material, Chemical, Supabase, Netlify Function and DingTalk logic preserved.

## V1.2 - General Material Manual DingTalk Alert
Warehouse Check now supports manual escalation to DingTalk after Material Code + MFG Date verification.

Flow:
Material Code -> Storage Profile -> MFG Date -> Expiry Status -> Warehouse Remark -> Notify DingTalk.

Required Netlify environment variable:
- `DINGTALK_MATERIAL_WEBHOOK_URL` = recommended dedicated DingTalk workflow/webhook for General Material alerts.

Fallback:
- If `DINGTALK_MATERIAL_WEBHOOK_URL` is not set, the function will use the existing `DINGTALK_WEBHOOK_URL`.

The General Material alert does NOT create stock, receiving, or WMS transactions.


## V1.5 - Chemical DingTalk Fix & Diagnostics
- Removed supplier-specific JD branding from login (now MSL).
- Chemical expiry alert now uses server-side service role after user JWT verification.
- Chemical DingTalk request is sent as JSON text-message payload.
- Added DingTalk response validation (errcode/errmsg).
- Added a dedicated `ทดสอบ DingTalk` button that tests the webhook without expiry thresholds or duplicate-suppression logic.
- Recommended env var for existing Chemical flow: `DINGTALK_WEBHOOK_URL`.
- General Material remains on its separate webhook/workflow variable and will be finalized against Workflow 2's actual field schema.


## V1.6 — Chemical DingTalk Workflow Fix
- Restored Chemical DingTalk payload to `text/plain; charset=utf-8` to match the existing DingTalk Workflow webhook contract.
- Chemical alert uses only `DINGTALK_WEBHOOK_URL`, matching the original working workflow.
- Chemical connection test now uses the same Workflow payload contract as production alerts.
- Receiving now explains when a saved lot did not trigger DingTalk because it was not due or was already sent.
- General Material Workflow 2 remains separate and is not modified here.

## V2.3 hotfix
- Fix Stock page selector bug (`$` -> `$$` for list actions/search).
- Fix re-receiving a previously cancelled Material+Lot so `is_active` is restored.
- Includes `supabase/CHEMICAL_ACTIVE_LOT_HOTFIX.sql` to repair current inconsistent inactive rows with positive stock.

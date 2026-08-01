-- Chemical Inventory: Receiving Chemical V1
-- Run this file once in Supabase SQL Editor before deploying the new frontend.

alter table public.materials
  add column if not exists shelf_life_months integer,
  add column if not exists storage_condition text;

alter table public.materials alter column unit drop not null;

alter table public.chemical_lots
  add column if not exists supplier_code text,
  add column if not exists product_name text,
  add column if not exists brand text,
  add column if not exists unit text,
  add column if not exists package_size text,
  add column if not exists mfg_qr_date date,
  add column if not exists mfg_label_date date,
  add column if not exists mfg_used_date date,
  add column if not exists mfg_source text,
  add column if not exists storage_location text;

create table if not exists public.mfg_date_mismatch_logs (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id),
  lot_id uuid not null references public.chemical_lots(id),
  qr_mfg_date date not null,
  label_mfg_date date not null,
  selected_mfg_date date not null,
  selected_source text not null check (selected_source in ('QR','LABEL')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.mfg_date_mismatch_logs enable row level security;
drop policy if exists "authenticated mismatch logs" on public.mfg_date_mismatch_logs;
create policy "authenticated mismatch logs" on public.mfg_date_mismatch_logs
  for all to authenticated using (true) with check (true);

create or replace function public.receive_stock_v1(
  p_material_id uuid,
  p_supplier_code text,
  p_lot_no text,
  p_qty numeric,
  p_unit text,
  p_product_name text,
  p_brand text,
  p_package_size text,
  p_received_date date,
  p_mfg_qr_date date,
  p_mfg_label_date date,
  p_mfg_used_date date,
  p_mfg_source text,
  p_expiry_date date,
  p_location text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_lot_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) <> 'authenticated' then
    raise exception 'Unauthorized';
  end if;
  if p_qty <= 0 then raise exception 'Invalid quantity'; end if;
  if coalesce(trim(p_unit),'') = '' then raise exception 'Unit is required'; end if;

  insert into chemical_lots(
    material_id, supplier_code, lot_no, received_qty, remaining_qty,
    unit, product_name, brand, package_size, received_date,
    mfg_qr_date, mfg_label_date, mfg_used_date, mfg_source,
    expiry_date, storage_location, created_by
  ) values (
    p_material_id, p_supplier_code, p_lot_no, p_qty, p_qty,
    p_unit, p_product_name, p_brand, p_package_size, p_received_date,
    p_mfg_qr_date, p_mfg_label_date, p_mfg_used_date, p_mfg_source,
    p_expiry_date, p_location, null
  )
  on conflict(material_id,lot_no) do update set
    received_qty=chemical_lots.received_qty+excluded.received_qty,
    remaining_qty=chemical_lots.remaining_qty+excluded.remaining_qty,
    supplier_code=excluded.supplier_code,
    unit=excluded.unit,
    product_name=excluded.product_name,
    brand=excluded.brand,
    package_size=excluded.package_size,
    received_date=excluded.received_date,
    mfg_qr_date=excluded.mfg_qr_date,
    mfg_label_date=excluded.mfg_label_date,
    mfg_used_date=excluded.mfg_used_date,
    mfg_source=excluded.mfg_source,
    expiry_date=excluded.expiry_date,
    storage_location=excluded.storage_location
  returning id into v_lot_id;

  insert into stock_movements(movement_type,material_id,lot_id,qty,note,performed_by)
  values('IN',p_material_id,v_lot_id,p_qty,
    case when p_mfg_label_date is not null and p_mfg_qr_date <> p_mfg_label_date
      then 'รับเข้า | MFG mismatch | เลือก ' || p_mfg_source
      else 'รับเข้า'
    end,
    null);

  if p_mfg_label_date is not null and p_mfg_qr_date <> p_mfg_label_date then
    insert into mfg_date_mismatch_logs(
      material_id,lot_id,qr_mfg_date,label_mfg_date,
      selected_mfg_date,selected_source,created_by
    ) values (
      p_material_id,v_lot_id,p_mfg_qr_date,p_mfg_label_date,
      p_mfg_used_date,p_mfg_source,null
    );
  end if;

  return v_lot_id;
end $$;

grant execute on function public.receive_stock_v1(
  uuid,text,text,numeric,text,text,text,text,date,date,date,date,text,date,text
) to authenticated;

-- Chemical Inventory: Stock Edit / Cancel V1
-- Run once in Supabase SQL Editor before uploading the new app.js.

alter table public.chemical_lots
  add column if not exists is_active boolean not null default true,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_reason text;

create table if not exists public.lot_change_logs (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.chemical_lots(id),
  action text not null check (action in ('EDIT','CANCEL')),
  before_data jsonb not null,
  after_data jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.lot_change_logs enable row level security;
drop policy if exists "authenticated lot change logs" on public.lot_change_logs;
create policy "authenticated lot change logs" on public.lot_change_logs
  for all to authenticated using (true) with check (true);

create or replace function public.update_chemical_lot_v1(
  p_lot_id uuid,
  p_material_id uuid,
  p_supplier_code text,
  p_lot_no text,
  p_received_qty numeric,
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
  p_location text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot chemical_lots%rowtype;
  v_before jsonb;
  v_issued_qty numeric;
  v_new_remaining numeric;
begin
  if current_setting('request.jwt.claim.role', true) <> 'authenticated' then
    raise exception 'Unauthorized';
  end if;

  select * into v_lot from chemical_lots where id = p_lot_id for update;
  if not found then raise exception 'Lot not found'; end if;
  if not v_lot.is_active then raise exception 'Lot is cancelled'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Edit reason is required'; end if;
  if p_received_qty <= 0 then raise exception 'Invalid received quantity'; end if;

  v_before := to_jsonb(v_lot);
  v_issued_qty := greatest(v_lot.received_qty - v_lot.remaining_qty, 0);
  if p_received_qty < v_issued_qty then
    raise exception 'Received quantity cannot be lower than issued quantity (%)', v_issued_qty;
  end if;
  v_new_remaining := p_received_qty - v_issued_qty;

  update chemical_lots set
    material_id = p_material_id,
    supplier_code = p_supplier_code,
    lot_no = p_lot_no,
    received_qty = p_received_qty,
    remaining_qty = v_new_remaining,
    unit = p_unit,
    product_name = p_product_name,
    brand = p_brand,
    package_size = p_package_size,
    received_date = p_received_date,
    mfg_qr_date = p_mfg_qr_date,
    mfg_label_date = p_mfg_label_date,
    mfg_used_date = p_mfg_used_date,
    mfg_source = p_mfg_source,
    expiry_date = p_expiry_date,
    storage_location = p_location
  where id = p_lot_id;

  update stock_movements set material_id = p_material_id where lot_id = p_lot_id;
  delete from expiry_notifications where lot_id = p_lot_id;

  insert into lot_change_logs(lot_id,action,before_data,after_data,reason)
  select p_lot_id,'EDIT',v_before,to_jsonb(l),trim(p_reason)
  from chemical_lots l where l.id = p_lot_id;
end $$;

create or replace function public.cancel_chemical_lot_v1(
  p_lot_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot chemical_lots%rowtype;
  v_before jsonb;
begin
  if current_setting('request.jwt.claim.role', true) <> 'authenticated' then
    raise exception 'Unauthorized';
  end if;

  select * into v_lot from chemical_lots where id = p_lot_id for update;
  if not found then raise exception 'Lot not found'; end if;
  if not v_lot.is_active then raise exception 'Lot is already cancelled'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Cancel reason is required'; end if;

  v_before := to_jsonb(v_lot);

  update chemical_lots set
    is_active = false,
    remaining_qty = 0,
    cancelled_at = now(),
    cancelled_reason = trim(p_reason)
  where id = p_lot_id;

  delete from expiry_notifications where lot_id = p_lot_id;

  insert into lot_change_logs(lot_id,action,before_data,after_data,reason)
  select p_lot_id,'CANCEL',v_before,to_jsonb(l),trim(p_reason)
  from chemical_lots l where l.id = p_lot_id;
end $$;

grant execute on function public.update_chemical_lot_v1(
  uuid,uuid,text,text,numeric,text,text,text,text,date,date,date,date,text,date,text,text
) to authenticated;

grant execute on function public.cancel_chemical_lot_v1(uuid,text) to authenticated;

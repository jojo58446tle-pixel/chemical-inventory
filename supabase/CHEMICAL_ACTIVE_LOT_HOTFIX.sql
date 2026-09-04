-- Chemical Active Lot Hotfix
-- Fixes the case where a previously cancelled Material+Lot is received again:
-- receive_stock_v1 used ON CONFLICT but did not restore is_active=true.
-- Result was: Receiving succeeded, but Stock and DingTalk could not find the Active Lot.

begin;

-- 1) Repair only inconsistent rows created by the bug.
-- A correctly cancelled lot has remaining_qty = 0, so an inactive lot with positive stock
-- is inconsistent and should be restored as active.
update public.chemical_lots
set
  is_active = true,
  cancelled_at = null,
  cancelled_reason = null
where is_active = false
  and remaining_qty > 0;

-- 2) Replace receive_stock_v1 so re-receiving a previously cancelled Material+Lot
-- safely reactivates that lot.
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
    storage_location=excluded.storage_location,
    is_active=true,
    cancelled_at=null,
    cancelled_reason=null
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

commit;

-- Verification: this should return zero inconsistent rows.
select id, lot_no, remaining_qty, is_active
from public.chemical_lots
where is_active = false and remaining_qty > 0;

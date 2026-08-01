-- รันไฟล์นี้ใน Supabase SQL Editor เพียงครั้งเดียว
-- ทำให้ระบบรับเข้า/เบิกจ่ายใช้งานกับ Login แบบ Username + Password ได้
-- โดยไม่ต้องสร้างผู้ใช้ใน Supabase Auth

create or replace function public.receive_stock(
  p_material_id uuid,
  p_lot_no text,
  p_qty numeric,
  p_received_date date,
  p_expiry_date date
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

  insert into chemical_lots(
    material_id, lot_no, received_qty, remaining_qty,
    received_date, expiry_date, created_by
  )
  values(
    p_material_id, p_lot_no, p_qty, p_qty,
    p_received_date, p_expiry_date, null
  )
  on conflict(material_id, lot_no) do update set
    received_qty = chemical_lots.received_qty + excluded.received_qty,
    remaining_qty = chemical_lots.remaining_qty + excluded.remaining_qty,
    expiry_date = excluded.expiry_date
  returning id into v_lot_id;

  insert into stock_movements(
    movement_type, material_id, lot_id, qty, note, performed_by
  )
  values('IN', p_material_id, v_lot_id, p_qty, 'รับเข้า', null);

  return v_lot_id;
end $$;

create or replace function public.issue_stock(
  p_lot_id uuid,
  p_qty numeric,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_lot chemical_lots%rowtype;
begin
  if current_setting('request.jwt.claim.role', true) <> 'authenticated' then
    raise exception 'Unauthorized';
  end if;

  select * into v_lot
  from chemical_lots
  where id = p_lot_id
  for update;

  if not found then raise exception 'Lot not found'; end if;
  if p_qty <= 0 then raise exception 'Invalid quantity'; end if;
  if v_lot.remaining_qty < p_qty then raise exception 'Insufficient stock'; end if;

  update chemical_lots
  set remaining_qty = remaining_qty - p_qty
  where id = p_lot_id;

  insert into stock_movements(
    movement_type, material_id, lot_id, qty, note, performed_by
  )
  values('OUT', v_lot.material_id, p_lot_id, p_qty, p_note, null);
end $$;

grant execute on function public.receive_stock(uuid,text,numeric,date,date) to authenticated;
grant execute on function public.issue_stock(uuid,numeric,text) to authenticated;

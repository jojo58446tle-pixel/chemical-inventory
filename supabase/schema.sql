create extension if not exists pgcrypto;

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  material_code text unique not null,
  material_name text not null,
  unit text not null,
  supplier text,
  barcode text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.chemical_lots (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id),
  lot_no text not null,
  received_qty numeric(14,3) not null check (received_qty >= 0),
  remaining_qty numeric(14,3) not null check (remaining_qty >= 0),
  received_date date not null,
  expiry_date date not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(material_id, lot_no)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type text not null check (movement_type in ('IN','OUT','ADJUST')),
  material_id uuid not null references public.materials(id),
  lot_id uuid not null references public.chemical_lots(id),
  qty numeric(14,3) not null check (qty > 0),
  note text,
  performed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.expiry_notifications (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.chemical_lots(id),
  alert_level integer not null,
  sent_at timestamptz not null default now(),
  success boolean not null default false,
  response_text text,
  unique(lot_id, alert_level)
);

alter table public.materials enable row level security;
alter table public.chemical_lots enable row level security;
alter table public.stock_movements enable row level security;
alter table public.expiry_notifications enable row level security;

create policy "authenticated materials" on public.materials for all to authenticated using (true) with check (true);
create policy "authenticated lots" on public.chemical_lots for all to authenticated using (true) with check (true);
create policy "authenticated movements" on public.stock_movements for all to authenticated using (true) with check (true);
create policy "authenticated notifications" on public.expiry_notifications for select to authenticated using (true);

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
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  insert into chemical_lots(material_id,lot_no,received_qty,remaining_qty,received_date,expiry_date,created_by)
  values(p_material_id,p_lot_no,p_qty,p_qty,p_received_date,p_expiry_date,auth.uid())
  on conflict(material_id,lot_no) do update set
    received_qty=chemical_lots.received_qty+excluded.received_qty,
    remaining_qty=chemical_lots.remaining_qty+excluded.remaining_qty,
    expiry_date=excluded.expiry_date
  returning id into v_lot_id;
  insert into stock_movements(movement_type,material_id,lot_id,qty,note,performed_by)
  values('IN',p_material_id,v_lot_id,p_qty,'รับเข้า',auth.uid());
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
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select * into v_lot from chemical_lots where id=p_lot_id for update;
  if not found then raise exception 'Lot not found'; end if;
  if p_qty <= 0 then raise exception 'Invalid quantity'; end if;
  if v_lot.remaining_qty < p_qty then raise exception 'Insufficient stock'; end if;
  update chemical_lots set remaining_qty=remaining_qty-p_qty where id=p_lot_id;
  insert into stock_movements(movement_type,material_id,lot_id,qty,note,performed_by)
  values('OUT',v_lot.material_id,p_lot_id,p_qty,p_note,auth.uid());
end $$;

grant execute on function public.receive_stock(uuid,text,numeric,date,date) to authenticated;
grant execute on function public.issue_stock(uuid,numeric,text) to authenticated;

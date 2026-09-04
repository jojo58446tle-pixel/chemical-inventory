-- Material Shelf-Life & Storage Control System
-- Profile-selection guard for material groups with multiple storage profiles.
-- Safe to run after MSL_DATABASE_BASE_V1.sql.

create table if not exists public.msl_material_profile_scope (
  material_code text primary key references public.msl_material_codes(material_code) on update cascade on delete cascade,
  storage_profile_id uuid not null references public.msl_storage_profiles(id) on delete restrict,
  selection_basis text not null,
  source_reference text,
  verified_by text,
  verified_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.msl_validate_profile_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_material_group text;
  v_profile_group text;
begin
  select group_code into v_material_group
  from public.msl_material_codes
  where material_code = new.material_code;

  select group_code into v_profile_group
  from public.msl_storage_profiles
  where id = new.storage_profile_id;

  if v_material_group is null then
    raise exception 'Material Code not found: %', new.material_code;
  end if;
  if v_profile_group is null then
    raise exception 'Storage Profile not found';
  end if;
  if v_material_group <> v_profile_group then
    raise exception 'Profile group mismatch. Material % belongs to %, but selected profile belongs to %',
      new.material_code, v_material_group, v_profile_group;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_msl_validate_profile_scope on public.msl_material_profile_scope;
create trigger trg_msl_validate_profile_scope
before insert or update on public.msl_material_profile_scope
for each row execute function public.msl_validate_profile_scope();

alter table public.msl_material_profile_scope enable row level security;

drop policy if exists msl_read_material_profile_scope on public.msl_material_profile_scope;
create policy msl_read_material_profile_scope
on public.msl_material_profile_scope
for select to authenticated using (true);

create or replace function public.msl_lookup_material_code(p_material_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_material_code,'')));
  v_group text;
  v_profile_count integer := 0;
  v_scoped_profile_id uuid;
  v_selection_status text;
  v_result jsonb;
begin
  if current_user not in ('postgres','supabase_admin')
     and coalesce(current_setting('request.jwt.claim.role',true),'') <> 'authenticated' then
    raise exception 'Unauthorized';
  end if;

  select group_code into v_group
  from public.msl_material_codes
  where material_code = v_code and is_active = true;

  if v_group is null then
    return jsonb_build_object('found',false,'reason','MATERIAL_CODE_NOT_FOUND','material_code',v_code);
  end if;

  select count(*) into v_profile_count
  from public.msl_storage_profiles
  where group_code = v_group and is_active = true;

  select storage_profile_id into v_scoped_profile_id
  from public.msl_material_profile_scope
  where material_code = v_code and is_active = true;

  if v_profile_count = 0 then
    v_selection_status := 'NO_STORAGE_PROFILE';
  elsif v_scoped_profile_id is not null then
    v_selection_status := 'SCOPED_PROFILE';
  elsif v_profile_count = 1 then
    v_selection_status := 'SINGLE_PROFILE';
  else
    v_selection_status := 'PROFILE_VERIFICATION_REQUIRED';
  end if;

  select jsonb_build_object(
    'found', true,
    'material_code', v_code,
    'material_group', g.group_code,
    'requirement_status', case when g.has_storage_master then 'FOUND' else 'NOT_FOUND_IN_MASTER' end,
    'profile_count', v_profile_count,
    'profile_selection_status', v_selection_status,
    'profile_verification_required', (v_selection_status = 'PROFILE_VERIFICATION_REQUIRED'),
    'group', jsonb_build_object(
      'main_category_th',g.main_category_th,
      'main_category_en',g.main_category_en,
      'sub_category_th',g.sub_category_th,
      'sub_category_en',g.sub_category_en,
      'material_type_th',g.material_type_th,
      'material_type_en',g.material_type_en
    ),
    'selected_profile', case
      when v_scoped_profile_id is not null then (
        select jsonb_build_object(
          'profile_no',sp.profile_no,
          'packaging',sp.packaging,
          'shelf_life_text',sp.shelf_life_text,
          'shelf_life_months',sp.shelf_life_months,
          'expiry_calculation_mode',sp.expiry_calculation_mode,
          'storage_temperature',sp.storage_temperature,
          'storage_humidity',sp.storage_humidity,
          'moisture_sensitive',sp.moisture_sensitive,
          'remark',sp.remark,
          'source_row',sp.source_row
        ) from public.msl_storage_profiles sp
        where sp.id = v_scoped_profile_id and sp.is_active = true
      )
      when v_profile_count = 1 then (
        select jsonb_build_object(
          'profile_no',sp.profile_no,
          'packaging',sp.packaging,
          'shelf_life_text',sp.shelf_life_text,
          'shelf_life_months',sp.shelf_life_months,
          'expiry_calculation_mode',sp.expiry_calculation_mode,
          'storage_temperature',sp.storage_temperature,
          'storage_humidity',sp.storage_humidity,
          'moisture_sensitive',sp.moisture_sensitive,
          'remark',sp.remark,
          'source_row',sp.source_row
        ) from public.msl_storage_profiles sp
        where sp.group_code = g.group_code and sp.is_active = true
        limit 1
      )
      else null
    end,
    'storage_profiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profile_no',sp.profile_no,
        'packaging',sp.packaging,
        'shelf_life_text',sp.shelf_life_text,
        'shelf_life_months',sp.shelf_life_months,
        'expiry_calculation_mode',sp.expiry_calculation_mode,
        'storage_temperature',sp.storage_temperature,
        'storage_humidity',sp.storage_humidity,
        'moisture_sensitive',sp.moisture_sensitive,
        'remark',sp.remark,
        'source_row',sp.source_row
      ) order by sp.profile_no)
      from public.msl_storage_profiles sp
      where sp.group_code = g.group_code and sp.is_active = true
    ), '[]'::jsonb)
  ) into v_result
  from public.msl_material_groups g
  where g.group_code = v_group and g.is_active = true;

  return v_result;
end;
$$;

grant execute on function public.msl_lookup_material_code(text) to authenticated;

-- Regression / behavior checks
select public.msl_lookup_material_code('SD000197');
select public.msl_lookup_material_code('FC057407');
select public.msl_lookup_material_code('FE000312');

-- IQC Risk Assessment System — PostgreSQL / Supabase migration
create extension if not exists pgcrypto;

create table if not exists public.ng_records (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('INCOMING','PRODUCTION')),
  material_code text not null,
  supplier text not null,
  lot_id text,
  po_number text,
  defect_category text not null,
  defect_description text not null,
  detail text not null default '',
  defect_level text not null check (defect_level in ('MINOR','MAJOR','CRITICAL')),
  ng_quantity integer not null check (ng_quantity > 0),
  inspected_quantity integer check (inspected_quantity is null or inspected_quantity > 0),
  functional_impact boolean not null default false,
  safety_impact boolean not null default false,
  occurrence_date date not null default current_date,
  image_urls jsonb not null default '[]'::jsonb,
  created_by text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.risk_events (
  id uuid primary key default gen_random_uuid(),
  ng_record_id uuid not null unique references public.ng_records(id) on delete cascade,
  material_code text not null,
  supplier text not null,
  normalized_defect text not null,
  risk_level text not null check (risk_level in ('LOW','MEDIUM','HIGH')),
  risk_source text not null default 'RULE_ENGINE',
  risk_trigger text not null,
  risk_reason text not null,
  repeat_occurrences integer not null default 1,
  repeat_qty integer not null default 0,
  window_days integer not null default 30,
  inspection_focus jsonb not null default '[]'::jsonb,
  alert_fingerprint text,
  alertable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  ng_record_id uuid not null references public.ng_records(id) on delete cascade,
  material_code text not null,
  risk_event_id uuid not null references public.risk_events(id) on delete cascade,
  defect_category text not null,
  control_areas jsonb not null default '[]'::jsonb,
  supplier_recommendation jsonb not null default '[]'::jsonb,
  confidence text not null check (confidence in ('LOW','MEDIUM','HIGH')),
  ai_provider text,
  ai_model text,
  prompt_version text not null,
  status text not null check (status in ('SUCCESS','FAILED','FALLBACK')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alert_history (
  id uuid primary key default gen_random_uuid(),
  risk_event_id uuid references public.risk_events(id) on delete set null,
  ai_recommendation_id uuid references public.ai_recommendations(id) on delete set null,
  channel text not null default 'DINGTALK',
  alert_fingerprint text not null,
  status text not null check (status in ('SUCCESS','FAILED','SKIPPED')),
  message text not null,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  actor text not null default 'admin',
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ng_records_repeat_idx
  on public.ng_records (material_code, defect_category, occurrence_date desc);
create index if not exists ng_records_source_date_idx
  on public.ng_records (source, occurrence_date desc);
create index if not exists risk_events_level_idx
  on public.risk_events (risk_level, created_at desc);
create index if not exists ai_recommendations_risk_idx
  on public.ai_recommendations (risk_event_id, created_at desc);
create unique index if not exists alert_history_success_fingerprint_idx
  on public.alert_history (alert_fingerprint)
  where status = 'SUCCESS';

alter table public.ng_records enable row level security;
alter table public.risk_events enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.alert_history enable row level security;
alter table public.audit_logs enable row level security;

-- No client-side policies are intentionally created. The Netlify Functions use
-- the service-role key. Never expose DATABASE_KEY to the browser.

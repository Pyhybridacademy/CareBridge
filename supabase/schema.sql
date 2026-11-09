-- =====================================================================
-- CareConnect database schema
-- Run this whole file once in Supabase: SQL Editor -> New query -> Run
-- =====================================================================

-- ---------- Roles ----------
do $$ begin
  create type public.app_role as enum ('patient', 'nurse');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  avatar_url text,
  dob date,
  gender text,
  license_number text,
  specialty text,
  emergency_contact text,
  created_at timestamptz not null default now()
);

-- Helper functions (security definer so RLS policies can call them without recursion)
create or replace function public.has_role(_user uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user and role = _role)
$$;

create or replace function public.is_assigned(_nurse uuid, _patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.nurse_patient_assignments
    where nurse_id = _nurse and patient_id = _patient and status = 'active'
  )
$$;

-- ---------- Assignments ----------
create table if not exists public.nurse_patient_assignments (
  id uuid primary key default gen_random_uuid(),
  nurse_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  unique (nurse_id, patient_id)
);

-- ---------- Messages ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'text' check (type in ('text', 'voice', 'video', 'image')),
  content text,
  media_path text,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_pair_idx on public.messages (sender_id, receiver_id, created_at);
create index if not exists messages_receiver_idx on public.messages (receiver_id, read_at);

-- ---------- Clinical records ----------
create table if not exists public.patient_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  nurse_id uuid not null references auth.users(id) on delete cascade,
  visit_date date not null default current_date,
  symptoms text,
  blood_pressure text,
  temperature numeric,
  pulse integer,
  weight numeric,
  spo2 integer,
  diagnosis_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  nurse_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'completed')),
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.treatment_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.treatment_plans(id) on delete cascade,
  medication_or_task text not null,
  dosage text,
  frequency text,
  duration text,
  instructions text,
  media_path text,
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  nurse_id uuid not null references auth.users(id) on delete cascade,
  scheduled_at timestamptz not null,
  reason text,
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------- New-user trigger ----------
-- Role comes from sign-up metadata but is limited to patient/nurse (never anything else).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r public.app_role;
begin
  r := case when meta->>'role' = 'nurse' then 'nurse'::public.app_role else 'patient'::public.app_role end;
  insert into public.user_roles (user_id, role) values (new.id, r);
  insert into public.profiles (id, full_name, phone, dob, gender, license_number, specialty, emergency_contact)
  values (
    new.id,
    coalesce(meta->>'full_name', ''),
    nullif(meta->>'phone', ''),
    nullif(meta->>'dob', '')::date,
    nullif(meta->>'gender', ''),
    nullif(meta->>'license_number', ''),
    nullif(meta->>'specialty', ''),
    nullif(meta->>'emergency_contact', '')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Notification triggers ----------
create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare sender_name text;
begin
  select full_name into sender_name from public.profiles where id = new.sender_id;
  insert into public.notifications (user_id, title, body, link)
  values (
    new.receiver_id,
    'New ' || case new.type when 'voice' then 'voice note' when 'video' then 'video note' when 'image' then 'photo' else 'message' end
      || ' from ' || coalesce(nullif(sender_name, ''), 'your care team'),
    case when new.type = 'text' then left(new.content, 120) else null end,
    '/app/messages/' || new.sender_id
  );
  return new;
end $$;
drop trigger if exists trg_notify_message on public.messages;
create trigger trg_notify_message after insert on public.messages
  for each row execute function public.notify_new_message();

create or replace function public.notify_appointment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, title, body, link)
    values (new.nurse_id, 'New appointment request', new.reason, '/app/appointments');
  elsif new.status is distinct from old.status then
    insert into public.notifications (user_id, title, body, link)
    values (new.patient_id, 'Appointment ' || new.status, to_char(new.scheduled_at, 'DD Mon YYYY HH24:MI'), '/app/appointments');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_appointment on public.appointments;
create trigger trg_notify_appointment after insert or update on public.appointments
  for each row execute function public.notify_appointment();

create or replace function public.notify_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, body, link)
  values (new.patient_id, 'New treatment plan', new.title, '/app/records');
  return new;
end $$;
drop trigger if exists trg_notify_plan on public.treatment_plans;
create trigger trg_notify_plan after insert on public.treatment_plans
  for each row execute function public.notify_plan();

-- Patients may only tick/untick items on their own plans (cannot edit medication details)
create or replace function public.toggle_treatment_item(p_item uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.treatment_items i set is_completed = p_done
  from public.treatment_plans p
  where i.id = p_item and i.plan_id = p.id and p.patient_id = auth.uid();
end $$;

-- ---------- Row level security ----------
alter table public.user_roles enable row level security;
alter table public.profiles enable row level security;
alter table public.nurse_patient_assignments enable row level security;
alter table public.messages enable row level security;
alter table public.patient_records enable row level security;
alter table public.treatment_plans enable row level security;
alter table public.treatment_items enable row level security;
alter table public.appointments enable row level security;
alter table public.notifications enable row level security;

-- user_roles: you can read your own role, and people you are connected to can read it
drop policy if exists "roles_select_own" on public.user_roles;
create policy "roles_select_own" on public.user_roles for select using (user_id = auth.uid());

-- profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (
  id = auth.uid()
  or public.has_role(id, 'nurse')                       -- any signed-in user can see nurse profiles (to pick a nurse)
  or public.is_assigned(auth.uid(), id)                 -- nurse sees assigned patients
);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- assignments
drop policy if exists "assign_select" on public.nurse_patient_assignments;
create policy "assign_select" on public.nurse_patient_assignments for select
  using (nurse_id = auth.uid() or patient_id = auth.uid());
drop policy if exists "assign_insert_patient" on public.nurse_patient_assignments;
create policy "assign_insert_patient" on public.nurse_patient_assignments for insert
  with check (patient_id = auth.uid() and public.has_role(auth.uid(), 'patient') and public.has_role(nurse_id, 'nurse'));
drop policy if exists "assign_update_own" on public.nurse_patient_assignments;
create policy "assign_update_own" on public.nurse_patient_assignments for update
  using (patient_id = auth.uid() or nurse_id = auth.uid());

-- messages
drop policy if exists "msg_select" on public.messages;
create policy "msg_select" on public.messages for select
  using (sender_id = auth.uid() or receiver_id = auth.uid());
drop policy if exists "msg_insert" on public.messages;
create policy "msg_insert" on public.messages for insert with check (
  sender_id = auth.uid()
  and (public.is_assigned(sender_id, receiver_id) or public.is_assigned(receiver_id, sender_id))
);
drop policy if exists "msg_mark_read" on public.messages;
create policy "msg_mark_read" on public.messages for update
  using (receiver_id = auth.uid()) with check (receiver_id = auth.uid());

-- patient_records: nurses write for assigned patients; patients read their own
drop policy if exists "rec_select" on public.patient_records;
create policy "rec_select" on public.patient_records for select
  using (patient_id = auth.uid() or nurse_id = auth.uid());
drop policy if exists "rec_insert" on public.patient_records;
create policy "rec_insert" on public.patient_records for insert
  with check (nurse_id = auth.uid() and public.is_assigned(auth.uid(), patient_id));
drop policy if exists "rec_update" on public.patient_records;
create policy "rec_update" on public.patient_records for update
  using (nurse_id = auth.uid()) with check (nurse_id = auth.uid());

-- treatment_plans
drop policy if exists "plan_select" on public.treatment_plans;
create policy "plan_select" on public.treatment_plans for select
  using (patient_id = auth.uid() or nurse_id = auth.uid());
drop policy if exists "plan_insert" on public.treatment_plans;
create policy "plan_insert" on public.treatment_plans for insert
  with check (nurse_id = auth.uid() and public.is_assigned(auth.uid(), patient_id));
drop policy if exists "plan_update" on public.treatment_plans;
create policy "plan_update" on public.treatment_plans for update
  using (nurse_id = auth.uid()) with check (nurse_id = auth.uid());
drop policy if exists "plan_delete" on public.treatment_plans;
create policy "plan_delete" on public.treatment_plans for delete using (nurse_id = auth.uid());

-- treatment_items
drop policy if exists "item_select" on public.treatment_items;
create policy "item_select" on public.treatment_items for select using (
  exists (select 1 from public.treatment_plans p
          where p.id = plan_id and (p.patient_id = auth.uid() or p.nurse_id = auth.uid()))
);
drop policy if exists "item_insert" on public.treatment_items;
create policy "item_insert" on public.treatment_items for insert with check (
  exists (select 1 from public.treatment_plans p where p.id = plan_id and p.nurse_id = auth.uid())
);
drop policy if exists "item_update" on public.treatment_items;
create policy "item_update" on public.treatment_items for update using (
  exists (select 1 from public.treatment_plans p where p.id = plan_id and p.nurse_id = auth.uid())
);
drop policy if exists "item_delete" on public.treatment_items;
create policy "item_delete" on public.treatment_items for delete using (
  exists (select 1 from public.treatment_plans p where p.id = plan_id and p.nurse_id = auth.uid())
);

-- appointments
drop policy if exists "appt_select" on public.appointments;
create policy "appt_select" on public.appointments for select
  using (patient_id = auth.uid() or nurse_id = auth.uid());
drop policy if exists "appt_insert" on public.appointments;
create policy "appt_insert" on public.appointments for insert with check (
  patient_id = auth.uid() and status = 'requested' and public.is_assigned(nurse_id, patient_id)
);
drop policy if exists "appt_update" on public.appointments;
create policy "appt_update" on public.appointments for update
  using (patient_id = auth.uid() or nurse_id = auth.uid());

-- notifications
drop policy if exists "notif_select" on public.notifications;
create policy "notif_select" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "notif_update" on public.notifications;
create policy "notif_update" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Private storage for voice notes, video notes and photos ----------
-- File path convention: <sender user id>/<file name>
insert into storage.buckets (id, name, public, file_size_limit)
values ('care-media', 'care-media', false, 52428800)   -- 50 MB limit, private
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "media_insert" on storage.objects;
create policy "media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'care-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media_select" on storage.objects;
create policy "media_select" on storage.objects for select to authenticated using (
  bucket_id = 'care-media' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.messages m
               where m.media_path = storage.objects.name and m.receiver_id = auth.uid())
    or exists (select 1 from public.treatment_items i
               join public.treatment_plans p on p.id = i.plan_id
               where i.media_path = storage.objects.name and p.patient_id = auth.uid())
  )
);

drop policy if exists "media_delete" on storage.objects;
create policy "media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'care-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Realtime ----------
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null; end $$;

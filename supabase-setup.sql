-- ============================================================
-- إعداد قاعدة بيانات صفحة «بيانات الطالب»
-- شغّل هذا الكود كاملاً في Supabase → SQL Editor → Run
-- الكود آمن للتشغيل أكثر من مرة (Idempotent)
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) جدول الملفات الشخصية
-- ------------------------------------------------------------
create table if not exists public.profiles (
  user_id     uuid references auth.users(id) on delete cascade not null primary key,
  full_name   text,
  student_id  text,
  grade_level text,
  major       text,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

-- إضافة أي أعمدة ناقصة إن كان الجدول موجوداً من محاولة سابقة
alter table public.profiles add column if not exists full_name   text;
alter table public.profiles add column if not exists student_id  text;
alter table public.profiles add column if not exists grade_level text;
alter table public.profiles add column if not exists major       text;
alter table public.profiles add column if not exists created_at  timestamptz default now() not null;
alter table public.profiles add column if not exists updated_at  timestamptz default now() not null;

-- ------------------------------------------------------------
-- 2) جدول المواد والدرجات
-- ------------------------------------------------------------
create table if not exists public.student_notes (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  subject_name text not null,
  subject_code text,
  grade        integer check (grade >= 0 and grade <= 100),
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null
);

alter table public.student_notes add column if not exists subject_name text;
alter table public.student_notes add column if not exists subject_code text;
alter table public.student_notes add column if not exists grade        integer;
alter table public.student_notes add column if not exists created_at   timestamptz default now() not null;
alter table public.student_notes add column if not exists updated_at   timestamptz default now() not null;

create index if not exists student_notes_user_id_idx on public.student_notes (user_id, created_at desc);

-- ------------------------------------------------------------
-- 3) تفعيل الحماية على مستوى الصفوف (RLS)
-- ------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.student_notes enable row level security;

-- ------------------------------------------------------------
-- 4) صلاحيات الجداول للمستخدمين المسجلين فقط
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles      to authenticated;
grant select, insert, update, delete on public.student_notes to authenticated;

-- ------------------------------------------------------------
-- 5) سياسات جدول profiles
-- ------------------------------------------------------------
-- حذف الأسماء القديمة إن وُجدت من محاولات سابقة
drop policy if exists "profiles select" on public.profiles;
drop policy if exists "profiles insert" on public.profiles;
drop policy if exists "profiles update" on public.profiles;
drop policy if exists "profiles delete" on public.profiles;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 6) سياسات جدول student_notes
-- ------------------------------------------------------------
-- حذف الأسماء القديمة إن وُجدت من محاولات سابقة
drop policy if exists "notes select" on public.student_notes;
drop policy if exists "notes insert" on public.student_notes;
drop policy if exists "notes update" on public.student_notes;
drop policy if exists "notes delete" on public.student_notes;

drop policy if exists "notes_select_own" on public.student_notes;
drop policy if exists "notes_insert_own" on public.student_notes;
drop policy if exists "notes_update_own" on public.student_notes;
drop policy if exists "notes_delete_own" on public.student_notes;

create policy "notes_select_own"
  on public.student_notes for select
  to authenticated
  using (auth.uid() = user_id);

create policy "notes_insert_own"
  on public.student_notes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "notes_update_own"
  on public.student_notes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "notes_delete_own"
  on public.student_notes for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 7) إنشاء ملف شخصي تلقائياً عند التسجيل
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 8) تحديث ذاكرة PostgREST حتى تظهر الجداول فوراً
-- ------------------------------------------------------------
notify pgrst, 'reload schema';

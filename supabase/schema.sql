-- ============================================================
-- MirzaBenevis — Supabase schema for cloud sync
-- ============================================================
-- How to use:
--   1. Create a free project at https://supabase.com
--   2. Open Dashboard -> SQL Editor -> New query
--   3. Paste this whole file and click "Run"
--   4. Copy your Project URL and anon public key from
--      Settings -> API, then put them in:
--        - modules/CloudSyncManager.js  (extension)
--        - web/config.js                (web app)
-- Email/password auth must be enabled (it is by default):
--   Authentication -> Providers -> Email -> Enabled
-- ============================================================

create table if not exists public.meetings (
    user_id            uuid        not null references auth.users (id) on delete cascade,
    meeting_start_time timestamptz not null,
    meeting_id         text,
    meeting_title      text,
    participants       jsonb       not null default '[]'::jsonb,
    messages           jsonb       not null default '[]'::jsonb,
    notes_text         text,
    notes_updated_at   timestamptz,
    summary_text       text,
    summary_language   text,
    summary_updated_at timestamptz,
    instance_id        text,
    last_updated       timestamptz,
    created_at         timestamptz not null default now(),
    primary key (user_id, meeting_start_time)
);

alter table public.meetings enable row level security;

drop policy if exists "Users can view own meetings" on public.meetings;
create policy "Users can view own meetings"
    on public.meetings for select
    using (auth.uid() = user_id);

drop policy if exists "Users can insert own meetings" on public.meetings;
create policy "Users can insert own meetings"
    on public.meetings for insert
    with check (auth.uid() = user_id);

drop policy if exists "Users can update own meetings" on public.meetings;
create policy "Users can update own meetings"
    on public.meetings for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users can delete own meetings" on public.meetings;
create policy "Users can delete own meetings"
    on public.meetings for delete
    using (auth.uid() = user_id);

create index if not exists meetings_user_start_idx
    on public.meetings (user_id, meeting_start_time desc);

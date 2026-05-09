-- PIXELFISH Community Schema — 社区功能迁移
-- 在 Supabase SQL Editor 中执行此文件

-- 确保 set_updated_at 函数存在（主 schema 已有时无影响）
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── 1. 用户资料表 ──────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar text not null default '🎮',
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles (username);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);


-- ── 2. 扩展 battle_teams 表 ────────────────────────────────
alter table public.battle_teams add column if not exists created_at timestamptz default now();
alter table public.battle_teams add column if not exists updated_at timestamptz default now();
alter table public.battle_teams add column if not exists is_public boolean not null default false;
alter table public.battle_teams add column if not exists likes_count integer not null default 0;
alter table public.battle_teams add column if not exists format text not null default 'singles';
alter table public.battle_teams add column if not exists author_username text;
alter table public.battle_teams add column if not exists author_avatar text;

create index if not exists battle_teams_public_idx on public.battle_teams (is_public);

-- 公开队伍允许所有人查看（覆盖原有只读自己的策略）
drop policy if exists "battle_teams_select_public" on public.battle_teams;
create policy "battle_teams_select_public" on public.battle_teams
  for select using (auth.uid() = user_id or is_public = true);


-- ── 3. 队伍点赞表 ─────────────────────────────────────────
create table if not exists public.team_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.battle_teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, team_id)
);

create index if not exists team_likes_team_idx on public.team_likes (team_id);
create index if not exists team_likes_user_idx on public.team_likes (user_id);

alter table public.team_likes enable row level security;

drop policy if exists "team_likes_select_all" on public.team_likes;
create policy "team_likes_select_all" on public.team_likes
  for select using (true);

drop policy if exists "team_likes_insert_own" on public.team_likes;
create policy "team_likes_insert_own" on public.team_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "team_likes_delete_own" on public.team_likes;
create policy "team_likes_delete_own" on public.team_likes
  for delete using (auth.uid() = user_id);


-- ── 4. 队伍评论表 ─────────────────────────────────────────
create table if not exists public.team_comments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.battle_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  content text not null check (char_length(content) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists team_comments_team_idx on public.team_comments (team_id, created_at asc);

alter table public.team_comments enable row level security;

drop policy if exists "team_comments_select_all" on public.team_comments;
create policy "team_comments_select_all" on public.team_comments
  for select using (true);

drop policy if exists "team_comments_insert_own" on public.team_comments;
create policy "team_comments_insert_own" on public.team_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "team_comments_delete_own" on public.team_comments;
create policy "team_comments_delete_own" on public.team_comments
  for delete using (auth.uid() = user_id);


-- ── 5. 扩展 pkm_catch_log — 捕捉/闪光分享 ───────────────────
alter table public.pkm_catch_log add column if not exists is_public boolean not null default false;
alter table public.pkm_catch_log add column if not exists author_username text;
alter table public.pkm_catch_log add column if not exists author_avatar text;
alter table public.pkm_catch_log add column if not exists likes_count integer not null default 0;

create index if not exists pkm_catch_log_public_idx on public.pkm_catch_log (is_public);

-- 覆盖原有只读自己的策略，允许公开记录所有人查看
drop policy if exists "pkm_catch_log_select_own" on public.pkm_catch_log;
drop policy if exists "pkm_catch_log_select_public" on public.pkm_catch_log;
create policy "pkm_catch_log_select_public" on public.pkm_catch_log
  for select using (auth.uid() = user_id or is_public = true);


-- ── 6. 扩展 pkm_series_log — 通关记录分享 ───────────────────
alter table public.pkm_series_log add column if not exists is_public boolean not null default false;
alter table public.pkm_series_log add column if not exists author_username text;
alter table public.pkm_series_log add column if not exists author_avatar text;
alter table public.pkm_series_log add column if not exists likes_count integer not null default 0;
alter table public.pkm_series_log add column if not exists series_name text;

create index if not exists pkm_series_log_public_idx on public.pkm_series_log (is_public);

drop policy if exists "pkm_series_log_select_own" on public.pkm_series_log;
drop policy if exists "pkm_series_log_select_public" on public.pkm_series_log;
create policy "pkm_series_log_select_public" on public.pkm_series_log
  for select using (auth.uid() = user_id or is_public = true);


-- ── 7. 扩展 pkm_partner — 排行榜公开 ────────────────────────
alter table public.pkm_partner add column if not exists is_public boolean not null default false;

create index if not exists pkm_partner_public_idx on public.pkm_partner (is_public);

-- 覆盖原有全量策略，加入公开伙伴可供所有人查看
drop policy if exists "Users manage own partner" on public.pkm_partner;
drop policy if exists "pkm_partner_public_select" on public.pkm_partner;
drop policy if exists "pkm_partner_manage_own" on public.pkm_partner;
create policy "pkm_partner_public_select" on public.pkm_partner
  for select using (auth.uid() = user_id or is_public = true);
create policy "pkm_partner_manage_own" on public.pkm_partner
  for all using (auth.uid() = user_id);


-- ── 8. 对战记录表 ─────────────────────────────────────────
create table if not exists public.battle_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.battle_teams(id) on delete set null,
  result text not null check (result in ('win', 'lose', 'draw')),
  format text not null default 'singles',
  note text,
  created_at timestamptz not null default now()
);

create index if not exists battle_records_user_idx on public.battle_records (user_id, created_at desc);

alter table public.battle_records enable row level security;

drop policy if exists "battle_records_select_own" on public.battle_records;
create policy "battle_records_select_own" on public.battle_records
  for select using (auth.uid() = user_id);

drop policy if exists "battle_records_insert_own" on public.battle_records;
create policy "battle_records_insert_own" on public.battle_records
  for insert with check (auth.uid() = user_id);

drop policy if exists "battle_records_delete_own" on public.battle_records;
create policy "battle_records_delete_own" on public.battle_records
  for delete using (auth.uid() = user_id);


-- ── 9. Champions 约战广场 ─────────────────────────────────
create table if not exists public.community_match_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  avatar text not null default '🎮',
  room_code text not null check (char_length(room_code) <= 24),
  format text not null default 'singles' check (format in ('singles', 'doubles')),
  rank_label text,
  note text check (char_length(note) <= 80),
  status text not null default 'open' check (status in ('open', 'closed')),
  expires_at timestamptz not null default (now() + interval '3 hours'),
  created_at timestamptz not null default now()
);

create index if not exists community_match_posts_open_idx
  on public.community_match_posts (status, expires_at desc, created_at desc);

alter table public.community_match_posts enable row level security;

drop policy if exists "community_match_posts_select_open" on public.community_match_posts;
create policy "community_match_posts_select_open" on public.community_match_posts
  for select using (status = 'open' and expires_at > now());

drop policy if exists "community_match_posts_insert_own" on public.community_match_posts;
create policy "community_match_posts_insert_own" on public.community_match_posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "community_match_posts_update_own" on public.community_match_posts;
create policy "community_match_posts_update_own" on public.community_match_posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "community_match_posts_delete_own" on public.community_match_posts;
create policy "community_match_posts_delete_own" on public.community_match_posts
  for delete using (auth.uid() = user_id);

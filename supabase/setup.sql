-- FORM. v0.07 — настройка хранилища фото. Выполнить один раз: Supabase → SQL Editor → Run.
-- Приватный бакет: файлы доступны только их владельцу (папка = id пользователя).

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('photos', 'photos', false,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif','image/gif'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;
-- file_size_limit намеренно не задаётся: размер файла ограничивает только глобальная настройка проекта
-- (Dashboard → Storage → Settings → Upload file size limit).

drop policy if exists "photos_select_own" on storage.objects;
drop policy if exists "photos_insert_own" on storage.objects;
drop policy if exists "photos_update_own" on storage.objects;
drop policy if exists "photos_delete_own" on storage.objects;

create policy "photos_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Защита от переполнения: суммарно не более 2 ГБ оригиналов на пользователя
-- (число 2147483648 можно поменять; приложение при замене фото само удаляет предыдущий оригинал).
create policy "photos_insert_own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (select coalesce(sum((o.metadata->>'size')::bigint), 0)
           from storage.objects o
          where o.bucket_id = 'photos'
            and (storage.foldername(o.name))[1] = auth.uid()::text) < 2147483648
  );

create policy "photos_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);


-- ============================================================================
-- Часть 2 (v0.10): синхронизация данных между устройствами
-- ============================================================================
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null,
  rev        integer     not null default 1,
  updated_at timestamptz not null default now(),
  device     text,
  constraint user_data_size check (pg_column_size(data) < 4194304)
);

-- Серверные резервные копии: клиент может только читать их, создаёт триггер.
create table if not exists public.user_data_backups (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  data       jsonb       not null,
  rev        integer     not null,
  created_at timestamptz not null default now()
);
create index if not exists user_data_backups_user_idx on public.user_data_backups (user_id, created_at desc);

alter table public.user_data enable row level security;
alter table public.user_data_backups enable row level security;

drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;
drop policy if exists "user_data_backups_select_own" on public.user_data_backups;

create policy "user_data_select_own" on public.user_data for select to authenticated using (auth.uid() = user_id);
create policy "user_data_insert_own" on public.user_data for insert to authenticated with check (auth.uid() = user_id);
create policy "user_data_update_own" on public.user_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Политики DELETE нет намеренно: прогресс нельзя удалить запросом из браузера (строка удаляется только вместе с аккаунтом).
create policy "user_data_backups_select_own" on public.user_data_backups for select to authenticated using (auth.uid() = user_id);

revoke all on public.user_data, public.user_data_backups from anon;

-- Защита от случайной перезаписи: версия может расти только на 1; перед изменением старая версия уходит в копии
-- (не чаще раза в 30 минут, а при восстановлении — всегда); хранится 30 последних копий.
create or replace function public.user_data_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id <> old.user_id then raise exception 'user_id is immutable'; end if;
  if new.rev <> old.rev + 1 then raise exception 'rev conflict' using errcode = '40001'; end if;
  if coalesce(new.device,'') like 'restore:%'
     or not exists (select 1 from public.user_data_backups b
                    where b.user_id = old.user_id and b.created_at > now() - interval '30 minutes') then
    insert into public.user_data_backups (user_id, data, rev) values (old.user_id, old.data, old.rev);
    delete from public.user_data_backups
     where user_id = old.user_id
       and id not in (select id from public.user_data_backups where user_id = old.user_id order by created_at desc limit 30);
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists user_data_guard on public.user_data;
create trigger user_data_guard before update on public.user_data
  for each row execute function public.user_data_guard();

-- Мгновенные обновления на других устройствах (без этого работает опрос раз в 45 секунд).
do $$ begin
  alter publication supabase_realtime add table public.user_data;
exception when duplicate_object then null; when undefined_object then null; end $$;


-- ============================================================================
-- Часть 3 (v0.14): социальная система — профили, FORM ID, друзья, приватность, уведомления
-- Скрипт можно запускать повторно. Все изменения данных идут через функции (RPC): прямых
-- INSERT/UPDATE/DELETE из браузера нет, а чужие профили читаются только через функции,
-- которые применяют настройки приватности на сервере.
-- ============================================================================

create table if not exists public.profiles (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  form_id             text not null unique check (form_id ~ '^FORM#[0-9]{6}$'),   -- постоянный публичный ID, не меняется
  username            text not null check (username ~ '^[A-Za-z0-9_.]{3,20}$'),   -- @имя, можно менять раз в 7 дней
  username_changed_at timestamptz,
  display_name        text not null default '' check (char_length(display_name) <= 18),
  bio                 text not null default '' check (char_length(bio) <= 200),
  status              text not null default '' check (char_length(status) <= 60),
  links               jsonb not null default '[]'::jsonb,
  theme               jsonb not null default '{}'::jsonb,
  avatar              text check (avatar is null or char_length(avatar) <= 120000),
  avatar_thumb        text check (avatar_thumb is null or char_length(avatar_thumb) <= 16000),
  banner_image        text check (banner_image is null or char_length(banner_image) <= 280000),
  bg_image            text check (bg_image is null or char_length(bg_image) <= 280000),
  stats               jsonb not null default '{}'::jsonb,
  pinned              jsonb not null default '[]'::jsonb,
  privacy             jsonb not null default '{}'::jsonb,
  registered_at       timestamptz not null default now(),
  last_seen           timestamptz,
  updated_at          timestamptz not null default now()
);
create unique index if not exists profiles_username_ci on public.profiles (lower(username));

create table if not exists public.friendships (
  user_a       uuid not null references auth.users(id) on delete cascade,
  user_b       uuid not null references auth.users(id) on delete cascade,
  requester    uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b),                      -- пара хранится один раз, в каноническом порядке
  check (requester = user_a or requester = user_b)
);
create index if not exists friendships_b_idx on public.friendships (user_b);

create table if not exists public.blocks (
  blocker    uuid not null references auth.users(id) on delete cascade,
  blocked    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null check (type in ('friend_request','friend_accepted','system')),
  actor      uuid references auth.users(id) on delete set null,
  data       jsonb not null default '{}'::jsonb,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, id desc);

-- ---------- v0.15: роли, теги, эксклюзивные предметы, журнал ----------
alter table public.profiles add column if not exists role text not null default 'user';
do $$ begin
  alter table public.profiles add constraint profiles_role_chk check (role in ('user','tester','owner'));
exception when duplicate_object then null; end $$;

create table if not exists public.profile_tags (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 24),
  style      text not null default 'outline' check (style in ('solid','outline','dotted','glow','plain')),
  color      text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists profile_tags_user_idx on public.profile_tags (user_id, id);

create table if not exists public.cosmetic_grants (
  user_id    uuid not null references auth.users(id) on delete cascade,
  item       text not null check (item in ('aurora','crown','void')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, item)
);

create table if not exists public.admin_log (
  id         bigint generated always as identity primary key,
  actor_fid  text,
  target_fid text,
  action     text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_log_idx on public.admin_log (id desc);

alter table public.profiles      enable row level security;
alter table public.profile_tags  enable row level security;
alter table public.cosmetic_grants enable row level security;
alter table public.admin_log     enable row level security;
alter table public.friendships   enable row level security;
alter table public.blocks        enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "profiles_select_own"      on public.profiles;
drop policy if exists "friendships_select_own"   on public.friendships;
drop policy if exists "blocks_select_own"        on public.blocks;
drop policy if exists "notifications_select_own" on public.notifications;
create policy "profiles_select_own"      on public.profiles      for select to authenticated using (user_id = auth.uid());
create policy "friendships_select_own"   on public.friendships   for select to authenticated using (auth.uid() = user_a or auth.uid() = user_b);
create policy "blocks_select_own"        on public.blocks        for select to authenticated using (blocker = auth.uid());
create policy "notifications_select_own" on public.notifications for select to authenticated using (user_id = auth.uid());

-- Писать в эти таблицы напрямую нельзя никому из клиентов: только через функции ниже.
revoke all on public.profiles, public.friendships, public.blocks, public.notifications from anon;
revoke insert, update, delete, truncate on public.profiles, public.friendships, public.blocks, public.notifications from authenticated;
revoke all on public.profile_tags, public.cosmetic_grants, public.admin_log from anon, authenticated;

-- ---------- вспомогательные функции (клиентам недоступны) ----------

create or replace function public._medals() returns text[] language sql immutable as $$
  select array['ПЕРВЫЙ ШАГ','НЕДЕЛЯ В ДЕЛЕ','СОТНЯ','ПЕРФЕКЦИОНИСТ','ДИСЦИПЛИНА','ОПЫТНЫЙ','СПЕЦИАЛИСТ']::text[]
$$;

create or replace function public._int(v text, lo int, hi int) returns int language plpgsql immutable as $$
begin
  return least(greatest(v::numeric::int, lo), hi);
exception when others then
  return lo;
end $$;

create or replace function public._reserved(n text) returns boolean language sql immutable as $$
  select lower(coalesce(n,'')) = any (array['admin','administrator','form','formapp','support','system','staff','moderator','mod','root','official','team','help','security','owner','ceo','tester'])
$$;

-- настройки приватности: значения по умолчанию + проверка допустимых вариантов
create or replace function public._priv(p jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'requests',  case when p->>'requests'  in ('everyone','nobody')            then p->>'requests'  else 'everyone' end,
    'online',    case when p->>'online'    in ('everyone','friends','nobody')  then p->>'online'    else 'friends'  end,
    'last_seen', case when p->>'last_seen' in ('everyone','friends','nobody')  then p->>'last_seen' else 'friends'  end,
    'profile',   case when p->>'profile'   in ('everyone','friends','nobody')  then p->>'profile'   else 'everyone' end,
    'find',      case when p->>'find'      in ('everyone','id')                then p->>'find'      else 'everyone' end,
    'hide', coalesce((
      select jsonb_agg(distinct h)
        from jsonb_array_elements_text(case when jsonb_typeof(p->'hide') = 'array' then p->'hide' else '[]'::jsonb end) h
       where h in ('bio','status','links','badges','stats','registered','banner')
    ), '[]'::jsonb)
  )
$$;

-- оформление профиля: цвет, баннер, декор, фон, рамка аватара
create or replace function public._theme(p jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'color',  case when p->>'color'  ~ '^#[0-9a-fA-F]{6}$' then lower(p->>'color') else '#2f5bea' end,
    'color2', case when p->>'color2' ~ '^#[0-9a-fA-F]{6} in ('color','image') then p->>'banner' else 'color' end,
    'deco',   case when p->>'deco'   in ('none','dots','grid','lines','orbit','ascii','binary') then p->>'deco' else 'dots' end,
    'bg',     case when p->>'bg'     in ('none','tint','image') then p->>'bg' else 'none' end,
    'frame',  case when p->>'frame'  in ('none','ring','dots','double','square','orbit','halo','aurora','crown','void') then p->>'frame' else 'none' end
  )
$$;

-- картинка допускается только как data-URL jpeg/png/webp ограниченного размера
create or replace function public._img_ok(v text, n int) returns boolean language sql immutable as $$
  select v is null or v = '' or (length(v) <= n and v ~ '^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$')
$$;

-- ссылки: до 4 штук, только http(s)
create or replace function public._links(p jsonb) returns jsonb language plpgsql immutable as $$
declare r jsonb := '[]'::jsonb; e jsonb; lab text; u text;
begin
  if coalesce(jsonb_typeof(p), '') <> 'array' then return r; end if;
  for e in select * from jsonb_array_elements(p) loop
    exit when jsonb_array_length(r) >= 4;
    if jsonb_typeof(e) <> 'object' then continue; end if;
    lab := left(btrim(coalesce(e->>'label', '')), 24);
    u   := btrim(coalesce(e->>'url', ''));
    if length(u) <= 200 and u ~* '^https?://[^\s<>"'']+$' then
      r := r || jsonb_build_array(jsonb_build_object('label', lab, 'url', u));
    end if;
  end loop;
  return r;
end $$;

create or replace function public._blocked(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;

-- отношение me → other: self | friend | incoming | outgoing | none
create or replace function public._rel(me uuid, other uuid) returns text language sql stable security definer set search_path = public as $$
  select case when me = other then 'self' else coalesce((
    select case when f.status = 'accepted' then 'friend' when f.requester = me then 'outgoing' else 'incoming' end
      from public.friendships f where f.user_a = least(me, other) and f.user_b = greatest(me, other)
  ), 'none') end
$$;

-- эксклюзивные рамки: доступны владельцу всегда, остальным — только по выдаче из Owner Panel
create or replace function public._exclusive() returns text[] language sql immutable as $$
  select array['aurora','crown','void']::text[]
$$;

create or replace function public._has_item(p_uid uuid, p_item text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = p_uid and role = 'owner')
      or exists (select 1 from public.cosmetic_grants where user_id = p_uid and item = p_item)
$$;

-- оформление с учётом прав: закрытая рамка (например, после снятия выдачи) показывается как «без рамки»
create or replace function public._eff_theme(p public.profiles) returns jsonb language sql stable security definer set search_path = public as $$
  select case when (public._theme(p.theme)->>'frame') = any (public._exclusive())
               and not public._has_item(p.user_id, public._theme(p.theme)->>'frame')
              then public._theme(p.theme) || '{"frame":"none"}'::jsonb
              else public._theme(p.theme) end
$$;

create or replace function public._tags(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('l', label, 's', style, 'c', color) order by id), '[]'::jsonb)
    from public.profile_tags where user_id = p_uid
$$;

create or replace function public._unlocked(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(case when exists (select 1 from public.profiles where user_id = p_uid and role = 'owner')
                       then public._exclusive()
                       else array(select item from public.cosmetic_grants where user_id = p_uid) end)
$$;

-- короткая карточка пользователя для списков (теги показываются везде рядом с именем)
create or replace function public._card(p public.profiles) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', p.form_id, 'username', p.username,
    'display_name', coalesce(nullif(p.display_name, ''), p.username),
    'avatar_thumb', p.avatar_thumb,
    'color', public._eff_theme(p)->>'color', 'frame', public._eff_theme(p)->>'frame',
    'tags', public._tags(p.user_id))
$$;

-- полный профиль для его владельца
create or replace function public._own(p public.profiles) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', p.form_id, 'username', p.username, 'username_changed_at', p.username_changed_at,
    'display_name', p.display_name, 'bio', p.bio, 'status', p.status, 'links', p.links,
    'theme', public._eff_theme(p), 'avatar', p.avatar, 'avatar_thumb', p.avatar_thumb,
    'banner_image', p.banner_image, 'bg_image', p.bg_image, 'stats', p.stats, 'pinned', p.pinned,
    'privacy', public._priv(p.privacy), 'registered_at', p.registered_at,
    'role', p.role, 'tags', public._tags(p.user_id), 'unlocked', public._unlocked(p.user_id))
$$;

-- профиль глазами другого пользователя: здесь применяются все настройки приватности
create or replace function public._profile_view(p public.profiles, p_friend boolean, p_limited boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  pv   jsonb := public._priv(p.privacy);
  hide jsonb := pv->'hide';
  th   jsonb := public._eff_theme(p);
  so   text  := pv->>'online';
  sl   text  := pv->>'last_seen';
  o    jsonb;
begin
  o := jsonb_build_object('id', p.form_id, 'username', p.username,
        'display_name', coalesce(nullif(p.display_name, ''), p.username),
        'avatar', p.avatar, 'avatar_thumb', p.avatar_thumb, 'tags', public._tags(p.user_id));
  if p_limited then
    return o || jsonb_build_object('limited', true,
      'theme', jsonb_build_object('color', th->'color', 'frame', th->'frame', 'banner', 'color', 'deco', 'none', 'bg', 'none'));
  end if;
  if (hide ? 'banner') then th := th || jsonb_build_object('banner', 'color', 'bg', 'none', 'deco', 'none'); end if;
  o := o || jsonb_build_object('theme', th,
        'online',    case when so = 'everyone' or (so = 'friends' and p_friend)
                          then (p.last_seen is not null and p.last_seen > now() - interval '2 minutes') else null end,
        'last_seen', case when sl = 'everyone' or (sl = 'friends' and p_friend) then p.last_seen else null end);
  if th->>'banner' = 'image' and p.banner_image is not null then o := o || jsonb_build_object('banner_image', p.banner_image); end if;
  if th->>'bg' = 'image' and p.bg_image is not null then o := o || jsonb_build_object('bg_image', p.bg_image); end if;
  if not (hide ? 'bio')        then o := o || jsonb_build_object('bio', p.bio); end if;
  if not (hide ? 'status')     then o := o || jsonb_build_object('status', p.status); end if;
  if not (hide ? 'links')      then o := o || jsonb_build_object('links', p.links); end if;
  if not (hide ? 'registered') then o := o || jsonb_build_object('registered_at', p.registered_at); end if;
  if not (hide ? 'badges') then
    o := o || jsonb_build_object('badges', jsonb_build_object(
      'rank', public._int(p.stats->>'rank', 0, 10),
      'medals', case when p.role = 'owner' then to_jsonb(public._medals())   -- владельцу открыты все достижения
                     when jsonb_typeof(p.stats->'medals') = 'array' then p.stats->'medals' else '[]'::jsonb end,
      'pinned', p.pinned));
  end if;
  if not (hide ? 'stats') then
    o := o || jsonb_build_object('stats', jsonb_build_object(
      'xp', public._int(p.stats->>'xp', 0, 10000000),
      'tasks', public._int(p.stats->>'tasks', 0, 1000000),
      'best', public._int(p.stats->>'best', 0, 10000)));
  end if;
  return o;
end $$;

create or replace function public._notify(p_user uuid, p_type text, p_actor uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'friend_request' and p_actor is not null then
    delete from public.notifications where user_id = p_user and type = 'friend_request' and actor = p_actor;
  end if;
  insert into public.notifications (user_id, type, actor, data) values (p_user, p_type, p_actor, coalesce(p_data, '{}'::jsonb));
  -- хранится не больше 100 последних уведомлений на пользователя
  delete from public.notifications
   where user_id = p_user and id not in (select id from public.notifications where user_id = p_user order by id desc limit 100);
end $$;

-- постоянный публичный ID вида FORM#483921 (повторов нет: проверка + уникальный индекс)
create or replace function public._gen_form_id() returns text language plpgsql security definer set search_path = public as $$
declare v text; i int := 0;
begin
  loop
    v := 'FORM#' || (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from public.profiles where form_id = v);
    i := i + 1;
    if i > 50 then raise exception 'id_space_full'; end if;
  end loop;
  return v;
end $$;

-- создаёт профиль: ID, стартовое @имя (из GitHub / почты, уникальное), дата регистрации из аккаунта
create or replace function public._make_profile(p_uid uuid) returns void language plpgsql security definer set search_path = public as $$
declare u record; base text; v text; i int := 0;
begin
  if exists (select 1 from public.profiles where user_id = p_uid) then return; end if;
  select id, email, raw_user_meta_data, created_at into u from auth.users where id = p_uid;
  if not found then return; end if;
  -- @имя берётся только из публичного логина GitHub; адрес почты никогда не используется
  base := left(regexp_replace(coalesce(u.raw_user_meta_data->>'user_name', u.raw_user_meta_data->>'preferred_username', ''), '[^A-Za-z0-9_.]', '', 'g'), 15);
  v := case when length(base) < 3 then 'user' || (100000 + floor(random() * 900000))::int::text else base end;
  while public._reserved(v) or exists (select 1 from public.profiles where lower(username) = lower(v)) loop
    i := i + 1;
    v := case when length(base) < 3 then 'user' || (100000 + floor(random() * 900000))::int::text
              else left(base, 15) || (floor(random() * 10000))::int::text end;
    if i > 30 then v := 'user' || (100000 + floor(random() * 900000))::int::text; exit; end if;
  end loop;
  insert into public.profiles (user_id, form_id, username, registered_at)
  values (p_uid, public._gen_form_id(), v, coalesce(u.created_at, now()));
  perform public._notify(p_uid, 'system', null, jsonb_build_object('k', 'welcome'));
exception when unique_violation then
  null; -- параллельный запрос уже создал профиль или занял имя: клиент повторит get_my_profile()
end $$;

-- профиль создаётся автоматически при регистрации; ошибка здесь никогда не ломает регистрацию
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public._make_profile(new.id);
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
  for each row execute function public.handle_new_user();

-- защита от подмены: ID, владелец и дата регистрации не меняются никогда и никем
create or replace function public.profiles_guard() returns trigger language plpgsql as $$
begin
  if new.user_id <> old.user_id then raise exception 'user_id is immutable'; end if;
  if new.form_id <> old.form_id then raise exception 'form_id is immutable'; end if;
  if new.registered_at <> old.registered_at then raise exception 'registered_at is immutable'; end if;
  -- роль меняют только функции Owner Panel (они выставляют form.admin на время транзакции)
  if new.role is distinct from old.role and coalesce(current_setting('form.admin', true), '') <> '1' then
    raise exception 'role is immutable';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

-- ---------- функции для клиента ----------

create or replace function public.get_my_profile() returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.profiles;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into p from public.profiles where user_id = me;
  if not found then
    perform public._make_profile(me);
    select * into p from public.profiles where user_id = me;
    if not found then raise exception 'profile_unavailable'; end if;
  end if;
  return public._own(p);
end $$;

create or replace function public.update_profile(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.profiles; v text; m text[];
begin
  if me is null then raise exception 'auth_required'; end if;
  perform public.get_my_profile();
  select * into r from public.profiles where user_id = me for update;

  if p ? 'display_name' then
    r.display_name := left(btrim(coalesce(p->>'display_name', '')), 18);
    -- имя нельзя оформить так, чтобы оно выглядело как чужой привилегированный тег
    if r.display_name <> '' and exists (select 1 from public.profile_tags where lower(label) = lower(r.display_name) and user_id <> me) then raise exception 'name_reserved'; end if;
  end if;

  if p ? 'username' then
    v := btrim(coalesce(p->>'username', ''));
    if v <> r.username then
      if v !~ '^[A-Za-z0-9_.]{3,20}$' then raise exception 'username_invalid'; end if;
      if public._reserved(v) then raise exception 'username_reserved'; end if;
      if r.username_changed_at is not null and r.username_changed_at > now() - interval '7 days' then raise exception 'username_cooldown'; end if;
      if exists (select 1 from public.profiles where lower(username) = lower(v) and user_id <> me) then raise exception 'username_taken'; end if;
      r.username := v;
      r.username_changed_at := now();
    end if;
  end if;

  if p ? 'bio'    then r.bio    := left(btrim(coalesce(p->>'bio', '')), 200); end if;
  if p ? 'status' then
    r.status := left(btrim(coalesce(p->>'status', '')), 60);
    if r.status <> '' and exists (select 1 from public.profile_tags where lower(label) = lower(r.status) and user_id <> me) then raise exception 'name_reserved'; end if;
  end if;
  if p ? 'links'  then r.links  := public._links(p->'links'); end if;

  if p ? 'theme' and jsonb_typeof(p->'theme') = 'object' then
    r.theme := public._theme(coalesce(r.theme, '{}'::jsonb) || (p->'theme'));
  end if;
  -- эксклюзивная рамка: только владелец или выданная из Owner Panel; проверка на сервере
  if (r.theme->>'frame') = any (public._exclusive()) and not public._has_item(me, r.theme->>'frame') then
    if (p->'theme') ? 'frame' then raise exception 'frame_locked'; end if;
    r.theme := r.theme || '{"frame":"none"}'::jsonb;
  end if;

  if p ? 'avatar' then
    v := p->>'avatar';
    if not public._img_ok(v, 120000) then raise exception 'image_invalid'; end if;
    r.avatar := nullif(v, '');
  end if;
  if p ? 'avatar_thumb' then
    v := p->>'avatar_thumb';
    if not public._img_ok(v, 16000) then raise exception 'image_invalid'; end if;
    r.avatar_thumb := nullif(v, '');
  end if;
  if p ? 'banner_image' then
    v := p->>'banner_image';
    if not public._img_ok(v, 280000) then raise exception 'image_invalid'; end if;
    r.banner_image := nullif(v, '');
  end if;
  if p ? 'bg_image' then
    v := p->>'bg_image';
    if not public._img_ok(v, 280000) then raise exception 'image_invalid'; end if;
    r.bg_image := nullif(v, '');
  end if;

  -- достижения и статистика приходят из приложения (прогресс хранится на устройстве): проверяется только формат
  if p ? 'stats' and jsonb_typeof(p->'stats') = 'object' then
    m := array(select distinct x
                 from jsonb_array_elements_text(case when jsonb_typeof(p->'stats'->'medals') = 'array' then p->'stats'->'medals' else '[]'::jsonb end) x
                where x = any (public._medals()));
    r.stats := jsonb_build_object(
      'rank',   public._int(p->'stats'->>'rank', 0, 10),
      'xp',     public._int(p->'stats'->>'xp', 0, 10000000),
      'tasks',  public._int(p->'stats'->>'tasks', 0, 1000000),
      'best',   public._int(p->'stats'->>'best', 0, 10000),
      'medals', to_jsonb(m));
  end if;

  if (p ? 'pinned' or p ? 'stats') then
    m := array(select jsonb_array_elements_text(case when jsonb_typeof(r.stats->'medals') = 'array' then r.stats->'medals' else '[]'::jsonb end));
    r.pinned := coalesce((
      select jsonb_agg(d.x order by d.o)
        from (select t.x, min(t.o) as o
                from jsonb_array_elements_text(case when jsonb_typeof(coalesce(p->'pinned', r.pinned)) = 'array' then coalesce(p->'pinned', r.pinned) else '[]'::jsonb end)
                     with ordinality as t(x, o)
               where t.x = any (m)
               group by t.x order by min(t.o) limit 3) d
    ), '[]'::jsonb);
  end if;

  if p ? 'privacy' and jsonb_typeof(p->'privacy') = 'object' then
    r.privacy := public._priv(coalesce(r.privacy, '{}'::jsonb) || (p->'privacy'));
  end if;

  update public.profiles set
    display_name = r.display_name, username = r.username, username_changed_at = r.username_changed_at,
    bio = r.bio, status = r.status, links = r.links, theme = r.theme,
    avatar = r.avatar, avatar_thumb = r.avatar_thumb, banner_image = r.banner_image, bg_image = r.bg_image,
    stats = r.stats, pinned = r.pinned, privacy = r.privacy, updated_at = now()
  where user_id = me;
  return public._own(r);
exception when unique_violation then
  raise exception 'username_taken';
end $$;

-- «что видят другие»: тот же код, что и для чужого просмотра, но для собственного профиля
create or replace function public.preview_profile(p_as text default 'stranger') returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles; pv jsonb; fr boolean := (p_as = 'friend'); lim boolean;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where user_id = me;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  pv := public._priv(t.privacy);
  lim := pv->>'profile' = 'nobody' or (pv->>'profile' = 'friends' and not fr);
  return jsonb_build_object('relation', case when fr then 'friend' else 'none' end, 'preview', true,
    'can_request', (not fr and pv->>'requests' = 'everyone'), 'profile', public._profile_view(t, fr, lim));
end $$;

create or replace function public.get_profile(p_form_id text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles; rel text; fr boolean; pv jsonb; mine boolean; lim boolean;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if t.user_id = me then return jsonb_build_object('relation', 'self', 'profile', public._own(t)); end if;
  -- тот, кто заблокировал меня, для меня «не существует»
  if exists (select 1 from public.blocks where blocker = t.user_id and blocked = me) then
    return jsonb_build_object('error', 'not_found');
  end if;
  rel  := public._rel(me, t.user_id);
  fr   := rel = 'friend';
  pv   := public._priv(t.privacy);
  mine := exists (select 1 from public.blocks where blocker = me and blocked = t.user_id);
  lim  := pv->>'profile' = 'nobody' or (pv->>'profile' = 'friends' and not fr);
  return jsonb_build_object('relation', rel, 'blocked_by_me', mine,
    'can_request', (rel = 'none' and not mine and pv->>'requests' = 'everyone'),
    'profile', public._profile_view(t, fr, lim));
end $$;

create or replace function public.search_users(p_q text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); q text := btrim(coalesce(p_q, '')); res jsonb; esc text;
begin
  if me is null then raise exception 'auth_required'; end if;
  q := left(q, 40);
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  -- точный ID: FORM#123456, #123456, 123456
  if q ~* '^(form)?\s*#?\s*[0-9]{6}$' then
    select coalesce(jsonb_agg(public._card(p) || jsonb_build_object('relation', public._rel(me, p.user_id))), '[]'::jsonb) into res
      from public.profiles p
     where p.form_id = 'FORM#' || substring(q from '([0-9]{6})$') and p.user_id <> me and not public._blocked(me, p.user_id);
    return res;
  end if;
  q := regexp_replace(q, '^@', '');
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  esc := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  select coalesce(jsonb_agg(x.c order by x.k, x.nm), '[]'::jsonb) into res from (
    select public._card(p) || jsonb_build_object('relation', public._rel(me, p.user_id)) as c,
           case when lower(p.username) = lower(q) then 0 when p.username ilike esc || '%' then 1 else 2 end as k,
           lower(p.username) as nm
      from public.profiles p
     where p.user_id <> me
       and public._priv(p.privacy)->>'find' = 'everyone'
       and not public._blocked(me, p.user_id)
       and (p.username ilike esc || '%' or p.display_name ilike '%' || esc || '%')
     order by 2, 3
     limit 20) x;
  return res;
end $$;

create or replace function public.friends_overview() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); res jsonb;
begin
  if me is null then raise exception 'auth_required'; end if;
  select coalesce(jsonb_agg(x.o order by x.nm), '[]'::jsonb) into res from (
    select public._card(t) || jsonb_build_object(
             'relation', case when f.status = 'accepted' then 'friend' when f.requester = me then 'outgoing' else 'incoming' end,
             'since', coalesce(f.responded_at, f.created_at),
             'requested_at', f.created_at,
             'status', case when f.status = 'accepted' and not ((public._priv(t.privacy)->'hide') ? 'status') then nullif(t.status, '') else null end,
             'online', case when f.status = 'accepted' and public._priv(t.privacy)->>'online' in ('everyone', 'friends')
                            then (t.last_seen is not null and t.last_seen > now() - interval '2 minutes') else null end,
             'last_seen', case when f.status = 'accepted' and public._priv(t.privacy)->>'last_seen' in ('everyone', 'friends')
                               then t.last_seen else null end) as o,
           lower(coalesce(nullif(t.display_name, ''), t.username)) as nm
      from public.friendships f
      join public.profiles t on t.user_id = case when f.user_a = me then f.user_b else f.user_a end
     where (f.user_a = me or f.user_b = me) and not public._blocked(me, t.user_id)
  ) x;
  return res;
end $$;

create or replace function public.send_friend_request(p_form_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles; f public.friendships; a uuid; b uuid; cnt int;
begin
  if me is null then raise exception 'auth_required'; end if;
  perform public.get_my_profile();
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  if t.user_id = me then raise exception 'self'; end if;
  if exists (select 1 from public.blocks where blocker = me and blocked = t.user_id) then raise exception 'unblock_first'; end if;
  if exists (select 1 from public.blocks where blocker = t.user_id and blocked = me) then raise exception 'unavailable'; end if;
  a := least(me, t.user_id); b := greatest(me, t.user_id);
  select * into f from public.friendships where user_a = a and user_b = b for update;
  if found then
    if f.status = 'accepted' then raise exception 'already_friends'; end if;
    if f.requester = me then raise exception 'already_sent'; end if;
    -- встречная заявка: оба хотят дружить, принимаем сразу
    update public.friendships set status = 'accepted', responded_at = now() where user_a = a and user_b = b;
    delete from public.notifications where user_id = me and type = 'friend_request' and actor = t.user_id;
    perform public._notify(t.user_id, 'friend_accepted', me, '{}'::jsonb);
    return jsonb_build_object('state', 'friend');
  end if;
  if public._priv(t.privacy)->>'requests' <> 'everyone' then raise exception 'requests_closed'; end if;
  select count(*) into cnt from public.friendships where requester = me and status = 'pending';
  if cnt >= 50 then raise exception 'too_many_pending'; end if;
  insert into public.friendships (user_a, user_b, requester) values (a, b, me);
  perform public._notify(t.user_id, 'friend_request', me, '{}'::jsonb);
  return jsonb_build_object('state', 'pending');
exception when unique_violation then
  raise exception 'already_sent';
end $$;

create or replace function public.respond_friend_request(p_form_id text, p_accept boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles; a uuid; b uuid;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  a := least(me, t.user_id); b := greatest(me, t.user_id);
  if coalesce(p_accept, false) then
    update public.friendships set status = 'accepted', responded_at = now()
     where user_a = a and user_b = b and status = 'pending' and requester = t.user_id;
    if not found then raise exception 'no_request'; end if;
    perform public._notify(t.user_id, 'friend_accepted', me, '{}'::jsonb);
  else
    delete from public.friendships where user_a = a and user_b = b and status = 'pending' and requester = t.user_id;
    if not found then raise exception 'no_request'; end if;
  end if;
  delete from public.notifications where user_id = me and type = 'friend_request' and actor = t.user_id;
  return jsonb_build_object('state', case when coalesce(p_accept, false) then 'friend' else 'none' end);
end $$;

create or replace function public.cancel_friend_request(p_form_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  delete from public.friendships
   where user_a = least(me, t.user_id) and user_b = greatest(me, t.user_id) and status = 'pending' and requester = me;
  if not found then raise exception 'no_request'; end if;
  delete from public.notifications where user_id = t.user_id and type = 'friend_request' and actor = me;
  return jsonb_build_object('state', 'none');
end $$;

-- удаление из друзей: второй стороне уведомление не отправляется
create or replace function public.remove_friend(p_form_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  delete from public.friendships
   where user_a = least(me, t.user_id) and user_b = greatest(me, t.user_id) and status = 'accepted';
  return jsonb_build_object('state', 'none');
end $$;

create or replace function public.block_user(p_form_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  if t.user_id = me then raise exception 'self'; end if;
  insert into public.blocks (blocker, blocked) values (me, t.user_id) on conflict do nothing;
  delete from public.friendships where user_a = least(me, t.user_id) and user_b = greatest(me, t.user_id);
  delete from public.notifications where (user_id = me and actor = t.user_id) or (user_id = t.user_id and actor = me);
  return jsonb_build_object('state', 'blocked');
end $$;

create or replace function public.unblock_user(p_form_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  delete from public.blocks where blocker = me and blocked = t.user_id;
  return jsonb_build_object('state', 'none');
end $$;

create or replace function public.list_blocked() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth_required'; end if;
  return coalesce((
    select jsonb_agg(public._card(t) || jsonb_build_object('since', b.created_at) order by b.created_at desc)
      from public.blocks b join public.profiles t on t.user_id = b.blocked
     where b.blocker = me), '[]'::jsonb);
end $$;

-- «онлайн»: приложение вызывает раз в минуту, пока открыто; считается онлайн в течение 2 минут
create or replace function public.touch_presence() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  update public.profiles set last_seen = now() where user_id = auth.uid();
end $$;

create or replace function public.notif_list(p_limit int default 50) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth_required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'type', n.type, 'read', n.is_read, 'created_at', n.created_at, 'data', n.data,
             'actor', case when a.user_id is null then null else public._card(a) end) order by n.id desc)
      from (select * from public.notifications where user_id = me order by id desc
             limit least(greatest(coalesce(p_limit, 50), 1), 100)) n
      left join public.profiles a on a.user_id = n.actor), '[]'::jsonb);
end $$;

create or replace function public.notif_unread() returns int language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth_required'; end if;
  return (select count(*)::int from public.notifications where user_id = me and not is_read);
end $$;

create or replace function public.notif_mark_read(p_ids bigint[] default null) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  update public.notifications set is_read = true
   where user_id = auth.uid() and not is_read and (p_ids is null or id = any (p_ids));
end $$;

create or replace function public.notif_clear() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  delete from public.notifications where user_id = auth.uid();
end $$;

-- ---------- права на вызов функций ----------
-- вспомогательные функции клиентам недоступны; рабочие — только вошедшим пользователям
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_medals','_int','_reserved','_priv','_theme','_img_ok','_links','_blocked','_rel',
                  '_card','_own','_profile_view','_notify','_gen_form_id','_make_profile','handle_new_user','profiles_guard') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('get_my_profile','update_profile','preview_profile','get_profile','search_users',
                  'friends_overview','send_friend_request','respond_friend_request','cancel_friend_request','remove_friend','block_user',
                  'unblock_user','list_blocked','touch_presence','notif_list','notif_unread','notif_mark_read','notif_clear') loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- мгновенные уведомления и обновление списка друзей (без этого приложение опрашивает сервер раз в 30 секунд)
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- профили для уже существующих аккаунтов (новые создаются триггером)
do $$
declare r record;
begin
  for r in select id from auth.users loop
    perform public._make_profile(r.id);
  end loop;
end $$;


-- ============================================================================
-- Часть 4 (v0.15): роли, теги, Owner Panel, приватность
-- Все проверки прав выполняются здесь, на сервере. Клиент роль не присылает и не может менять.
-- ============================================================================

create or replace function public._is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'owner')
$$;

create or replace function public._admin_log(p_action text, p_target uuid, p_data jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_log (actor_fid, target_fid, action, data)
  values ((select form_id from public.profiles where user_id = auth.uid()),
          (select form_id from public.profiles where user_id = p_target),
          p_action, coalesce(p_data, '{}'::jsonb));
end $$;

-- список пользователей: только публичные поля (почта и другие данные аккаунта недоступны никому, даже владельцу)
create or replace function public.admin_users(p_q text default '') returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := left(btrim(coalesce(p_q, '')), 40); esc text;
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  esc := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return coalesce((
    select jsonb_agg(x.o order by x.ord, x.nm) from (
      select public._card(p) || jsonb_build_object('role', p.role, 'registered_at', p.registered_at, 'last_seen', p.last_seen) as o,
             case p.role when 'owner' then 0 when 'tester' then 1 else 2 end as ord,
             lower(p.username) as nm
        from public.profiles p
       where q = '' or p.form_id ilike '%' || esc || '%' or p.username ilike '%' || esc || '%' or p.display_name ilike '%' || esc || '%'
       order by 2, 3
       limit 100) x), '[]'::jsonb);
end $$;

create or replace function public.admin_user(p_form_id text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.profiles;
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object(
    'user', public._card(t) || jsonb_build_object('role', t.role, 'registered_at', t.registered_at, 'last_seen', t.last_seen),
    'tags', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'l', g.label, 's', g.style, 'c', g.color) order by g.id)
                        from public.profile_tags g where g.user_id = t.user_id), '[]'::jsonb),
    'grants', coalesce((select jsonb_agg(c.item order by c.item) from public.cosmetic_grants c where c.user_id = t.user_id), '[]'::jsonb),
    'exclusive', to_jsonb(public._exclusive()));
end $$;

-- роль: user или tester. Роль owner назначается только вручную в базе; свою роль и роль владельца менять нельзя
create or replace function public.admin_set_role(p_form_id text, p_role text) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.profiles; old text;
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  if p_role not in ('user', 'tester') then raise exception 'role_invalid'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  if t.user_id = auth.uid() then raise exception 'self_role'; end if;
  if t.role = 'owner' then raise exception 'owner_protected'; end if;
  old := t.role;
  perform set_config('form.admin', '1', true);
  update public.profiles set role = p_role where user_id = t.user_id;
  perform set_config('form.admin', '', true);
  perform public._admin_log('set_role', t.user_id, jsonb_build_object('from', old, 'to', p_role));
  return jsonb_build_object('role', p_role);
end $$;

create or replace function public.admin_add_tag(p_form_id text, p_label text, p_style text default 'outline', p_color text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.profiles; lab text := btrim(coalesce(p_label, '')); col text := nullif(btrim(coalesce(p_color, '')), '');
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  if char_length(lab) < 1 or char_length(lab) > 24 then raise exception 'tag_invalid'; end if;
  if p_style not in ('solid', 'outline', 'dotted', 'glow', 'plain') then raise exception 'tag_invalid'; end if;
  if col is not null and col !~ '^#[0-9a-fA-F]{6}$' then raise exception 'tag_invalid'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  if (select count(*) from public.profile_tags where user_id = t.user_id) >= 3 then raise exception 'too_many_tags'; end if;
  insert into public.profile_tags (user_id, label, style, color, created_by) values (t.user_id, lab, p_style, lower(col), auth.uid());
  perform public._admin_log('add_tag', t.user_id, jsonb_build_object('label', lab, 'style', p_style, 'color', col));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_remove_tag(p_tag_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.profile_tags;
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  delete from public.profile_tags where id = p_tag_id returning * into g;
  if not found then raise exception 'not_found'; end if;
  perform public._admin_log('remove_tag', g.user_id, jsonb_build_object('label', g.label));
  return jsonb_build_object('ok', true);
end $$;

-- выдача и снятие эксклюзивных предметов (рамок)
create or replace function public.admin_grant(p_form_id text, p_item text, p_on boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.profiles;
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  if p_item <> all (public._exclusive()) then raise exception 'item_invalid'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  if coalesce(p_on, false) then
    insert into public.cosmetic_grants (user_id, item, granted_by) values (t.user_id, p_item, auth.uid()) on conflict do nothing;
  else
    delete from public.cosmetic_grants where user_id = t.user_id and item = p_item;
  end if;
  perform public._admin_log(case when coalesce(p_on, false) then 'grant' else 'revoke' end, t.user_id, jsonb_build_object('item', p_item));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_log_list(p_limit int default 100) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'actor', l.actor_fid, 'target', l.target_fid, 'action', l.action, 'data', l.data, 'at', l.created_at) order by l.id desc)
      from (select * from public.admin_log order by id desc limit least(greatest(coalesce(p_limit, 100), 1), 200)) l), '[]'::jsonb);
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_exclusive','_has_item','_eff_theme','_tags','_unlocked','_is_owner','_admin_log') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('admin_users','admin_user','admin_set_role','admin_add_tag','admin_remove_tag','admin_grant','admin_log_list') loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- ---------- назначение ролей существующим аккаунтам по FORM ID (повторный запуск безопасен) ----------
do $$
declare o uuid; t uuid;
begin
  select user_id into o from public.profiles where form_id = 'FORM#000000';
  select user_id into t from public.profiles where form_id = 'FORM#107445';

  perform set_config('form.admin', '1', true);
  if o is null then raise notice 'FORM#000000 не найден: войдите этим аккаунтом в приложение (0.14+) и запустите скрипт ещё раз';
  else
    update public.profiles set role = 'owner' where user_id = o and role <> 'owner';
    if not exists (select 1 from public.profile_tags where user_id = o and label = 'I''m Ceo Bitch') then
      insert into public.profile_tags (user_id, label, style) values (o, 'I''m Ceo Bitch', 'solid');
      insert into public.admin_log (actor_fid, target_fid, action, data) values ('system', 'FORM#000000', 'bootstrap', '{"role":"owner","tag":"I''m Ceo Bitch"}');
    end if;
  end if;
  if t is null then raise notice 'FORM#107445 не найден: аккаунт должен хотя бы раз войти в приложение 0.14+';
  else
    update public.profiles set role = 'tester' where user_id = t and role = 'user';
    if not exists (select 1 from public.profile_tags where user_id = t and label = 'Тестировщик') then
      insert into public.profile_tags (user_id, label, style) values (t, 'Тестировщик', 'outline');
      insert into public.admin_log (actor_fid, target_fid, action, data) values ('system', 'FORM#107445', 'bootstrap', '{"role":"tester","tag":"Тестировщик"}');
    end if;
  end if;
  perform set_config('form.admin', '', true);
end $$;

-- ---------- приватность: старые @имена, созданные из адреса почты, заменяются ----------
-- (до 0.15 стартовое имя бралось из части адреса до «@», то есть раскрывало почту; вручную изменённые имена не трогаются)
do $$
declare r record; v text; i int;
begin
  for r in
    select p.user_id from public.profiles p
      join auth.users u on u.id = p.user_id
      cross join lateral (select left(regexp_replace(split_part(coalesce(u.email, ''), '@', 1), '[^A-Za-z0-9_.]', '', 'g'), 15) as b) x
     where p.username_changed_at is null
       and coalesce(u.raw_user_meta_data->>'user_name', u.raw_user_meta_data->>'preferred_username', '') = ''
       and length(x.b) >= 3
       and left(lower(p.username), length(x.b)) = lower(x.b)
       and p.username !~ '^user[0-9]{6}$'
  loop
    i := 0;
    loop
      v := 'user' || (100000 + floor(random() * 900000))::int::text;
      i := i + 1;
      exit when not exists (select 1 from public.profiles where lower(username) = lower(v)) or i > 30;
    end loop;
    update public.profiles set username = v, updated_at = now() where user_id = r.user_id;
    perform public._notify(r.user_id, 'system', null, jsonb_build_object('k', 'username_reset'));
  end loop;
end $$;
 then lower(p->>'color2') else null end,
    'banner', case when p->>'banner' in ('color','image') then p->>'banner' else 'color' end,
    'deco',   case when p->>'deco'   in ('none','dots','grid','lines','orbit','ascii','binary') then p->>'deco' else 'dots' end,
    'bg',     case when p->>'bg'     in ('none','tint','image') then p->>'bg' else 'none' end,
    'frame',  case when p->>'frame'  in ('none','ring','dots','double','square','orbit','halo','aurora','crown','void') then p->>'frame' else 'none' end
  )
$$;

-- картинка допускается только как data-URL jpeg/png/webp ограниченного размера
create or replace function public._img_ok(v text, n int) returns boolean language sql immutable as $$
  select v is null or v = '' or (length(v) <= n and v ~ '^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$')
$$;

-- ссылки: до 4 штук, только http(s)
create or replace function public._links(p jsonb) returns jsonb language plpgsql immutable as $$
declare r jsonb := '[]'::jsonb; e jsonb; lab text; u text;
begin
  if coalesce(jsonb_typeof(p), '') <> 'array' then return r; end if;
  for e in select * from jsonb_array_elements(p) loop
    exit when jsonb_array_length(r) >= 4;
    if jsonb_typeof(e) <> 'object' then continue; end if;
    lab := left(btrim(coalesce(e->>'label', '')), 24);
    u   := btrim(coalesce(e->>'url', ''));
    if length(u) <= 200 and u ~* '^https?://[^\s<>"'']+$' then
      r := r || jsonb_build_array(jsonb_build_object('label', lab, 'url', u));
    end if;
  end loop;
  return r;
end $$;

create or replace function public._blocked(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;

-- отношение me → other: self | friend | incoming | outgoing | none
create or replace function public._rel(me uuid, other uuid) returns text language sql stable security definer set search_path = public as $$
  select case when me = other then 'self' else coalesce((
    select case when f.status = 'accepted' then 'friend' when f.requester = me then 'outgoing' else 'incoming' end
      from public.friendships f where f.user_a = least(me, other) and f.user_b = greatest(me, other)
  ), 'none') end
$$;

-- эксклюзивные рамки: доступны владельцу всегда, остальным — только по выдаче из Owner Panel
create or replace function public._exclusive() returns text[] language sql immutable as $$
  select array['aurora','crown','void']::text[]
$$;

create or replace function public._has_item(p_uid uuid, p_item text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = p_uid and role = 'owner')
      or exists (select 1 from public.cosmetic_grants where user_id = p_uid and item = p_item)
$$;

-- оформление с учётом прав: закрытая рамка (например, после снятия выдачи) показывается как «без рамки»
create or replace function public._eff_theme(p public.profiles) returns jsonb language sql stable security definer set search_path = public as $$
  select case when (public._theme(p.theme)->>'frame') = any (public._exclusive())
               and not public._has_item(p.user_id, public._theme(p.theme)->>'frame')
              then public._theme(p.theme) || '{"frame":"none"}'::jsonb
              else public._theme(p.theme) end
$$;

create or replace function public._tags(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('l', label, 's', style, 'c', color) order by id), '[]'::jsonb)
    from public.profile_tags where user_id = p_uid
$$;

create or replace function public._unlocked(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(case when exists (select 1 from public.profiles where user_id = p_uid and role = 'owner')
                       then public._exclusive()
                       else array(select item from public.cosmetic_grants where user_id = p_uid) end)
$$;

-- короткая карточка пользователя для списков (теги показываются везде рядом с именем)
create or replace function public._card(p public.profiles) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', p.form_id, 'username', p.username,
    'display_name', coalesce(nullif(p.display_name, ''), p.username),
    'avatar_thumb', p.avatar_thumb,
    'color', public._eff_theme(p)->>'color', 'frame', public._eff_theme(p)->>'frame',
    'tags', public._tags(p.user_id))
$$;

-- полный профиль для его владельца
create or replace function public._own(p public.profiles) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', p.form_id, 'username', p.username, 'username_changed_at', p.username_changed_at,
    'display_name', p.display_name, 'bio', p.bio, 'status', p.status, 'links', p.links,
    'theme', public._eff_theme(p), 'avatar', p.avatar, 'avatar_thumb', p.avatar_thumb,
    'banner_image', p.banner_image, 'bg_image', p.bg_image, 'stats', p.stats, 'pinned', p.pinned,
    'privacy', public._priv(p.privacy), 'registered_at', p.registered_at,
    'role', p.role, 'tags', public._tags(p.user_id), 'unlocked', public._unlocked(p.user_id))
$$;

-- профиль глазами другого пользователя: здесь применяются все настройки приватности
create or replace function public._profile_view(p public.profiles, p_friend boolean, p_limited boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  pv   jsonb := public._priv(p.privacy);
  hide jsonb := pv->'hide';
  th   jsonb := public._eff_theme(p);
  so   text  := pv->>'online';
  sl   text  := pv->>'last_seen';
  o    jsonb;
begin
  o := jsonb_build_object('id', p.form_id, 'username', p.username,
        'display_name', coalesce(nullif(p.display_name, ''), p.username),
        'avatar', p.avatar, 'avatar_thumb', p.avatar_thumb, 'tags', public._tags(p.user_id));
  if p_limited then
    return o || jsonb_build_object('limited', true,
      'theme', jsonb_build_object('color', th->'color', 'frame', th->'frame', 'banner', 'color', 'deco', 'none', 'bg', 'none'));
  end if;
  if (hide ? 'banner') then th := th || jsonb_build_object('banner', 'color', 'bg', 'none', 'deco', 'none'); end if;
  o := o || jsonb_build_object('theme', th,
        'online',    case when so = 'everyone' or (so = 'friends' and p_friend)
                          then (p.last_seen is not null and p.last_seen > now() - interval '2 minutes') else null end,
        'last_seen', case when sl = 'everyone' or (sl = 'friends' and p_friend) then p.last_seen else null end);
  if th->>'banner' = 'image' and p.banner_image is not null then o := o || jsonb_build_object('banner_image', p.banner_image); end if;
  if th->>'bg' = 'image' and p.bg_image is not null then o := o || jsonb_build_object('bg_image', p.bg_image); end if;
  if not (hide ? 'bio')        then o := o || jsonb_build_object('bio', p.bio); end if;
  if not (hide ? 'status')     then o := o || jsonb_build_object('status', p.status); end if;
  if not (hide ? 'links')      then o := o || jsonb_build_object('links', p.links); end if;
  if not (hide ? 'registered') then o := o || jsonb_build_object('registered_at', p.registered_at); end if;
  if not (hide ? 'badges') then
    o := o || jsonb_build_object('badges', jsonb_build_object(
      'rank', public._int(p.stats->>'rank', 0, 10),
      'medals', case when p.role = 'owner' then to_jsonb(public._medals())   -- владельцу открыты все достижения
                     when jsonb_typeof(p.stats->'medals') = 'array' then p.stats->'medals' else '[]'::jsonb end,
      'pinned', p.pinned));
  end if;
  if not (hide ? 'stats') then
    o := o || jsonb_build_object('stats', jsonb_build_object(
      'xp', public._int(p.stats->>'xp', 0, 10000000),
      'tasks', public._int(p.stats->>'tasks', 0, 1000000),
      'best', public._int(p.stats->>'best', 0, 10000)));
  end if;
  return o;
end $$;

create or replace function public._notify(p_user uuid, p_type text, p_actor uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'friend_request' and p_actor is not null then
    delete from public.notifications where user_id = p_user and type = 'friend_request' and actor = p_actor;
  end if;
  insert into public.notifications (user_id, type, actor, data) values (p_user, p_type, p_actor, coalesce(p_data, '{}'::jsonb));
  -- хранится не больше 100 последних уведомлений на пользователя
  delete from public.notifications
   where user_id = p_user and id not in (select id from public.notifications where user_id = p_user order by id desc limit 100);
end $$;

-- постоянный публичный ID вида FORM#483921 (повторов нет: проверка + уникальный индекс)
create or replace function public._gen_form_id() returns text language plpgsql security definer set search_path = public as $$
declare v text; i int := 0;
begin
  loop
    v := 'FORM#' || (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from public.profiles where form_id = v);
    i := i + 1;
    if i > 50 then raise exception 'id_space_full'; end if;
  end loop;
  return v;
end $$;

-- создаёт профиль: ID, стартовое @имя (из GitHub / почты, уникальное), дата регистрации из аккаунта
create or replace function public._make_profile(p_uid uuid) returns void language plpgsql security definer set search_path = public as $$
declare u record; base text; v text; i int := 0;
begin
  if exists (select 1 from public.profiles where user_id = p_uid) then return; end if;
  select id, email, raw_user_meta_data, created_at into u from auth.users where id = p_uid;
  if not found then return; end if;
  -- @имя берётся только из публичного логина GitHub; адрес почты никогда не используется
  base := left(regexp_replace(coalesce(u.raw_user_meta_data->>'user_name', u.raw_user_meta_data->>'preferred_username', ''), '[^A-Za-z0-9_.]', '', 'g'), 15);
  v := case when length(base) < 3 then 'user' || (100000 + floor(random() * 900000))::int::text else base end;
  while public._reserved(v) or exists (select 1 from public.profiles where lower(username) = lower(v)) loop
    i := i + 1;
    v := case when length(base) < 3 then 'user' || (100000 + floor(random() * 900000))::int::text
              else left(base, 15) || (floor(random() * 10000))::int::text end;
    if i > 30 then v := 'user' || (100000 + floor(random() * 900000))::int::text; exit; end if;
  end loop;
  insert into public.profiles (user_id, form_id, username, registered_at)
  values (p_uid, public._gen_form_id(), v, coalesce(u.created_at, now()));
  perform public._notify(p_uid, 'system', null, jsonb_build_object('k', 'welcome'));
exception when unique_violation then
  null; -- параллельный запрос уже создал профиль или занял имя: клиент повторит get_my_profile()
end $$;

-- профиль создаётся автоматически при регистрации; ошибка здесь никогда не ломает регистрацию
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public._make_profile(new.id);
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
  for each row execute function public.handle_new_user();

-- защита от подмены: ID, владелец и дата регистрации не меняются никогда и никем
create or replace function public.profiles_guard() returns trigger language plpgsql as $$
begin
  if new.user_id <> old.user_id then raise exception 'user_id is immutable'; end if;
  if new.form_id <> old.form_id then raise exception 'form_id is immutable'; end if;
  if new.registered_at <> old.registered_at then raise exception 'registered_at is immutable'; end if;
  -- роль меняют только функции Owner Panel (они выставляют form.admin на время транзакции)
  if new.role is distinct from old.role and coalesce(current_setting('form.admin', true), '') <> '1' then
    raise exception 'role is immutable';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

-- ---------- функции для клиента ----------

create or replace function public.get_my_profile() returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.profiles;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into p from public.profiles where user_id = me;
  if not found then
    perform public._make_profile(me);
    select * into p from public.profiles where user_id = me;
    if not found then raise exception 'profile_unavailable'; end if;
  end if;
  return public._own(p);
end $$;

create or replace function public.update_profile(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.profiles; v text; m text[];
begin
  if me is null then raise exception 'auth_required'; end if;
  perform public.get_my_profile();
  select * into r from public.profiles where user_id = me for update;

  if p ? 'display_name' then
    r.display_name := left(btrim(coalesce(p->>'display_name', '')), 18);
    -- имя нельзя оформить так, чтобы оно выглядело как чужой привилегированный тег
    if r.display_name <> '' and exists (select 1 from public.profile_tags where lower(label) = lower(r.display_name) and user_id <> me) then raise exception 'name_reserved'; end if;
  end if;

  if p ? 'username' then
    v := btrim(coalesce(p->>'username', ''));
    if v <> r.username then
      if v !~ '^[A-Za-z0-9_.]{3,20}$' then raise exception 'username_invalid'; end if;
      if public._reserved(v) then raise exception 'username_reserved'; end if;
      if r.username_changed_at is not null and r.username_changed_at > now() - interval '7 days' then raise exception 'username_cooldown'; end if;
      if exists (select 1 from public.profiles where lower(username) = lower(v) and user_id <> me) then raise exception 'username_taken'; end if;
      r.username := v;
      r.username_changed_at := now();
    end if;
  end if;

  if p ? 'bio'    then r.bio    := left(btrim(coalesce(p->>'bio', '')), 200); end if;
  if p ? 'status' then
    r.status := left(btrim(coalesce(p->>'status', '')), 60);
    if r.status <> '' and exists (select 1 from public.profile_tags where lower(label) = lower(r.status) and user_id <> me) then raise exception 'name_reserved'; end if;
  end if;
  if p ? 'links'  then r.links  := public._links(p->'links'); end if;

  if p ? 'theme' and jsonb_typeof(p->'theme') = 'object' then
    r.theme := public._theme(coalesce(r.theme, '{}'::jsonb) || (p->'theme'));
  end if;
  -- эксклюзивная рамка: только владелец или выданная из Owner Panel; проверка на сервере
  if (r.theme->>'frame') = any (public._exclusive()) and not public._has_item(me, r.theme->>'frame') then
    if (p->'theme') ? 'frame' then raise exception 'frame_locked'; end if;
    r.theme := r.theme || '{"frame":"none"}'::jsonb;
  end if;

  if p ? 'avatar' then
    v := p->>'avatar';
    if not public._img_ok(v, 120000) then raise exception 'image_invalid'; end if;
    r.avatar := nullif(v, '');
  end if;
  if p ? 'avatar_thumb' then
    v := p->>'avatar_thumb';
    if not public._img_ok(v, 16000) then raise exception 'image_invalid'; end if;
    r.avatar_thumb := nullif(v, '');
  end if;
  if p ? 'banner_image' then
    v := p->>'banner_image';
    if not public._img_ok(v, 280000) then raise exception 'image_invalid'; end if;
    r.banner_image := nullif(v, '');
  end if;
  if p ? 'bg_image' then
    v := p->>'bg_image';
    if not public._img_ok(v, 280000) then raise exception 'image_invalid'; end if;
    r.bg_image := nullif(v, '');
  end if;

  -- достижения и статистика приходят из приложения (прогресс хранится на устройстве): проверяется только формат
  if p ? 'stats' and jsonb_typeof(p->'stats') = 'object' then
    m := array(select distinct x
                 from jsonb_array_elements_text(case when jsonb_typeof(p->'stats'->'medals') = 'array' then p->'stats'->'medals' else '[]'::jsonb end) x
                where x = any (public._medals()));
    r.stats := jsonb_build_object(
      'rank',   public._int(p->'stats'->>'rank', 0, 10),
      'xp',     public._int(p->'stats'->>'xp', 0, 10000000),
      'tasks',  public._int(p->'stats'->>'tasks', 0, 1000000),
      'best',   public._int(p->'stats'->>'best', 0, 10000),
      'medals', to_jsonb(m));
  end if;

  if (p ? 'pinned' or p ? 'stats') then
    m := array(select jsonb_array_elements_text(case when jsonb_typeof(r.stats->'medals') = 'array' then r.stats->'medals' else '[]'::jsonb end));
    r.pinned := coalesce((
      select jsonb_agg(d.x order by d.o)
        from (select t.x, min(t.o) as o
                from jsonb_array_elements_text(case when jsonb_typeof(coalesce(p->'pinned', r.pinned)) = 'array' then coalesce(p->'pinned', r.pinned) else '[]'::jsonb end)
                     with ordinality as t(x, o)
               where t.x = any (m)
               group by t.x order by min(t.o) limit 3) d
    ), '[]'::jsonb);
  end if;

  if p ? 'privacy' and jsonb_typeof(p->'privacy') = 'object' then
    r.privacy := public._priv(coalesce(r.privacy, '{}'::jsonb) || (p->'privacy'));
  end if;

  update public.profiles set
    display_name = r.display_name, username = r.username, username_changed_at = r.username_changed_at,
    bio = r.bio, status = r.status, links = r.links, theme = r.theme,
    avatar = r.avatar, avatar_thumb = r.avatar_thumb, banner_image = r.banner_image, bg_image = r.bg_image,
    stats = r.stats, pinned = r.pinned, privacy = r.privacy, updated_at = now()
  where user_id = me;
  return public._own(r);
exception when unique_violation then
  raise exception 'username_taken';
end $$;

-- «что видят другие»: тот же код, что и для чужого просмотра, но для собственного профиля
create or replace function public.preview_profile(p_as text default 'stranger') returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles; pv jsonb; fr boolean := (p_as = 'friend'); lim boolean;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where user_id = me;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  pv := public._priv(t.privacy);
  lim := pv->>'profile' = 'nobody' or (pv->>'profile' = 'friends' and not fr);
  return jsonb_build_object('relation', case when fr then 'friend' else 'none' end, 'preview', true,
    'can_request', (not fr and pv->>'requests' = 'everyone'), 'profile', public._profile_view(t, fr, lim));
end $$;

create or replace function public.get_profile(p_form_id text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles; rel text; fr boolean; pv jsonb; mine boolean; lim boolean;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if t.user_id = me then return jsonb_build_object('relation', 'self', 'profile', public._own(t)); end if;
  -- тот, кто заблокировал меня, для меня «не существует»
  if exists (select 1 from public.blocks where blocker = t.user_id and blocked = me) then
    return jsonb_build_object('error', 'not_found');
  end if;
  rel  := public._rel(me, t.user_id);
  fr   := rel = 'friend';
  pv   := public._priv(t.privacy);
  mine := exists (select 1 from public.blocks where blocker = me and blocked = t.user_id);
  lim  := pv->>'profile' = 'nobody' or (pv->>'profile' = 'friends' and not fr);
  return jsonb_build_object('relation', rel, 'blocked_by_me', mine,
    'can_request', (rel = 'none' and not mine and pv->>'requests' = 'everyone'),
    'profile', public._profile_view(t, fr, lim));
end $$;

create or replace function public.search_users(p_q text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); q text := btrim(coalesce(p_q, '')); res jsonb; esc text;
begin
  if me is null then raise exception 'auth_required'; end if;
  q := left(q, 40);
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  -- точный ID: FORM#123456, #123456, 123456
  if q ~* '^(form)?\s*#?\s*[0-9]{6}$' then
    select coalesce(jsonb_agg(public._card(p) || jsonb_build_object('relation', public._rel(me, p.user_id))), '[]'::jsonb) into res
      from public.profiles p
     where p.form_id = 'FORM#' || substring(q from '([0-9]{6})$') and p.user_id <> me and not public._blocked(me, p.user_id);
    return res;
  end if;
  q := regexp_replace(q, '^@', '');
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  esc := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  select coalesce(jsonb_agg(x.c order by x.k, x.nm), '[]'::jsonb) into res from (
    select public._card(p) || jsonb_build_object('relation', public._rel(me, p.user_id)) as c,
           case when lower(p.username) = lower(q) then 0 when p.username ilike esc || '%' then 1 else 2 end as k,
           lower(p.username) as nm
      from public.profiles p
     where p.user_id <> me
       and public._priv(p.privacy)->>'find' = 'everyone'
       and not public._blocked(me, p.user_id)
       and (p.username ilike esc || '%' or p.display_name ilike '%' || esc || '%')
     order by 2, 3
     limit 20) x;
  return res;
end $$;

create or replace function public.friends_overview() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); res jsonb;
begin
  if me is null then raise exception 'auth_required'; end if;
  select coalesce(jsonb_agg(x.o order by x.nm), '[]'::jsonb) into res from (
    select public._card(t) || jsonb_build_object(
             'relation', case when f.status = 'accepted' then 'friend' when f.requester = me then 'outgoing' else 'incoming' end,
             'since', coalesce(f.responded_at, f.created_at),
             'requested_at', f.created_at,
             'status', case when f.status = 'accepted' and not ((public._priv(t.privacy)->'hide') ? 'status') then nullif(t.status, '') else null end,
             'online', case when f.status = 'accepted' and public._priv(t.privacy)->>'online' in ('everyone', 'friends')
                            then (t.last_seen is not null and t.last_seen > now() - interval '2 minutes') else null end,
             'last_seen', case when f.status = 'accepted' and public._priv(t.privacy)->>'last_seen' in ('everyone', 'friends')
                               then t.last_seen else null end) as o,
           lower(coalesce(nullif(t.display_name, ''), t.username)) as nm
      from public.friendships f
      join public.profiles t on t.user_id = case when f.user_a = me then f.user_b else f.user_a end
     where (f.user_a = me or f.user_b = me) and not public._blocked(me, t.user_id)
  ) x;
  return res;
end $$;

create or replace function public.send_friend_request(p_form_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles; f public.friendships; a uuid; b uuid; cnt int;
begin
  if me is null then raise exception 'auth_required'; end if;
  perform public.get_my_profile();
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  if t.user_id = me then raise exception 'self'; end if;
  if exists (select 1 from public.blocks where blocker = me and blocked = t.user_id) then raise exception 'unblock_first'; end if;
  if exists (select 1 from public.blocks where blocker = t.user_id and blocked = me) then raise exception 'unavailable'; end if;
  a := least(me, t.user_id); b := greatest(me, t.user_id);
  select * into f from public.friendships where user_a = a and user_b = b for update;
  if found then
    if f.status = 'accepted' then raise exception 'already_friends'; end if;
    if f.requester = me then raise exception 'already_sent'; end if;
    -- встречная заявка: оба хотят дружить, принимаем сразу
    update public.friendships set status = 'accepted', responded_at = now() where user_a = a and user_b = b;
    delete from public.notifications where user_id = me and type = 'friend_request' and actor = t.user_id;
    perform public._notify(t.user_id, 'friend_accepted', me, '{}'::jsonb);
    return jsonb_build_object('state', 'friend');
  end if;
  if public._priv(t.privacy)->>'requests' <> 'everyone' then raise exception 'requests_closed'; end if;
  select count(*) into cnt from public.friendships where requester = me and status = 'pending';
  if cnt >= 50 then raise exception 'too_many_pending'; end if;
  insert into public.friendships (user_a, user_b, requester) values (a, b, me);
  perform public._notify(t.user_id, 'friend_request', me, '{}'::jsonb);
  return jsonb_build_object('state', 'pending');
exception when unique_violation then
  raise exception 'already_sent';
end $$;

create or replace function public.respond_friend_request(p_form_id text, p_accept boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles; a uuid; b uuid;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  a := least(me, t.user_id); b := greatest(me, t.user_id);
  if coalesce(p_accept, false) then
    update public.friendships set status = 'accepted', responded_at = now()
     where user_a = a and user_b = b and status = 'pending' and requester = t.user_id;
    if not found then raise exception 'no_request'; end if;
    perform public._notify(t.user_id, 'friend_accepted', me, '{}'::jsonb);
  else
    delete from public.friendships where user_a = a and user_b = b and status = 'pending' and requester = t.user_id;
    if not found then raise exception 'no_request'; end if;
  end if;
  delete from public.notifications where user_id = me and type = 'friend_request' and actor = t.user_id;
  return jsonb_build_object('state', case when coalesce(p_accept, false) then 'friend' else 'none' end);
end $$;

create or replace function public.cancel_friend_request(p_form_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  delete from public.friendships
   where user_a = least(me, t.user_id) and user_b = greatest(me, t.user_id) and status = 'pending' and requester = me;
  if not found then raise exception 'no_request'; end if;
  delete from public.notifications where user_id = t.user_id and type = 'friend_request' and actor = me;
  return jsonb_build_object('state', 'none');
end $$;

-- удаление из друзей: второй стороне уведомление не отправляется
create or replace function public.remove_friend(p_form_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  delete from public.friendships
   where user_a = least(me, t.user_id) and user_b = greatest(me, t.user_id) and status = 'accepted';
  return jsonb_build_object('state', 'none');
end $$;

create or replace function public.block_user(p_form_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  if t.user_id = me then raise exception 'self'; end if;
  insert into public.blocks (blocker, blocked) values (me, t.user_id) on conflict do nothing;
  delete from public.friendships where user_a = least(me, t.user_id) and user_b = greatest(me, t.user_id);
  delete from public.notifications where (user_id = me and actor = t.user_id) or (user_id = t.user_id and actor = me);
  return jsonb_build_object('state', 'blocked');
end $$;

create or replace function public.unblock_user(p_form_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles;
begin
  if me is null then raise exception 'auth_required'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  delete from public.blocks where blocker = me and blocked = t.user_id;
  return jsonb_build_object('state', 'none');
end $$;

create or replace function public.list_blocked() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth_required'; end if;
  return coalesce((
    select jsonb_agg(public._card(t) || jsonb_build_object('since', b.created_at) order by b.created_at desc)
      from public.blocks b join public.profiles t on t.user_id = b.blocked
     where b.blocker = me), '[]'::jsonb);
end $$;

-- «онлайн»: приложение вызывает раз в минуту, пока открыто; считается онлайн в течение 2 минут
create or replace function public.touch_presence() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  update public.profiles set last_seen = now() where user_id = auth.uid();
end $$;

create or replace function public.notif_list(p_limit int default 50) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth_required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'type', n.type, 'read', n.is_read, 'created_at', n.created_at, 'data', n.data,
             'actor', case when a.user_id is null then null else public._card(a) end) order by n.id desc)
      from (select * from public.notifications where user_id = me order by id desc
             limit least(greatest(coalesce(p_limit, 50), 1), 100)) n
      left join public.profiles a on a.user_id = n.actor), '[]'::jsonb);
end $$;

create or replace function public.notif_unread() returns int language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth_required'; end if;
  return (select count(*)::int from public.notifications where user_id = me and not is_read);
end $$;

create or replace function public.notif_mark_read(p_ids bigint[] default null) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  update public.notifications set is_read = true
   where user_id = auth.uid() and not is_read and (p_ids is null or id = any (p_ids));
end $$;

create or replace function public.notif_clear() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  delete from public.notifications where user_id = auth.uid();
end $$;

-- ---------- права на вызов функций ----------
-- вспомогательные функции клиентам недоступны; рабочие — только вошедшим пользователям
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_medals','_int','_reserved','_priv','_theme','_img_ok','_links','_blocked','_rel',
                  '_card','_own','_profile_view','_notify','_gen_form_id','_make_profile','handle_new_user','profiles_guard') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('get_my_profile','update_profile','preview_profile','get_profile','search_users',
                  'friends_overview','send_friend_request','respond_friend_request','cancel_friend_request','remove_friend','block_user',
                  'unblock_user','list_blocked','touch_presence','notif_list','notif_unread','notif_mark_read','notif_clear') loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- мгновенные уведомления и обновление списка друзей (без этого приложение опрашивает сервер раз в 30 секунд)
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- профили для уже существующих аккаунтов (новые создаются триггером)
do $$
declare r record;
begin
  for r in select id from auth.users loop
    perform public._make_profile(r.id);
  end loop;
end $$;


-- ============================================================================
-- Часть 4 (v0.15): роли, теги, Owner Panel, приватность
-- Все проверки прав выполняются здесь, на сервере. Клиент роль не присылает и не может менять.
-- ============================================================================

create or replace function public._is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'owner')
$$;

create or replace function public._admin_log(p_action text, p_target uuid, p_data jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_log (actor_fid, target_fid, action, data)
  values ((select form_id from public.profiles where user_id = auth.uid()),
          (select form_id from public.profiles where user_id = p_target),
          p_action, coalesce(p_data, '{}'::jsonb));
end $$;

-- список пользователей: только публичные поля (почта и другие данные аккаунта недоступны никому, даже владельцу)
create or replace function public.admin_users(p_q text default '') returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := left(btrim(coalesce(p_q, '')), 40); esc text;
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  esc := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return coalesce((
    select jsonb_agg(x.o order by x.ord, x.nm) from (
      select public._card(p) || jsonb_build_object('role', p.role, 'registered_at', p.registered_at, 'last_seen', p.last_seen) as o,
             case p.role when 'owner' then 0 when 'tester' then 1 else 2 end as ord,
             lower(p.username) as nm
        from public.profiles p
       where q = '' or p.form_id ilike '%' || esc || '%' or p.username ilike '%' || esc || '%' or p.display_name ilike '%' || esc || '%'
       order by 2, 3
       limit 100) x), '[]'::jsonb);
end $$;

create or replace function public.admin_user(p_form_id text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.profiles;
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object(
    'user', public._card(t) || jsonb_build_object('role', t.role, 'registered_at', t.registered_at, 'last_seen', t.last_seen),
    'tags', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'l', g.label, 's', g.style, 'c', g.color) order by g.id)
                        from public.profile_tags g where g.user_id = t.user_id), '[]'::jsonb),
    'grants', coalesce((select jsonb_agg(c.item order by c.item) from public.cosmetic_grants c where c.user_id = t.user_id), '[]'::jsonb),
    'exclusive', to_jsonb(public._exclusive()));
end $$;

-- роль: user или tester. Роль owner назначается только вручную в базе; свою роль и роль владельца менять нельзя
create or replace function public.admin_set_role(p_form_id text, p_role text) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.profiles; old text;
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  if p_role not in ('user', 'tester') then raise exception 'role_invalid'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  if t.user_id = auth.uid() then raise exception 'self_role'; end if;
  if t.role = 'owner' then raise exception 'owner_protected'; end if;
  old := t.role;
  perform set_config('form.admin', '1', true);
  update public.profiles set role = p_role where user_id = t.user_id;
  perform set_config('form.admin', '', true);
  perform public._admin_log('set_role', t.user_id, jsonb_build_object('from', old, 'to', p_role));
  return jsonb_build_object('role', p_role);
end $$;

create or replace function public.admin_add_tag(p_form_id text, p_label text, p_style text default 'outline', p_color text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.profiles; lab text := btrim(coalesce(p_label, '')); col text := nullif(btrim(coalesce(p_color, '')), '');
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  if char_length(lab) < 1 or char_length(lab) > 24 then raise exception 'tag_invalid'; end if;
  if p_style not in ('solid', 'outline', 'dotted', 'glow', 'plain') then raise exception 'tag_invalid'; end if;
  if col is not null and col !~ '^#[0-9a-fA-F]{6}$' then raise exception 'tag_invalid'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  if (select count(*) from public.profile_tags where user_id = t.user_id) >= 3 then raise exception 'too_many_tags'; end if;
  insert into public.profile_tags (user_id, label, style, color, created_by) values (t.user_id, lab, p_style, lower(col), auth.uid());
  perform public._admin_log('add_tag', t.user_id, jsonb_build_object('label', lab, 'style', p_style, 'color', col));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_remove_tag(p_tag_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.profile_tags;
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  delete from public.profile_tags where id = p_tag_id returning * into g;
  if not found then raise exception 'not_found'; end if;
  perform public._admin_log('remove_tag', g.user_id, jsonb_build_object('label', g.label));
  return jsonb_build_object('ok', true);
end $$;

-- выдача и снятие эксклюзивных предметов (рамок)
create or replace function public.admin_grant(p_form_id text, p_item text, p_on boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.profiles;
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  if p_item <> all (public._exclusive()) then raise exception 'item_invalid'; end if;
  select * into t from public.profiles where form_id = upper(btrim(coalesce(p_form_id, '')));
  if not found then raise exception 'not_found'; end if;
  if coalesce(p_on, false) then
    insert into public.cosmetic_grants (user_id, item, granted_by) values (t.user_id, p_item, auth.uid()) on conflict do nothing;
  else
    delete from public.cosmetic_grants where user_id = t.user_id and item = p_item;
  end if;
  perform public._admin_log(case when coalesce(p_on, false) then 'grant' else 'revoke' end, t.user_id, jsonb_build_object('item', p_item));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_log_list(p_limit int default 100) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_owner() then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'actor', l.actor_fid, 'target', l.target_fid, 'action', l.action, 'data', l.data, 'at', l.created_at) order by l.id desc)
      from (select * from public.admin_log order by id desc limit least(greatest(coalesce(p_limit, 100), 1), 200)) l), '[]'::jsonb);
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_exclusive','_has_item','_eff_theme','_tags','_unlocked','_is_owner','_admin_log') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('admin_users','admin_user','admin_set_role','admin_add_tag','admin_remove_tag','admin_grant','admin_log_list') loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- ---------- назначение ролей существующим аккаунтам по FORM ID (повторный запуск безопасен) ----------
do $$
declare o uuid; t uuid;
begin
  select user_id into o from public.profiles where form_id = 'FORM#000000';
  select user_id into t from public.profiles where form_id = 'FORM#107445';

  perform set_config('form.admin', '1', true);
  if o is null then raise notice 'FORM#000000 не найден: войдите этим аккаунтом в приложение (0.14+) и запустите скрипт ещё раз';
  else
    update public.profiles set role = 'owner' where user_id = o and role <> 'owner';
    if not exists (select 1 from public.profile_tags where user_id = o and label = 'I''m Ceo Bitch') then
      insert into public.profile_tags (user_id, label, style) values (o, 'I''m Ceo Bitch', 'solid');
      insert into public.admin_log (actor_fid, target_fid, action, data) values ('system', 'FORM#000000', 'bootstrap', '{"role":"owner","tag":"I''m Ceo Bitch"}');
    end if;
  end if;
  if t is null then raise notice 'FORM#107445 не найден: аккаунт должен хотя бы раз войти в приложение 0.14+';
  else
    update public.profiles set role = 'tester' where user_id = t and role = 'user';
    if not exists (select 1 from public.profile_tags where user_id = t and label = 'Тестировщик') then
      insert into public.profile_tags (user_id, label, style) values (t, 'Тестировщик', 'outline');
      insert into public.admin_log (actor_fid, target_fid, action, data) values ('system', 'FORM#107445', 'bootstrap', '{"role":"tester","tag":"Тестировщик"}');
    end if;
  end if;
  perform set_config('form.admin', '', true);
end $$;

-- ---------- приватность: старые @имена, созданные из адреса почты, заменяются ----------
-- (до 0.15 стартовое имя бралось из части адреса до «@», то есть раскрывало почту; вручную изменённые имена не трогаются)
do $$
declare r record; v text; i int;
begin
  for r in
    select p.user_id from public.profiles p
      join auth.users u on u.id = p.user_id
      cross join lateral (select left(regexp_replace(split_part(coalesce(u.email, ''), '@', 1), '[^A-Za-z0-9_.]', '', 'g'), 15) as b) x
     where p.username_changed_at is null
       and coalesce(u.raw_user_meta_data->>'user_name', u.raw_user_meta_data->>'preferred_username', '') = ''
       and length(x.b) >= 3
       and left(lower(p.username), length(x.b)) = lower(x.b)
       and p.username !~ '^user[0-9]{6}$'
  loop
    i := 0;
    loop
      v := 'user' || (100000 + floor(random() * 900000))::int::text;
      i := i + 1;
      exit when not exists (select 1 from public.profiles where lower(username) = lower(v)) or i > 30;
    end loop;
    update public.profiles set username = v, updated_at = now() where user_id = r.user_id;
    perform public._notify(r.user_id, 'system', null, jsonb_build_object('k', 'username_reset'));
  end loop;
end $$;

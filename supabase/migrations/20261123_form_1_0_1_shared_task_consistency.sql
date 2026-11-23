-- FORM 1.0.1 correctness hotfix. Safe CREATE OR REPLACE; no table data is modified.
-- Snapshot from deployed functions 2026-11-23; preserve signatures, grants and invoker checks.
-- Existing incorrectly completed tasks are NOT reopened (client-side XP may be synced).
CREATE OR REPLACE FUNCTION public.create_shared_task(p_title text, p_description text DEFAULT ''::text, p_category text DEFAULT 'SOCIAL'::text, p_xp integer DEFAULT 10, p_friend_ids text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  tid uuid;
  cat text := upper(coalesce(nullif(btrim(p_category), ''), 'SOCIAL'));
  title text := left(btrim(coalesce(p_title, '')), 80);
  descr text := left(btrim(coalesce(p_description, '')), 180);
  fid text;
  tuid uuid;
  priv text;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if title = '' then raise exception 'title_required'; end if;
  if cat not in ('INTELLIGENCE','DISCIPLINE','CREATIVITY','FITNESS','TECHNICAL','SOCIAL') then
    cat := 'SOCIAL';
  end if;

  insert into public.shared_tasks (creator_id, title, description, category, xp, status)
  values (me, title, descr, cat, greatest(0, least(coalesce(p_xp, 10), 1000)), 'active')
  returning id into tid;

  insert into public.shared_task_members (task_id, user_id, status, progress, done, joined_at)
  values (tid, me, 'accepted', 0, false, now());

  perform public._st_log(tid, me, 'created');

  if p_friend_ids is not null then
    foreach fid in array p_friend_ids loop
      select p.user_id into tuid from public.profiles p where p.form_id = upper(btrim(fid)) or p.user_id::text = fid;
      if tuid is null or tuid = me then continue; end if;
      -- только друзья
      if not exists (
        select 1 from public.friendships f
         where f.status = 'accepted'
           and ((f.user_a = least(me, tuid) and f.user_b = greatest(me, tuid)))
      ) then continue; end if;
      -- приватность shared_tasks
      select coalesce(p.privacy->>'shared_tasks', 'friends') into priv
        from public.profiles p where p.user_id = tuid;
      if priv = 'nobody' then continue; end if;

      insert into public.shared_task_members (task_id, user_id, status, invited_by)
      values (tid, tuid, 'invited', me)
      on conflict do nothing;

      perform public._st_log(tid, me, 'invited');
      perform public._st_notify(tuid, 'shared_task_invite',
        jsonb_build_object('task_id', tid, 'title', title, 'from', me));
    end loop;
  end if;

  -- Ensure at least one real eligible invitee; rollback the entire transaction otherwise.
  if not exists (
    select 1 from public.shared_task_members m
    where m.task_id=tid and m.user_id<>me and m.status in ('accepted','invited')
  ) then
    raise exception 'at_least_two_participants_required';
  end if;
  return jsonb_build_object('ok', true, 'task_id', tid);
end $function$;

CREATE OR REPLACE FUNCTION public.update_shared_task_progress(p_task_id uuid, p_progress integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  t public.shared_tasks;
  m public.shared_task_members;
  pct int := greatest(0, least(100, coalesce(p_progress, 0)));
  active_n int;
  done_n int;
  share int;
  rec record;
  just_completed boolean := false;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  select * into t from public.shared_tasks where id = p_task_id for update;
  if not found then raise exception 'not_found'; end if;
  if t.status = 'cancelled' then raise exception 'task_cancelled'; end if;
  if t.status = 'completed' then
    return jsonb_build_object('ok', true, 'status', 'completed', 'already', true);
  end if;

  select * into m from public.shared_task_members
   where task_id = p_task_id and user_id = me and status = 'accepted' for update;
  if not found then raise exception 'forbidden'; end if;

  -- сброс личного выполнения
  if pct < 100 then
    update public.shared_task_members
       set progress = pct, done = false, done_at = null
     where task_id = p_task_id and user_id = me;
    perform public._st_log(p_task_id, me, 'progress', pct);
    update public.shared_tasks set updated_at = now() where id = p_task_id;
    return jsonb_build_object('ok', true, 'progress', pct, 'done', false, 'status', 'active');
  end if;

  -- подтверждение выполнения (идемпотентно)
  if not m.done then
    update public.shared_task_members
       set progress = 100, done = true, done_at = now()
     where task_id = p_task_id and user_id = me;
    perform public._st_log(p_task_id, me, 'done', 100);

    -- уведомить остальных участников
    for rec in
      select user_id from public.shared_task_members
       where task_id = p_task_id and status = 'accepted' and user_id <> me
    loop
      perform public._st_notify(rec.user_id, 'shared_task_done',
        jsonb_build_object('task_id', p_task_id, 'title', t.title));
    end loop;
  end if;

  select count(*) filter (where status = 'accepted'),
         count(*) filter (where status = 'accepted' and done)
    into active_n, done_n
    from public.shared_task_members
   where task_id = p_task_id;

  if active_n >= 2 and done_n >= active_n and not exists (
      select 1 from public.shared_task_members sm
      where sm.task_id = p_task_id and sm.status = 'invited'
    ) then
    -- атомарное завершение + распределение XP (один раз)
    share := public._st_share_xp(t.xp, active_n);
    update public.shared_tasks
       set status = 'completed', completed_at = now(), updated_at = now()
     where id = p_task_id and status = 'active';
    if found then
      just_completed := true;
      update public.shared_task_members
         set xp_awarded = share
       where task_id = p_task_id and status = 'accepted' and xp_awarded = 0;
      perform public._st_log(p_task_id, me, 'completed');
      for rec in
        select user_id from public.shared_task_members
         where task_id = p_task_id and status = 'accepted'
      loop
        perform public._st_notify(rec.user_id, 'shared_task_completed',
          jsonb_build_object('task_id', p_task_id, 'title', t.title, 'xp', share));
      end loop;
    end if;
  else
    update public.shared_tasks set updated_at = now() where id = p_task_id;
  end if;

  select xp_awarded into share from public.shared_task_members
   where task_id = p_task_id and user_id = me;

  return jsonb_build_object(
    'ok', true,
    'progress', 100,
    'done', true,
    'status', case when just_completed or t.status = 'completed' then 'completed' else 'active' end,
    'done_count', done_n,
    'active_count', active_n,
    'xp_awarded', coalesce(share, 0),
    'just_completed', just_completed
  );
end $function$;

CREATE OR REPLACE FUNCTION public.leave_shared_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  t public.shared_tasks;
  active_n int;
  done_n int;
  share int;
  rec record;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  select * into t from public.shared_tasks where id = p_task_id for update;
  if not found then raise exception 'not_found'; end if;

  if t.creator_id = me then
    -- создатель удаляет задание целиком
    delete from public.shared_tasks where id = p_task_id;
    return jsonb_build_object('ok', true, 'deleted', true);
  end if;

  if not exists (
    select 1 from public.shared_task_members
     where task_id = p_task_id and user_id = me and status in ('invited','accepted')
  ) then raise exception 'not_member'; end if;

  update public.shared_task_members
     set status = 'left', done = false, progress = 0
   where task_id = p_task_id and user_id = me;

  perform public._st_log(p_task_id, me, 'left');

  -- если после выхода все оставшиеся accepted уже done — завершить
  if t.status = 'active' then
    select count(*) filter (where status = 'accepted'),
           count(*) filter (where status = 'accepted' and done)
      into active_n, done_n
      from public.shared_task_members
     where task_id = p_task_id;

    if active_n >= 2 and done_n >= active_n and not exists (
      select 1 from public.shared_task_members sm
      where sm.task_id = p_task_id and sm.status = 'invited'
    ) then
      share := public._st_share_xp(t.xp, active_n);
      update public.shared_tasks
         set status = 'completed', completed_at = now(), updated_at = now()
       where id = p_task_id and status = 'active';
      if found then
        update public.shared_task_members
           set xp_awarded = share
         where task_id = p_task_id and status = 'accepted' and xp_awarded = 0;
        perform public._st_log(p_task_id, me, 'completed');
      end if;
    else
      update public.shared_tasks set updated_at = now() where id = p_task_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'left', true);
end $function$;

CREATE OR REPLACE FUNCTION public._theme(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'color2', case when p->>'color2' ~ '^#[0-9a-fA-F]{6} when p->>'color'  ~ '^#[0-9a-fA-F]{6}$' then lower(p->>'color') else '#2f5bea' end,
    'banner', case when p->>'banner' in ('color','image') then p->>'banner' else 'color' end,
    'deco',   case when p->>'deco'   in ('none','dots','grid','lines','orbit') then p->>'deco' else 'dots' end,
    'bg',     case when p->>'bg'     in ('none','tint','image') then p->>'bg' else 'none' end,
    'frame',  case when p->>'frame'  in ('none','ring','dots','double','square','orbit','halo','aurora','crown','void') then p->>'frame' else 'none' end
  )
$function$
 then lower(p->>'color2') else null end,
    'color',  case when p->>'color'  ~ '^#[0-9a-fA-F]{6}$' then lower(p->>'color') else '#2f5bea' end,
    'banner', case when p->>'banner' in ('color','image') then p->>'banner' else 'color' end,
    'deco',   case when p->>'deco'   in ('none','dots','grid','lines','orbit') then p->>'deco' else 'dots' end,
    'bg',     case when p->>'bg'     in ('none','tint','image') then p->>'bg' else 'none' end,
    'frame',  case when p->>'frame'  in ('none','ring','dots','double','square','orbit','halo','aurora','crown','void') then p->>'frame' else 'none' end
  )
$function$;

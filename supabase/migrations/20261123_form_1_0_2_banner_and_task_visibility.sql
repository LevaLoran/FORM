-- FORM 1.0.2: non-destructive migration; existing accounts, progress and rewards are preserved.
CREATE OR REPLACE FUNCTION public._theme(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
 SELECT jsonb_build_object(
  'color', CASE WHEN p->>'color' ~ '^#[0-9a-fA-F]{6}$' THEN lower(p->>'color') ELSE '#2f5bea' END,
  'color2', CASE WHEN p->>'color2' ~ '^#[0-9a-fA-F]{6}$' THEN lower(p->>'color2') ELSE NULL END,
  'banner', CASE WHEN p->>'banner' IN ('color','image') THEN p->>'banner' ELSE 'color' END,
  'deco', CASE WHEN p->>'deco' IN ('none','dots','grid','lines','orbit','ascii','binary') THEN p->>'deco' ELSE 'dots' END,
  'bg', CASE WHEN p->>'bg' IN ('none','tint','image') THEN p->>'bg' ELSE 'none' END,
  'frame', CASE WHEN p->>'frame' IN ('none','ring','dots','double','square','orbit','halo','aurora','crown','void') THEN p->>'frame' ELSE 'none' END
 );
$$;
CREATE TABLE IF NOT EXISTS public.shared_task_hidden (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 task_id uuid NOT NULL REFERENCES public.shared_tasks(id) ON DELETE CASCADE,
 hidden_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,task_id)
);
ALTER TABLE public.shared_task_hidden ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shared_task_hidden FROM anon;
GRANT SELECT, INSERT, DELETE ON public.shared_task_hidden TO authenticated;
DROP POLICY IF EXISTS st_hidden_read ON public.shared_task_hidden;
DROP POLICY IF EXISTS st_hidden_insert ON public.shared_task_hidden;
DROP POLICY IF EXISTS st_hidden_delete ON public.shared_task_hidden;
CREATE POLICY st_hidden_read ON public.shared_task_hidden FOR SELECT TO authenticated
 USING ((select auth.uid()) = user_id);
CREATE POLICY st_hidden_insert ON public.shared_task_hidden FOR INSERT TO authenticated
 WITH CHECK ((select auth.uid()) = user_id AND EXISTS (
  SELECT 1 FROM public.shared_task_members m WHERE m.task_id=task_id
    AND m.user_id=(select auth.uid()) AND m.status='accepted'
  ));
CREATE POLICY st_hidden_delete ON public.shared_task_hidden FOR DELETE TO authenticated
 USING ((select auth.uid()) = user_id);

-- Equipo interno con acceso al panel. Roles: admin (todo) y staff (operar, sin ajustes).

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

comment on table public.staff is 'Miembros del equipo con acceso al panel.';

alter table public.staff enable row level security;

-- Funciones auxiliares para las políticas. security definer para no depender del RLS de staff
-- (evita recursión) y search_path vacío para que no se puedan secuestrar con otros esquemas.
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()));
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()) and role = 'admin');
$$;

revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Privilegios de tabla: anon nada; authenticated lo que permitan las políticas.
-- Solo se pueden cambiar el nombre y el rol (nunca el user_id).
revoke all on table public.staff from anon, authenticated;
grant select, insert, delete on table public.staff to authenticated;
grant update (name, role) on table public.staff to authenticated;

create policy staff_select_self_or_admin on public.staff
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy staff_insert_admin on public.staff
  for insert to authenticated
  with check ((select public.is_admin()));

create policy staff_update_admin on public.staff
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy staff_delete_admin on public.staff
  for delete to authenticated
  using ((select public.is_admin()));

-- Siempre debe quedar al menos un admin: si no, nadie podría gestionar el equipo.
create function public.staff_keep_one_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    -- Bloquea las filas de admin para que dos cambios simultáneos no dejen el equipo sin admin.
    perform 1 from public.staff where role = 'admin' for update;
    if not exists (select 1 from public.staff where role = 'admin' and user_id <> old.user_id) then
      raise exception 'Debe quedar al menos un administrador' using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.staff_keep_one_admin() from public, anon, authenticated;

create trigger staff_keep_one_admin
  before update of role or delete on public.staff
  for each row execute function public.staff_keep_one_admin();

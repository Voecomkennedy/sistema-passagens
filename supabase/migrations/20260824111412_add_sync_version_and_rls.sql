-- Controle otimista de concorrência para impedir sobrescrita silenciosa.
alter table public.dados_app
    add column if not exists versao bigint not null default 0;

alter table public.dados_app
    drop constraint if exists dados_app_versao_nao_negativa;

alter table public.dados_app
    add constraint dados_app_versao_nao_negativa check (versao >= 0);

-- A tabela é exposta pela Data API: somente o dono autenticado pode acessá-la.
alter table public.dados_app enable row level security;

revoke all on table public.dados_app from anon, authenticated;
grant select, insert, update, delete on table public.dados_app to authenticated;

-- Substitui políticas antigas para evitar uma regra permissiva residual.
do $$
declare
    politica record;
begin
    for politica in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = 'dados_app'
    loop
        execute format('drop policy %I on public.dados_app', politica.policyname);
    end loop;
end
$$;

create policy "dados_app_select_proprio"
on public.dados_app for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "dados_app_insert_proprio"
on public.dados_app for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "dados_app_update_proprio"
on public.dados_app for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "dados_app_delete_proprio"
on public.dados_app for delete
to authenticated
using ((select auth.uid()) = user_id);

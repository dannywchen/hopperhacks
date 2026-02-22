do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'memory_category'
  ) then
    alter type public.memory_category add value if not exists 'profile';
    alter type public.memory_category add value if not exists 'onboarding_intake';
    alter type public.memory_category add value if not exists 'onboarding_interview';
  end if;
end
$$;


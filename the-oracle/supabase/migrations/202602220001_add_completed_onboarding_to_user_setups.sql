alter table public.user_setups
add column if not exists completed_onboarding boolean not null default false;

alter table public.user_setups
add column if not exists onboarding_completed_at timestamptz;

-- Optional backfill for users who already have saved onboarding data.
update public.user_setups
set
  completed_onboarding = true,
  onboarding_completed_at = coalesce(onboarding_completed_at, updated_at)
where completed_onboarding = false
  and setup_json is not null
  and jsonb_typeof(setup_json::jsonb) = 'object'
  and setup_json::jsonb ? 'onboarding';

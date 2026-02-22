This is a Next.js + Supabase project for The Oracle onboarding and simulation flow.

## Local development

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env.local
```

3. Run the Supabase migration in your Supabase SQL editor:

```sql
-- Run these files in order:
-- supabase/migrations/202602220001_user_bootstrap_and_context.sql
-- supabase/migrations/202602220002_simulation_modes_and_runs.sql
```

4. Start the app:

```bash
npm run dev
```

## What is persisted per user

- Authenticated user bootstrap records (`game_state`, `game_settings`, `user_setups`).
- Resume ingest memory (`onboarding_resume_latest`).
- LinkedIn ingest memory (`onboarding_linkedin_latest`).
- Interview progress and turn-by-turn memory (`onboarding_interview_*`).
- Final onboarding setup payload (`user_setups.setup_json`).
- Simulation runs and timeline nodes (`simulation_runs`, `simulation_nodes`).

## Important backend routes

- `POST /api/user/bootstrap`: idempotent per-user provisioning after login/signup.
- `GET /api/user/setup`: fetch saved setup from Supabase.
- `POST /api/user/setup`: save setup to Supabase.

# Release process (Alloy)

How we promote **application code** and **Supabase operational config** (workflows, statuses, SMS copy, action links) from staging to production.

## Operating model

1. **All code changes land on Git `staging` first**  
   Feature branches and fixes merge into `staging` before production.

2. **All Supabase workflow / status / message / config changes happen in staging first**  
   Edit the **staging** Supabase project (dashboard, SQL, or admin tools). Do not tune production directly.

3. **Staging is the source of truth**  
   If staging and the repo disagree, fix staging first, then capture the result in SQL.

4. **After staging is verified, add or update migration SQL in this repo**  
   Put versioned files under `supabase/migrations/`. Prefer idempotent statements keyed by stable IDs. Do not use migrations for one-off test-data cleanup unless that is explicitly the task.

5. **Merge `staging` → `main`**  
   Production tracks `main`. Promote only when staging is green and the migration reflects the verified config.

6. **Deploy application code**  
   Deploy the `main` build to production using your normal pipeline.

7. **Apply migrations in production Supabase**  
   Run pending migrations against the **production** project (Supabase CLI, hosted runner, or controlled SQL). Config in prod should come from migrations, not from repeating manual dashboard edits.

8. **Run a production smoke test**  
   Use the **production smoke test checklist** below (lighter than staging).

## Staging smoke test checklist

Run a full booking / payment / SMS / action-link path; use real SMS and payment test mode as appropriate.

- [ ] Booking works
- [ ] Payment works
- [ ] Customer confirmation SMS works
- [ ] Vendor offer SMS works
- [ ] Vendor accept action link works
- [ ] Customer assigned SMS works
- [ ] Vendor assigned SMS works
- [ ] Reschedule works
- [ ] Cancel works

## Production smoke test checklist

Keep prod checks minimal and safe (avoid unnecessary cancellations; prefer one controlled test booking if policy allows).

- [ ] Booking + payment (small test or monitored real booking)
- [ ] Customer confirmation SMS (copy and link domain)
- [ ] Vendor offer SMS and vendor accept action link (or equivalent spot-check)
- [ ] Customer + vendor assigned SMS after accept, when you run accept in prod
- [ ] Reschedule or cancel only on a disposable test job when you need to re-verify those paths

## Notes

- Baseline migrations that reference fixed `workflows.id` / `workflow_actions.id` assume those UUIDs match the target environment (as created in staging and promoted).
- Runtime behavior depends on **code and DB agreeing** on event types, action types, and template paths (for example `action_link_consumed` for vendor accept). See workflow comments and `web/lib/workflowRun.ts` when in doubt.

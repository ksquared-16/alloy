---
owner: runtime
status: proposed
last_reviewed: 2026-11-26
supersedes: []
status_note: Owner's step-by-step guide to every Vercel, Render and Supabase dashboard action in the first promotion (objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66), in the order of the final cutover plan. Written for the owner's 2026-11-26 decision (D12) that the owner does every dashboard step personally. Placeholders only; no value appears here. Nothing here authorizes a live action.
---

# Environments and promotion — owner dashboard guide (2026-11-26)

This guide is for you, the owner. It lists every step you do yourself in the **Vercel**, **Render** and **Supabase**
dashboards for the first promotion, before the window and during it, in the order of the
[final cutover plan](environments-final-cutover-plan-2026-11-26.md). Every setting name comes from the
[settings checklist](environments-p1s-settings-checklist-2026-11-25.md); the plan's step numbers are given with each
step, so you can see where you are in the plan.

## How to use this guide

**Each step has four parts:**

- **Where**: where to click. The menu names are the ones the settings checklist uses. A dashboard can label a page
  slightly differently. If you cannot find a page, or a screen asks for something this guide does not mention, **stop
  and ask the Developer**. Do not guess, and do not change anything else on the page.
- **Enter**: what to type or choose. Words in angle brackets, like `<new-ref>`, are placeholders: you put in the real
  value, from your secret store or from an earlier step. This guide never holds a real value.
- **Check**: how you know it worked.
- **If it doesn't work**: what to do.

**Four rules for the whole operation:**

1. **You never type commands.** Claude Code runs the commands in your operator session on the Mac mini. In step 16 it
   shows you each command first and runs it only if you say yes (plan §0, D11 and D12).
2. **Secrets live in your secret store, and nowhere else.** A secret goes from your secret store into a dashboard field,
   or into a hidden prompt (`read -rs`) in the operator session. Never paste a secret into a chat, an email, a file or a
   command line, and never show one to Claude. If one is ever shown, stop and decide how to go on.
3. **The old production project, `vslwnntzzgpnmrpjipat`, is not touched.** No setting, Vault secret, Auth change or
   pause. It is the rollback target. Everything below in Supabase is on the **new** project, except the step-6 reads of
   **staging**, which only look.
4. **Production only.** In Vercel, set values on the **Production** environment only, never on Preview or Development.
   In Render, change only the **production** backend service.

**Your secret store.** Keep one entry for each value below. The names are the ones the plan and the commands use:

| Entry | What it is | Filled at |
|---|---|---|
| `NEW` (the new project's ref) | Not a secret; you also tell the Developer | Step 5 |
| New project URL and `anon` key | The anon key ships to the browser, but keep it with the others | Step 5 |
| New project `service_role` key | Secret | Step 5 |
| `PRODUCTION_DB_URL` | Secret: the new project's `postgres` connection, port 5432 | Step 5 |
| `PRODUCTION_DB_URL_READONLY` | Secret: the new project's read-only role, port 5432 | Step 5 |
| `STAGING_DB_URL_READONLY` | Secret: staging's read-only role | Before step 6 |
| The four new signing secrets | Secret (see *Before step 10*) | Before step 10 |
| Provider keys, for each capability going live | Secret (see *Before step 10*) | Before step 10 |
| C-FLAG-1, C-CLOCK-1, C-CLOCK-2, C-MSG-1, C-O-1, C-RB-1, C-RB-2, C-RB-3, C-REN-1, C-REN-2 | Your step-6 dashboard reads | Step 6 |
| Your 16.1 password | Secret: the password for your account on the new project | Step 16.1 |

## Part 1. Before the window

### Step 5 (by Sat Nov 28). Create the new Supabase project

**Where:** the Supabase dashboard, your organization, **New project**.

**Enter:**

- a project name of your choice;
- region **`us-west-2`** (AWS, Oregon). This sits beside Vercel's `pdx1` functions (checklist A.1, I-14);
- a database password: generate it in your secret store and keep it there.

**Check:** the project opens, and its settings show region `us-west-2`. Copy the project's **ref** (the short id in its
URL, also shown in its settings) into your secret store as `NEW`, and tell the Developer the ref. The ref is not a
secret. The Developer then runs the config copy (plan step 5), which must name your new ref.

**If it doesn't work:** if the region is wrong, delete this new project (only this one) and create it again. If the
config copy refuses the ref, the Developer tells you why; do not touch the old project to fix it.

### Step 5. Turn on point-in-time recovery, 7 days (O-PITR)

**Where:** the new project's add-ons and backup settings (the checklist calls them *Database → backups / PITR*).

**Enter:** point-in-time recovery with **7 days** of retention. It is a paid add-on, and it needs a compute add-on as
well, so add both now (plan §4 (a) 1).

**Check:** the backup page shows PITR on, with 7-day retention. Before the window, it shows a restore point. Note
"PITR on, 7 days" in your secret store beside `NEW`.

**If it doesn't work:** if the add-on is not offered or is refused, stop and tell the Development Lead before step 6b:
the plan needs PITR before the window (M7), so the window cannot start without it.

### Step 5. Create the read-only role

**Where:** the new project's **SQL Editor**.

**Enter:** the statement that creates the read-only role. **This repository does not hold that statement yet** (P6
owner action 5 says no read-only role exists in any record here). Ask the Database Engineer for the reviewed statement
before step 5, paste it into the SQL Editor, and run it. Choose the role's password in your secret store.

**Check:** the Database Engineer confirms the role cannot write. Its connection details go into your secret store as
`PRODUCTION_DB_URL_READONLY` (next step).

**If it doesn't work:** an error from the statement means stop and send the error text (never a password) to the
Database Engineer.

### Step 5. Copy the new project's values into your secret store

**Where:**

- *API* settings (checklist C.2: *API → Project URL, `anon` key, `service_role` key*);
- the connection details, *Session pooler*, **port 5432** (checklist C.2: *Database → connection pooling*; release
  applies use 5432, never 6543).

**Enter:** nothing in the dashboard. Copy into your secret store:

- the **Project URL** (it is `https://<new-ref>.supabase.co`);
- the **`anon` key**;
- the **`service_role` key**;
- the `postgres` connection on port 5432, as `PRODUCTION_DB_URL`;
- the read-only role's connection on port 5432, as `PRODUCTION_DB_URL_READONLY`.

**Check:** both connections say port 5432, and both name `<new-ref>`, not `vslwnntzzgpnmrpjipat` and not staging's
`ikaxilmwmrmbagoidedu`. The release tool's `fp_target` refuses any other ref or port at step 9.

**If it doesn't work:** if the dashboard shows only port 6543, look for the *session* pooler, not the *transaction*
pooler. If you cannot find it, stop and ask the Developer.

### Step 6 (by Sun Nov 29). The C-row dashboard reads

These are **reads only**: you change nothing. Write each answer into your secret store under its C-row name. Values
stay there; the Development Lead only needs to hear "recorded" for each row at step 6b.

| Row | Where to look | What to note |
|---|---|---|
| **C-FLAG-1** | Vercel, the project, *Settings → Environment Variables*, filtered to **Preview** (staging's scope) | For each of the 68 class **F** keys in checklist A.2: "set, value `<value>`" or "unset". Also note staging's `NEXT_PUBLIC_APP_ENV` value, and for the pair `DRAWER_SUMMARY_STRIP_BOUNDARY` and `NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY`, whether staging sets them and to what (briefing §5.5) |
| **C-O-1** | The same Vercel page, Preview | Staging's values of `ALLOY_CANCELLATION_FEE_CENTS`, `ALLOY_CANCELLATION_FEE_WITHIN_HOURS`, `ALLOY_DEFAULT_BUSINESS_TIMEZONE` and `NEXT_PUBLIC_BOOKING_PATH`, or "unset", and for each, whether it is a real business setting you want in production (I-18) |
| **C-CLOCK-1** | Supabase, the **staging** project, *SQL Editor*. Run `select wake_count, last_wake_at from public.scheduled_work_clock`, wait at least five minutes, and run it again | Both readings, and whether `last_wake_at` moved forward. It should: staging's clock ticks every five minutes |
| **C-CLOCK-2** | Vercel, the project's settings, *Cron Jobs* | Whether Vercel lets you disable Cron Jobs for the project ("yes" or "no"). Do not disable anything yet |
| **C-MSG-1** | Render, the list of services | Whether a Render **Cron Job** calls staging's backend `/internal/messages/process`. If one does: its schedule, and which service it calls |
| **C-RB-1** | Vercel, the project, *Deployments*, the current **Production** deployment | Its deployment id. Instant Rollback goes back to exactly this one |
| **C-RB-2** | Render, the **production** backend service, *Environment*, and its deploy history | The current values of `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `INTERNAL_CRON_TOKEN`, and the id of the current deploy. A rollback restores these |
| **C-RB-3** | Vercel, the C-RB-1 deployment | Whether *Instant Rollback* is offered for that deployment. On some plans it only reaches the immediately previous deployment, so no extra production deploys may happen in the window |
| **C-REN-1** | Render, the production backend service, its settings | The branch it deploys from, and whether auto-deploy is on |
| **C-REN-2** | Render, the production backend service, *Environment* | Whether saving an environment change redeploys the service, or whether Render offers to save without deploying |

**Check:** each row has an answer. Tell the Development Lead which rows are recorded (not their values).

**If it doesn't work:** if a page is not where the table says, or you cannot tell the answer, write "could not read"
and tell the Development Lead. An unread row keeps step 6b open (plan §4 (d) 3).

**Staging's read-only URL.** The step-6 export also needs `STAGING_DB_URL_READONLY` in your secret store. You paste it at
the hidden prompt when the Developer runs the export; you do not type a command.

### Before step 10. The new production secrets

None of these is copied from staging. Each goes into your secret store first, then into the place shown, at the step
shown.

| Secret | Where it comes from | Where it goes | When |
|---|---|---|---|
| `INTERNAL_CRON_TOKEN` | Generate a new long random value in your secret store | Vercel Production `INTERNAL_CRON_TOKEN`; Render production `INTERNAL_CRON_TOKEN`; Supabase Vault `scheduled_work_wake_credential`. **The same value in all three** (checklist D) | Step 10 (Vercel, Render); step 13 (Vault) |
| `COMMUNICATION_UNSUBSCRIBE_SECRET` | Generate new | Vercel Production only | Step 10 |
| `COMMAND_DESTRUCTIVE_PREVIEW_SECRET` | Generate new | Vercel Production only | Step 10 |
| `DOCUMENT_API_UPLOAD_SECRET` | Generate new | Vercel Production only | Step 10 |
| `SUPABASE_SERVICE_ROLE_KEY` | The new project's `service_role` key (step 5) | Vercel Production `SUPABASE_SERVICE_ROLE_KEY`; Render production `SUPABASE_SERVICE_ROLE_KEY`; the 16.0 hidden prompt | Step 10; step 16.0 |
| `PRODUCTION_DB_URL`, `PRODUCTION_DB_URL_READONLY` | Step 5 | Only the hidden prompts in the operator session. Never a dashboard field | Steps 7, 9, 15, 15b, 16 |
| Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe, live mode, one account; the webhook secret is the production endpoint `/api/stripe/webhook`'s | Vercel Production | Step 10, **only if payments go live** |
| Resend: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` (and the sender `RESEND_FROM_EMAIL`) | Resend; the webhook secret is the production endpoint `/api/webhooks/resend`'s | `RESEND_API_KEY` and `RESEND_FROM_EMAIL` on Vercel and Render; `RESEND_WEBHOOK_SECRET` on Vercel | Step 10, **only if email goes live** |
| Twilio: `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_MESSAGING_SERVICE_SID` | Twilio, the production account | `TWILIO_AUTH_TOKEN` on Vercel and Render; the two SIDs on Render | Step 10, **only if SMS goes live** |
| OpenAI: `OPENAI_API_KEY` (with `OPENAI_MODEL`) | OpenAI | Vercel Production | Step 10, **only if AI enrichment is wanted** |

**Do not create `CRON_SECRET`.** Production leaves it unset (D4).

**Check:** the four generated values (`INTERNAL_CRON_TOKEN` and the three signing secrets) are all different from one
another (I-2), and none matches a staging value.

**If it doesn't work:** if two generated values match, generate one again. If a provider key is not ready, that
capability stays off: leave its rows unset (they are class **C**, "set when the capability is on").

### Before step 16 (and before any invite). Supabase Auth SMTP

The window itself does not need this: your own 16.1 account gets a password. It is needed before Firefly's admin
invites anyone (I-19).

**Where:** the new project, *Authentication → Emails → SMTP* (checklist C.2).

**Enter:** your mail provider's SMTP details and a **delivering** sender address. Staging uses a capture-only
sandbox; production must not. The *Invite user* and *Reset password* templates are the ones the code uses.

**Check:** the settings save and show your sender. The first real proof is the first invite you send after step 16:
it must arrive.

**If it doesn't work:** if a saved setting is refused, check the provider's details. If the first invite does not arrive,
check your mail provider's log before sending more.

## Part 2. In the window (T = 09:00 PT)

### Step 10 (T+1:30). Supabase settings on the new project (§5.1)

**Where and what to enter**, on the **new** project:

| Where | Enter |
|---|---|
| *API → exposed schemas* | `public` |
| *Authentication → Providers → Email* | Enabled, with password sign-in. No other provider |
| *Authentication → URL Configuration → Site URL* | `<production-origin>`, the same as `NEXT_PUBLIC_APP_URL` (the plan's step 11 checks `https://www.workwithalloy.com`) |
| *Authentication → URL Configuration → Redirect URLs* | `<production-origin>/reset-password` and `<production-origin>/login` |
| *Authentication → Emails → SMTP* | As in *Before step 16* above, if not done yet |
| *Database → connection pooling* | Nothing to change: confirm the session pooler is on port 5432 |
| Vault | **Nothing yet.** Vault is steps 12 and 13 |

**Check:** re-open each page and read the value back.

**If it doesn't work:** a value that will not save is a stop for step 10: tell the Developer. Step 11 does not start
until step 10 passes.

### Step 10 (T+1:30). Vercel, Production scope (§5.2)

**Where:** Vercel, the project, *Settings → Environment Variables*. Every value goes on **Production** only.

**Project settings first** (checklist A.1), in the project's settings: Root Directory `web`; Ignored Build Step
`bash scripts/vercel-ignored-build.sh`; production branch `main`; *Automatically expose System Environment Variables*
**on**. If C-CLOCK-2 said Vercel lets you disable Cron Jobs, disable them now.

**Enter, by class** (the class letters are the checklist's):

- **R, always set:**
  - `ALLOY_ENVIRONMENT` = `production`;
  - `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL` = the **new** project URL, the same in both;
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the new project's anon key;
  - `SUPABASE_SERVICE_ROLE_KEY` = the new project's service-role key;
  - `NEXT_PUBLIC_APP_URL` = `<production-origin>` (`https://` and the host, no path);
  - `INTERNAL_CRON_TOKEN` = the new value, the same as Render's;
  - `INTERNAL_MESSAGES_PROCESS_URL` = `<production-backend-origin>/internal/messages/process`, the **production** Render
    service, never staging's;
  - `COMMUNICATION_UNSUBSCRIBE_SECRET` and `COMMAND_DESTRUCTIVE_PREVIEW_SECRET` = their new values.
- **`CRON_SECRET`: leave unset.**
- **C, only for a capability going live:** `DOCUMENT_API_UPLOAD_SECRET` (its new value; set it with the other two
  signing secrets, I-2); Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`);
  Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`); `TWILIO_AUTH_TOKEN`; `OPENAI_API_KEY` with
  `OPENAI_MODEL`; `MARKETING_DEMO_FROM` (a verified sender); `NEXT_PUBLIC_META_PIXEL_ID` (only if you want the pixel).
- **F, the flags (D6):** every F key your C-FLAG-1 read says staging sets, at staging's value. A key staging leaves unset
  stays unset. **Except** the pair `DRAWER_SUMMARY_STRIP_BOUNDARY` and `NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY`:
  **always set both**, to staging's value if staging sets it, otherwise `1` (I-3).
- **O, business settings (C-O-1):** set `ALLOY_CANCELLATION_FEE_CENTS`, `ALLOY_CANCELLATION_FEE_WITHIN_HOURS`,
  `ALLOY_DEFAULT_BUSINESS_TIMEZONE` or `NEXT_PUBLIC_BOOKING_PATH` only where your C-O-1 read says staging's value is a
  real business setting. Leave every other O row unset.
- **L, legacy: leave unset:** `ALLOY_PUBLIC_ORG_ID`, `BOOK_V2_BOOKED_STAGE_ID`, `BOOK_V2_NEEDS_A_QUOTE_STAGE_ID`,
  `BOOK_V2_QUOTE_STARTED_STAGE_ID`, `NEXT_PUBLIC_API_BASE_URL`.
- **A, D and B rows:** leave unset. **P rows:** do not set; Vercel provides them.
- **S and X rows must be absent** (I-13). Check that none of these is on Production:
  - S: `APP_ENV`, `NEXT_PUBLIC_APP_ENV` (if either is there, it must not say `staging`),
    `COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST`, `COMMUNICATIONS_STAGING_SMS_ALLOWLIST`,
    `NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG`;
  - X: `DEV_TENANT_SPINUP_ENABLED`, `ALLOY_CERTIFICATION`, `AI_ENRICHMENT_STUB_ENABLED`, `NEXT_PUBLIC_COMMS_V2_FIXTURES`,
    `VITEST`, `ALLOY_AGENT_ENV`, `ALLOY_BUILD_SHA`, `ALLOY_DEV_STRICT_MODE`, `ALLOY_PROD_CERT_DIST`, and every key that
    starts with `ALLOY_CERT_` or `ALLOY_QA_` (checklist A.2 lists them all).

**Check:** filter the list to Production and read it against the checklist, row by row. Every `NEXT_PUBLIC_*` value
must be in place **before** step 11, because the build bakes them in.

**If it doesn't work:** a key that will not save, or a value you are unsure of, is a stop for step 10: tell the
Developer, and step 11 waits. If a `NEXT_PUBLIC_*` value turns out wrong after step 11's build, it needs a new build;
tell the Developer, and the T+2:20 keep-or-roll-back rule applies.

### Step 10 (T+1:30). Render, the production backend service (§5.3)

**Where:** Render, the **production** backend service, *Environment*.

**Before you save:** look at your C-REN-2 note. If saving the environment redeploys the service, **do not save now**:
enter these values just before step 11's Render deploy instead, so the old backend never runs against the new project.
If Render offers to save without deploying, use that.

**Enter:**

- **R:** `ALLOY_ENVIRONMENT` = `production`; `SUPABASE_URL` = the **new** project URL; `SUPABASE_SERVICE_ROLE_KEY` = the
  new project's service-role key; `INTERNAL_CRON_TOKEN` = the same value as on Vercel.
- **C, only if SMS or email go live:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`,
  `COMMUNICATIONS_TWILIO_INBOUND_VALIDATION_BASE_URL` (`<production-backend-origin>`, the backend's own public origin),
  `PUBLIC_TWILIO_STATUS_CALLBACK_BASE` (only if delivery receipts are wanted), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
- **O:** leave `COMMUNICATIONS_SMS_INBOUND_ENABLED` unset.
- **S rows must be absent:** `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_SUPABASE_URL`, `VERCEL_ENV`,
  `COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST`, `COMMUNICATIONS_STAGING_SMS_ALLOWLIST`.
- **Not carried:** `TWILIO_FROM_NUMBER` (no code reads it, I-4).
- **Service settings** (checklist B.1), read only: start command `uvicorn backend.main:app`, Python 3.10.5,
  `pip install -r backend/requirements.txt`.
- **Render cron (C-MSG-1):** if staging has a Render Cron Job calling `/internal/messages/process`, production gets one
  pointed at `<production-backend-origin>` with production's `INTERNAL_CRON_TOKEN`. If staging has none, production gets
  none.

**Check:** re-open *Environment* and read each value back. `SUPABASE_URL` names `<new-ref>` (I-11).

**If it doesn't work:** if a save started a deploy you did not expect, tell the Developer at once: the backend may be
running against the new project before step 11. If a value will not save, step 10 is not passed.

### Step 11 (T+1:45). Deploy Render on the candidate

The Developer pushes the candidate to `main` and checks Vercel. Your part is Render.

**Where:** Render, the production backend service, its manual deploy.

**Enter:** deploy commit `<candidate-sha>` (the plan's `$SHA`, which the Developer gives you). If you held Render's
values back at step 10 (C-REN-2), save them immediately before this deploy. If your C-REN-1 note says Render
auto-deploys from `main`, the push may already have started this deploy: check its commit instead of starting another.

**Check:** `<production-backend-origin>/build-info` shows `git_commit` `<candidate-sha>`.

**If it doesn't work:** a failed Render deploy, or `/build-info` serving another commit, is trigger 5 at T+2:20 (plan
§3 R-C). Tell the Developer; do not change Vercel to compensate.

### Step 12 (T+2:00). Vault: the wake URL, always, and first

**Where:** the **new** project's *Vault* in the Supabase dashboard.

**Enter:** a new secret named `scheduled_work_wake_url`, value `<production-origin>/api/scheduled-work/wake`.

**Check:** open the secret and read the value back: it starts with the production origin and ends with
`/api/scheduled-work/wake`. **This must pass before step 13.** Without it, the clock falls back to the staging URL and
would send production's token to staging every five minutes.

**If it doesn't work:** if the value reads back wrong, fix it and read it back again. Do not start step 13 until it reads
back right.

### Step 13 (T+2:03). Vault: the wake credential, second

**Where:** the same *Vault* page, on the new project.

**Enter:** a new secret named `scheduled_work_wake_credential`, value = production's `INTERNAL_CRON_TOKEN` (the same
value as on Vercel and Render).

**Check:** the secret is listed. You do not need to reveal it. The Developer's step 14 then watches for a tick.

**If it doesn't work:** if the secret will not save, tell the Developer. If step 14 sees no tick within ten minutes, that
is trigger 4 at T+2:20.

### Step 15 (T+2:10). Re-read after the deploy

**Where:** Vercel Production variables, Render's production *Environment*, the app, and the **old** project.

**Check:**

- **I-2:** `COMMUNICATION_UNSUBSCRIBE_SECRET`, `COMMAND_DESTRUCTIVE_PREVIEW_SECRET`, `DOCUMENT_API_UPLOAD_SECRET` and
  `INTERNAL_CRON_TOKEN` are four different values;
- **I-3:** both `DRAWER_SUMMARY_STRIP_BOUNDARY` and `NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY` are set;
- **I-10:** `ALLOY_ENVIRONMENT` is `production` on Vercel and on Render;
- **I-11:** every Supabase URL and key on both platforms is the new project's;
- **I-13:** no S or X row is set;
- `<production-origin>/login` shows the sign-in page;
- the old project `vslwnntzzgpnmrpjipat` is as you left it: you made no change there.

Tell the Developer each result.

**If it doesn't work:** any failed row goes into the T+2:20 decision. Do not fix production settings after T+2:20
without the Developer, because a `NEXT_PUBLIC_*` change needs a new build.

### T+2:20. If you decide to roll back (plan §3 R-C)

Only if you decide **roll back** at T+2:20. Do these in this order:

1. **Clock first.** In the **new** project's *Vault*, delete `scheduled_work_wake_credential`. The clock then sends
   nothing. Check: the secret is gone.
2. **Vercel.** *Deployments*, the C-RB-1 deployment, **Instant Rollback**. Check: the Developer sees build-info serve
   the old `main`, `bbfbec76d779`, on `vslwnntzzgpnmrpjipat`.
3. **Render.** Restore the C-RB-2 values (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_CRON_TOKEN`) and roll
   back to the C-RB-2 deploy. Check: `/build-info` no longer serves `<candidate-sha>`.

**If it doesn't work:** if Instant Rollback is not offered for the C-RB-1 deployment (C-RB-3), stop and tell the
Developer before doing anything else in Vercel.

### Step 16.1 (T+2:25). Add your own account on the new project

The operator, Claude Code, runs the rest of step 16. It shows you each command first and runs it only if you say yes.
At 16.0 it asks you to paste the new project's service-role key at a hidden prompt.

**Where:** the **new** project, *Authentication → Users*, **Add user**.

**Enter:** your own existing email, `<admin-email>`; a password from your secret store; and mark the email confirmed.
The password is what you sign in with at step 16L.

**Check:** the user is listed. Copy its user id, `<admin-user-id>`, and give it to the operator in the session (the id
is not a secret, but it is not written in any file).

**If it doesn't work:** if *Add user* fails, tell the operator; step 16 cannot start without the id. If it is not done by
T+2:50, the STOP point applies: production stays live without Firefly, and step 16 moves to a later session.

## What this guide does not cover

- **Step 8**, your approval of the release at your own terminal, and **step 16's per-command approvals**: see the plan,
  §0 and §2.2.
- **Step 16L**, setting up Firefly's lanes in the app's Work Unit Queue screen, and inviting Firefly's staff afterwards.
- **Provider dashboards** (Stripe, Resend, Twilio webhooks): for each capability going live, its webhook must point at
  production, never staging (briefing I-8).
- Anything not named in the [settings checklist](environments-p1s-settings-checklist-2026-11-25.md). If a dashboard
  shows a key that is not in the checklist, do not carry it (checklist E.2).

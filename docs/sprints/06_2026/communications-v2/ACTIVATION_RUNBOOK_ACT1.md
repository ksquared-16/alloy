# Communications V2 — ACT-0A + ACT-1 Runbook

Your 5 steps. Nothing else required.

## 1. Import the bundle
```bash
cd ~/Alloy-Comms-Gate
git fetch /path/to/communications-v2-act0a-act1.bundle communications-v2
git merge --ff-only FETCH_HEAD          # advances to the ACT-1 tip
```

## 2. Copy/paste the env block into web/.env.local
(see ACTIVATION_ENV_BLOCK.txt — the three NEXT_PUBLIC_COMMS_V2_* lines)

## 3. Run the seed (idempotent, synthetic, additive — targets your oldest org)
```bash
psql "$DATABASE_URL" -f scripts/dev/seed_comms_v2_demo.sql
# or via Supabase: supabase db query < scripts/dev/seed_comms_v2_demo.sql
# It prints seeded_org / demo_threads / demo_messages at the end.
```

## 4. Start local + open the browser
```bash
cd web && npm run dev
# visit http://localhost:3000/adminV2/communications
```

## 5. Execute the QA sheet (Command Center tab in Alloy_Comms_V2_UI_QA_Sheets.xlsx)

---

## Baseline verification (prove nothing else broke)
- BEFORE pasting the env block (flags off): `/adminV2/communications` → **404**, and the rest of Alloy behaves exactly as before. This is the "flags off = no behavior change" guarantee (the route + shell only render under the flag).
- The only new server surface is an additive read-only route (`GET /api/admin/communications/conversations`) that 404s when the flag is off.

## ACT-1 success criteria (what you should be able to do)
1. Enable flags (step 2). 2. Start local (step 4). 3. Navigate to `/adminV2/communications`.
4. **See conversations** (seeded families grouped into operational queues).
5. **See assignments** (Claim/Assign updates the row + writes an audit event).
6. **See metrics** (New / Requires Response / SLA At Risk / Messages Sent / Response Rate).
7. **Open threads** (click a conversation → workspace timeline).
8. **Verify nothing else in Alloy broke** (flags off elsewhere; baseline check above).

If all 8 hold → product mode. If not → send me the browser/console error and I'll fix in a follow-up bundle.

## ACT-1.1 — Route exposure (fix)
The Command Center URL is **`/admin/communications`** (the `/adminV2/...` form redirects to it).
With `comms_v2_command_center=1`, middleware now treats `/admin/communications` as a canonical AdminV2
route (served by `app/adminV2/communications`) instead of redirecting to `/legacy-admin/communications`.
Flag off → unchanged (legacy). Nav link update (left nav → V2 workspace) is a follow-on; use the URL directly for QA.

## ACT-1 CORRECTED (supersedes the /admin/communications page + ACT-1.1)
The Command Center is NOT a new page. It **replaces the Inbox modal body**: with `comms_v2_command_center=1`,
clicking the top-nav **Inbox** button opens the same modal (BOS right rail unchanged) but its body is now the
V2 Command Center (operational queues → conversation workspace) instead of the legacy inbox panel. Flag off →
the legacy inbox modal exactly as before. The standalone `/admin/communications` page and the middleware change
were removed/reverted. **How to test:** flag on → click **Inbox** in the top nav → see the Command Center.

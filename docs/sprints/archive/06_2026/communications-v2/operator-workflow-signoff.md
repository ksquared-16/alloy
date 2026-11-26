# Communications V2 — Operator Workflow Signoff

**Date:** 2026-06-15  
**Scope:** Final operator workflow completion pass (Command Center only). No modal redesign, BOS, Announcements, Provider Admin, or Email Inbound.

---

## A. What is now complete

| Area | Status |
|------|--------|
| Queue render + auto-select + timeline/composer load | Complete |
| Stage resolution (shared Opportunity Drawer path) | Complete |
| Queue enrichment (family, parent, child, stage, preview) | Complete |
| Record navigation (family → customer drawer, parent → person, child → member, stage → opportunity) | Complete — links hidden when UUID cannot resolve |
| Communication preferences panel (Email / SMS / Marketing → Allowed / Blocked / Unknown) | Complete — always visible |
| “Needs review” operator terminology (replaces “Unclassified”) | Complete |
| Workspace modes: Email, SMS, Notes, Tasks | Complete — all tabs visible; unavailable modes explain why |
| SMS send channel switching | Complete when eligible |
| Visual section separation (queue / timeline / composer) | Complete — borders + subtle backgrounds |
| Related operational tasks (opportunity-scoped) | Complete — read-only list in Tasks mode |
| Workflow integrity (no fake consent / health labels) | Complete |

---

## B. Intentionally deferred

1. **Provider Administration** — binding management UI, org-level provider config
2. **Email Inbound** — inbound parsing, thread creation from email replies
3. **Production QA** — full cross-org regression, load testing, operator UAT script

Also deferred within Communications:

- **Note compose** — notes are viewable in timeline + Notes mode; new internal note authoring requires a dedicated write path (not in family-send)
- **Task creation from Communications** — tasks are read-only; creation stays in My Tasks / opportunity workflows
- **Queue classification workflow** — no operator UI yet to assign `attention_state` (see Task 3 below)
- **Assignment / Claim** — hidden unless `comms_v2_assignment` flag ON
- **Consent enforcement at send** — requires `comms_v2_compliance` flag ON; display is always on

---

## C. Consent data model

| Operator label | Source table | Category column(s) | Scope |
|----------------|--------------|-------------------|--------|
| **Email** | `communication_preferences` | `email_transactional` | Primary contact `person_id`, org-scoped |
| **SMS** | `communication_preferences` | `sms_transactional` | Primary contact `person_id`, org-scoped |
| **Marketing** | `communication_preferences` | `email_marketing` + `sms_marketing` (strictest wins) | Primary contact `person_id`, org-scoped |

**States:** `opted_in` → Allowed, `opted_out` → Blocked, `unset` or missing row → Unknown.

**If rows are missing:** UI shows **Unknown** (not hidden). This is expected for legacy contacts until preferences are seeded or captured.

**Not used for display:** channel eligibility flags, `displayFlags`, provider binding status (those gate send, not consent display).

---

## D. “Needs review” (formerly Unclassified)

**Why:** Thread has null or unknown `attention_state` — not yet placed in an operational queue (`awaiting_parent_reply`, `needs_follow_up`, etc.). Most staging threads (~119) are in this state.

**How an operator changes it today:** No in-product classification workflow yet. Threads appear under **All conversations**.

**Future path:** Assignment/classification UI (PKG assignment + attention_state mutation via admin action or inbound rules), gated behind `comms_v2_assignment` and a future triage action.

---

## E. Workspace modes

| Mode | Today | Unavailable reason (when shown) |
|------|-------|----------------------------------|
| **Email** | Send when provider + recipient eligible | Provider not configured / no email recipient |
| **SMS** | Send when provider + SMS-capable recipient | Provider not configured / no SMS recipient |
| **Notes** | View timeline notes | Compose: “not yet available from this workspace” |
| **Tasks** | List open `operational_tasks` for linked opportunity | No opportunity linked |

---

## F. Remaining operator-facing gaps

1. Note authoring from Command Center
2. Task creation / completion from Communications workspace
3. Queue triage / classify into operational attention queues
4. Preference editing inline (read-only display only today)
5. Marketing sends / announcement composer (separate from this pass)

---

## G. Freeze recommendation

**YES** — Communications V2 Command Center is ready to freeze for operator use at the current staging maturity.

**Why yes:**

- Core operator loop works: queue → select family → read timeline → compose email/SMS → navigate to related records
- Preferences are visible (Unknown is honest)
- No dead tabs; unavailable modes explain themselves
- No placeholder values presented as truth for consent or health
- Deferred items are clearly bounded and do not block daily email/SMS coordination

**Why not a hard production lock:** Note compose, queue classification, and inline preference edit remain follow-ups before calling Communications “finished” for all operator personas.

---

## Files changed (this pass)

- `web/lib/communications/v2/householdCommunicationPreferences.ts` (new)
- `web/lib/communications/v2/loadCommunicationPreferences.ts` (new)
- `web/lib/communications/v2/workspaceModeAvailability.ts` (new)
- `web/lib/communications/v2/familyWorkspace/types.ts`
- `web/lib/communications/v2/familyWorkspace/assembleFamilyWorkspace.ts`
- `web/lib/communications/v2/familyWorkspace/resolveFamilyCommunicationWorkspace.ts`
- `web/lib/communications/v2/commandCenterViewModel.ts`
- `web/app/adminV2/communications/CommandCenterShell.tsx`
- `web/app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx`
- `web/app/adminV2/communications/FamilyCommunicationWorkspace.tsx`
- Tests under `web/tests/communications/` and `web/tests/adminV2/commsV2CommandCenterLive.contract.test.ts`

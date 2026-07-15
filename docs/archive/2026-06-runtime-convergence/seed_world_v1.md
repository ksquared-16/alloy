# Seed World v1 — Operational Demo Dataset Design

**Path:** `docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/seed_world_v1.md`  
**Status:** Architecture & data strategy (June 2026) — **no implementation**  
**Scope:** Ideal staging/demo operational world for Alloy enrollment childcare vertical  
**Out of scope:** Seed scripts, migrations, database resets, or executable loaders

---

## Purpose

Define a **believable operating world** that exercises Alloy end-to-end: multi-campus enrollment, mixed sibling lifecycles, waitlist orchestration, tours, packets, communications, tasks, readiness enforcement, and Needs Attention overlays.

This document is the **target dataset contract** for staging/demo tenants. Implementers (seeds, fixtures, or import pipelines) should treat it as authoritative intent, not as code.

**Related doctrine:**

- `docs/platform/governance/glossary.md` — case vs child lifecycle, queues, work units
- `docs/product/crm-system.md` — enrollment pipeline, Needs Attention, waitlist
- `docs/sprints/archive/05_2026/lifecycle_information_matrix_v1.md` — stage requirements
- `docs/sprints/archive/05_2026/childcare_lifecycle_matrix_v1.md` — status/action vocabulary
- `web/lib/config/enrollmentPipelineQueueDefinitionV2.ts` — canonical queue lanes

---

## Design principles

| Principle | Application in seed world |
|-----------|---------------------------|
| **Case vs child grain** | `opportunities.status_key` = household coordination; `opportunity_customer_members.outcome_status_key` = per-child enrollment truth. Siblings **must** diverge in at least 6 families. |
| **Queues are previews** | Row counts and ordering should populate every visible lane; authoritative detail still lives on entity GET. |
| **Person-first identity** | Every family has `persons` + `customer_persons`; contacts optional for legacy comms paths only. |
| **Child facts on members** | Names, DOB, roster state on `customer_members`; inquiry fields on OCM — not opportunity metadata. |
| **Config-driven vertical** | Program types, status labels, packet definitions, and attention buckets come from org config — not hardcoded in application branches. |
| **Performance realism** | Dataset sized for queue pagination (50-row caps), drawer hydration, global search, and dept bootstrap — not micro-fixtures. |
| **Deterministic narrative** | Named exemplar families anchor demo scripts; bulk filler uses generated but structurally valid data. |

---

## Target org profile

**Fictional operator:** **BrightPath Early Learning**  
**Vertical:** Childcare (`childcare` slug)  
**Market:** Suburban multi-site operator, infant through pre-K, full- and part-time schedules  
**Staging intent:** Primary demo tenant + performance validation tenant (same shape, optional 1.5× scale variant noted below)

### Scale targets

| Entity | Count | Notes |
|--------|------:|-------|
| **Families (`customers`)** | **40** | Within 25–50 requirement; all have ≥1 parent person |
| **Parent/guardian persons** | 52 | ~25% two-parent households |
| **Children (`customer_members`)** | **58** | ~1.45 children/family avg; 12 sibling sets (2–3 children) |
| **Open/recent opportunities (cases)** | **38** | 2 families roster-only (enrolled legacy, no open case) |
| **OCM inquiry child links** | **54** | Some enrolled children have closed cases + active member roster |
| **Placement candidates (waitlist grain)** | **14** | One row per child × site × cohort |
| **Active tour bookings** | **9** | Mix confirmed + pending approval |
| **Communication threads** | **85** | ~2.2 per active case avg |
| **Operational tasks (`operational_tasks`)** | **45** | ~60% open |
| **Form packet sessions** | **12** | Mix in_progress, submitted, under_review, approved |
| **Standalone form submissions** | **20** | Intake + operational one-offs |

**Performance variant (optional):** Duplicate shape at **60 families / 85 children** for load testing only — same distribution percentages, not a second doc revision.

---

## Data strategy

### Layering model

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 0 — Platform config (org bootstrap)                  │
│  statuses, lifecycle builder, queue_definition v2, forms,   │
│  attention buckets, tour rules, placement priority profile  │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 1 — Org structure                                    │
│  org, locations (sites + units), departments, work units,   │
│  staff users, access profiles, role grants                  │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2 — Identity & households                            │
│  persons, customers, customer_persons, customer_members     │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3 — Pipeline cases                                   │
│  opportunities, OCM rows, placement_candidates, tours       │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 4 — Operational activity                             │
│  communications, tasks, forms/packets, documents, events      │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 5 — Attention & readiness stressors                  │
│  deliberate gaps, stale timestamps, overdue follow-ups      │
└─────────────────────────────────────────────────────────────┘
```

### Temporal strategy

Anchor **“today”** to load date (relative offsets, not fixed calendar dates):

| Pattern | Offset from today | Used for |
|---------|-------------------|----------|
| Fresh lead | 0–4 hours | New inquiry lane |
| Stale lead | 30–54 hours | `stale_new_inquiry` |
| Stale qualification | 3–5 days idle | `stale_qualified` |
| Tour this week | +2 to +6 days | Upcoming tours lane |
| Tour passed | −1 to −4 days | `tour_date_passed` |
| High-value stale | 3–7 days since tour complete | `high_value_stale` |
| Waitlist aging | 14–120 days on candidate | Placement priority demos |
| Enrolling packet | start date +14 to +45 days | `waiting_on_documents` |
| Enrolled active | start date −90 to −400 days | Roster depth |
| Withdrawn | exit −10 to −180 days | Historical churn |

### Idempotency & naming

- **Stable external keys** in `metadata.demo_world_v1_key` on exemplar rows (e.g. `family.rivera`, `child.rivera.maya`) for QA re-seek without UUID memorization.
- **Bulk filler** uses deterministic pseudo-random generation from a fixed seed integer (`20260606`) so repeated loads produce identical counts and distributions.
- **No production PII** — synthetic names, `@brightpath-demo.example` emails, `(555) 010-xxxx` phones.

### Integrity rules (load must enforce)

1. Every opportunity has `work_unit_id` → enrollment pipeline WU and resolvable department.
2. Every OCM row references a `customer_member_id` on the same customer as the opportunity.
3. Waitlist lane rows require **`placement_candidates`** + OCM `outcome_status_key` ∈ `{waitlisted, offer_pending}`.
4. Child-grain enrolling/enrolled lanes require OCM disposition, not case status alone.
5. Confirmed tour bookings mirror `opportunities.metadata.tour_date` / `tour_time`.
6. At most one active non-terminal `tour_bookings` row per opportunity.
7. Withdrawn children: `customer_members.status_key` = `withdrawn` + historical OCM/opportunity closure — not active pipeline cases.
8. Communications threads anchor on `opportunity_id` (or person with opportunity link in metadata).

---

## 1. Organization structure

### Org

| Field | Value |
|-------|-------|
| **Display name** | BrightPath Early Learning |
| **Slug** | `brightpath-demo` |
| **Timezone** | `America/Chicago` |
| **Vertical** | Childcare preset bootstrap |

### Campuses (`locations`, `location_type = site`)

| Site key | Label | Address flavor | Capacity story |
|----------|-------|----------------|----------------|
| `site.north` | BrightPath North | Suburban campus, parking lot | Largest — infant + toddler + pre-K units |
| `site.downtown` | BrightPath Downtown | Urban center, limited infant | Waitlist-heavy, premium demand |
| `site.west` | BrightPath Westside | Newer build, growing enrollment | Tour-heavy, expanding units |

### Classrooms / cohorts (`locations`, `location_type = unit`, parent → site)

Each site has **4 units** aligned to program bands:

| Unit pattern | Program key (`childcare_program_type`) | Typical age band |
|--------------|----------------------------------------|------------------|
| `{site}.infants` | `infant` | 6 weeks – 12 months |
| `{site}.toddlers` | `toddler` | 12 – 30 months |
| `{site}.preschool` | `preschool` | 2.5 – 4 years |
| `{site}.prek` | `pre_k` | 4 – 5 years |

Store cohort interest on OCM as `program_room_cohort_key` = unit `locations.id`.

### Departments & work units

| Department key | Label | Work units |
|----------------|-------|------------|
| `enrollment` | Enrollment | **`enrollment_pipeline`** (primary demo WU) |
| `operations` | Center Operations | `center_ops` (light queue — 5 open facility tasks, optional) |
| `family_experience` | Family Experience | none required for v1 |

**Enrollment pipeline WU** carries:

- `queue_definition` v2 bundle equivalent to `RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2`
- `metadata.placement_priority_v1.enabled` = **true** on waitlist lane
- Ranking profile: `childcare_enrollment_waitlist_v2` preset, `shadow_mode: false`
- `metadata.opportunity_attention_rules.needs_attention_buckets` = canonical childcare enrollment seed (9 buckets)
- `metadata.opportunity_attention_rules.readiness_projection_v1` = enabled (projects `missing_required_info`)

### Staff & access (demo login personas)

| Persona | Role | Department scope | Site scope | Purpose |
|---------|------|------------------|------------|---------|
| **Alex Morgan** | Enrollment Director | All | All | Full pipeline demos, settings |
| **Jordan Lee** | Enrollment Coordinator | Enrollment | All | Day-to-day queue work |
| **Sam Ortiz** | Enrollment Coordinator | Enrollment | North + West | Scoped queue filtering |
| **Riley Chen** | Campus Director | Operations | Downtown only | Site-scoped visibility demo |
| **Demo Admin** | Org admin | All | All | Config walkthroughs |

---

## 2. Families

### Composition (40 households)

| Household pattern | Count | Demo purpose |
|-------------------|------:|--------------|
| Single parent, one child | 14 | Lead → tour simplicity |
| Two parents, one child | 10 | Secondary contact + packet signers |
| Single parent, 2 siblings | 8 | Mixed lifecycle stress |
| Two parents, 2–3 siblings | 6 | Waitlist + enrolled split |
| Roster-only (no open case) | 2 | Global search / member drawer |

### Exemplar families (named anchors)

| Key | Family | Narrative |
|-----|--------|-----------|
| `family.rivera` | **Rivera** | Maya **enrolled** North preschool; Lucas **waitlisted** Downtown toddlers — flagship mixed-sibling case |
| `family.chen` | **Chen** | Twins: Emma **enrolling** (packet 80% complete); Ethan **tour_scheduled** West pre-K |
| `family.patel` | **Patel** | New web inquiry **2 hours ago** — pristine lead lane |
| `family.johnson` | **Johnson** | Qualification **5 days stale** — `stale_qualified` + missing program on second child |
| `family.nguyen` | **Nguyen** | Tour **yesterday**, no outcome recorded — `tour_date_passed` |
| `family.okonkwo` | **Okonkwo** | Waitlist #2 Downtown infants, employee priority flag on parent |
| `family.santos` | **Santos** | Enrolling — `waiting_on_documents`, packet submitted, immunization missing |
| `family.brooks` | **Brooks** | Lost competitor — closed case with reason |
| `family.kim` | **Kim** | Withdrawn child (relocated) — roster history |
| `family.martinez` | **Martinez** | High-value tour complete **6 days idle** — `high_value_stale` |

### Parent/guardian data shape

Every household includes:

- Primary parent: first name, last name, phone **or** email (100% have at least one channel; 90% both)
- 35% secondary parent or guardian (`customer_persons.role_type` = `parent` | `guardian`)
- `customers.metadata.inquiry_source` distributed: web 40%, referral 25%, walk-in 15%, phone 12%, campaign 8%
- Optional: `persons.is_employee` = true on **3 families** (waitlist priority demos)

---

## 3. Children

### Roster totals (58 children across 40 families)

| Attribute | Coverage target |
|-----------|-----------------|
| Legal first + last name | 100% |
| DOB | 92% (5 deliberate missing for readiness) |
| `relationship = child`, `is_active` | Per lifecycle below |
| Program interest (`OCM.desired_program_type`) | 88% |
| Desired schedule (`OCM.desired_schedule_type`) | 85% — mix `full_time`, `part_time_am`, `part_time_pm` |
| Desired start date | 80% |
| Site (`OCM.location_id`) | 75% — gaps intentional in qualification stage |
| Cohort key (`OCM.program_room_cohort_key`) | 70% on waitlist/enrolling/enrolled rows |

### Age distribution (aligned to program demand)

| Program band | Children | Notes |
|--------------|----------|-------|
| Infant | 12 | Long waitlists at Downtown |
| Toddler | 16 | Highest volume |
| Preschool | 18 | Steady enrollment |
| Pre-K | 12 | Seasonal start clustering |

### Sibling scenarios (minimum 6 mixed-lifecycle households)

Document in QA script as **must preserve** on reload:

1. **Rivera** — enrolled + waitlisted (different sites)
2. **Chen** — enrolling + tour scheduled
3. **Williams** — one waitlisted infant, one enrolled toddler (same site North)
4. **Thompson** — triplets: two waitlisted, one `not_enrolling` (case open for remaining two)
5. **Garcia** — older child enrolled, younger `new_inquiry` on same reopened case
6. **Foster** — one child withdrawn, sibling actively enrolling (replacement care narrative)

---

## 4. Lifecycle stage distribution

### Case-level (`opportunities.status_key`)

Distribution across **38 active/recent cases** (case grain):

| Stage / status key | Cases | % | Notes |
|--------------------|------:|--:|-------|
| `new_inquiry` | 6 | 16% | Includes Patel fresh lead |
| `qualification` | 7 | 18% | Includes stale Johnson |
| `tour_scheduled` | 5 | 13% | Active bookings attached |
| `tour_completed` / `follow_up_attempted` / `tour_no_show` | 4 | 11% | Post-tour decision window |
| `waitlisted` | 10 | 26% | Case open while ≥1 child waitlisted |
| `enrolling` / `ready_to_enroll` | 7 | 18% | Case coordination during paperwork |
| `enrolled` | 4 | 11% | Case still open for sibling coordination |
| `lost` / `closed` | 4 | — | Historical + recent losses |
| **Roster-only (no open case)** | 2 | — | Kim + one alumni family |

### Child-level (`opportunity_customer_members.outcome_status_key`)

Distribution across **54 OCM rows** on active inquiries:

| Child disposition | Children | % | Primary queue lane |
|-------------------|----------|--:|--------------------|
| `interested` | 8 | 15% | Early funnel / follow-up |
| `waitlisted` | 14 | 26% | **Waitlist** (candidate grain) |
| `enrolling` | 9 | 17% | **Enrolling** |
| `enrolled` | 15 | 28% | **Enrolled** |
| `not_enrolling` | 3 | 6% | Sibling decline / closed intent |
| `deferred` | 2 | 4% | Paused families |
| `withdrawn` | 3 | 6% | Active exit (OCM on closed cases) |

### Withdrawn children (roster grain)

**7 children** across **6 families** on `customer_members.status_key = withdrawn`:

| Reason mix | Count |
|------------|------:|
| Relocation | 3 |
| Schedule change | 2 |
| Financial | 1 |
| Aged out / graduated | 1 |

Withdrawn rows retain historical OCM + closed opportunity for Activity timeline demos; they **must not** appear in active pipeline queue lanes.

### Lifecycle coverage checklist

| Lifecycle phase | Represented | Exemplar |
|-----------------|-------------|----------|
| New lead | ✓ | Patel |
| Qualification | ✓ | Johnson (stale) |
| Tour scheduled | ✓ | Chen (Ethan) |
| Tour completed / no-show | ✓ | Nguyen (passed date), 1× `tour_no_show` |
| Waitlist | ✓ | Okonkwo + 13 others |
| Enrollment / paperwork | ✓ | Santos, Chen (Emma) |
| Active enrolled | ✓ | Rivera (Maya) + 14 others |
| Lost | ✓ | Brooks |
| Withdrawn | ✓ | Kim + roster exits |

---

## 5. Queue distribution

Target row counts per **`enrollment_pipeline`** visible lane (approximate — overlaps allowed for Needs Attention overlay):

| Queue key | Grain | Target rows | Content mix |
|-----------|-------|------------:|-------------|
| `new_leads` | case | **6** | Web + walk-in; 2 stale enough for attention |
| `communications_followup` | case | **7** | Qualification; partial child data |
| `tours` | case | **5** | Confirmed bookings next 7 days |
| `tours_follow_up` | case | **4** | Completed / no-show / follow-up attempted |
| `waitlist` | candidate | **14** | V2 candidate rows with placement priority previews |
| `enrollment_offers` | child | **9** | Packet in flight |
| `enrollment_completed` | child | **15** | Active enrolled (open or closed cases) |
| `needs_attention` | case | **12–15** | Union of attention reasons (overlay) |
| `case_closed` | case | **4** | Lost — not in default throughput pills |

### Waitlist ordering stressors

Ensure the waitlist lane exposes:

| Scenario | Count | Fact |
|----------|------:|------|
| Employee priority parent | 2 | `persons.is_employee` |
| Sibling already enrolled | 3 | household enrolled sibling fact |
| Downtown infant long wait | 4 | `created_at` 60–120 days ago |
| Recently added | 3 | < 14 days |
| Manual position override | 1 | Okonkwo at position 2 of 11 |

### Site filter behavior

When workspace site header = **Downtown**:

- Waitlist rows drop to ~6
- Tours ~2
- Global search still finds all families (permission permitting)

---

## 6. Tasks

**45** `operational_tasks` rows, **`entity_type = opportunities`** only.

| Status | Count | Notes |
|--------|------:|-------|
| `open` | 27 | Nav badge + drawer strip |
| `completed` | 12 | Activity history |
| `canceled` | 6 | Operator dismissed |

| Due pattern | Count | Attention linkage |
|-------------|------:|-----------------|
| Overdue (−1 to −7 days) | 8 | `follow_up_date_passed` |
| Due today | 5 | My Tasks “due today” filter |
| Due this week | 9 | Normal ops |
| No due date | 5 | Informational |
| Completed last 30 days | 12 | Timeline density |

| Source | Count |
|--------|------:|
| `manual` | 30 |
| `task_assist` | 15 |

### Task narratives (exemplar)

| Family | Task | Due | Status |
|--------|------|-----|--------|
| Nguyen | Record tour outcome | Overdue 2 days | open |
| Santos | Chase immunization form | Tomorrow | open |
| Johnson | Call re: second child program interest | Overdue 5 days | open |
| Rivera | Confirm Lucas waitlist check-in | +3 days | open |
| Patel | Initial outreach call | Today | open |
| Brooks | — | — | (none — lost) |

Populate `opportunities.metadata.next_follow_up_at` from earliest open task per affected opportunity.

---

## 7. Communications

**85 threads** / **~210 messages** — canonical `communication_threads` + `communication_messages`.

### Channel mix

| Channel | Threads | Messages |
|---------|--------:|---------:|
| Email | 52 | 140 |
| SMS | 33 | 70 |

### Direction & status

| Pattern | Share | Demo use |
|---------|-------|----------|
| Outbound sent | 55% | Tour confirmations, packet links |
| Outbound queued / scheduled | 10% | Task Assist scheduled send chips |
| Inbound unread | 15% | Family replies needing response |
| Inbound read | 20% | Thread history |

### Exemplar threads

| Family | Thread | Highlight |
|--------|--------|-----------|
| Patel | SMS welcome auto-reply | New lead speed-to-lead |
| Chen | Email packet link + reminder | Enrolling paperwork |
| Nguyen | SMS “running 10 min late” inbound | Unread — staff action |
| Santos | Email immunization request ×3 | `waiting_on_family` |
| Okonkwo | SMS waitlist position update | Waitlist comms |
| Rivera | Email enrolled welcome + handbook | Post-enrollment |

### Scheduled sends

**6** `communication_scheduled_sends` — tour reminders (+24h), packet nudges (+48h), waitlist monthly check-in.

---

## 8. Forms

### Published definitions (org config layer)

| Form key | Purpose | Public link |
|----------|---------|-------------|
| `intake.web_lead` | Web lead capture → opportunity + OCM | Embedded on marketing site |
| `intake.walk_in` | Staff tablet quick intake | Internal kiosk token |
| `ops.medication_authorization` | Med admin renewal | Per-child existing-record link |
| `ops.allergy_action_plan` | Allergy protocol | Packet step |
| `enrollment.emergency_contacts` | Packet step | Packet only |
| `enrollment.enrollment_agreement` | Legal acknowledgment | Packet step |

### Packet definition

**`enrollment_packet.standard_v1`** — 5 steps:

1. Family & emergency contacts
2. Child health questionnaire
3. Immunization upload (document capture)
4. Enrollment agreement (signature)
5. Payment authorization (informational — no live billing in demo)

### Packet session distribution (12 sessions)

| Session status | Count | Family anchor |
|----------------|------:|---------------|
| `in_progress` | 3 | Chen (Emma) — step 3 of 5 |
| `submitted` | 4 | Santos — awaiting review |
| `under_review` | 2 | enrolling filler |
| `approved` | 2 | recently enrolled |
| `needs_correction` | 1 | immunization photo rejected |

### Standalone submissions (20)

- 8 tied to web intake (created opportunities)
- 6 medication forms (enrolled roster maintenance)
- 4 tour booking public flow confirmations (linked metadata only)
- 2 incomplete abandoned public starts (no opportunity — analytics filler)

---

## 9. Documents

**~35 document rows** linked via `documents` + `form_submission_documents` junction.

| Document type | Count | Source |
|---------------|------:|--------|
| Packet-generated PDF (approval) | 8 | Auto on packet approve |
| Immunization record upload | 10 | Form file fields |
| Signed enrollment agreement PDF | 6 | Packet step |
| Manual staff upload (birth certificate) | 4 | Drawer upload |
| Withdrawal acknowledgment | 2 | Historical |
| Tour waiver (optional form) | 5 | Standalone |

### Exemplar document states

| Family | Document | State |
|--------|----------|-------|
| Santos | Immunization photo | Uploaded but **rejected** in review — drives `waiting_on_documents` |
| Chen | Enrollment agreement | Draft in progress — not yet submitted |
| Rivera | Signed handbook acknowledgment | Approved PDF visible on Documents tab |
| Kim | Withdrawal form | Archived on withdrawn member |

---

## 10. Readiness examples

Readiness gaps come from **lifecycle requirement evaluation** projected into **`missing_required_info`** when `readiness_projection_v1.enabled`.

### Deliberate gap catalog (must exist after load)

| Gap ID | Family | Missing field / rule | Stage blocked | Attention |
|--------|--------|-------------------|---------------|-----------|
| R1 | Johnson | Child 2 — `desired_program_type` | Tour schedule / waitlist | `missing_required_info` |
| R2 | filler ×3 | Child DOB absent | Qualification → tour | `missing_required_info` |
| R3 | filler ×2 | `desired_start_date` | Move to waitlist | `missing_required_info` |
| R4 | Nguyen | Tour outcome not recorded | Post-tour advance | `tour_date_passed` |
| R5 | Santos | Immunization document | Approve enrollment | `waiting_on_documents` |
| R6 | filler ×2 | Parent phone **and** email absent | Execute-now comms | completion preview only |
| R7 | Patel | Child not added | Waitlist action preflight | drawer guidance (not attention yet) |
| R8 | enrolling ×2 | Classroom/cohort not assigned | Approve enrollment | `waiting_on_staff` |

### Needs Attention bucket coverage

Map exemplars to **`CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED`** reason codes:

| Bucket key | Reason code | Exemplar count |
|------------|-------------|---------------:|
| `new_inquiry_stale` | `stale_new_inquiry` | 2 |
| `qualification_stale` | `stale_qualified` | 2 |
| `required_information_missing` | `missing_required_info` | 5 |
| `follow_up_overdue` | `follow_up_date_passed` | 4 |
| `tour_date_passed` | `tour_date_passed` | 2 |
| `high_value_stale` | `high_value_stale` | 2 |
| `waiting_on_family` | `waiting_on_family` | 3 |
| `waiting_on_staff` | `waiting_on_staff` | 2 |
| `waiting_on_documents` | `waiting_on_documents` | 2 |

**Target:** 12–15 unique opportunities flagged `needs_attention = true`; at least **3 opportunities appear in 2+ buckets** to demo bucket semantics vs resolver union.

---

## Demo walkthrough scripts

Short operator paths the dataset must support without manual fixes:

| # | Script | Route | Pass criteria |
|---|--------|-------|---------------|
| 1 | Speed-to-lead | `new_leads` → Patel drawer | Call/SMS actions, Add Child, move to qualification |
| 2 | Mixed siblings | Search “Rivera” | Drawer shows divergent child statuses + two sites |
| 3 | Tour ops | `tours` → Chen | Booking detail, reschedule, confirm mirror metadata |
| 4 | Post-tour gap | `needs_attention` → Nguyen | Record tour outcome clears `tour_date_passed` |
| 5 | Waitlist rank | `waitlist` → Okonkwo | Position 2/11, employee priority badge, manual move |
| 6 | Packet review | Santos enrolling | Packet rollup, reject immunization, family resubmit |
| 7 | Approve enrollment | Chen Emma | Preflight, approve, PDF generation, enrolled lane |
| 8 | Withdrawn history | Search “Kim” | Member withdrawn, documents archived, no pipeline row |
| 9 | Site filter | Header Downtown | Queue counts shrink; scoped operator (Riley) matches |
| 10 | My Tasks | Nav badge | Overdue + due today from seeded tasks |
| 11 | Global search | “Lucas Rivera” | Finds child, opens case drawer in place |
| 12 | BOS handoff | Johnson stale qual | Review Assist surfaces missing program + task suggestion |

---

## Performance validation profile

Use the same world to exercise AdminV2 runtime doctrine (`docs/system/adminv2-runtime-performance-doctrine.md`):

| Surface | What to measure | Expected non-empty |
|---------|-----------------|---------------------|
| Dept enrollment bootstrap | Paired pipeline + NA lanes | All section keys populated |
| WU queue pagination | 50-row limit per lane | Waitlist + enrolled near cap optional in 1.5× variant |
| Drawer entity GET | Composed payload + attention strip | Exemplar families < 2s staging SLO |
| Global search | Children + parents | ≥15 child hits for common prefix |
| Packet review rollup | Santos session | Multi-step answers + document provenance |
| Placement priority evaluator | Waitlist sort | Deterministic order on fixed seed |

---

## Config dependencies (Layer 0 checklist)

Before narrative data loads, org must have:

- [ ] Childcare vertical bootstrap statuses (`opportunities` + `opportunity_customer_members`)
- [ ] Lifecycle Builder enrollment process with stage requirements matching gap catalog
- [ ] `enrollment_pipeline` queue_definition v2
- [ ] Needs Attention buckets + readiness projection profile on department or WU metadata
- [ ] Tour availability rules (3 sites × weekday slots)
- [ ] Form definitions + published versions + packet definition
- [ ] Action catalog placements for enrollment stages
- [ ] Program option set `childcare_program_type`
- [ ] Communication provider bindings (stub or sandbox)

---

## Out of scope for v1 seed world

- Live payment processing / ledger entries
- Staff scheduling / timecards
- Multi-vertical org (stay childcare-only)
- AI proposal rows beyond 15 task_assist tasks
- External CRM sync (GHL) identities
- Non-English localized content

---

## Revision history

| Date | Change |
|------|--------|
| 2026-06-06 | Initial v1 architecture & data strategy |

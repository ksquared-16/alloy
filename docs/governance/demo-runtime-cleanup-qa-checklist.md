# Demo runtime cleanup — QA checklist (golden-path seed)

Use after running `npm run demo:seed:golden-path` against a staging/demo org.

**Seed markers to verify in DB:**

| Key | Expected value |
|-----|----------------|
| `metadata.demo_seed_package` | `golden_path_enrollment_v1` |
| `metadata.seed_key` | `golden_path_martinez_v1` |
| `metadata.demo_seed_family_key` | `martinez_golden_v1` |
| `metadata.is_demo_data` | `true` |

Save `demo_seed_run_id` from script output for targeted delete.

---

## Pre-flight

- [ ] Org has `departments.key = enrollment` and `work_units.key = enrollment_pipeline`
- [ ] At least one active `locations.location_type = site` exists (org config — not demo-created)
- [ ] `status_definitions` includes `new_inquiry` for `entity_type = opportunity`
- [ ] Logged-in user has access to Enrollment department + site

---

## 1. Enrollment workspace queue

Navigate to the `ui_paths.enrollment_workspace` URL from seed output.

- [ ] **New inquiry** lane shows exactly **one** row: "Enrollment — Martinez Family"
- [ ] Row preview shows guardian name **Elena Martinez** (or household label)
- [ ] Site filter (if enabled) includes the seeded site; row remains visible when filtered to that site
- [ ] Row is not duplicated after page refresh

---

## 2. Opportunity drawer

Open the Martinez opportunity from the queue.

- [ ] **Status** = New inquiry (`status_key: new_inquiry`)
- [ ] **Primary contact** resolves to Elena Martinez (person-first; no legacy contact card)
- [ ] **Site / location** matches org site used in seed (`site_location_id`)
- [ ] **Inquiry children** section shows **Sofia Martinez** with program preschool / full-time
- [ ] **Desired start date** is ~45 days from today (metadata)
- [ ] Drawer loads without false empty states or section-owned skeleton flicker

---

## 3. Person / family records

- [ ] Global search finds **Elena Martinez** and **Sofia Martinez**
- [ ] Person drawer for Elena shows link to Martinez Family customer
- [ ] Child drawer / member record shows DOB **2022-03-14**
- [ ] `customer_persons` shows Elena as guardian / primary
- [ ] `person_relationships` shows parent link Elena → Sofia

---

## 4. Tasks (operational_tasks)

In opportunity drawer tasks / follow-ups strip:

- [ ] **Initial inquiry call** — open, due ~2 days out
- [ ] **Send enrollment packet overview** — open, due ~5 days out
- [ ] Opportunity metadata `next_follow_up_at` synced to earliest open task (if surfaced)

---

## 5. Communications

In communications panel / thread list:

- [ ] One **email** thread for Elena (`recipient_key` = demo email)
- [ ] Thread contains one **outbound** message with subject "Thanks for your interest…"
- [ ] Message body visible; no provider binding errors in staging

---

## 6. Documents

- [ ] One document: **Martinez — intake summary (demo)** linked to opportunity
- [ ] Document does not appear under Forms **definitions** — runtime instance only

---

## 7. Config preservation (negative checks)

Confirm these were **not** created or modified by the seed:

- [ ] `field_definitions` row count unchanged
- [ ] `status_definitions` row count unchanged
- [ ] `work_units` / `departments` definitions unchanged (only `opportunity.work_unit_id` set)
- [ ] `form_definitions` unchanged (no new form definition rows)
- [ ] `user_roles` / auth users unchanged (seed only reads `created_by` actor)

---

## 8. Cleanup verification

Run dry-run before delete:

```bash
cd web
DEMO_RESET_ORG_ID=<org_id> npm run demo:cleanup:dry
```

- [ ] Counts show 1 opportunity, 2 persons, 1 customer, 1 child member, 2 tasks, 1 thread, 1 document
- [ ] Config table counts are **not** listed

Targeted delete (one family):

```bash
DEMO_RESET_ORG_ID=<org_id> npm run demo:delete:one-family -- --run-id=<run_id> --execute
```

Or package-scoped:

```bash
DEMO_RESET_ORG_ID=<org_id> DEMO_SEED_PACKAGE=golden_path_enrollment_v1 \
  DEMO_CLEANUP_CONFIRM=DELETE_DEMO_RUNTIME_DATA npm run demo:cleanup:execute
```

After delete:

- [ ] Martinez row gone from New inquiry lane
- [ ] Orphan check: zero rows with `metadata.demo_seed_run_id = <run_id>`
- [ ] Org config (sites, work units, field definitions) still present

---

## 9. Re-seed idempotency

Run `npm run demo:seed:golden-path` again.

- [ ] No duplicate opportunity / persons / tasks
- [ ] Same `seed_key` rows updated in place
- [ ] Queue still shows exactly one Martinez row

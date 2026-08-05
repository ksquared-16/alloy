---
owner: platform
status: sprint
last_reviewed: 2026-08-05
supersedes: []
---

# Staging test — operator tour invitation → parent lifecycle

Run **after** PR #327 merges and its migration is promoted. Every step is
copy-pasteable. Expected values are stated so a failure is obvious.

> **Do not run the operator send until §1 passes.** §1 is what stops a real
> family being contacted.

---

## 0. Preflight — deployment matches merged code

```bash
gh api repos/ksquared-16/alloy/commits/staging --jq '.sha[0:9]'
```

Confirm the Vercel staging deployment SHA matches. If it does not, the app is
not running the code the migration assumes.

---

## 0b. Measured staging state — 2026-08-05 (read-only)

Inspected via the linked staging project `ikaxil…` (parent Alloy
`vslwnnt…`). **This changes the plan: the test cannot run on staging as
written.**

| Fact | Measured |
| --- | --- |
| orgs | 2 — Firefly Early Learning, Alloy Bend |
| **persons** | **0** |
| **opportunities** | **0** |
| locations | 20 |
| tour_availability_rules | 6 active (Firefly only; 4 org-wide, 2 location-scoped) |
| tour_bookings | 0 |
| `tour_invitations` table | **does not exist** — Slice C migration not applied |
| `send_tour_invitation` action | absent (expected before merge) |
| outbound messages ever | 0 |
| delivery events ever | 0 |
| Firefly `tour_comms` | `enabled: true`, **email true, SMS false** |
| Firefly email binding | **resend · active · primary · credentialed** |
| Firefly SMS binding | **twilio · active · primary · credentialed** |

**Two hard blockers.**

1. **No families exist.** Zero persons, zero opportunities, and no person
   carries an email or phone. There is nothing to select in a Work Unit, and
   `send_tour_invitation` would refuse with `missing_recipient` anyway.
2. **Live provider credentials.** Resend and Twilio bindings are active with
   real credentials, and with zero send history there is **no evidence either
   way** about whether a dispatcher drains the queue. Creating a fixture with a
   real address here risks a genuine delivery.

Mitigation already in place: Firefly has **SMS disabled by config**, so any test
is email-only.

**Recommended path:** certify on the local certification stack, where the full
operator send is already proven end to end. Only move to staging once someone
confirms (a) Resend is in test mode or the dispatcher is off, and (b) a
synthetic family is seeded through the product's own Create Lead path with an
address you control.

---

## 1. Provider safety — MUST pass before any send

Run against staging. **This has not been verified by the agent — no staging
credentials were available.**

```sql
-- (a) Are provider bindings active, and could they reach a real person?
select channel, provider, scope, is_primary, status,
       (secret_ref is not null) as has_credential
from communication_provider_bindings
where org_id = :org
order by channel;
```

**Stop if** an SMS or email binding is `active` with a real (non-sandbox)
provider account and no allowlist. A queued message only becomes an outbound
message when a dispatcher picks it up:

```sql
-- (b) Is anything draining the queue?
select status, count(*) from communication_messages
where org_id = :org and direction = 'outbound'
group by status;
```

If `queued` rows persist and never become `sent`, no dispatcher is running and
the test is inert — the safest state for a first run.

**Never disable a global delivery protection to make this test pass.**

---

## 2. Prerequisites

```sql
-- Tour comms enabled? (platform default is DISABLED)
select metadata->'tour_comms' from org_settings where org_id = :org;
-- expect: {"enabled": true, ...}

-- Which locations can actually offer times?
select location_id, count(*) filter (where is_active) as active_rules
from tour_availability_rules where org_id = :org group by location_id;
-- expect: at least one location with >= 1 active rule
```

If either is missing the command will correctly **refuse with a stated reason** —
that is a valid negative test, not a failure.

---

## 3. Command reachability (post-migration)

```sql
select ad.key, ad.label, ad.entity_type, ad.action_type, ad.is_active,
       ad.payload_schema->>'intent' as intent,
       ap.surface, ap.slot, ap.display_style, ap.condition_config, ap.is_active
from action_definitions ad
join action_placements ap on ap.action_definition_id = ad.id
where ad.key = 'send_tour_invitation';
```

Expect **exactly one row**:

| field | expected |
| --- | --- |
| label | `Send tour invitation` |
| entity_type | `opportunity` |
| action_type / intent | `ui_intent` / `send_tour_invitation` |
| is_active (both) | `true` |
| surface / slot | `record_header` / `overflow` |
| display_style | `menu_item` |
| condition_config | `{}` |

```sql
-- No other surface may be provisioned.
select surface, slot, count(*) from action_placements ap
join action_definitions ad on ad.id = ap.action_definition_id
where ad.key = 'send_tour_invitation' group by surface, slot;
-- expect exactly: record_header | overflow | 1
```

---

## 4. Controlled fixture

Pick a family whose name is obviously synthetic and whose email/phone you
control. **Do not use a real family.**

```sql
select op.id, op.name, op.status_key, op.location_id,
       p.email, p.phone,
       (select count(*) from tour_bookings tb
         where tb.opportunity_id = op.id
           and tb.status_key not in ('canceled','completed','no_show')) as active_bookings,
       (select count(*) from tour_invitations ti
         where ti.opportunity_id = op.id and ti.status = 'active') as active_invitations
from opportunities op
join persons p on p.id = op.primary_person_id
where op.org_id = :org
  and op.name ilike '%test%'
  and p.email is not null and p.phone is not null
  and op.location_id in (select location_id from tour_availability_rules
                          where org_id = :org and is_active)
limit 5;
```

Choose a row with `active_bookings = 0` and `active_invitations = 0`.
Record its id as `:opp`.

---

## 5. Operator test

1. Sign in to staging.
2. Go to `/workspace/work-unit/<slug>` — the **Focus Panel**, *not* the global-search drawer.
3. Select the synthetic family.
4. **Manage ▾** → **Send tour invitation** must be listed.
5. Invoke it.
6. Confirmation reads: *"Send this tour invitation to <name> by <channels>?"*
7. Confirm.
8. The result must name **actual channel outcomes** — e.g. `Invitation created · Email queued · SMS queued`.

**Fail immediately if** the result says "completed", "Invitation sent", or any
wording that does not name each channel.

```sql
select
 (select count(*) from tour_invitations where opportunity_id = :opp and status='active') as invitations,
 (select count(*) from communication_messages cm
    join communication_threads ct on ct.id = cm.thread_id
   where ct.primary_entity_id = :opp) as messages,
 (select count(*) from workflow_events where entity_id = :opp
    and event_type like 'message%') as message_events;
-- expect: 1 | 2 | 2   (one invitation; email + SMS; one event each)
```

9. **Press it a second time.** Expect `Existing invitation reused`, and the
   counts above **unchanged at 1 | 2 | 2**. Any increase is a duplicate-dispatch
   failure.

---

## 6. Parent test — from the real delivered link

Take the link from the **actual queued message** (never substitute a token):

```sql
select channel, substring(body from 'https?://[^ ]*/tour-booking/[^ ]*') as link
from communication_messages cm
join communication_threads ct on ct.id = cm.thread_id
where ct.primary_entity_id = :opp;
```

Open it at **375×812**:

1. Alloy brandmark, no "Services" wording; no marketing nav/footer.
2. Correct campus and parent-facing context.
3. Calendar groups by the **centre's** timezone; unavailable days disabled.
4. Select a day, then a time — selected state readable, no horizontal overflow.
5. **Book.** Confirmation is truthful and the date/time matches what was selected.
6. Open the **reschedule** link from the confirmation message; pick a new time.
7. Open the **Manage** link; opening it must not mutate anything.
8. **Cancel** — consequence confirmation appears, safe choice visually primary, then confirm.

```sql
select status_key, start_at, (canceled_at is not null) as canceled
from tour_bookings where opportunity_id = :opp;
-- after booking:    confirmed | <chosen time>  | false
-- after reschedule: confirmed | <new time>     | false
-- after cancel:     canceled  | <new time>     | true
```

---

## 7. Operator final state

Back on the Focus Panel → **Activity**:

- invitation activity present
- booking, reschedule and bounded cancellation activity present
- per-channel communication outcomes, each with a human-safe reason
- **no** raw event keys (`message_blocked`, `message_queued`) shown to the operator
- no stale "current tour" action offered after cancellation

```sql
select event_type, count(*) from workflow_events
where entity_id = :opp group by event_type order by event_type;
```

Expect one row per lifecycle step and **no duplicates**.

---

## Stop conditions

Stop and report rather than continuing if: the action is absent after migration;
the UI reports success without naming channels; counts increase on replay;
provider bindings could reach a real recipient; the chosen location has no
availability; or any step would require substituting a token by hand.

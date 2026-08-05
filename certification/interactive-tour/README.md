---
owner: platform
status: certified
last_reviewed: 2026-08-03
supersedes: []
---

# Interactive Tour — database certification

Certifies `supabase/migrations/20260801120000_tour_invitation_and_scoped_public_actions.sql`
against real Postgres.

## Run it

Requires an exclusive lease on the sanctioned shared stack. Never `supabase start`.

```bash
alloy-stack use interactive-tour
certification/alloy-certify reset          # full chain replay + representative seed
docker exec -i supabase_db_alloy-cert psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < certification/interactive-tour/assert-tour-invitation-schema.sql
alloy-stack release interactive-tour
```

The assertion script runs inside a transaction it **rolls back** — it proves, it does
not seed. It exits non-zero if any assertion fails.

## Result — 2026-08-03

Run on branch `feat/interactive-tour-invitation` at `1838b1363`, rebased onto
`origin/staging` @ `db212fe1c`. Migration blob `8502a62d1` — byte-identical to the
version certified before the rebase.

```
307 migrations replayed in full chain          clean
migration re-applied twice on a live database  clean (idempotent)
assertions re-run after re-apply               11/11 still pass

PASS  tour_invitations rejects a NULL recipient_person_id
PASS  tour_invitations rejects an arbitrary status
PASS  scoped link rejected without invitation_id
PASS  scoped link rejected without recipient_person_id
PASS  scoped link rejected without action_kind
PASS  arbitrary action_kind rejected
PASS  use_count exceeding max_uses rejected
PASS  fully scoped link accepted
PASS  all four Slice C indexes present
PASS  all four Slice C constraints present
PASS  no legacy link is marked scoped
```

Every rejection names the constraint that fired
(`tour_public_booking_links_scoped_complete_chk`, `..._action_kind_chk`,
`..._use_count_chk`, `tour_invitations_status_chk`). That matters: an earlier attempt
proved nothing because a fabricated `opportunity_id` tripped a foreign key before any
CHECK was reached. Fixtures here are selected from real seeded rows, so a failure is
the CHECK talking.

## Why this file exists

The first certification run was ad hoc and its assertions were never committed, so
"it was certified" could not be re-established without redoing the reasoning. This
script is the durable form of that evidence.

## Scope

Proves the **structural** guarantee: no unscoped link can exist, the action
vocabulary is closed, and the reuse budget holds — enforced by the database rather
than by the code path that happens to insert. Runtime authorization behaviour is
certified separately by `web/tests/tours/authorizeTourAction.test.ts`.

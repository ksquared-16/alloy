# Operational Expectations — live Postgres certification

Two scripts share one harness and one minimal base:

| Script | Proves |
|---|---|
| `wave_c_live_cert.sql` | Wave C: governed Authority, self-ratifying authoring, immutable ratification |
| `m1_demo.sql` | The frozen **M1 (Ledger Foundation) demonstration** — see [M1 demonstration](#m1-demonstration) |

---

## Wave C live Postgres certification

Reproducible real-database certification of the OE Wave C migration set (governed
Authority model, self-ratifying authoring, immutable ratification). It exercises the
**actual** DDL, triggers, RLS policies, `SECURITY DEFINER` functions, and
transactions on real Postgres.

**Scope.** Targeted certification of the OE migration set on a minimal
Supabase-compatible base (roles `authenticated`/`anon`/`service_role`, `auth.uid()`/
`auth.role()`, and the OE dependency tables). A full 250-migration replay from empty
requires the Docker Supabase stack (`supabase db reset`) and is not what this proves.

## Run

```bash
createdb oe_wavec_cert
psql -q -d oe_wavec_cert -f supabase/tests/operational_expectations/wave_c_min_base.sql
for m in 20260717000000_operational_expectations_ledger_p1_wave_a \
         20260719000000_operational_expectations_authoring_intake_p1_wave_b \
         20260720000000_operational_expectations_author_permission_and_idempotency \
         20260721000000_operational_expectations_ratification_p1_wave_c \
         20260722000000_operational_expectations_authority_model_p1_wave_c \
         20260722010000_operational_expectations_authority_enforcement_p1_wave_c; do
  psql -q -d oe_wavec_cert -v ON_ERROR_STOP=1 -f "supabase/migrations/$m.sql"
done
psql -d oe_wavec_cert -f supabase/tests/operational_expectations/wave_c_live_cert.sql
dropdb oe_wavec_cert
```

## Certified (2026-07-14, Postgres 14.17)

- Full OE migration set replays cleanly from the minimal base.
- Catalog: unique authority_key/org, same key cross-org, no executable-rule column.
- Assignments: ungoverned rejected, AI holder rejected, append-only (UPDATE/DELETE
  blocked), effective/inactive/future/expired honored, scope isolation, revocation.
- Resolver: holds/not-holds, AI never holds, inactive/future not effective,
  location scope isolation, revoked no longer holds — real rows + timestamps.
- Self-ratifying authoring: held-authority human → binding + assignment evidence +
  ONE Authoring Act + NO Ratification Act; no-authority/ungoverned → proposed;
  predicted → model; AI → proposed; forgery-resistant (caller `standing` ignored);
  recorded time DB-assigned; idempotent (one row/event).
- Explicit ratification: sufficient authority → binding + one immutable row + one
  Ratification Act; insufficient → `oe_insufficient_authority` (no row, no event);
  rows immutable; idempotent.
- Security posture (`pg_proc`/`information_schema`/`pg_class`): every Wave C function
  `SECURITY DEFINER` + `search_path=public`, EXECUTE denied to PUBLIC/anon/
  authenticated, granted only to `service_role`; RLS enabled on all tables; no
  authenticated INSERT, no anon read; zero dynamic SQL; real role-exercise:
  `authenticated` INSERT → permission denied.

---

## M1 demonstration

The frozen M1 Demo (Engineering Realization §4): *"Author a `required` staffing-ratio expectation on a
real room; attempt a malformed and a sixth-modality act (both rejected); revise it (re-plans) and correct
it (unwinds) — lineage visible."*

It runs in **two halves**, because re-plan and unwind are derived on read and never stored:

- **Database half — `m1_demo.sql` (here).** The authoring acts, the rejections, the typed transitions,
  the lineage, and append-only preservation, through the real DDL/triggers/RPCs.
- **Resolver half — `web/tests/operationalExpectations/resolver/m1DemoLineage.test.ts`.** The re-plan /
  unwind / two-axis behavior, folded from the **real rows this script emits**. The fixture
  (`m1DemoLineage.fixture.json`) is a verbatim capture, not hand-written — that is what makes it M1
  evidence rather than a restatement of the Wave D unit tests.

Each authoring act runs in its **own transaction**, as production does. This is load-bearing:
`authored_at` defaults to `now()`, which is transaction-start time in Postgres, so authoring the lineage
inside one block would stamp identical recorded times and make the as-known-at-T (audit) axis
undemonstrable.

### Run

```bash
createdb oe_m1_demo
psql -q -d oe_m1_demo -f supabase/tests/operational_expectations/wave_c_min_base.sql
for m in 20260717000000_operational_expectations_ledger_p1_wave_a \
         20260719000000_operational_expectations_authoring_intake_p1_wave_b \
         20260720000000_operational_expectations_author_permission_and_idempotency \
         20260721000000_operational_expectations_ratification_p1_wave_c \
         20260722000000_operational_expectations_authority_model_p1_wave_c \
         20260722010000_operational_expectations_authority_enforcement_p1_wave_c; do
  psql -q -d oe_m1_demo -v ON_ERROR_STOP=1 -f "supabase/migrations/$m.sql"
done
psql -d oe_m1_demo -v ON_ERROR_STOP=1 -f supabase/tests/operational_expectations/m1_demo.sql
dropdb oe_m1_demo
```

The script prints one `PASS` per assertion and emits the resolved lineage as JSON between
`M1_DEMO_ROWS_JSON_BEGIN` / `M1_DEMO_ROWS_JSON_END` (the resolver-half fixture input).

### Certified (2026-07-16, Postgres 14.17) — 32 assertions

- Setup: authority governed in the catalog and actually held by a human holder.
- **M1.1** a `required` staffing-ratio expectation authored on `room-infant-1`; a create roots itself,
  no transition; **held authority self-ratifies → `binding`** with the assignment recorded as evidence;
  exactly one Authoring Act.
- **M1.2** malformed acts rejected — Temporal Frame absent, inverted valid window — with **no row
  committed**.
- **M1.3** **a sixth modality is rejected** (G-Modality-Closure), no row committed.
- **M1.4** revision authored, typed `revision`, same lineage, supersedes by reference, authority ≥
  original; **the predecessor row is not mutated** (`valid_to`/frame/`authored_at` intact); recorded
  time advances.
- **M1.5** correction authored, typed `correction` (not revision), same lineage, supersedes the
  revision; both transitions stored, distinctly typed.
- **M1.6** lineage visible — 3 acts on one root, one create, all three attributable; UPDATE and DELETE
  on the ledger blocked; recorded time advances.

**Not claimed:** the resolver's fold behavior (that is the resolver half); anything downstream of P1.

# Supabase migration history repair (pre-P3.1)

**Status:** Local repo repair **applied** (June 2026). The two phantom POS files have been **renamed to unique versions** in the repo (committed). **No `migration repair` was run and no shared staging/prod/remote Supabase history was mutated** — those ledger steps remain for the maintainer to run deliberately per environment (see "Repair commands still required"). The Operational Execution (OEP) migrations are **not** the cause and are **not** touched.

> **Local rename completed:**
> - `20260612120000_pos_processing_cases_v1.sql` → `20260612120100_pos_processing_cases_v1.sql`
> - `20260623120000_pos_packet_instance.sql` → `20260623120200_pos_packet_instance.sql`
>
> File contents were not changed. `ls … | sed … | uniq -d` now returns **no duplicate versions**.

## Repair commands still required (per shared environment)

The repo is collision-free, but each shared environment's ledger still needs the new versions recorded **without re-running SQL** (the POS content already exists there). Run per linked project (staging first, verify, then prod only if it has the same drift):

```bash
supabase migration repair --status applied 20260612120100
supabase migration repair --status applied 20260623120200
supabase migration list   # verify only OEP migrations 20260628120000 / 20260629120000 remain pending
```

Not yet executed in this pass by design (shared-state mutation).

**Context:** OEP foundation committed in `31e1d7aa`. `supabase migration up` / `supabase db push` fail; this blocks any future CLI push (including P3.1) because the offending files sort *before* the OEP/P3.1 migrations.

---

## Root cause

Two migration **version timestamps are used by two files each** (a 14-digit version collision). Supabase records applied migrations in `supabase_migrations.schema_migrations` keyed by **`version`** (the 14-digit prefix) as the primary key — filenames are irrelevant to the ledger. So a single version can only ever have **one** ledger row, but the repo has **two files** claiming each of these versions:

| Colliding version | File A (owns the remote ledger row) | File B (phantom "unapplied") | Origin |
|---|---|---|---|
| `20260612120000` | `…_enrollment_process_status_vocabulary_repair.sql` | `…_pos_processing_cases_v1.sql` | POS/Claude merge `b908ebba` |
| `20260623120000` | `…_metric_snapshots.sql` | `…_pos_packet_instance.sql` | POS/Claude merge `b908ebba` |

Both File B's were introduced by the merge `b908ebba Merge origin/claude/pos-packet-parent-submission-20260622 …` (POS cutover), colliding with already-existing migrations of the same timestamp.

**Why the CLI fails two different ways:**
- `supabase migration up` → *"Found local migration files to be inserted before the last migration on remote database"* and names the two File B's. The remote head is `20260625140100`; the two File B versions are already "occupied" in the ledger (by their File A twin) yet the File B's are unmatched local files sorting before the head → CLI refuses without `--include-all`.
- `supabase db push --include-all` → tries to apply File B and then `INSERT INTO schema_migrations(version)` for a version that **already exists** → `ERROR: duplicate key value violates unique constraint "schema_migrations_pkey" Key (version)=(20260612120000) already exists`.

**Important:** the *content* of the POS File B's is **already present on remote** — the failed push logged `NOTICE: relation "processing_cases" already exists, skipping`. Both POS files are idempotent (`pos_processing_cases_v1`: 8× `IF NOT EXISTS`; `pos_packet_instance`: 3× `IF NOT EXISTS`). So this is a **ledger bookkeeping drift**, not missing schema.

---

## Affected migration files

**Collision (the only two in the whole directory — verified via `uniq -d` on version prefixes):**
- `supabase/migrations/20260612120000_pos_processing_cases_v1.sql` ← rename target
- `supabase/migrations/20260612120000_enrollment_process_status_vocabulary_repair.sql` (leave as-is; owns the ledger row)
- `supabase/migrations/20260623120000_pos_packet_instance.sql` ← rename target
- `supabase/migrations/20260623120000_metric_snapshots.sql` (leave as-is; owns the ledger row)

**Not affected — OEP migrations are clean, uniquely versioned, and correctly ordered after the remote head (`20260625140100`):**
- `supabase/migrations/20260625120000_childcare_operational_enrollment_slice1.sql` (already applied on remote)
- `supabase/migrations/20260628120000_childcare_config_rules_phase1.sql` (local-only, pending — correct)
- `supabase/migrations/20260629120000_childcare_attendance_facts_p2.sql` (local-only, pending — correct)

---

## Recommended repair path

`supabase migration repair` **alone cannot fix this** — it sets the status of a *version* in the ledger, but the defect is *two files → one version*. The only correct fix is to give each File B its **own unique version**, then reconcile the ledger. Because File B content already exists on remote and is idempotent, the safe sequence is **rename → mark applied (don't re-run) on shared envs**.

### Step 1 — Rename the two phantom files to unique versions (local, committed) — ✅ DONE

Completed in commit `chore(supabase): resolve migration timestamp collisions`:

```bash
cd supabase/migrations
git mv 20260612120000_pos_processing_cases_v1.sql 20260612120100_pos_processing_cases_v1.sql
git mv 20260623120000_pos_packet_instance.sql     20260623120200_pos_packet_instance.sql
```

(`20260612120100` is free — next existing is `20260613120000`. `20260623120200` is free — existing siblings are `…120000`, `…120100`, `…130000`.) File contents were not changed; the File A twins and all OEP migrations are untouched.

### Step 2 — Reconcile each shared environment ledger (no SQL re-run)

For every environment where the POS content already exists (**staging**, and **prod** if it was deployed there), mark the new versions as already-applied so the CLI never re-runs them:

```bash
# Run once per shared environment (linked project), e.g. staging:
supabase migration repair --status applied 20260612120100
supabase migration repair --status applied 20260623120200
```

This inserts ledger rows for the new versions without executing SQL — correct because the tables already exist remotely.

### Step 3 — Verify

```bash
supabase migration list
# Expect: no "local-only before head" rows for the renamed files;
# only 20260628120000 and 20260629120000 remain pending (the OEP migrations).
```

### Step 4 — (Fresh/local DBs only) nothing extra needed

On a brand-new local DB, the renamed files simply run in order; their `IF NOT EXISTS` guards make re-runs harmless.

---

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| `migration repair` only (no rename) | ❌ Insufficient | Cannot represent two files under one version PK; CLI keeps seeing a phantom unapplied file. |
| `migration repair --status reverted 20260612120000` then push | ❌ Unsafe | Push would then try to run **both** same-version files → same duplicate-key error. |
| Rename File B + `db push` (let idempotent SQL re-run) | ⚠️ Acceptable, riskier | Works only if every statement is truly idempotent; re-running on shared envs is unnecessary I/O and risk. Prefer `repair --status applied`. |
| Squash/rewrite history | ❌ Rejected | Heavy, destructive to shared history; unjustified for two additive POS files. |
| Rename a File A twin instead of File B | ❌ Rejected | File A owns the remote ledger row; renaming it would orphan that row and force a re-run of the wrong file. |

---

## Risks

- **Shared-ledger mutation.** `migration repair` writes to `schema_migrations` on the linked remote. Run against the correct project (`supabase link` / confirm before each repair). Do staging first, verify, then prod.
- **Renaming an applied migration** is generally discouraged; it is safe **here** only because (a) the content is additive + idempotent and already present remotely, and (b) we pair the rename with `repair --status applied` so the new version is recorded without re-execution.
- **Coordination.** These files came from the POS/Claude branch; confirm no other in-flight branch references the old filenames before renaming.
- **Prod uncertainty.** Confirm whether `20260612120000` / `20260623120000` POS content was ever pushed to prod. If prod's ledger differs from staging, repair each per its actual state (`migration list` against each).

---

## Does staging / prod need repair?

- **Staging (linked remote in this report):** **Yes.** Its ledger has the single colliding rows and is missing distinct rows for the two POS File B's. Apply Steps 1–3 against staging.
- **Prod:** **Conditional.** Apply the same procedure **only after** running `supabase migration list` against prod to confirm the identical drift (collision present, POS tables already exist). If prod never received the POS merge, the rename alone (Step 1) plus a normal push will apply them in order.
- **Local dev DBs:** No repair needed; OEP migrations were applied directly via `psql` this session, and the renamed idempotent files re-run harmlessly on a fresh reset.

---

## Can P3.1 safely create a new migration after repair?

**Yes — after Steps 1–3.** Once the two versions are unique and the shared ledgers are reconciled:

- The collision no longer blocks the push pipeline, so `supabase db push` will reach and apply new migrations.
- P3.1 should use a fresh, unique timestamp **after the current head**, e.g. `20260630120000_…` (later than the OEP `20260629120000`). Verify uniqueness first:

```bash
ls supabase/migrations | sed -E 's/^([0-9]{14})_.*/\1/' | sort | uniq -d   # must print nothing
```

- Until the repair is done, P3.1 migrations can still be applied **manually via `psql`** (as the OEP migrations were this session), but CLI `db push` will keep failing on the pre-existing collisions — so do the repair first.

---

## When this report must be updated

The two POS files are renamed/reconciled (mark this resolved), or any further version-prefix collision is introduced.

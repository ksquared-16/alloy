# `alloy-cert` is ready. The only missing piece is an operator session.

Stopping exactly where §1's stop condition says to: *"If the certification DB can be used but the
only missing piece is operator authentication/session creation, STOP there with the exact supported
mechanisms you found and the smallest decision needed from me."*

**No tenant mutation was made anywhere.** Every database read was a `SELECT`.

---

## What is already true

| §1 proof | Result |
|---|---|
| `exclusive-certification-db` permit held | ✅ `1/1`, owner `wt4-enrollment-phase2-participant-anchor`, pid live |
| No other lane owns the stack | ✅ it was `0/1` when I took it |
| Shared dev org untouched | ✅ fingerprint identical before and after — `7730d8da…` |

**The certification database is real and usable.** Read directly at `127.0.0.1:54422`:

- **263 public tables** — the full Alloy schema, including `orgs`, `user_roles`,
  `processing_cases`, `documents`, `form_definitions`, `form_definition_versions`,
  `field_definitions`, `customer_payment_methods`.
- **Exactly one org**: `00000000-0000-4000-8000-000000000001` — *Northwind Early Learning*
  (`northwind-early-learning`). Not the shared dev org.
- **Exactly one auth user**: `00000000-0000-4000-8000-000000000002`,
  `qa.operator@northwind.invalid`, email confirmed.
- **Exactly one membership**: that user → that org, role `admin`.

That last line is §2's required property, already satisfied by the existing seed. I do not need to
create an identity, and I have not touched one.

## The one thing missing

The operator has a password — `encrypted_password` is not null — **and I do not know it.**

`supabase/seed/local_representative_seed.sql` is explicit about why: it deliberately leaves the
password NULL, commenting *"this seed does not fabricate credentials"*, and documents attaching one
out of band. Someone has since attached one. §2 tells me not to create credentials manually and not
to invent auth state, so I stopped rather than set one.

### The smallest decision — pick one

1. **Tell me the password** already set on `qa.operator@northwind.invalid`. I mint the session and
   continue. *(Smallest — nothing changes.)*
2. **Set or rotate it yourself**, then tell me the value:
   ```
   supabase auth admin update-user-by-id 00000000-0000-4000-8000-000000000002 --password '<choose>'
   ```
   or Supabase Studio → Users, at **http://127.0.0.1:54423**.
3. **Authorize me to run that documented command** with a value you specify. I will not choose one.

## Two mechanical items, named now so the next run is uninterrupted

**A. The env rebinding is ready.** The supported knob is `ALLOY_SERVER_ENV_SOURCE` /
`ALLOY_ENV_SOURCE` (`lib/verify.sh:74,80`; `alloy-engineering-certify` sets both through a config
file) — no hand-edit of trusted env required. The cert stack exposes Kong on **`127.0.0.1:54421`**,
and its JWT secret is present in `supabase_auth_alloy-cert`, so the anon/service keys are derivable
from the running stack rather than copied from anywhere.

**B. The cert DB is two migrations behind this branch.** Latest applied there is `20260820140000`.
This branch adds:

- `20260825120000` — the READY NOW child-profile `field_definitions` seeds (Slice 5);
- `20260825140000` — `child_safeguarding_restrictions` (Slice 6, currently absent there).

Neither is destructive, but both change a shared certification database, which is squarely inside
the permit I now hold. Say the word and I apply them forward as part of the switch; I have not
touched the schema.

## Permit posture

I am **holding** `exclusive-certification-db` while this decision is open — that is what stops
another lane's `destroy-db`, `seed` or `wipe-tenant` from landing on the tenant this program is
about to build. If you would rather I let it go meanwhile:

```
alloy-compute release exclusive-certification-db --holder wt4-enrollment-phase2-participant-anchor
```

## Evidence

- `evidence/shared-dev-fingerprint.json` — 12 processing cases, 32 form definitions (31 published),
  all in org `93667019-…`; sha256 `7730d8dae7d6c0064ec42ce0e6aca85161567bdfc9e1ff9eb456d2aba441ac95`,
  identical before and after this run.

## State

No org created. No case. No document. No decision. No schema change. No publish. Branch clean.

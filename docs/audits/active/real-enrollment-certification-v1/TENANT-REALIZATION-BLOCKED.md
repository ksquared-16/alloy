# Tenant realization — **STOPPED at §1.** No isolated certification org is reachable.

§1 says: *"If no supported isolated-org bootstrap exists, STOP and report that gap. Do not fake
isolation by inserting arbitrary rows."* That is the situation. **No mutation was performed.**

§0 is done and committed. §§2–8 are blocked behind §1.

---

## §0 — the distinction, recorded (done)

`loadCertificationPacket()` and the fixture corpus are **certification fixtures**. They prove what
the pipeline *should* produce. They are not tenant state.

Three narrow changes, no new framework:

1. **The loader says so.** Its docstring now states that its output is never a publish package, and
   why: numbers produced there were assembled into `FIRST-PUBLISH-PACKAGE.md` and a publish was
   authorized against them while the target tenant held one of three artifacts, no decisions and no
   generated form.
2. **The document was renamed** to `FIXTURE-CERTIFIED-EXPECTATIONS.md`, with a header stating what
   it is. `slice-9-closeout.md` no longer calls it a package.
3. **Two assertions hold the boundary** in the existing certification suite: the loader reaches no
   database, and every proposal it returns is still `proposed` — because `accepted` there would only
   mean a test helper said so.

## §1 — the gap, in two independent parts

### A. The canonical mechanism exists and is disabled

`POST /api/admin/dev/create-org` → `createOrgAndAssignAdmin` is the supported path (org + industry +
admin role, no hand-built rows). Probed live with the QA session, using an empty body that validates
out before any insert:

```
create-org (empty body) -> 403 {"error":"DEV_TENANT_SPINUP_ENABLED is not set to true"}
```

`DEV_TENANT_SPINUP_ENABLED` is a **trusted server variable**, injected by the gateway from the
canonical `.env.local` and — by the two-tier env doctrine — never written into the worktree.
Enabling it is not mine to do.

### B. Even enabled, the QA identity cannot hold a second org

`chooseOrgAndRoleKeysFromMembershipRows` (`lib/admin/resolveAdminAccessCore.ts:218`) refuses a
multi-org user outright:

```ts
if (orgs.length !== 1) return null;   // "any rule that resolves this … is an authority
                                      //  decision made where no authority decision belongs"
```

**There is no org-switch mechanism, by design.** So every route to a second org is closed:

| Approach | Outcome |
|---|---|
| Assign `qa-slot4-ui@example.com` to the new org | Two memberships → `portalEligible: false` → **403; the slot loses portal access entirely**, including to its current org |
| Assign a different user as admin | Needs a session for that user; `alloy-agent-login` captures one by **manual** sign-in — I cannot create credentials |
| Move the membership across orgs | A hand-edited authority row with no canonical path — forbidden by §1 |

Confirmed live: the session resolves org `93667019-bd28-49b5-a688-acc9bb1e0a19` — the shared dev
org §1 forbids using.

### The most promising supported route (yours to authorize)

The **local `alloy-cert` certification database** (`supabase_db_alloy-cert`, port 54422) is a
genuinely isolated environment, healthy, and already used by `wt3-runtime-continuity` — so a
worktree pointing at it is a supported configuration, not an invention.

Two Director-owned steps stand between here and there:

1. **Repoint wt4's trusted Supabase configuration** at the local stack. `web/.env.local.agent`
   currently carries `https://ikaxilmwmrmbagoidedu.supabase.co`; the keys live in the trusted tier.
2. **The `exclusive-certification-db` permit.** `CERTIFICATION-OWNERSHIP.md` makes it an *enforced*
   permit precisely because a certification tenant, its migration, fixtures, credentials and browser
   evidence were destroyed three times. Certification work there should hold it.

I attempted to raise this through `vac governed-action`; the run has no mission binding
(`missing_mission_binding`), so I am not retrying that channel.

## What I need from you, in one line

**An isolated certification org, plus an operator session that belongs to it.** Any of:

- Enable `DEV_TENANT_SPINUP_ENABLED` for slot 4 **and** provide an operator identity whose only
  membership is the new org; or
- Repoint wt4 at the local `alloy-cert` stack and grant the `exclusive-certification-db` permit; or
- Name an existing isolated certification org and a session that belongs to it.

Given (A) or (B), §§2–8 are mechanical and I can run them: attach the three hash-verified artifacts
to one case, run *Analyse as one packet* through the production action, compare the durable analysis
against the fixture-certified expectations, persist the safe-accept decisions through the real
command, and hand you the Needs-review workload for the decisions that are genuinely yours.

## State

No org created. No case created. No document attached. No decision persisted. No publish. Branch
clean; nothing pushed.

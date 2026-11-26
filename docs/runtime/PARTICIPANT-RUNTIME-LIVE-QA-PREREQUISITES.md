# Participant Runtime — live QA prerequisites and script

Status: **BLOCKED — live QA cannot run yet.** Read-only verification against the hosted Firefly
tenant (`ikaxilmwmrmbagoidedu`, org `93667019-bd28-49b5-a688-acc9bb1e0a19` "Firefly Early Learning")
on 2026-08-17, against staging `287aa2372`.

Nothing in the hosted tenant was mutated. Every probe was a `SELECT`.

---

## 1. What the hosted tenant actually holds

| Question | Answer |
| --- | --- |
| Enrollment `process_instances` for Firefly | **Yes** — `process_key='enrollment'`, `subject_type='child'`, `context_type='opportunity'`, `stage_key='waitlist'`, `business_process_revision_id` **NULL** (unpinned → D-96 compat branch, which can resolve a department from the opportunity context, so this is not itself a blocker) |
| `form_packet_sessions` | **0 rows, all orgs** |
| Packet-mode public links for Firefly | **1** — `aa70afd5-827e-428d-bbdd-d81458881d78`, label "Cert Handoff 1785022300329", created 2026-07-25, `last_used_at` NULL, `packet_definition_id=e2936ebb-…` |
| Raw token for that link | **Not recoverable.** Only `token_hash` + `token_prefix` (`JW6m33u7PYEZ`) are stored, and unlike the intake links this row's metadata carries no `share_embed_path`. The plaintext token was shown once at compose time. |
| Firefly `ai_policy` | `enabled: true`, `provider: "openai"`, `pii_mode: "strict"`, `logging_mode: "minimal"`, `retention_mode: "none"`, `allowed_features: [draft_enrichment, operational_summary, reasoning_paraphrase, task_assist_draft, workflow_assist_draft]` |

`ai_policy` lives in **`org_settings.metadata`**. The hosted `orgs` table has columns
`id, name, slug, status, created_at, industry_id` — **there is no `orgs.metadata` column at all.**

---

## 2. Blockers

### B1 — no product path creates an anchored session (hard blocker)

`resolveParticipantEnrollmentFromToken` requires
`form_public_links → form_packet_sessions.started_via_public_link_id → .process_instance_id`.

- `launchEnrollmentObjectiveSession` — the only function that passes `processInstanceId` into
  `ensurePacketSessionForPublicLink` — has **zero production callers**. The only reference outside
  its own module is `web/tests/lifecycle/enrollmentObjectiveSession.test.ts`.
- The one production path that does create packet sessions,
  `web/lib/public/forms/resolvePublicFormEmbedContext.ts:96`, does **not** pass `processInstanceId`.
  Every session it creates has `process_instance_id = NULL`.

Consequence: any packet link opened today yields either `NO_SESSION` (before first open) or
`NO_ENROLLMENT_JOURNEY` (after). `FormEmbedClient` swallows the non-2xx
(`web/app/forms/embed/[token]/FormEmbedClient.tsx:481` — `if (!res.ok) return;`) and simply never
mounts `EnrollmentConversationCard`. The participant sees the ordinary packet form and no error.

**The conversational surface is unreachable in production by any operator action.**

### B2 — the provider gate reads a table that does not have the column (hard blocker)

`web/lib/enrollment/participantRuntime/participantProviderAuthorization.ts:44` reads
`orgs.metadata`. Every other consumer of `parseAiPolicyFromMetadata` reads **`org_settings.metadata`**
— see `web/app/api/admin/ai/enrich-attention-suggestion/route.ts:49` and the doc comment on
`web/lib/ai/resolveTrustAuthorization.ts:151` (“`org_settings.metadata` for the resolved org”).

On hosted, `select metadata from orgs` returns `42703 column orgs.metadata does not exist`. The
function's own fail-closed contract then returns `false` on the error branch — **for every org,
unconditionally**. Granting the feature in policy would still not enable the provider path.

No test covers `participantProviderReasoningPermitted`; its only references are the module itself and
`web/app/api/public/forms/[token]/enrollment-turn/route.ts`. That is how it shipped.

### B3 — Firefly policy lacks the feature (known; needs Kelly)

`participant_conversation_interpretation` is absent from `allowed_features`. Changing hosted AI
policy is Kelly's call — **not edited.**

### B4 — deployment credentials unverified

`resolveGovernedReasoningProviderPort()` returns non-null only when `OPENAI_API_KEY` **and**
`OPENAI_MODEL` are set in the running deployment (`createOpenAiCompatibleProviderAdapterFromEnv`).
Both are present in the local `web/.env.local` (`OPENAI_MODEL=gpt-5-mini`,
`OPENAI_BASE_URL=https://api.openai.com`). The **Vercel production** env could not be read —
`vercel env ls` was denied by the sandbox classifier. Kelly must confirm, or it is confirmed
implicitly by a successful run.

---

## 3. The QA script — runnable only after B1–B4 clear

Written now so it is ready; **do not run it until the blockers above are resolved and Kelly
authorizes provider spend.**

**Preconditions**
1. An Enrollment `process_instance` for a Firefly child (one already exists, e.g.
   `93722453-33e9-4207-8774-8931ee2c855d`, subject child `b247b8a3-…`, stage `waitlist`).
2. A packet public link whose session is anchored to that instance —
   `form_packet_sessions.process_instance_id = <instance>` and `status='in_progress'`.
3. `org_settings.metadata.ai_policy.allowed_features` includes
   `participant_conversation_interpretation` (B3).
4. `OPENAI_API_KEY` + `OPENAI_MODEL` set on the deployment (B4).

**URL**

```
https://<firefly-app-host>/forms/embed/<plaintext-token>
```

The plaintext token is emitted once when the link is composed; it cannot be read back from the
database.

**Expected first paint**

The ordinary packet form, **with** the Enrollment conversation card mounted above it
(`EnrollmentConversationCard`, rendered only when `GET /api/public/forms/<token>/enrollment-objective`
returns `ok`). The first prompt is whatever `selectNextParticipantTurn` deterministically chooses —
for a `waitlist`-stage instance with no realized items, the first unconfirmed/missing information
need, rendered through `participantTurnPresentation`.

**Step 1 — deterministic control (no provider spend).** Type the value into the turn's own input
(`#enrollment-turn-value`) and submit. Expect the turn to advance and the answer to bind. This proves
the loop without touching a model, and must pass before step 2.

**Step 2 — free text (provider spend).** Answer the same class of turn in prose in
`#enrollment-turn-text` — phrasing the deterministic interpreter cannot read, e.g. a date written as
"she was born the third of March two thousand twenty" rather than a date value. Expect the same
binding and turn advance. A failure here must degrade to `clarification_needed`, never block.

**Post-run verification (DB, read-only)**

For the decision recorded by `interpretParticipantResponseViaTrust`:
- decision class `capability.participant_conversation_interpretation`, strategy
  `participant_conversation_interpretation_provider_backed`
- outcome is `recommended` (there is no "accepted")
- `review_requirement` — `automatic`, not `none`
- privacy: the D-101 admission (`acknowledged_unminimized_classes`) and D-102 admission
  (`acknowledged_untransformed_classes`) present with their support levels
- usage: `input_units` / `output_units` (not `*_tokens`); `execution_location` ∈
  `local | remote | unknown`
- provider identity: requested `openai` + `gpt-5-mini`; **what answered** comes back from the
  adapter as `ProviderIdentityV1` and is authoritative

---

## 4. Recommended order of repair

1. **B2 first** — one-line source fix (`orgs` → `org_settings`, keyed on `org_id`) plus the test that
   was never written. It is a defect, not a policy question.
2. **B1 next** — decide and build the operator action that launches an anchored Enrollment objective
   session. This is a product decision, not a bug fix: `launchEnrollmentObjectiveSession` exists and
   is tested; nothing invokes it.
3. **B3/B4** — Kelly's calls (hosted AI policy; deployment credentials).

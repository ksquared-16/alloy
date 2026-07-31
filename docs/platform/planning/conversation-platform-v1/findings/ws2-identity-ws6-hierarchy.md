# WS2 Conversation Identity Platform + WS6 Communication Hierarchy — Discovery Findings

Sprint: `conversation-platform-v1-discovery` (slot 2). Base `origin/staging @ 3fc2e0f4e`. Read-only.

---

## WS2 — Conversation Identity Platform

### 2.1 Schema — `20260715120000_communications_identity_platform_foundation.sql` (412 lines)

Four new tables + two columns on `communication_messages`. All additive; legacy `communication_provider_bindings` retained.

**`communication_provider_accounts`** `:13-34` — `provider_type` is **plain `text`, no enum** (only a non-empty CHECK `:32-33`); `status` CHECK `active|disabled|pending_verification` `:18-19`; `verification_state` CHECK `unverified|pending|verified|failed` `:20-21`; `health_status` CHECK `unknown|healthy|degraded|unavailable` `:22-23`; `secret_ref text NOT NULL DEFAULT 'unconfigured'` `:24`; `capabilities`/`config`/`metadata` jsonb; `legacy_binding_id` → bindings with unique partial index `:36-38`. Index `:40-42` on `(org_id, provider_type) WHERE status='active'`.

**`communication_identities`** `:52-82` — `provider_account_id` NOT NULL CASCADE; `channel` CHECK `sms|email|voice|internal` `:56` (voice/internal never implemented); `identity_type` free text (backfill emits `phone_number`, `system_email`, `location_email`, `shared_mailbox` `:327,:337-341`); `canonical_address`/`normalized_address` NOT NULL non-empty `:78-79`; `inbound_enabled`/`outbound_enabled`; `verification_state` `:63-64`; `status` CHECK `active|disabled` `:65-66`; `provider_resource_ref` backfilled from `messaging_service_sid` or `from_email` `:381`; **`scope` CHECK `tenant|location|department|system`** `:71-72` — the entire hierarchy vocabulary; `is_default_for_scope`; `legacy_binding_id` unique partial `:84-86`. Indexes `:88-97`. **No unique constraint on `(org_id, channel, normalized_address)`** — duplicate identities permitted.

**`communication_identity_location_bindings`** `:105-119` — `identity_id`, `location_id` → locations CASCADE, `channel`, `priority integer DEFAULT 100`, `is_default`, `inbound_routing_enabled`, `outbound_sending_enabled`, `status`. Unique: one default per `(org_id, location_id, channel)` `:125-127`; one row per `(identity_id, location_id)` `:129-130`.

**`communication_identity_grants`** `:138-154` — per-user bits `can_send`, `can_receive`, `can_configure`, `can_manage`, `can_override_default`, `can_use_across_locations`. `user_id uuid NOT NULL` — **no FK**. Unique `(org_id, identity_id, user_id)`. Table comment `:160-161`: when no grants exist for an identity, org-level `communications.send` applies — **grants default open, not closed**.

**`communication_messages` extension** `:166-174` — `communication_identity_id`, `communication_provider_account_id`, nullable, ON DELETE SET NULL.

**RLS** `:202-254` — all four tables enabled. Per table a `_select_org` policy for `authenticated` via `user_roles`, plus a `_service_all` policy `FOR ALL TO authenticated USING (auth.role() = 'service_role')`. Then `GRANT ALL ... TO anon, authenticated, service_role` `:251-254`. **No INSERT/UPDATE/DELETE policy for `authenticated`** — all writes must go through service-role.

**Backfill** `:259-412` — idempotent `DO $$` loop keyed on `legacy_binding_id`. Maps `binding.status` → `verification_state` (`active`→`verified`, `pending_verification`→`pending`, else `failed`) `:283-287`. Skips bindings with no resolvable address rather than fabricating `:323-326,:333-336`. **`binding.scope='user'` collapses to identity `scope='tenant'`** `:344-348` — the `user` scope is silently lost, retained only in `metadata.legacy_user_id` `:386`.

### 2.2 Legacy table — `20260430254100:4-22`

`channel` CHECK `('sms','email')`; `provider` free text; `scope` CHECK `('org','location','user')`; `location_id` → locations SET NULL; `user_id uuid NULL`; `inbound_to_e164`; `status` CHECK `('active','disabled','pending_verification')`; `is_primary`; `config jsonb`; `secret_ref text DEFAULT 'unconfigured'`. Comment `:169`: `secret_ref` is `legacy_global_twilio | unconfigured | env:VAR_NAME`. RLS enabled `:94`; policies `:100-110`; `GRANT ALL TO anon` `:150`.

### 2.3 Seed — `20260501200000` (100 lines)

Guarded on hardcoded staging org `93667019-…` existing `:10-13`, else `RAISE NOTICE` + return. SMS/Twilio `scope='org'`, `inbound_to_e164='+15555555555'`, `status='pending_verification'`, `config = {twilio_account_sid: '<PLACEHOLDER>', messaging_service_sid: '<PLACEHOLDER>'}`, `secret_ref='unconfigured'` `:30-57`. Email/Resend `config = {from_email: '<no-reply@YOUR_VERIFIED_DOMAIN_PLACEHOLDER>'}` `:74-99`.

Two later migrations flip these live: `20260501201000:7` sets `secret_ref='env:RESEND_API_KEY'`; `20260707170000:11` sets `secret_ref='env:TWILIO_AUTH_TOKEN'` — **without correcting the placeholder `config`**.

### 2.4 Sprint docs — designed / shipped / deferred

`docs/sprints/archive/08_2026/communications-identity-platform/README.md` is **44 lines, a single file** — no design doc, no audit, no phase-1 artifact. The substantive doc is `docs/platform/modules/communications-identity-platform.md` (103 lines, `status: canonical`, `last_reviewed: 2026-07-12`).

**Shipped:** 4 tables + 2 message columns; idempotent backfill; TS canonical resolver (`web/lib/communications/identity/`, 22 tests); Python parity validator; `GET /api/admin/communications/identities`; inbound SMS canonical identity FK.

**Deferred** (doc `:90-97`, README `:44`): Google Workspace / Microsoft 365 OAuth + sync · inbound email · voice · internal messaging · **provider-admin UX** · **grant-management UX** · legacy binding table removal.

**Certification caveat** (README `:13`): "Phase 2 — Certification ✅ Complete (local migration apply blocked: Docker unavailable)". **The migration was never actually applied locally.** `supabase db reset` and the backfill certification SQL are listed as un-run.

> **Doc/code contradiction #1.** Doc `:44-53` presents a per-send-path authorization table implying the identity platform governs all paths. In reality it is **read-only in application code**: `loadIdentityContext.ts:109,117,121` is the only reader of accounts/location-bindings/grants, and **nothing in `web/` or `backend/` ever INSERTs, UPDATEs or DELETEs those tables**. Rows exist only from the migration backfill. `GET /api/admin/communications/identities` has **zero UI consumers**.

### 2.5 Provider adapters

| Provider | Status | Evidence |
|---|---|---|
| **Resend** | **REAL send** (Python only) | `backend/app/integrations/resend_client.py:44` `requests.post("https://api.resend.com/emails")`. Webhook via Svix `web/app/api/webhooks/resend/route.ts:53-76` |
| **Twilio** | **REAL send** (Python SDK) | `backend/app/integrations/twilio_client.py:63`, `:103`. Only provider SDK in the repo: `backend/requirements.txt:10` |
| **Google / Gmail** | **STUB — throws** | `web/lib/communications/v2/providers/deferredAdapters.ts:14-19,23` |
| **Microsoft 365 / Graph** | **STUB — throws** | same file `:24` |
| **SendGrid** | nothing | negative-test fixture `composerChannels.test.ts:13-15`; commented-out config in `certification/supabase/config.toml:216-218` |
| **Vonage** | nothing | negative-test fixture `composerChannels.test.ts:67` |
| **Bandwidth** | nothing | one doc sentence `messaging_v2_architecture.md:195` |
| Mailgun, Postmark, SES, SMTP, nodemailer, MessageBird, Sinch, Plivo, Telnyx | **nothing** | zero hits repo-wide |

**No provider SDK in any `package.json`.** `web/package.json:108` has only `svix`. No `resend`, `@sendgrid/mail`, `twilio`, `nodemailer`, `googleapis`, `@azure/msal-node`, `@aws-sdk/client-ses`.

**The registry is dead code.** `v2/providers/registry.ts:15-28` is documented as "the only place provider names are switched" — **zero production callers**. The `ProviderAdapter` interface has **no `send()` method at all** (`providers/types.ts:30-37`); adapters only do `mapStatusEvent` + `normalizeInbound`. Real code branches on provider strings elsewhere: `composerChannels.ts:20,29`; `communication_message_sender.py:326`. Webhooks use a **duplicate, divergent** mapping module `v2/deliveryReceiptMapping.ts:9-49` (differs from the adapters on `email.failed`, `accepted`, `scheduled`, `received`). `resolveSenderIdentity.ts:118` computes `adapterKey = account.provider_type` and serializes it as `provider_adapter_key` `:332` — **metadata only, never dispatched on**.

> **Doc/code contradiction #2.** `deferredAdapters.ts:3-5` implies Google/Microsoft are "adapter code only, off the V1 critical path." That is wrong: the interface has no `send()`, all real transport lives in Python with no adapter abstraction, and no OAuth token store exists. Adding Gmail/Graph is a **platform change, not an adapter drop-in**.

**Real send path today:** TS enqueues, Python sends. `executeCommunicationsSend.ts:93` → `resolveOutboundSender` `:229` → `enqueueCanonicalOutboundMessage` `:291` → wake worker `:318` → `POST /messages/process` (`backend/app/routes/messages_sender.py:36`) → `communication_message_sender.py` SMS `:254` / email `:323` / `in_app` `:383` / unknown → `ValueError` `:405`.

### 2.6 Credential storage — no encryption at rest anywhere

Credentials are **never stored in the DB**. `secret_ref` is an opaque pointer resolved to a **process environment variable** at send time — `backend/app/services/communications/secret_ref.py:15-33`: `env:VAR_NAME` → `os.getenv`; `legacy_global_twilio` → sentinel using process-wide env (`settings.py:205-207,216`); `unconfigured`/unknown → `None` (refuses to treat the ref as a literal secret `:32-33`). TS mirror for webhook verification `twilioAuthToken.ts:12-27`.

- **Plaintext secret columns:** none. `config` jsonb holds non-secret identifiers only — `twilio_account_sid`, `messaging_service_sid`, `from_email`.
- **Supabase Vault:** extension installed (`20260329165048_remote_schema.sql:47`) but **never used** by communications. Zero `vault.*` references.
- **pgsodium / pgcrypto / pgp_sym_encrypt:** zero hits in `supabase/migrations/`.
- **Consequence: provider credentials are per-deployment, not per-tenant.** `env:RESEND_API_KEY` resolves to the same key for every org. True BYO-credentials multi-tenancy is architecturally impossible under the current `secret_ref` grammar.

### 2.7 OAuth for email providers — does not exist

Zero matches repo-wide for `googleapis`, `msal`, `graph.microsoft`, `oauth2/v2.0`, `accounts.google.com`, `office365`, `authorization_code`. `client_secret` hits are Stripe SetupIntents; `access_token` hits are Supabase session tokens; `outlook` hits are calendar deep-links (`tourAddToCalendarLinks.ts:25`).

**No token table** (`provider_oauth_tokens` does not exist). **No refresh logic. No scopes.** Design intent only, archived: `messaging_v2_architecture.md:55` ("Not present today"), `:171-172` (proposed `secret_ref = oauth:{token_row_id}`), `:311` ("OAuth tokens: encrypt at rest; rotate refresh tokens in worker").

### 2.8 Sender identities, verified domains, SPF/DKIM/DMARC

A **sender identity** = one row in `communication_identities` — a channel-typed canonical address owned by one provider account, with independent `inbound_enabled`/`outbound_enabled`, a `verification_state`, a `health_status`, a `scope`, and an optional `is_default_for_scope`.

**Verified-domain / verified-sender: not modeled.** `verification_state` is a 4-value string with **no writer anywhere** — only ever set by the migration backfill `:283-288`, derived mechanically from `binding.status`. No domain entity, no DNS record, no verification workflow, no provider status poll.

**SPF/DKIM/DMARC exist only as three optional booleans in a dark, unsourced UI:** `v2/deliverability.ts:37` `DomainAuth = { spf?, dkim?, dmarc? }`; `:40` `computeDomainAuthStatus` counts truthy flags; `DeliverabilityDashboard.tsx:21` returns `null` unless `comms_v2_deliverability` (default OFF), and `:24` reads `props.domainAuth ?? {}` — **the props are never populated from anything**.

**Reply-to: not in the schema.** `RulesWorkspace.tsx:32,71` renders a "Reply-To Email" row whose value is `emailBinding?.from_email_hint` — the *From* address relabelled. `RulesWorkspace` is display-only (`:39-40`); logo/school_name/signature/brand_colors are hardcoded placeholders `:67-76` (e.g. `signature: "Managed in template and announcement editors"`).

Doc confirms intent: `docs/archive/2026-06-product/communications.md:84` — "SPF/DKIM alignment remains tenant DNS + provider responsibility"; `:94` — "No full tenant self-serve SPF/DKIM / BYO wizard in V1."

### 2.9 Ownership and the resolution function

**Ownership is `org_id` (a tenant), full stop.** Every table in both generations is `org_id NOT NULL REFERENCES orgs(id)`. Location is a *binding association*, not an owner.

**Canonical resolver: `resolveSenderIdentity(ctx, input)` — `web/lib/communications/identity/resolveSenderIdentity.ts:203`.** Pure, no I/O. Context loaded by `loadIdentityContext.ts`; async wrapper `resolveOutboundSender.ts`.

Eligibility gate `isOutboundReady` `:24-31`: identity `active` + `outbound_enabled` + account `active` + `secret_ref` present and ≠ `unconfigured`.

| Order | Branch | Reason | `fallbackLevel` |
|---|---|---|---|
| 1 | explicit `requestedIdentityId`/`requestedLegacyBindingId` (requires `can_override_default` or `can_manage` `:54`) | `explicit_authorized_override` | 0 |
| 2 | location binding with `is_default` `:271` | `location_default` | 10 |
| 3 | location bindings by `priority` asc `:72` | `location_priority` | 20 |
| 4 | identity `scope='location'` (or `metadata.legacy_scope='location'`) with **no binding row** `:282-292` | `location_priority` | 25 |
| 5 | `is_default_for_scope && scope='tenant'`, id-sorted `:296-298` | `tenant_default` | 30 |
| 6 | any `scope IN ('tenant','system')`, id-sorted `:307-309` | `tenant_default` | 40 |
| 7 | legacy binding fallback `:147-200` | `legacy_compatibility_fallback` | 90 |

Provenance returned: `selectionReason`, `fallbackLevel`, `locationBinding`, `authorization {allowed, usedGrant, overrideUsed}`, `warnings[]`, `legacyBindingId`; serialized by `serializeSenderResolution` `:322-337`. Failure codes (`identity/failureCodes.ts`): `TENANT_MISSING`, `UNSUPPORTED_CHANNEL`, `OVERRIDE_INVALID`, `OPERATOR_UNAUTHORIZED`, `NO_ELIGIBLE_IDENTITY`, `PROVIDER_ACCOUNT_UNHEALTHY`.

**`scope='department'` is in the DB CHECK `:71-72` and the TS type (`identity/types.ts:5`) but the resolver never branches on it** — a department-scoped identity falls through to nothing.

**Two parallel, divergent legacy resolvers still run:** `binding_resolver.py:19` (`user > location > org`, `_prefer_primary`, plus a "any org-level row regardless of stray location_id" fallback `:87-89` that the TS resolver has no analogue for); `identity_resolver.py:149` (validates a *persisted* identity, refuses to reselect, org-mismatch guard `:174-176`).

### 2.10 Settings UI — what an operator can actually configure

`web/app/adminV2/settings/communications/page.tsx` (7 L) → `CommunicationsConfigurationPage.tsx` (18 L) → `CommunicationsSetupClient.tsx` (270 L).

**The page reads the LEGACY `communication_provider_bindings` table via `GET /api/admin/communications/bindings`. It does not touch the identity platform at all.**

- **Banner** `:109-121` — amber, verbatim: "Communications settings — mid-build but useful". States credential setup is admin-managed (deployment / vault / DB binding rows); operator can edit "label, status, and primary only — never secret values."
- **"Outbound readiness"** `:123-143` — two read-only rows (Email, SMS), "Ready for composer" / "Not ready", from `channels_available`.
- **"Provider bindings"** `:145-267` — one card per binding. *Read-only:* header `{Email|SMS} · {Resend|Twilio|raw provider}` `:174`; "Composer outbound: ready / not ready" `:176-178`; `Status (stored)`; `Primary`; `Inbound` (E.164, SMS only); `From (config hint)`; `Scope` (raw string).

  *Editable — exactly three controls:* `Display label` (free text, trimmed, capped 200 server-side `:210-220`, API `bindings/[bindingId]/route.ts:44`); `Binding status` (`<select>` `active`/`disabled`/`pending_verification` `:224-237`); `Primary for this channel` (checkbox `:239-251`). Then `Save row` → `PATCH /api/admin/communications/bindings/{id}` `:83-92`.

**Not present anywhere in this UI:** provider selection, credential entry, `secret_ref` editing, from-address, reply-to, signature, domain/DNS verification, phone-number purchase or assignment, location assignment, identity CRUD, grant management, quiet hours, templates. The page text says `secret_ref` changes "still happen outside this UI today (runbooks / migrations / ops)" `:148-151`.

**There is no UI whatsoever** for `communication_provider_accounts`, `communication_identities`, `communication_identity_location_bindings`, or `communication_identity_grants`.

---

## WS6 — Communication Hierarchy & Inheritance

### 6.1 Target hierarchy vs reality

| Level | Real table | Citation |
|---|---|---|
| Organization | **`public.orgs`** (not `organizations`) | `20260329165048_remote_schema.sql:2284` |
| **Brand** | ❌ **DOES NOT EXIST** | exhaustive grep: `brand` appears only as `customer_payment_methods.brand` (Visa/Mastercard `:1251`), `payment_method_brand` `:1363`, and CSS branding |
| Location (site) | `public.locations` WHERE `location_type='site'` | `remote_schema.sql:2117`; discriminator CHECK `:2151` = `('address','site','unit')` |
| Program | `public.location_program_categories` | `20260610140001_location_program_categories.sql:9` (FK `location_id` must be a `site`) |
| Program (org-level, newer) | `public.programs` | `20260722020000_configuration_publication_runtime_v1.sql:9`, UNIQUE `(org_id, program_key)` |
| **Room** | **`public.locations` WHERE `location_type='unit'`, `parent_location_id` = the site — *not a separate table*** | `web/lib/location/canonicalLocationModel.ts:5,:100`; `canonicalRoomProvider.ts:4`; label map `web/lib/admin/locationListPresentation.ts:18` |

Extra real level not in the target: **department** (`communication_identities.scope` already allows it; `20260409090000_cleaning_org_departments_and_work_units_seed.sql`).

DB-side hierarchy integrity trigger already exists: `public.validate_childcare_config_scope()` — `20260628120000_childcare_config_rules_phase1.sql:26-86` (site must be `location_type='site'` + same org; program category same org; room must be `location_type='unit'` + same org). TS mirror `web/lib/childcareOperational/validateChildcareLocationRefs.ts:34,72`.

### 6.2 The canonical inheritance pattern — `resolveConfigRule`

**`web/lib/childcareOperational/config/resolveConfigRule.ts:130`**

```ts
export function resolveConfigRule<T extends ResolvableConfigRule>(
    rules: readonly T[],
    context: ConfigRuleScopeContext,
    dateYmd: string
): T | null
```

Companion `resolveMatchingConfigRules<T>` `:118` returns the full ranked list.

**Contract, precisely:**

- **Not a walk-up-and-merge.** It is a *flat filter → total sort → take first*. `ruleMatchesContext` `:48` filters; `compareRulePrecedence` `:96` sorts; `[0]` wins. Pure, no I/O `:16`.
- **Precedence** `:36-45` (doctrine `:4-7`): `room(4) > program(3) > site(2) > org(1)`, then age-group-specific beats age-group-null `:86-88`, then latest `effective_start` `:104`, then latest `created_at`, then smallest id `:107-113` (determinism tiebreak).
- **Overrides are recorded as one row per scope in a single per-domain table**, using four shared columns: `scope_type text` + `site_location_id` + `program_category_id` + `room_location_id`, with exactly one non-null, enforced by a `*_scope_shape` CHECK. Not JSON merge, not null-means-inherit. Row types `configRuleTypes.ts:18-29`; scope enum `CONFIG_RULE_SCOPE_TYPES` `:11`.
- Tables using it: `childcare_capacity_rules` (`20260628120000:90`, CHECK `:115-119`), `childcare_ratio_rules` (`:138`, CHECK `:159-163`), `childcare_ratio_rule_tiers` `:175`, `childcare_operating_windows` (`:199`, CHECK `:223-227`), `childcare_schedule_rules` `:245`.

**Provenance is first-class** — `web/lib/location/operationalResolutionContracts.ts:49`:

```ts
export type AppliedOperationalRule = {
    ruleId: string; ruleType: string;
    scopeType: string;   // 'org' | 'site' | 'program' | 'room'  ← WHICH LEVEL
    scopeId?: string; effectiveStart?: string; effectiveEnd?: string;
    sourceKey?: string;  // 'licensing' | 'organization' | 'config' | 'location_override'
    binding?: boolean;   // true = this rule set the result
};
```

Plus a 4-value status model `:28` — `"resolved" | "incomplete" | "not_configured" | "conflicted"` — with explicit doctrine `:6-9` that **unknown is never coerced to 0/Infinity/a default**. Structured warnings `:35`; deterministic serialization `sortWarnings` `:102`, `sortAppliedRules` `:117`, `mergeResolutionStatus` `:80`. *Every* applicable rule is reported, not just the winner, so the UI can say "limited by the 2:11 ratio (effective Sep 1)" `:45-47`. Populated e.g. `capacity/resolveRatio.ts:73-74`.

**Cross-domain reuse (proof of canonicity):** `config/capacityRules.ts:38`, `config/scheduleRules.ts:20`, `config/regulatoryCeiling.ts:25`, `config/roomConfigResolvers.ts:92`, `capacity/resolveRatio.ts:117`, `capacity/resolveOperationalCapacity.ts:56`, `expectations/buildScheduleExpectations.ts:27`, and **`web/lib/financials/rates/resolveRate.ts:78`** (financials reusing the childcare resolver).

**Adding a level costs:** new nullable FK column + CHECK arm on each scoped table, one entry in `CONFIG_RULE_SCOPE_TYPES` `configRuleTypes.ts:11`, one in `SCOPE_SPECIFICITY` `resolveConfigRule.ts:36`. The resolver body needs no other change. Adding **brand** additionally requires creating the `brands` table from scratch.

#### Runner-up patterns

**#2 `resolveFinancialPolicy`** — `web/lib/financials/policies/resolveFinancialPolicy.ts:64`. Same shape, different axis: `rate_plan(4) > service(3) > location(2) > org(1)` `:26-31`. Provenance is a discriminated union with `sourceScope` + `sourceScopeLabel` `:54`. Table `financial_policies` `20260704120000:20`, CHECK `:51-56`. Sibling `commercial_policies` `20260715000001:24` uses `('org','location','program','offering','variant')`. **It duplicates #1's engine rather than reusing it** — precedent for a new axis, not the shared engine.

**#3 `resolveEffectiveConfiguration`** — `web/lib/configPublication/effectiveResolution.ts:24`. Two levels only (org → location), per-field policy-governed: `organization_locked | location_may_override | location_must_supply | runtime_derived` (`configPublication/types.ts:8`). Fallback `runtime → location_override → organization → platform_default → missing`. Explicit-presence via `hasOwn` `:12` so `false`/`0`/`""` survive; unknown or illegal override keys **throw** `:29-34`. Provenance `EffectiveConfigurationField.source` (`types.ts:28`, typed `:14`). One production consumer (`programPublicationModel.ts:131`). Related: `web/lib/configRuntime/scope.ts:9` declares `ConfigScope` as **only** `{kind:"org"} | {kind:"location"}`; `resolveConfigLayers<T>` `:57` (AUTHORITY_RANK `platform:0, org:1, location:2` `:45`); `resolveInherited<T>` `:70`. Operator labels `organizationLocationScope.ts:6,14` — `"Inherited from Organization"`, `` `Overridden by ${locationLabel}` ``. → **Use this layer for *which fields a location may override*; insufficient alone for a 5-level hierarchy.**

**#4 ❌ ANTI-PATTERN — do not reuse.** `resolveTourCommsConfig` (`web/lib/tours/comms/resolveTourCommsConfig.ts:52`) deep-merges `platform default → org_settings.metadata.tour_comms → locations.metadata.tour_comms`. Merger `tourCommsConfig.ts:345`. Sub-mergers detect an override by **diffing from the default** (`:311`: `if (location.enabled !== base.enabled) out.enabled = …`), so a location explicitly setting a value equal to the default is indistinguishable from "not set". Provenance is only `sources: { org: boolean, location: boolean }` `resolveTourCommsConfig.ts:75` — no per-field attribution.

**Distribution layer (orthogonal, complementary):** `20260722020000_configuration_publication_runtime_v1.sql` — `configuration_publications` `:93`, `configuration_distribution_runs` `:113`, `configuration_distribution_targets` `:129` (**fan-out is per-`location_id`**), `configuration_delivery_attempts` `:151`, `configuration_consumptions` `:185`. Immutability guard plpgsql `:227` (triggers `:238,244,250`); atomic publish `public.publish_program_revision_v1(...)` `:296`. Location-owned override columns `:194-199`.

**No plpgsql function performs scope-walk config resolution** — resolution is 100% TypeScript over a fully-loaded rule bundle (`childcareConfigRuleService.ts:90`).

### 6.3 Business hours / quiet hours

**Business hours: YES — already on the canonical pattern.** `public.childcare_operating_windows` `20260628120000:199` — `weekday smallint` (0-6, Sun=0) `:206`, `open_time time` `:207`, `close_time time` `:208`, full `scope_type` + 3 scope FKs `:202-205`, effective-dating, `source_key`, `metadata`. CHECKs `:219-220`, scope shape `:223-227`. Table comment `:232` notes date-specific closures (**holiday calendar**) are explicitly **future work — does not exist**. Loader `childcareConfigRuleService.ts:55`; consumer `expectations/buildScheduleExpectations.ts:238`; authoring `configRuleAuthoringService.ts:770` (+ `createOperatingWindowVersion` `:805`, `retireOperatingWindow` `:829`, `voidScheduledOperatingWindow` `:842`); API `web/app/api/admin/operational-config/operating-windows/route.ts`.

Second, unrelated hours system: `public.tour_availability_rules` `20260511143000:18` — flat `org_id` + nullable `location_id`, `day_of_week smallint` `:23`, `start_time`/`end_time` `:24-25`, `timezone`, `slot_duration_minutes`, `buffer_minutes`, `max_bookings_per_slot`, `approval_required`. **Naming drift:** `day_of_week` here vs `weekday` in operating windows.

No table named `business_hours` or `operating_hours` exists.

**Quiet hours: YES — but tours-only, JSON-blob, on the anti-pattern.** `web/lib/tours/comms/tourCommsConfig.ts:68`:

```ts
type TourCommsQuietHoursConfig = {
    enabled: boolean; start: string; end: string;   // local "HH:mm"
    timezone_source: "booking" | "org";
    apply_to_confirmation: boolean;
    defer_policy: "next_window_end" | "next_morning";
    next_morning_time: string;
};
```

Platform default `:150`: enabled, 21:00→08:00, timezone from booking, defer to next morning 08:00. **Storage: `org_settings.metadata.tour_comms.quiet_hours` → `locations.metadata.tour_comms.quiet_hours`. No table, no column.** `org_settings` is one row per org (`remote_schema.sql:2269`); **there is no `location_settings` table** — location config piggybacks on `locations.metadata`. Enforcement `tourReminderTiming.ts` (`isInstantInQuietHours`, `deferTourReminderFromQuietHours`, exported `web/lib/tours/index.ts:115-117`); orchestrated `tourCommsOrchestrator.ts:400`; telemetry code `"quiet_hours_adjusted"` `tourCommsConfig.ts:20`.

### 6.4 Compliance — opt-out / consent / TCPA / unsubscribe

**Two disconnected systems.**

**(a) `person.communication_opt_out` — a field-registry boolean.** `20260529210000` seeds a `consent` section `:4-18` and a `field_definitions` row `communication_opt_out` (boolean, `is_system=false`, `is_visible_in_drawer=true`, sort 230) for **every org** `:20-70`. Values live in `field_values`. Rendered in the person drawer: `PersonDrawerParentSummary.tsx:199-208`, `PersonDrawerParentTitleRow.tsx:41`; parent-only `personDrawerPresentationProfile.ts:95`.

> **This field is never read by any send path.** Grep of `web/lib/communications/`, `web/app/api/admin/communications/`, `backend/app/services/`: **zero** references to `communication_opt_out`. It is a display-only checkbox.

**(b) Communications V2 preference/consent platform — real schema, enforcement DARK.** `20260619140000`: `communication_message_recipients` `:8-23` (`recipient_role` CHECK `('to','cc','bcc')`, `person_id uuid NULL` **without FK** `:5`); `communication_preferences` `:32-45` (`(org_id, person_id, category)` UNIQUE, `state text DEFAULT 'unset'`, `source`, `method`, `updated_by_user_id` — **category and state vocabularies are free text in the DB**, defined only in `v2/preferences.ts`, migration comment `:30-31`); `communication_preference_events` `:49-64` (immutable append-only audit).

Migration header `:1-4` is explicit: **"NO send-time enforcement (that lands in PKG-08)"**; table comment `:113` repeats it.

Enforcement was later written — `v2/consentEnforcement.ts:18` `enforceConsentForSend` → `v2/consentGate.ts` `evaluateConsent` — and wired into `executeCommunicationsSend.ts:113-122` (403 `consent_blocked`) and `family-send/route.ts:8`. **But it is gated on `comms_v2_compliance`, which defaults OFF.** `v2/flags.ts:53-59` lists only `command_center`, `record_tab`, `composer`, `live_workspace` as core/default-ON; `resolveCommsV2Flag` `:69-77` returns `false` for every non-core key when the env var is unset. `NEXT_PUBLIC_COMMS_V2_COMPLIANCE` appears **nowhere** in the repo except the flag module. `consentEnforcement.ts:5-6` states plainly: "when the flag is off this code path never runs."

**STOP/START/HELP keyword handling: parser exists, wired to nothing.** `v2/smsKeywords.ts:14` `parseSmsKeyword` (STOP set `stop/stopall/unsubscribe/cancel/end/quit/optout/opt-out` `:9`); `SMS_KEYWORD_CATEGORIES` `:23`; `keywordTargetState` `:26`. **Only importers are `v2/preferenceMutations.ts:8` and its own test.** The real inbound SMS handler `backend/app/routes/sms_inbound.py` has **zero** keyword or opt-out logic.

Meanwhile the app emits opt-out promises to users: `web/app/terms/page.tsx:51` ("Reply **STOP** to unsubscribe at any time") and `backend/app/routes/dispatch.py:1380` appends "Reply STOP to unsubscribe" to outbound SMS.

No unsubscribe link generation, no suppression list, no TCPA-specific logic anywhere.

---

## Gaps

### Identity platform

| ID | Gap |
|---|---|
| I1 | **The identity platform has no write path.** No UI, no API, no service function inserts/updates/deletes any of the four tables. Rows exist only from the one-shot backfill. Anything new must be authored by SQL. |
| I2 | **`GET /api/admin/communications/identities` has zero consumers.** Built, sanitized, tested, never called. |
| I3 | **The operator settings page still reads the legacy table.** Three editable fields total: label, status, primary. |
| I4 | **Legacy bindings are still the real resolution path in Python.** `binding_resolver.py:19` runs an independent `user > location > org` walk with a "loose org fallback" `:87-89` the canonical TS resolver has no analogue for. |
| I5 | **The provider registry is dead code** with no `send()` in its interface; a **duplicate, divergent** event-mapping module is what actually runs. Real disagreements on `email.failed`, `accepted`, `scheduled`, `received`. |
| I6 | **`verification_state` has no writer.** No domain verification, no provider status poll, no sender-verification workflow. |
| I7 | **`scope='department'` is unreachable** — in the DB CHECK and TS type, never branched on by `resolveSenderIdentity`. |
| I8 | **`binding.scope='user'` is destroyed by the backfill** `:344-348` — collapsed to `tenant`, preserved only in `metadata.legacy_user_id`. |
| I9 | **Zero OAuth infrastructure.** No token table, no refresh, no scopes. Gmail/Graph are `throw`-only stubs. |
| I10 | **No unique constraint on `(org_id, channel, normalized_address)`** — duplicate identities permitted, and resolution steps 5/6 tiebreak on `id.localeCompare` (arbitrary). |
| I11 | **Certification was never actually executed.** README `:13` — "local migration apply blocked: Docker unavailable". |

### Hierarchy

| ID | Gap |
|---|---|
| H1 | **No `brands` table.** Net-new entity required. Nothing in the codebase anticipates it. |
| H2 | **No `rooms` table** — a room is `locations` with `location_type='unit'`. Any comms hierarchy must adopt this convention or fork the location model. |
| H3 | **Two competing program entities** — `location_program_categories` (site-scoped) and `programs` (org-scoped). Which one a comms hierarchy attaches to is an open decision. |
| H4 | **Communications knows only 4 scope values** (`tenant\|location\|department\|system`) with zero effective-dating, versus the canonical pattern's 4 hierarchical scopes + `effective_start`/`effective_end` + `source_key`. **The vocabularies do not line up** — `tenant` vs `org`, no `program`, no `room`. |
| H5 | **Templates are org-scoped only.** `communication_templates` has `org_id` and no scope columns. No location/program/room override. |
| H6 | **Reply-to and signature do not exist in any schema.** `RulesWorkspace.tsx:67-76` renders hardcoded placeholders; "Reply-To" is the From address relabelled. |
| H7 | **Quiet hours are tours-only, JSON-blob, 2-level, with no per-field provenance** — built on the one pattern explicitly identified as an anti-pattern. |
| H8 | **No `location_settings` table.** Location config rides on `locations.metadata` jsonb. |
| H9 | **No holiday/closure calendar** — named as future work `20260628120000:232`. |
| H10 | **Naming drift in hours**: `weekday` (operating windows) vs `day_of_week` (tour availability) vs `weekdays smallint[]` (`schedule_patterns`, `20260625120000:146`). |

---

## Security concerns

**S1 — No encryption at rest for provider credentials; credentials are platform-global, not tenant-scoped.** `secret_ref` resolves only to `env:VAR_NAME`, `legacy_global_twilio`, or `unconfigured` (`secret_ref.py:15-33`). Supabase Vault is installed (`remote_schema.sql:47`) but **never used** for communications; no pgsodium/pgcrypto in any migration. Every tenant in a deployment necessarily shares the same `RESEND_API_KEY` / `TWILIO_AUTH_TOKEN`. No key rotation path, no per-tenant isolation, no ability to onboard a customer's own credentials without a redeploy.

**S2 — Silent cross-tenant credential fallback on the email send path.** `backend/app/services/communication_message_sender.py:329-334`:

```python
api_key_ref = binding.get("secret_ref") or "env:RESEND_API_KEY"
api_key_plain = resolve_secret_plaintext(api_key_ref)
if not api_key_plain:
    api_key_plain = resolve_secret_plaintext("env:RESEND_API_KEY")   # ← unconditional fallback
```

A tenant whose account is `unconfigured` or misconfigured **still sends** — using the platform's global Resend key and, via `default_from_email()` `:337`, potentially the platform's From address. This defeats the `isOutboundReady` gate in `resolveSenderIdentity.ts:28-29`, written specifically to block `unconfigured`. The SMS branch does **not** do this (`:265-269` raises `RuntimeError`) — the two channels have inconsistent fail-closed behavior.

**S3 — TCPA/CAN-SPAM opt-out is unenforced in the default configuration.** Consent enforcement runs **only** when `comms_v2_compliance` is on, and that flag is non-core → **default OFF**; `NEXT_PUBLIC_COMMS_V2_COMPLIANCE` is set nowhere in the repo. Compounding: the `person.communication_opt_out` field that operators actually see and toggle is **read by nothing**; and inbound STOP is never processed — `parseSmsKeyword` has no production caller and `sms_inbound.py` contains no keyword logic. Meanwhile `web/app/terms/page.tsx:51` and `backend/app/routes/dispatch.py:1380` both tell recipients "Reply STOP to unsubscribe." **As deployed today, an opted-out person continues to receive messages and a STOP reply changes nothing.** Regulatory exposure, not merely a feature gap.

**S4 — `GRANT ALL ... TO anon` on every communications table.** `20260715120000:251-254` and `20260430254100:150-163`. RLS is enabled and no policy targets `anon`, so this is currently inert — but it is a single dropped or incorrect policy away from anonymous read/write of provider bindings, identities, threads, and messages. No defense in depth.

**S5 — `secret_ref` is readable by every org member.** `communication_bindings_select_org` (`20260430254100:100-104`) and `communication_provider_accounts_select_org` (`20260715120000:207-211`) grant SELECT on the **full row**, including `secret_ref`, to any user with a `user_roles` entry for the org — not just admins. The value is an env-var *name*, not the secret, but it discloses the deployment's secret-management topology. The API layer sanitizes correctly (`bindings/route.ts` `sanitizeBindings`, `identities/route.ts` `sanitizeIdentity`); the exposure is at the RLS/PostgREST layer, which the browser Supabase client can reach directly.

**S6 — Grants fail open.** `resolveSenderIdentity.ts:50-51`: if `operatorUserId` is null **or the identity has no grant rows at all**, authorization falls back to the coarse org-level `communications.send` permission. Documented as intended (`20260715120000:160-161`), but it means the six per-identity capability bits provide **no restriction whatsoever** until someone inserts a grant row — and per I1 **there is no code path anywhere that inserts one**. The grants table is currently always empty, so every identity is usable by every operator with `communications.send`.

**S7 — Placeholder credentials shipped in a migration.** `20260501200000:41-46` writes literal `<TWILIO_ACCOUNT_SID_PLACEHOLDER>` / `<TWILIO_MESSAGING_SERVICE_SID_PLACEHOLDER>` into `config` jsonb against a hardcoded production-looking org UUID. Harmless as written, but two later migrations flip `secret_ref` to live env refs **without correcting the placeholder `config`** — leaving a row that passes the `secret_ref` readiness gate while carrying garbage `twilio_account_sid`. Fails closed at send (`communication_message_sender.py:265-269`), but a latent trap.

**S8 — `communication_preferences.person_id` and `communication_identity_grants.user_id` have no foreign keys** (`20260619140000:5,:34`; `20260715120000:142`). Deleting a person or user orphans their consent record and identity grants rather than cascading — an orphaned `opted_out` row silently stops matching, and an orphaned grant row silently persists.

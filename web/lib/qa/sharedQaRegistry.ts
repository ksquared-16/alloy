/**
 * Shared QA Tenant Architecture V1 — Alloy-side frozen registry (B2).
 *
 * Mirrors Vacilando toolkit `lib/qa-plan-registry.mjs` (B1 @ 0cc773d1f3a1).
 * Organization ids, structure ids, and identity emails are permanent and reviewed
 * like code. Hosted org creation is separately approved; this module never writes.
 */

export const QA_HOSTED_PROJECT_REF = "ikaxilmwmrmbagoidedu";
export const QA_PRODUCTION_PROJECT_REF = "vslwnntzzgpnmrpjipat";

/** Firefly Early Learning — certified operating tenant; never a QA target. */
export const FORBIDDEN_QA_ORG_IDS = Object.freeze([
  "93667019-bd28-49b5-a688-acc9bb1e0a19",
] as const);

export const QA_ORGS = Object.freeze({
  qa_shared: Object.freeze({
    key: "qa_shared",
    id: "4acc9386-c485-486f-aa1f-05d83499d142",
    name: "ZZ Alloy QA",
    slug: "zz-alloy-qa",
    actor: "qa_shared_actor",
    actor_email: "qa-shared-actor@example.com",
    actor_display_name: "QA Shared Administrator",
  }),
  qa_secondary: Object.freeze({
    key: "qa_secondary",
    id: "ad53fee2-2570-460f-9300-f0e106c473b6",
    name: "ZZ Alloy QA — Cross-Org",
    slug: "zz-alloy-qa-cross-org",
    actor: "qa_secondary_admin",
    actor_email: "qa-secondary-admin@example.com",
    actor_display_name: "QA Secondary Administrator",
  }),
} as const);

/** B1 identity emails / display names mirrored for Alloy-side plan compatibility checks. */
export const QA_IDENTITIES = Object.freeze({
  qa_shared_actor: Object.freeze({
    key: "qa_shared_actor",
    kind: "actor",
    org: "qa_shared",
    email: "qa-shared-actor@example.com",
    display_name: "QA Shared Administrator",
  }),
  qa_pool_01: Object.freeze({ key: "qa_pool_01", kind: "pool", org: "qa_shared", email: "qa-pool-01@example.com", display_name: "QA Pool 01" }),
  qa_pool_02: Object.freeze({ key: "qa_pool_02", kind: "pool", org: "qa_shared", email: "qa-pool-02@example.com", display_name: "QA Pool 02" }),
  qa_pool_03: Object.freeze({ key: "qa_pool_03", kind: "pool", org: "qa_shared", email: "qa-pool-03@example.com", display_name: "QA Pool 03" }),
  qa_pool_04: Object.freeze({ key: "qa_pool_04", kind: "pool", org: "qa_shared", email: "qa-pool-04@example.com", display_name: "QA Pool 04" }),
  qa_pool_05: Object.freeze({ key: "qa_pool_05", kind: "pool", org: "qa_shared", email: "qa-pool-05@example.com", display_name: "QA Pool 05" }),
  qa_secondary_admin: Object.freeze({
    key: "qa_secondary_admin",
    kind: "actor",
    org: "qa_secondary",
    email: "qa-secondary-admin@example.com",
    display_name: "QA Secondary Administrator",
  }),
} as const);

export const QA_PLAN_KEYS = Object.freeze(["authz_q1", "bp_v2"] as const);

export const QA_STRUCTURE = Object.freeze({
  departments: Object.freeze({
    qa_d1: Object.freeze({
      key: "qa_d1",
      org: "qa_shared",
      id: "0704e72c-f73d-44b2-87d9-89924e222464",
      name: "QA D1",
      dept_key: "qa_d1",
    }),
    qa_d2: Object.freeze({
      key: "qa_d2",
      org: "qa_shared",
      id: "609d088b-0446-4a7f-b529-f971fb5d73c8",
      name: "QA D2",
      dept_key: "qa_d2",
    }),
  }),
  sites: Object.freeze({
    qa_north: Object.freeze({
      key: "qa_north",
      org: "qa_shared",
      id: "21c9be10-f6e9-4048-ab4c-939ddbe0f0b7",
      name: "QA North",
    }),
    qa_south: Object.freeze({
      key: "qa_south",
      org: "qa_shared",
      id: "cfb73302-3bbe-49db-b173-876fda776a6d",
      name: "QA South",
    }),
  }),
} as const);

/** Fixture UUID namespace for Documents authz vendor SQL (hex-only). */
export const QA_AUTHZ_FIXTURE_UUID_PREFIX = "aa000000-";

/**
 * Surfaces c4 run-owned room-Uses fixture (OPWORK_FAACCA6079AD_SPRINT_6E76007E732B).
 *
 * TWO rows in QA Shared, both in their own `ac000000-` namespace: one child assignment category and
 * one classroom under the permanent QA North site whose configured `space_uses` names it. Existing
 * rooms are never touched (Room N/S 584637 carry no ownership marker). Firefly is never a target —
 * a Firefly room was proposed and WITHDRAWN (it is `FORBIDDEN_QA_ORG_IDS`). Hosted execution is
 * separately approved and registered by the platform owner; this module never writes.
 */
export const QA_SURFACES_FIXTURE_UUID_PREFIX = "ac000000-";
export const QA_SURFACES_ROOM_USES_FIXTURE = Object.freeze({
  org: "qa_shared",
  site: "qa_north",
  site_id: "21c9be10-f6e9-4048-ab4c-939ddbe0f0b7",
  category_id: "ac000000-0000-4000-8000-000000000301",
  category_key: "qa_surfaces_room_use",
  room_id: "ac000000-0000-4000-8000-000000000311",
  marker: "surfaces_c4_room_uses",
  paths: Object.freeze({
    ensure: "certification/fixtures/qa-surfaces-room-uses-ensure.sql",
    reset: "certification/fixtures/qa-surfaces-room-uses-reset.sql",
    census: "certification/qa-shared/surfaces-room-uses-census.sql",
    /** The isolated executor census program (`census count=<n>`), distinct from the read_census query above. */
    fixture_census: "certification/fixtures/qa-surfaces-room-uses-census.sql",
  }),
  /** npm scripts the registered reconciliation runs (`npm run --silent <runner>` in web/). */
  runners: Object.freeze({
    ensure: "dev:qa:surfaces-room-uses-fixture-ensure",
    reset: "dev:qa:surfaces-room-uses-fixture-reset",
    census: "dev:qa:surfaces-room-uses-fixture-census",
  }),
  sha256: Object.freeze({
    ensure: "95a4906215c04c121c3cbf4bd2ae281e0d06f3365d155fe0ad72f8cca476c139",
    reset: "7fc6f68a588024c946717589050666e6e91fe20c8b71fcce2469d9ef6bb2c349",
    census: "6d35ea1c8668a7e923f2b534285b607b03707cfc1941e773e061e86e1ff91a80",
  }),
} as const);

export const QA_AUTHZ_VENDOR_IDS = Object.freeze({
  v1: "aa000000-0000-4000-8000-000000000001",
  v2: "aa000000-0000-4000-8000-000000000002",
} as const);

export const QA_FIXTURE_EXTERNAL_SOURCE = "alloy_qa_fixture";

export const QA_AUTHZ_FIXTURE_PATHS = Object.freeze({
  ensure: "certification/fixtures/qa-authz-vendors-ensure.sql",
  reset: "certification/fixtures/qa-authz-vendors-reset.sql",
} as const);

/** Exact content pins — update deliberately with Vacilando reconciliation pins. */
export const QA_AUTHZ_FIXTURE_SHA256 = Object.freeze({
  ensure: "9d23cc63f92f8df373aa5ff29ac6ae1254632157fe9588cbf7bcb559cdb5b199",
  reset: "8c34f50479ed612010e3dc049f9ed419ff02778fa66a171c75eaefc6932d0dad",
} as const);

export const QA_CENSUS_PATHS = Object.freeze({
  documents_zero_residue: "certification/qa-shared/documents-zero-residue-census.sql",
  bp_quiesced_retained: "certification/qa-shared/bp-quiesced-retained-census.sql",
  phase_a_preflight: "certification/qa-shared/b2-phase-a-preflight-census.sql",
} as const);

export const QA_CENSUS_SHA256 = Object.freeze({
  documents_zero_residue: "7957a51a60407ca03489a1ca89a854e71a2ba3564a62c14995f459e436c35c04",
  bp_quiesced_retained: "08d4fa7218fc9ef0d048bea8e0d814c264a4c5491a47f01a3a465a70d0a2670d",
  phase_a_preflight: "b71b6a37c6024aae41bf60a51f31b34baa4f2421088bb9341c5657ce4f2e2a46",
} as const);

export const SEEDED_ASSIGNABLE_ROLES = Object.freeze(["admin", "ops", "school_director"] as const);
export const RESERVED_ROLE_KEYS = Object.freeze([
  "owner",
  "admin",
  "ops",
  "manager",
  "regional_lead",
  "school_director",
] as const);

export type QaOrgKey = keyof typeof QA_ORGS;

export function isForbiddenQaOrgId(orgId: string): boolean {
  return (FORBIDDEN_QA_ORG_IDS as readonly string[]).includes(orgId);
}

export function isRegisteredQaOrgId(orgId: string): boolean {
  return Object.values(QA_ORGS).some((o) => o.id === orgId);
}

export function qaOrgById(orgId: string) {
  return Object.values(QA_ORGS).find((o) => o.id === orgId) ?? null;
}

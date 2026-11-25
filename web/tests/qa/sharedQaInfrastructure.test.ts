import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_QA_ORG_IDS,
  QA_AUTHZ_FIXTURE_PATHS,
  QA_AUTHZ_FIXTURE_SHA256,
  QA_AUTHZ_FIXTURE_UUID_PREFIX,
  QA_CENSUS_PATHS,
  QA_CENSUS_SHA256,
  QA_HOSTED_PROJECT_REF,
  QA_IDENTITIES,
  QA_ORGS,
  QA_PLAN_KEYS,
  QA_PRODUCTION_PROJECT_REF,
  QA_STRUCTURE,
  RESERVED_ROLE_KEYS,
  SEEDED_ASSIGNABLE_ROLES,
  isForbiddenQaOrgId,
  isRegisteredQaOrgId,
} from "@/lib/qa/sharedQaRegistry";
import {
  auditQaAuthzFixtureSql,
  refuseForbiddenOrg,
  refuseProductionProject,
  refuseQaOrgOutbound,
  requireQaRunId,
} from "@/lib/qa/sharedQaSafety";

const ROOT = join(__dirname, "../../..");
const WEB = join(ROOT, "web");
const ENSURE_RUNNER = join(WEB, "scripts/qaAuthzFixtureEnsure.mjs");
const RESET_RUNNER = join(WEB, "scripts/qaAuthzFixtureReset.mjs");
const TENANT_RUNNER = join(WEB, "scripts/ensureSharedQaTenant.ts");
const TSX = join(WEB, "node_modules/tsx/dist/cli.mjs");

const FIREFLY = FORBIDDEN_QA_ORG_IDS[0];
const QA_SHARED = QA_ORGS.qa_shared.id;
const PIN_ENSURE = QA_AUTHZ_FIXTURE_SHA256.ensure;
const PIN_RESET = QA_AUTHZ_FIXTURE_SHA256.reset;

function runNode(script: string, env: Record<string, string | undefined>) {
  const childEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "test",
  };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete childEnv[k];
    else childEnv[k] = v;
  }
  // Strip inherited DB/credentials so refusals cannot reach a real database.
  for (const k of [
    "DATABASE_URL",
    "DIRECT_DATABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL",
  ]) {
    delete childEnv[k];
  }
  const out = spawnSync(process.execPath, [script], {
    cwd: WEB,
    env: childEnv,
    encoding: "utf8",
    timeout: 30_000,
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse((out.stdout || "").trim().split("\n").pop() || "");
  } catch {
    json = null;
  }
  return { status: out.status, stdout: out.stdout ?? "", stderr: out.stderr ?? "", json };
}

function runTsx(script: string, env: Record<string, string | undefined>) {
  const childEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "test",
  };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete childEnv[k];
    else childEnv[k] = v;
  }
  for (const k of [
    "DATABASE_URL",
    "DIRECT_DATABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL",
    "CERT_QA_ENSURE_APPLY",
    "DRY_RUN",
  ]) {
    if (!(k in env)) delete childEnv[k];
  }
  const out = spawnSync(process.execPath, [TSX, "--tsconfig", "tsconfig.json", script], {
    cwd: WEB,
    env: childEnv,
    encoding: "utf8",
    timeout: 30_000,
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse((out.stdout || "").trim().split("\n").pop() || "");
  } catch {
    json = null;
  }
  return { status: out.status, stdout: out.stdout ?? "", stderr: out.stderr ?? "", json };
}

describe("shared QA B2 registry — B1 identity parity", () => {
  it("freezes the B1 organization ids and names", () => {
    expect(QA_ORGS.qa_shared.id).toBe("4acc9386-c485-486f-aa1f-05d83499d142");
    expect(QA_ORGS.qa_shared.name).toBe("ZZ Alloy QA");
    expect(QA_ORGS.qa_shared.slug).toBe("zz-alloy-qa");
    expect(QA_ORGS.qa_secondary.id).toBe("ad53fee2-2570-460f-9300-f0e106c473b6");
    expect(QA_ORGS.qa_secondary.name).toBe("ZZ Alloy QA — Cross-Org");
    expect(FORBIDDEN_QA_ORG_IDS).toContain("93667019-bd28-49b5-a688-acc9bb1e0a19");
    expect(QA_HOSTED_PROJECT_REF).toBe("ikaxilmwmrmbagoidedu");
    expect(QA_PRODUCTION_PROJECT_REF).toBe("vslwnntzzgpnmrpjipat");
  });

  it("freezes structure ids used by authz_q1 and bp_v2 scope", () => {
    expect(QA_STRUCTURE.departments.qa_d1.id).toBe("0704e72c-f73d-44b2-87d9-89924e222464");
    expect(QA_STRUCTURE.departments.qa_d2.id).toBe("609d088b-0446-4a7f-b529-f971fb5d73c8");
    expect(QA_STRUCTURE.sites.qa_north.id).toBe("21c9be10-f6e9-4048-ab4c-939ddbe0f0b7");
    expect(QA_STRUCTURE.sites.qa_south.id).toBe("cfb73302-3bbe-49db-b173-876fda776a6d");
    expect(QA_STRUCTURE.sites.qa_secondary_site.id).toBe("4f89f324-dbc5-4815-8431-38ffec891398");
    expect(QA_STRUCTURE.sites.qa_secondary_site.org).toBe("qa_secondary");
    expect(Object.values(QA_STRUCTURE.sites).filter((s) => s.org === "qa_secondary")).toHaveLength(1);
  });

  it("mirrors B1 identity emails and plan keys", () => {
    expect(Object.keys(QA_IDENTITIES).sort()).toEqual([
      "qa_pool_01",
      "qa_pool_02",
      "qa_pool_03",
      "qa_pool_04",
      "qa_pool_05",
      "qa_secondary_admin",
      "qa_shared_actor",
    ]);
    expect(QA_IDENTITIES.qa_shared_actor.email).toBe("qa-shared-actor@example.com");
    expect(QA_IDENTITIES.qa_secondary_admin.email).toBe("qa-secondary-admin@example.com");
    expect([...QA_PLAN_KEYS]).toEqual(["authz_q1", "bp_v2"]);
    expect([...SEEDED_ASSIGNABLE_ROLES]).toEqual(["admin", "ops", "school_director"]);
    expect(RESERVED_ROLE_KEYS).toContain("owner");
    expect(RESERVED_ROLE_KEYS).toContain("admin");
  });
});

/**
 * ALY-14 E3 owner decision (a), 2026-11-25: Firefly is the staging org of the three managed slot
 * identities only. The shared-QA plans keep their ZZ Alloy QA tenant and keep refusing Firefly by id;
 * only the registry comment and personas §2 changed.
 */
describe("shared QA registry — Firefly fence under E3 decision (a)", () => {
  const MANAGED_SLOT_LOGINS = [
    "qa-slot1-product@example.com",
    "qa-slot5-refactor@example.com",
    "qa-slot12-work-items@example.com",
  ];

  it("keeps Firefly forbidden and unregistered for every shared-QA plan", () => {
    expect([...FORBIDDEN_QA_ORG_IDS]).toEqual(["93667019-bd28-49b5-a688-acc9bb1e0a19"]);
    expect(isForbiddenQaOrgId(FIREFLY)).toBe(true);
    expect(isRegisteredQaOrgId(FIREFLY)).toBe(false);
    const refusal = refuseForbiddenOrg(FIREFLY);
    expect(refusal.ok).toBe(false);
    expect(refusal.ok ? null : refusal.code).toBe("firefly_refused");
    expect(Object.values(QA_ORGS).map((o) => o.id)).not.toContain(FIREFLY);
  });

  it("keeps ZZ Alloy QA as the only shared-QA plan tenant", () => {
    expect(Object.values(QA_ORGS).map((o) => o.name)).toEqual(["ZZ Alloy QA", "ZZ Alloy QA — Cross-Org"]);
    for (const org of Object.values(QA_ORGS)) {
      expect(isRegisteredQaOrgId(org.id)).toBe(true);
      expect(isForbiddenQaOrgId(org.id)).toBe(false);
    }
    const orgKeys = new Set(Object.keys(QA_ORGS));
    for (const identity of Object.values(QA_IDENTITIES)) expect(orgKeys.has(identity.org)).toBe(true);
    for (const structure of [...Object.values(QA_STRUCTURE.departments), ...Object.values(QA_STRUCTURE.sites)]) {
      expect(orgKeys.has(structure.org)).toBe(true);
    }
  });

  it("does not register the managed slot logins as shared-QA identities", () => {
    const emails = Object.values(QA_IDENTITIES).map((i) => i.email);
    for (const login of MANAGED_SLOT_LOGINS) expect(emails).not.toContain(login);
  });

  it("narrows only the registry comment, and personas §2 names the slot-identity exception", () => {
    const registry = readFileSync(join(WEB, "lib/qa/sharedQaRegistry.ts"), "utf8");
    expect(registry).toContain("never a shared-QA plan target; the managed slot");
    expect(registry).toContain("identities' staging org");
    expect(registry).not.toMatch(/Firefly[^\n]*never a QA target\. \*\//);
    const personas = readFileSync(join(ROOT, "docs/platform/governance/authorization-qa-personas.md"), "utf8");
    const section2 = personas.slice(personas.indexOf("## 2. Tenancy"), personas.indexOf("## 3."));
    expect(section2).toContain("**Never a QA target:** Firefly (`93667019-bd28-49b5-a688-acc9bb1e0a19`)");
    const exception = section2.split("\n").filter((line) => line.includes("Slot-identity exception"));
    expect(exception).toHaveLength(1);
    for (const login of ["qa-slot1-product", "qa-slot5-refactor", "qa-slot12-work-items@example.com"]) {
      expect(exception[0]).toContain(login);
    }
    expect(exception[0]).toContain("ZZ Alloy QA");
  });
});

/**
 * ALY-14 E4: ZZ Alloy QA stays the tenant of the existing cross-organization and permission fixtures,
 * and no fixture introduces another tenant. Every UUID a fixture names is a registered QA org, a
 * registered QA structure id, a fixture-namespace row id (`xx000000-`) or a listed non-org id.
 */
describe("shared QA fixtures — ZZ Alloy QA is the only fixture tenant (E4)", () => {
  const QA_FIXTURE_FILES = readdirSync(join(ROOT, "certification/fixtures"))
    .filter((f) => /^qa-.*\.sql$/.test(f))
    .map((f) => `certification/fixtures/${f}`);
  const CROSS_ORG_INVARIANTS = [
    "certification/invariants/documents-d9-hosted-fixture.sql",
    "certification/invariants/documents-q1-g1-subject-fixtures.sql",
    "certification/invariants/documents-r5-shared-child-fixture.sql",
    "certification/invariants/documents-d6-requirements.sql",
  ];
  /* Prior Documents form ids the forms-residue reset removes; forms, not organizations. */
  const NON_ORG_IDS = new Set([
    "01c4bf36-39ea-4ab8-8966-8fd850e381fe",
    "6a565dc9-fab7-4220-ada2-3d7b55036f26",
    "6f2e664b-97a2-464b-b3ac-405c7810bbcb",
    "7e36208b-5250-407c-bb90-31e80adfc277",
    "8dd68ff9-fad9-49c1-8bda-e998571faddf",
  ]);
  const KNOWN_IDS = new Set<string>([
    ...Object.values(QA_ORGS).map((o) => o.id),
    ...Object.values(QA_STRUCTURE.departments).map((d) => d.id),
    ...Object.values(QA_STRUCTURE.sites).map((s) => s.id),
  ]);
  const uuids = (sql: string) =>
    [...new Set(sql.toLowerCase().match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [])];

  it("finds the existing permission and cross-org fixtures", () => {
    expect(QA_FIXTURE_FILES).toEqual(
      expect.arrayContaining([QA_AUTHZ_FIXTURE_PATHS.ensure, QA_AUTHZ_FIXTURE_PATHS.reset]),
    );
    expect(QA_FIXTURE_FILES).toContain("certification/fixtures/qa-authz-subjects-ensure.sql");
  });

  for (const file of [...QA_FIXTURE_FILES, ...CROSS_ORG_INVARIANTS]) {
    it(`${file}: names only ZZ Alloy QA ids, never Firefly, and creates no organization`, () => {
      const sql = readFileSync(join(ROOT, file), "utf8");
      const ids = uuids(sql);
      expect(ids).toContain(QA_SHARED);
      expect(ids).not.toContain(FIREFLY);
      const unknown = ids.filter((id) => !KNOWN_IDS.has(id) && !NON_ORG_IDS.has(id) && !/^[0-9a-f]{2}000000-/.test(id));
      expect(unknown).toEqual([]);
      expect(sql).not.toMatch(/insert\s+into\s+(public\.)?organizations\b/i);
    });
  }

  it("the cross-org and permission fixtures target ZZ Alloy QA — Cross-Org as the second tenant", () => {
    for (const file of [...CROSS_ORG_INVARIANTS, QA_AUTHZ_FIXTURE_PATHS.ensure, "certification/fixtures/qa-authz-subjects-ensure.sql"]) {
      expect(uuids(readFileSync(join(ROOT, file), "utf8"))).toContain(QA_ORGS.qa_secondary.id);
    }
  });
});

describe("shared QA B2 safety refusals (library)", () => {
  it("refuses production and wrong staging project", () => {
    expect(refuseProductionProject(QA_PRODUCTION_PROJECT_REF).ok).toBe(false);
    expect(refuseProductionProject("not-staging").ok).toBe(false);
    expect(refuseProductionProject(QA_HOSTED_PROJECT_REF).ok).toBe(true);
  });

  it("refuses Firefly and unregistered organizations", () => {
    expect(refuseForbiddenOrg(FIREFLY).ok).toBe(false);
    expect(refuseForbiddenOrg("00000000-0000-4000-8000-000000000099").ok).toBe(false);
    expect(refuseForbiddenOrg(QA_SHARED).ok).toBe(true);
    expect(refuseForbiddenOrg(QA_ORGS.qa_secondary.id).ok).toBe(true);
  });

  it("requires a registered qa run id", () => {
    expect(requireQaRunId(null).ok).toBe(false);
    expect(requireQaRunId("run_123").ok).toBe(false);
    expect(requireQaRunId("qar_abcd1234").ok).toBe(true);
  });
});

describe("shared QA B2 fixture SQL safety + hashes", () => {
  it("audits ensure and reset fixtures as safe", () => {
    for (const rel of Object.values(QA_AUTHZ_FIXTURE_PATHS)) {
      const sql = readFileSync(join(ROOT, rel), "utf8");
      const audit = auditQaAuthzFixtureSql(sql);
      expect(audit.failures, `${rel}: ${audit.failures.join("; ")}`).toEqual([]);
      expect(audit.ok).toBe(true);
      expect(sql).toContain(QA_AUTHZ_FIXTURE_UUID_PREFIX);
      expect(sql.toLowerCase()).not.toContain(FIREFLY.toLowerCase());
      expect(sql).not.toContain(QA_PRODUCTION_PROJECT_REF);
    }
  });

  it("pins exact fixture content hashes for toolkit reconciliation", () => {
    for (const [key, rel] of Object.entries(QA_AUTHZ_FIXTURE_PATHS)) {
      const bytes = readFileSync(join(ROOT, rel));
      const hash = createHash("sha256").update(bytes).digest("hex");
      expect(hash).toBe(QA_AUTHZ_FIXTURE_SHA256[key as keyof typeof QA_AUTHZ_FIXTURE_SHA256]);
    }
  });

  it("pins census content hashes and distinguishes retained artifacts", () => {
    for (const [key, rel] of Object.entries(QA_CENSUS_PATHS)) {
      const bytes = readFileSync(join(ROOT, rel));
      const hash = createHash("sha256").update(bytes).digest("hex");
      expect(hash).toBe(QA_CENSUS_SHA256[key as keyof typeof QA_CENSUS_SHA256]);
    }
    const docs = readFileSync(join(ROOT, QA_CENSUS_PATHS.documents_zero_residue), "utf8");
    expect(docs).toMatch(/retained_by_design/);
    expect(docs).toMatch(/mutation_events/);
    expect(docs).toMatch(/doc_zr_vendors[\s\S]*zero/);
    expect(docs).toMatch(/doc_zr_pool_access/);
    expect(docs).toMatch(/doc_zr_zero_sent/);
    expect(docs).toMatch(/qa-shared-actor@example\.com/);
    expect(docs).toMatch(/qa-secondary-admin@example\.com/);
    expect(docs).toMatch(/status = 'sent'/);
    const bp = readFileSync(join(ROOT, QA_CENSUS_PATHS.bp_quiesced_retained), "utf8");
    expect(bp).toMatch(/quiesced_retained/);
    expect(bp).toMatch(/posted financial records/);
    expect(bp).toMatch(/configuration_publications/);
    expect(bp).toMatch(/not_residue/);
    // Activation Safety: exclude only the frozen actor email — not every admin role.
    expect(bp).toMatch(/qa-shared-actor@example\.com/);
    expect(bp).not.toMatch(/ur\.role\s*<>\s*'admin'/);
    expect(bp).toMatch(/bp_qr_zero_sent/);
    expect(bp).toMatch(/status = 'sent'/);
    // Retained financial rows are reported as data, never asserted to zero.
    expect(bp).not.toMatch(/charges ~ zero/);
  });

  it("refuses QA outbound via refuseQaOrgOutbound (activation safety)", () => {
    expect(refuseQaOrgOutbound(QA_SHARED).ok).toBe(false);
    expect(refuseQaOrgOutbound(QA_ORGS.qa_secondary.id).ok).toBe(false);
    expect(refuseQaOrgOutbound(FIREFLY).ok).toBe(true);
  });

  it("refuses a fixture that deletes by organization alone", () => {
    const bad = `
\\if :{?org}
\\else
do $$ begin raise exception 'governed organization'; end $$;
\\endif
delete from public.vendors where org_id = :'org'::uuid;
`;
    const audit = auditQaAuthzFixtureSql(bad);
    expect(audit.ok).toBe(false);
    expect(audit.failures.some((f) => f.includes("unscoped") || f.includes("org-wide"))).toBe(true);
  });

  it("refuses a fixture that names Firefly or production", () => {
    const firefly = `
\\if :{?org}
\\else
do $$ begin raise exception 'governed organization'; end $$;
\\endif
delete from public.vendors where org_id = :'org'::uuid and id::text like 'aa000000-%';
select '${FIREFLY}'::uuid;
`;
    expect(auditQaAuthzFixtureSql(firefly).ok).toBe(false);
    const prod = `
\\if :{?org}
\\else
do $$ begin raise exception 'governed organization'; end $$;
\\endif
delete from public.vendors where org_id = :'org'::uuid and id::text like 'aa000000-%';
select '${QA_PRODUCTION_PROJECT_REF}';
`;
    expect(auditQaAuthzFixtureSql(prod).ok).toBe(false);
  });
});

describe("shared QA B2 ensure-shared-tenant — dry-run default", () => {
  it("emits a dry-run plan without credentials and never provisions", () => {
    const out = runTsx(TENANT_RUNNER, {});
    expect(out.status).toBe(0);
    expect(out.json?.ok).toBe(true);
    expect(out.json?.dry_run).toBe(true);
    expect(out.json?.reconciliation_key).toBe("ensure_shared_qa_tenant");
    const plan = out.json?.plan as Array<{ action: string; org_id: string }>;
    expect(plan.every((p) => p.action === "would_create")).toBe(true);
    expect(plan.map((p) => p.org_id).sort()).toEqual([QA_ORGS.qa_secondary.id, QA_SHARED].sort());
  });

  it("refuses apply against production even when armed", () => {
    const out = runTsx(TENANT_RUNNER, {
      CERT_QA_ENSURE_APPLY: "1",
      DRY_RUN: "0",
      SUPABASE_PROJECT_REF: QA_PRODUCTION_PROJECT_REF,
      SUPABASE_SERVICE_ROLE_KEY: "not-real",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    });
    expect(out.status).not.toBe(0);
    expect(out.json?.ok).toBe(false);
    expect(out.json?.code).toBe("production_refused");
  });

  it("refuses apply without an explicit staging project proof", () => {
    const out = runTsx(TENANT_RUNNER, {
      CERT_QA_ENSURE_APPLY: "1",
      DRY_RUN: "0",
      SUPABASE_SERVICE_ROLE_KEY: "not-real",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    });
    expect(out.status).not.toBe(0);
    expect(out.json?.code).toBe("project_ref_missing");
  });

  it("duplicate ensure is idempotent in the dry-run plan shape (would_create or already_present only)", () => {
    const a = runTsx(TENANT_RUNNER, {});
    const b = runTsx(TENANT_RUNNER, {});
    expect(a.json?.plan).toEqual(b.json?.plan);
    const actions = (a.json?.plan as Array<{ action: string }>).map((p) => p.action);
    expect(actions.every((x) => x === "would_create" || x === "already_present")).toBe(true);
  });
});

describe("shared QA B2 fixture runners — execution-boundary refusals", () => {
  const armed = {
    CERT_FIXTURE_APPLY: "1",
    DRY_RUN: "0",
    SUPABASE_PROJECT_REF: QA_HOSTED_PROJECT_REF,
    ORG_ID: QA_SHARED,
    QA_RUN_ID: "qar_testboundary01",
    FIXTURE_SHA256: PIN_ENSURE,
    ALLOY_CANONICAL_ROOT: ROOT,
  };

  it.each([
    ["ensure", ENSURE_RUNNER, PIN_ENSURE],
    ["reset", RESET_RUNNER, PIN_RESET],
  ] as const)("%s refuses when apply is not armed", (label, script, pin) => {
    const out = runNode(script, { ...armed, FIXTURE_SHA256: pin, CERT_FIXTURE_APPLY: undefined });
    expect(out.status).not.toBe(0);
    expect(out.json?.code).toBe("apply_not_armed");
  });

  it.each([
    ["ensure", ENSURE_RUNNER, PIN_ENSURE],
    ["reset", RESET_RUNNER, PIN_RESET],
  ] as const)("%s refuses production project", (_label, script, pin) => {
    const out = runNode(script, {
      ...armed,
      FIXTURE_SHA256: pin,
      SUPABASE_PROJECT_REF: QA_PRODUCTION_PROJECT_REF,
    });
    expect(out.status).not.toBe(0);
    expect(out.json?.code).toBe("production_refused");
  });

  it.each([
    ["ensure", ENSURE_RUNNER, PIN_ENSURE],
    ["reset", RESET_RUNNER, PIN_RESET],
  ] as const)("%s refuses wrong staging project", (_label, script, pin) => {
    const out = runNode(script, {
      ...armed,
      FIXTURE_SHA256: pin,
      SUPABASE_PROJECT_REF: "wrongprojectref000",
    });
    expect(out.status).not.toBe(0);
    expect(out.json?.code).toBe("wrong_staging_project");
  });

  it.each([
    ["ensure", ENSURE_RUNNER, PIN_ENSURE],
    ["reset", RESET_RUNNER, PIN_RESET],
  ] as const)("%s refuses Firefly organization", (_label, script, pin) => {
    const out = runNode(script, { ...armed, FIXTURE_SHA256: pin, ORG_ID: FIREFLY });
    expect(out.status).not.toBe(0);
    expect(out.json?.code).toBe("firefly_refused");
  });

  it.each([
    ["ensure", ENSURE_RUNNER, PIN_ENSURE],
    ["reset", RESET_RUNNER, PIN_RESET],
  ] as const)("%s refuses unregistered organization (cross-org write)", (_label, script, pin) => {
    const out = runNode(script, {
      ...armed,
      FIXTURE_SHA256: pin,
      ORG_ID: "00000000-0000-4000-8000-000000000099",
    });
    expect(out.status).not.toBe(0);
    expect(out.json?.code).toBe("unregistered_organization");
  });

  it.each([
    ["ensure", ENSURE_RUNNER, PIN_ENSURE],
    ["reset", RESET_RUNNER, PIN_RESET],
  ] as const)("%s refuses missing qa run id (cross-run write)", (_label, script, pin) => {
    const out = runNode(script, { ...armed, FIXTURE_SHA256: pin, QA_RUN_ID: undefined });
    expect(out.status).not.toBe(0);
    expect(out.json?.code).toBe("qa_run_id_required");
  });

  it.each([
    ["ensure", ENSURE_RUNNER, PIN_ENSURE],
    ["reset", RESET_RUNNER, PIN_RESET],
  ] as const)("%s refuses mismatched fixture hash", (_label, script, pin) => {
    const out = runNode(script, {
      ...armed,
      FIXTURE_SHA256: "0".repeat(64),
    });
    expect(out.status).not.toBe(0);
    expect(out.json?.code).toBe("fixture_content_mismatch");
    void pin;
  });

  it("ensure refuses before database contact when DATABASE_URL is absent", () => {
    const out = runNode(ENSURE_RUNNER, armed);
    expect(out.status).not.toBe(0);
    expect(out.json?.code).toBe("database_unreachable");
  });

  it("reset refuses before database contact when DATABASE_URL is absent (cleanup failure path)", () => {
    const out = runNode(RESET_RUNNER, { ...armed, FIXTURE_SHA256: PIN_RESET });
    expect(out.status).not.toBe(0);
    expect(out.json?.code).toBe("database_unreachable");
  });
});

describe("shared QA B2 package scripts + createOrg frozen id support", () => {
  it("registers the three npm runners", () => {
    const pkg = JSON.parse(readFileSync(join(WEB, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["dev:qa:ensure-shared-tenant"]).toContain("ensureSharedQaTenant.ts");
    expect(pkg.scripts["dev:qa:authz-fixture-ensure"]).toContain("qaAuthzFixtureEnsure.mjs");
    expect(pkg.scripts["dev:qa:authz-fixture-reset"]).toContain("qaAuthzFixtureReset.mjs");
  });

  it("createOrgAndAssignAdmin accepts optional frozen org_id and slug", () => {
    const src = readFileSync(join(WEB, "lib/dev/createOrgAndAssignAdmin.ts"), "utf8");
    expect(src).toMatch(/org_id\?:/);
    expect(src).toMatch(/slug\?:/);
    expect(src).toMatch(/insertRow\.id = requestedOrgId/);
  });

  it("ensureSharedQaTenant recovers missing admin and refuses foreign members", () => {
    const src = readFileSync(TENANT_RUNNER, "utf8");
    expect(src).toMatch(/createMembershipWithAccessProfile/);
    expect(src).toMatch(/foreign_members/);
    expect(src).toMatch(/recover_admin/);
    expect(src).toMatch(/would_recover_admin/);
    expect(src).toMatch(/classifyExistingOrg/);
  });
});

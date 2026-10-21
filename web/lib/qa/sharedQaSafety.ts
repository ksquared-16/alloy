/**
 * Shared QA B2 — execution-time refusals for Alloy-side runners.
 *
 * Callers never supply organization, fixture path, or production target.
 * Registered run ids gate every fixture mutation.
 */

import {
  FORBIDDEN_QA_ORG_IDS,
  QA_AUTHZ_FIXTURE_UUID_PREFIX,
  QA_HOSTED_PROJECT_REF,
  QA_ORGS,
  QA_PRODUCTION_PROJECT_REF,
  isForbiddenQaOrgId,
  isRegisteredQaOrgId,
} from "@/lib/qa/sharedQaRegistry";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QA_RUN_ID_RE = /^qar_[a-z0-9]{8,}$/i;

export type SafetyRefusal = { ok: false; code: string; detail: string };
export type SafetyOk = { ok: true };

export function refuseProductionProject(projectRef: string | null | undefined): SafetyRefusal | SafetyOk {
  const ref = String(projectRef || "").trim();
  if (!ref) return { ok: false, code: "project_ref_missing", detail: "backing project ref is required" };
  if (ref === QA_PRODUCTION_PROJECT_REF) {
    return { ok: false, code: "production_refused", detail: "production is unreachable for QA fixtures" };
  }
  if (ref !== QA_HOSTED_PROJECT_REF) {
    return { ok: false, code: "wrong_staging_project", detail: `expected ${QA_HOSTED_PROJECT_REF}, got ${ref}` };
  }
  return { ok: true };
}

export function refuseForbiddenOrg(orgId: string): SafetyRefusal | SafetyOk {
  if (!UUID_RE.test(orgId)) return { ok: false, code: "organization_malformed", detail: "org id is not a canonical uuid" };
  if (isForbiddenQaOrgId(orgId)) {
    return { ok: false, code: "firefly_refused", detail: `organization ${orgId} is Firefly and is never a QA target` };
  }
  if (!isRegisteredQaOrgId(orgId)) {
    return {
      ok: false,
      code: "unregistered_organization",
      detail: `organization ${orgId} is not QA Shared or QA Secondary`,
    };
  }
  return { ok: true };
}

export function requireQaRunId(qaRunId: string | null | undefined): SafetyRefusal | SafetyOk {
  const id = String(qaRunId || "").trim();
  if (!QA_RUN_ID_RE.test(id)) {
    return { ok: false, code: "qa_run_id_required", detail: "fixture mutations require a registered qar_… run id" };
  }
  return { ok: true };
}

/** Executable-text check: no literal Firefly or production project refs; org is runner-owned. */
export function auditQaAuthzFixtureSql(sql: string): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const executable = String(sql)
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

  if (/\\set\s+org\b/i.test(executable)) {
    failures.push("fixture assigns org; the runner must own the organization variable");
  }
  if (!/\\if\s+:\{\?org\}/i.test(executable) && !/\\if\s+:\{\?org_id\}/i.test(executable)) {
    // accept either :org or guarded probe style used by financials
    if (!/raise exception.*governed organization/i.test(executable)) {
      failures.push("fixture does not refuse an absent organization");
    }
  }
  for (const forbidden of FORBIDDEN_QA_ORG_IDS) {
    if (executable.toLowerCase().includes(forbidden.toLowerCase())) {
      failures.push(`fixture names forbidden organization ${forbidden}`);
    }
  }
  if (executable.includes(QA_PRODUCTION_PROJECT_REF)) {
    failures.push("fixture names the production project ref");
  }
  // Destructive statements must name fixture uuid prefix or qa_run_id, never org alone.
  const deletes = [...executable.matchAll(/delete\s+from\s+([a-z_][a-z0-9_]*)[\s\S]*?;/gi)];
  for (const m of deletes) {
    const text = m[0].replace(/\s+/g, " ");
    const scoped =
      text.includes(QA_AUTHZ_FIXTURE_UUID_PREFIX) ||
      /qa_run_id/i.test(text) ||
      /external_source/i.test(text) ||
      /:'vendor_/i.test(text);
    if (!scoped) failures.push(`org-wide or unscoped delete on ${m[1]}`);
  }
  return { ok: failures.length === 0, failures };
}

export function registeredQaOrgIds(): string[] {
  return Object.values(QA_ORGS).map((o) => o.id);
}

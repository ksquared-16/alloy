/**
 * B2 — ensure the frozen QA Shared and QA Secondary organizations (and structure).
 *
 * Uses createOrgAndAssignAdmin with frozen ids. Defaults to dry-run.
 * Hosted apply requires CERT_QA_ENSURE_APPLY=1 and DRY_RUN=0.
 *
 * B2 must NOT execute the apply path against staging — org creation is a separately
 * approved one-time action.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { createOrgAndAssignAdmin } from "@/lib/dev/createOrgAndAssignAdmin";
import {
  FORBIDDEN_QA_ORG_IDS,
  QA_HOSTED_PROJECT_REF,
  QA_ORGS,
  QA_PRODUCTION_PROJECT_REF,
  QA_STRUCTURE,
} from "@/lib/qa/sharedQaRegistry";
import { refuseProductionProject } from "@/lib/qa/sharedQaSafety";

loadEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });

const started = new Date();
const fail = (code: string, detail: string): never => {
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      code,
      detail,
      started_at: started.toISOString(),
      finished_at: new Date().toISOString(),
    })}\n`,
  );
  process.exit(1);
  throw new Error("unreachable");
};

type PlanStep = {
  key: string;
  action: "already_present" | "create" | "would_create";
  org_id: string;
  name?: string;
  slug?: string;
};

function registryWouldCreatePlan(): PlanStep[] {
  return Object.entries(QA_ORGS).map(([key, org]) => ({
    key,
    action: "would_create" as const,
    org_id: org.id,
    name: org.name,
    slug: org.slug,
  }));
}

async function main() {
  const apply = process.env.CERT_QA_ENSURE_APPLY === "1" && process.env.DRY_RUN === "0";
  const projectRef = String(
    process.env.SUPABASE_PROJECT_REF || process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || "",
  ).trim();

  for (const org of Object.values(QA_ORGS)) {
    if ((FORBIDDEN_QA_ORG_IDS as readonly string[]).includes(org.id)) fail("firefly_refused", org.id);
  }

  if (!apply) {
    // Dry-run never provisions. Registry plan is enough without credentials; a live probe is
    // optional when service-role credentials are present.
    let plan = registryWouldCreatePlan();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      if (projectRef) {
        const projectGate = refuseProductionProject(projectRef);
        if (!projectGate.ok) fail(projectGate.code, projectGate.detail);
      }
      const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      plan = [];
      for (const [orgKey, org] of Object.entries(QA_ORGS)) {
        const { data: existing, error } = await supabase.from("orgs").select("id,name,slug").eq("id", org.id).maybeSingle();
        if (error) fail("org_probe_failed", error.message);
        if (existing) {
          if ((existing as { name: string }).name !== org.name) {
            fail("org_identity_mismatch", `${org.id} is named ${JSON.stringify((existing as { name: string }).name)}`);
          }
          plan.push({ key: orgKey, action: "already_present", org_id: org.id });
        } else {
          plan.push({
            key: orgKey,
            action: "would_create",
            org_id: org.id,
            name: org.name,
            slug: org.slug,
          });
        }
      }
    }

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        dry_run: true,
        reconciliation_key: "ensure_shared_qa_tenant",
        plan,
        hosted_project_ref: QA_HOSTED_PROJECT_REF,
        production_project_ref: QA_PRODUCTION_PROJECT_REF,
        structure: {
          departments: Object.values(QA_STRUCTURE.departments).map((d) => ({ id: d.id, name: d.name })),
          sites: Object.values(QA_STRUCTURE.sites).map((s) => ({ id: s.id, name: s.name })),
        },
        note: "B2 ships this runner; do not apply against staging until the one-time org ensure is separately approved.",
        started_at: started.toISOString(),
        finished_at: new Date().toISOString(),
      })}\n`,
    );
    return;
  }

  if (!projectRef) fail("project_ref_missing", "apply requires SUPABASE_PROJECT_REF proving staging");
  const projectGate = refuseProductionProject(projectRef);
  if (!projectGate.ok) fail(projectGate.code, projectGate.detail);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) fail("credentials_missing", "service-role credentials are required (trusted host only)");

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const plan: PlanStep[] = [];
  for (const [orgKey, org] of Object.entries(QA_ORGS)) {
    const { data: existing, error } = await supabase.from("orgs").select("id,name,slug").eq("id", org.id).maybeSingle();
    if (error) fail("org_probe_failed", error.message);
    if (existing) {
      if ((existing as { name: string }).name !== org.name) {
        fail("org_identity_mismatch", `${org.id} is named ${JSON.stringify((existing as { name: string }).name)}`);
      }
      plan.push({ key: orgKey, action: "already_present", org_id: org.id });
    } else {
      plan.push({
        key: orgKey,
        action: "create",
        org_id: org.id,
        name: org.name,
        slug: org.slug,
      });
    }
  }

  const created: string[] = [];
  for (const step of plan) {
    if (step.action !== "create") continue;
    const org = QA_ORGS[step.key as keyof typeof QA_ORGS];
    const envKey = step.key === "qa_shared" ? "QA_SHARED_ACTOR_USER_ID" : "QA_SECONDARY_ACTOR_USER_ID";
    const adminUserId = String(process.env[envKey] || "").trim();
    if (!adminUserId) fail("actor_user_missing", `${envKey} is required to assign the permanent admin`);
    const result = await createOrgAndAssignAdmin(supabase, {
      name: org.name,
      slug: org.slug,
      org_id: org.id,
      industry_key: "childcare",
      admin_user_id: adminUserId,
    });
    if (!result.ok) fail("org_create_failed", `${step.key}: ${result.error}`);
    const createdOrgId = result.ok ? result.org_id : "";
    if (createdOrgId !== org.id) fail("org_id_mismatch", `created ${createdOrgId}, expected ${org.id}`);
    created.push(step.key);
  }

  const sharedId = QA_ORGS.qa_shared.id;
  for (const d of Object.values(QA_STRUCTURE.departments)) {
    const { data: row } = await supabase.from("departments").select("id,name").eq("id", d.id).maybeSingle();
    if (row) {
      if ((row as { name: string }).name !== d.name) fail("structure_identity_mismatch", `department ${d.id}`);
      continue;
    }
    const { error } = await supabase.from("departments").insert({
      id: d.id,
      org_id: sharedId,
      key: d.dept_key,
      name: d.name,
      is_active: true,
      sort_order: 0,
      metadata: { qa_structure: true },
    });
    if (error) fail("department_ensure_failed", error.message);
  }
  for (const s of Object.values(QA_STRUCTURE.sites)) {
    const { data: row } = await supabase.from("locations").select("id,label,org_id").eq("id", s.id).maybeSingle();
    if (row) {
      if ((row as { org_id: string }).org_id !== sharedId) fail("structure_identity_mismatch", `site ${s.id} wrong org`);
      continue;
    }
    const { error } = await supabase.from("locations").insert({
      id: s.id,
      org_id: sharedId,
      label: s.name,
      location_type: "site",
      is_active: true,
      external_source: "alloy_qa_structure",
      metadata: { qa_structure: true },
    });
    if (error) fail("site_ensure_failed", error.message);
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      dry_run: false,
      reconciliation_key: "ensure_shared_qa_tenant",
      created,
      plan,
      started_at: started.toISOString(),
      finished_at: new Date().toISOString(),
    })}\n`,
  );
}

main().catch((e) => fail("ensure_crashed", String(e?.message || e).slice(0, 240)));

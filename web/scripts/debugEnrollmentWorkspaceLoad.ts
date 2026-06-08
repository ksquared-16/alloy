#!/usr/bin/env npx tsx
/**
 * Debug trace: AdminV2 Enrollment department/work-unit loading.
 *
 * Prints:
 * 1) Org row
 * 2) All departments for org
 * 3) Enrollment department row
 * 4) All work units for Enrollment department
 * 5) Any work units with key enrollment_pipeline across ALL orgs
 * 6) QueueDefinition summary for each enrollment_pipeline
 * 7) Count of opportunities by org_id/work_unit_id/status_key for enroll_demo_% seed data
 * 8) QueueService summaries for the expected work unit
 * 9) QueueService items for specific queue keys
 *
 * Env:
 *   DEV_QUEUE_ORG_ID=... (required)
 *   DEV_QUEUE_DEPT_ID=... (optional)
 *   DEV_QUEUE_WORK_UNIT_ID=... (optional)
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getWorkUnitQueueItems, getWorkUnitQueueSummaries } from "@/lib/queues/QueueService";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const EXPECTED_ORG_ID_DEFAULT = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const EXPECTED_DEPT_ID_DEFAULT = "04958a78-32ca-4091-bcd3-4bbaef3fee4b";
const EXPECTED_WORK_UNIT_ID_DEFAULT = "5ba90557-876d-4450-9c28-36beac6e83be";
const EXPECTED_WORK_UNIT_KEY = "enrollment_pipeline";

const EXPECTED_QUEUE_KEYS = [
  "all",
  "new_inquiries",
  "contacted_touring",
  "post_tour_followup",
  "paperwork",
  "ready_to_enroll",
  "enrolled_starting",
  "needs_attention",
] as const;

function line() {
  console.log("=".repeat(90));
}

function pass(label: string, detail?: unknown) {
  console.log(`PASS: ${label}`);
  if (detail != null) console.log(detail);
}

function fail(label: string, detail?: unknown) {
  console.log(`FAIL: ${label}`);
  if (detail != null) console.log(detail);
}

function warn(label: string, detail?: unknown) {
  console.log(`WARN: ${label}`);
  if (detail != null) console.log(detail);
}

function qdSummary(qd: unknown): Record<string, unknown> {
  if (!qd || typeof qd !== "object") return { version: null, note: "null_or_non_object" };
  const v = (qd as any).version;
  const entity_type = (qd as any).entity_type;
  const queues = Array.isArray((qd as any).queues) ? (qd as any).queues : null;
  return {
    version: typeof v === "number" ? v : null,
    entity_type: typeof entity_type === "string" ? entity_type : null,
    queues:
      queues?.map((q: any) => ({
        key: q?.key,
        label: q?.label,
        priority: q?.priority,
      })) ?? null,
  };
}

type OpportunitySeedRow = {
  id: string;
  org_id: string | null;
  work_unit_id: string | null;
  status_key: string | null;
  metadata: any;
};

async function main() {
  const orgId = (process.env.DEV_QUEUE_ORG_ID ?? EXPECTED_ORG_ID_DEFAULT).trim();
  const deptId = (process.env.DEV_QUEUE_DEPT_ID ?? EXPECTED_DEPT_ID_DEFAULT).trim();
  const workUnitId = (process.env.DEV_QUEUE_WORK_UNIT_ID ?? EXPECTED_WORK_UNIT_ID_DEFAULT).trim();

  if (!orgId) {
    console.error("Set DEV_QUEUE_ORG_ID to the target org UUID.");
    process.exit(1);
  }

  const supabase = createAdminClient();

  line();
  console.log("Enrollment workspace debug trace");
  console.log({ orgId, deptId, workUnitId, expectedWorkUnitKey: EXPECTED_WORK_UNIT_KEY });
  line();

  // 1) org row
  const { data: orgRow, error: orgErr } = await supabase
    .from("orgs")
    .select("id, name, slug, industry_id, created_at")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr || !orgRow) fail("Org row load", orgErr?.message ?? "not found");
  else pass("Org row load", orgRow);

  // 2) all departments for org
  line();
  const { data: deptRows, error: deptsErr } = await supabase
    .from("departments")
    .select("id, org_id, key, name, sort_order, is_active")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (deptsErr) fail("Departments list", deptsErr.message);
  else pass(`Departments list (${(deptRows ?? []).length})`, deptRows);

  // 3) Enrollment dept row
  line();
  const enrollmentDept =
    (deptRows ?? []).find((d) => d.id === deptId) ??
    (deptRows ?? []).find((d) => String(d.key ?? "").trim().toLowerCase() === "enrollment") ??
    null;
  if (!enrollmentDept) {
    fail("Enrollment department resolve", { requestedDeptId: deptId, foundKeys: (deptRows ?? []).map((d) => d.key) });
  } else {
    pass("Enrollment department resolve", enrollmentDept);
  }

  // 4) work units for enrollment dept
  line();
  const resolvedDeptId = enrollmentDept?.id ?? deptId;
  const { data: deptWus, error: deptWusErr } = await supabase
    .from("work_units")
    .select("id, org_id, department_id, key, name, is_active, sort_order, queue_definition, updated_at")
    .eq("org_id", orgId)
    .eq("department_id", resolvedDeptId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (deptWusErr) fail("Work units for enrollment department", deptWusErr.message);
  else pass(`Work units for enrollment department (${(deptWus ?? []).length})`, deptWus?.map((w) => ({ ...w, queue_definition: qdSummary(w.queue_definition) })));

  const expectedWuInDept = (deptWus ?? []).find(
    (w) => String(w.id) === workUnitId || String(w.key ?? "").trim().toLowerCase() === EXPECTED_WORK_UNIT_KEY
  );
  if (!expectedWuInDept) {
    fail("Expected work unit present in enrollment department", {
      expectedWorkUnitId: workUnitId,
      expectedKey: EXPECTED_WORK_UNIT_KEY,
      deptWorkUnitIds: (deptWus ?? []).map((w) => w.id),
      deptWorkUnitKeys: (deptWus ?? []).map((w) => w.key),
    });
  } else {
    const qd = qdSummary(expectedWuInDept.queue_definition);
    if (qd.version === 1) pass("Expected work unit present in enrollment department (v1 queue_definition)", { ...expectedWuInDept, queue_definition: qd });
    else warn("Expected work unit present in enrollment department (NOT v1 queue_definition)", { ...expectedWuInDept, queue_definition: qd });
  }

  // 5) enrollment_pipeline across all orgs
  line();
  const { data: allEnrollmentPipelineWus, error: allEpErr } = await supabase
    .from("work_units")
    .select("id, org_id, department_id, key, name, queue_definition, updated_at")
    .eq("key", EXPECTED_WORK_UNIT_KEY)
    .order("updated_at", { ascending: false });
  if (allEpErr) fail("Query work_units where key=enrollment_pipeline (all orgs)", allEpErr.message);
  else pass(`work_units where key=enrollment_pipeline (all orgs) (${(allEnrollmentPipelineWus ?? []).length})`, allEnrollmentPipelineWus?.map((w) => ({ ...w, queue_definition: qdSummary(w.queue_definition) })));

  // 6) queue_definition summary for each enrollment_pipeline
  line();
  for (const w of allEnrollmentPipelineWus ?? []) {
    console.log(`QueueDefinition summary for enrollment_pipeline work_unit_id=${w.id} org_id=${w.org_id}`);
    console.log(JSON.stringify(qdSummary(w.queue_definition), null, 2));
  }

  // 7) opportunity counts for seed data
  line();
  const { data: seedOppRows, error: seedOppErr } = await supabase
    .from("opportunities")
    .select("id, org_id, work_unit_id, status_key, metadata")
    .like("metadata->>seed_key", "enroll_demo_%")
    .limit(2000);
  if (seedOppErr) {
    fail("Load seed opportunities (metadata.seed_key like enroll_demo_%)", seedOppErr.message);
  } else {
    pass(`Load seed opportunities (${(seedOppRows ?? []).length})`, (seedOppRows ?? []).slice(0, 5).map((r) => ({
      id: r.id,
      org_id: r.org_id,
      work_unit_id: (r as any).work_unit_id ?? null,
      status_key: r.status_key,
      seed_key: (r as any).metadata?.seed_key ?? null,
    })));
  }

  const seeds = (seedOppRows ?? []) as unknown as OpportunitySeedRow[];
  const byOrg = new Map<string, number>();
  const byWorkUnit = new Map<string, number>();
  const byStatus = new Map<string, number>();
  const byOrgWorkUnitStatus = new Map<string, number>();

  for (const r of seeds) {
    const o = r.org_id ?? "null_org";
    const wu = r.work_unit_id ?? "null_work_unit";
    const st = (r.status_key ?? "null_status").toLowerCase();
    byOrg.set(o, (byOrg.get(o) ?? 0) + 1);
    byWorkUnit.set(wu, (byWorkUnit.get(wu) ?? 0) + 1);
    byStatus.set(st, (byStatus.get(st) ?? 0) + 1);
    const k = `${o} | ${wu} | ${st}`;
    byOrgWorkUnitStatus.set(k, (byOrgWorkUnitStatus.get(k) ?? 0) + 1);
  }

  console.log("Seed opportunity counts by org_id:");
  console.log([...byOrg.entries()].sort((a, b) => b[1] - a[1]));
  console.log("Seed opportunity counts by work_unit_id:");
  console.log([...byWorkUnit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20));
  console.log("Seed opportunity counts by status_key:");
  console.log([...byStatus.entries()].sort((a, b) => b[1] - a[1]));
  console.log("Seed opportunity counts by org_id | work_unit_id | status_key:");
  console.log([...byOrgWorkUnitStatus.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50));

  const expectedSeedCount = seeds.filter((r) => r.org_id === orgId && r.work_unit_id === workUnitId).length;
  if (expectedSeedCount > 0) pass("Seed opportunities exist for expected org + expected work_unit_id", { expectedSeedCount });
  else fail("Seed opportunities exist for expected org + expected work_unit_id", { expectedSeedCount });

  // Total count for org+work unit (not just seed)
  const { count: totalOppCount, error: totalOppErr } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("work_unit_id", workUnitId);
  if (totalOppErr) warn("Total opportunities count for expected org+work unit", totalOppErr.message);
  else pass("Total opportunities count for expected org+work unit", { totalOppCount: totalOppCount ?? 0 });

  // 8) QueueService summaries (expected work unit)
  line();
  try {
    const { queues: summaries } = await getWorkUnitQueueSummaries({ orgId, workUnitId, limit: 3 });
    pass("QueueService summaries for expected work unit", summaries.map((s) => ({ key: s.key, label: s.label, count: s.count })));
  } catch (e) {
    fail("QueueService summaries for expected work unit", e instanceof Error ? e.message : String(e));
  }

  // 9) QueueService items for specified queue keys
  line();
  for (const queueKey of EXPECTED_QUEUE_KEYS) {
    try {
      const { result: items } = await getWorkUnitQueueItems({ orgId, workUnitId, queueKey, limit: 5, offset: 0 });
      pass(`QueueService items: ${queueKey}`, {
        total: items.total,
        limit: items.limit,
        sampleIds: (items.items ?? []).slice(0, 5).map((r: any) => r?.id ?? null),
      });
    } catch (e) {
      fail(`QueueService items: ${queueKey}`, e instanceof Error ? e.message : String(e));
    }
  }

  line();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


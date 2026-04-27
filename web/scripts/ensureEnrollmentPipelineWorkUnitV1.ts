#!/usr/bin/env npx tsx
/**
 * Dev/staging helper: ensure a dedicated Enrollment pipeline work unit exists and has
 * an opportunity QueueDefinition v1 applied.
 *
 * - Prefers an existing Enrollment-like department when present.
 * - If none found, reuses the department of an existing opportunity-like work unit (heuristic).
 *
 * Env:
 *   DEV_QUEUE_ORG_ID=... (required)
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const ENROLLMENT_PIPELINE_KEY = "enrollment_pipeline";

type StatusDefRow = { status_key: string | null; status_label: string | null; entity_type: string | null; is_active: boolean | null };

function pickPaperworkStatuses(statusKeys: string[]): string[] {
    // We only include this queue if there are explicit status keys for paperwork/application/contract/enrollment-in-progress.
    const needles = [
        "paperwork",
        "application",
        "apply",
        "applied",
        "contract",
        "enrollment_in_progress",
        "enrolling",
        "docs_pending",
        "forms_pending",
    ];
    const out: string[] = [];
    for (const k of statusKeys) {
        const s = k.toLowerCase();
        if (needles.some((n) => s.includes(n))) out.push(k);
    }
    return [...new Set(out)];
}

function buildEnrollmentQueueDefinitionV1(opts: { paperworkStatusKeys: string[] }) {
    const baseQueues: any[] = [
        {
            key: "all",
            label: "All enrollment records",
            description: "All enrollment opportunities.",
            filters: [],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 5,
            priority: "standard",
            display: "list",
        },
        {
            key: "new_contacted",
            label: "New & contacted",
            description: "New inquiries and contacted families.",
            filters: [{ type: "status", operator: "in", values: ["new", "contacted"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 5,
            priority: "standard",
            display: "list",
        },
        {
            key: "tours_in_progress",
            label: "Tours / qualified",
            description: "Qualified and scheduled enrollment opportunities.",
            filters: [{ type: "status", operator: "in", values: ["qualified", "scheduled"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 5,
            priority: "standard",
            display: "list",
        },
    ];

    if (opts.paperworkStatusKeys.length > 0) {
        baseQueues.push({
            key: "paperwork",
            label: "Enrollment paperwork",
            description: "Applications, contracts, and paperwork in progress.",
            filters: [{ type: "status", operator: "in", values: opts.paperworkStatusKeys }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 5,
            priority: "attention",
            display: "list",
        });
    }

    baseQueues.push(
        {
            key: "booked_enrolling",
            label: "Booked / enrolling",
            description: "Booked enrollment opportunities (in progress).",
            filters: [{ type: "status", operator: "in", values: ["booked"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 5,
            priority: "attention",
            display: "list",
        },
        {
            key: "closed",
            label: "Closed",
            description: "Closed enrollment opportunities (won or lost).",
            filters: [{ type: "status", operator: "in", values: ["won", "lost"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 5,
            priority: "standard",
            display: "list",
        },
        {
            key: "needs_attention",
            label: "Needs attention",
            description:
                "Enrollment records that need review. Intended exception categories: time_related, information_clarity, value_readiness.",
            filters: [{ type: "exception", operator: "exists" }],
            sort: [{ field: "updated_at", direction: "asc" }],
            limit: 5,
            priority: "critical",
            display: "list",
        }
    );

    return {
        version: 1,
        entity_type: "opportunity",
        queues: baseQueues,
    } as const;
}

function normalizeKey(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

type DepartmentRow = { id: string; key: string; name: string | null };
type WorkUnitRow = { id: string; department_id: string; key: string; name: string | null; queue_definition: unknown };

function looksEnrollmentishDepartment(d: DepartmentRow): boolean {
    const k = (d.key ?? "").trim().toLowerCase();
    const n = (d.name ?? "").trim().toLowerCase();
    return k === "enrollment" || n.includes("enrollment") || n.includes("growth");
}

function looksOpportunityWorkUnitKey(k: string): boolean {
    const s = k.trim().toLowerCase();
    return s.includes("lead") || s.includes("inquir") || s.includes("enroll") || s.includes("pipeline");
}

async function main() {
    const orgId = process.env.DEV_QUEUE_ORG_ID?.trim() || "";
    if (!orgId) {
        console.error("Set DEV_QUEUE_ORG_ID to the target org UUID.");
        process.exit(1);
    }

    const supabase = createAdminClient();
    const { data: statusDefs, error: sdErr } = await supabase
        .from("status_definitions")
        .select("entity_type, status_key, status_label, is_active")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
    if (sdErr) throw new Error(sdErr.message);

    const oppStatusKeys = (statusDefs ?? [])
        .map((r) => (r as StatusDefRow).status_key)
        .filter((k): k is string => typeof k === "string" && k.trim() !== "");
    const paperworkStatusKeys = pickPaperworkStatuses(oppStatusKeys);
    const enrollmentQueueDefinition = buildEnrollmentQueueDefinitionV1({ paperworkStatusKeys });
    const validated = validateQueueDefinition(enrollmentQueueDefinition);

    const [{ data: depts, error: deptErr }, { data: wus, error: wuErr }] = await Promise.all([
        supabase.from("departments").select("id, key, name").eq("org_id", orgId).order("sort_order", { ascending: true }),
        supabase
            .from("work_units")
            .select("id, department_id, key, name, queue_definition")
            .eq("org_id", orgId)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
    ]);
    if (deptErr) throw new Error(deptErr.message);
    if (wuErr) throw new Error(wuErr.message);

    const deptRows = (depts ?? []) as DepartmentRow[];
    const wuRows = (wus ?? []) as WorkUnitRow[];

    const deptById = new Map(deptRows.map((d) => [d.id, d]));

    const existingPipeline = wuRows.find((w) => w.key === ENROLLMENT_PIPELINE_KEY);

    // 1) Prefer explicit enrollment-like department
    let targetDeptId: string | null = deptRows.find(looksEnrollmentishDepartment)?.id ?? null;

    // 2) Else, find department containing an opportunity-like work unit (heuristic based on key or queue_definition entity_type)
    if (!targetDeptId) {
        for (const w of wuRows) {
            if (looksOpportunityWorkUnitKey(w.key)) {
                targetDeptId = w.department_id;
                break;
            }
            try {
                const parsed = validateQueueDefinition(w.queue_definition);
                if (parsed.entity_type === "opportunity") {
                    targetDeptId = w.department_id;
                    break;
                }
            } catch {
                // ignore invalid/unset
            }
        }
    }

    // 3) Final fallback: use department of any existing work unit (keeps script usable in sparse orgs)
    if (!targetDeptId) {
        targetDeptId = wuRows[0]?.department_id ?? null;
    }

    if (!targetDeptId) {
        console.error("No departments/work units found to attach enrollment_pipeline.");
        process.exit(1);
    }

    const dept = deptById.get(targetDeptId) ?? null;
    console.log("--- Enrollment candidates ---");
    console.log("Opportunity status keys (active):", oppStatusKeys.join(", ") || "—");
    console.log("Paperwork status keys chosen:", paperworkStatusKeys.join(", ") || "— (paperwork queue omitted)");
    console.log(
        "Enrollment-like departments:",
        deptRows.filter(looksEnrollmentishDepartment).map((d) => `${d.key} (${d.id})`).join(", ") || "—"
    );
    const wuCandidates = wuRows
        .filter((w) => looksOpportunityWorkUnitKey(w.key))
        .slice(0, 20)
        .map((w) => `${w.key} (${w.id})`);
    console.log("Work unit key candidates:", wuCandidates.join(", ") || "—");
    console.log("Selected department:", dept ? `${dept.key} (${dept.id})` : targetDeptId);

    let pipelineId = existingPipeline?.id ?? null;
    let pipelineKey = existingPipeline?.key ?? ENROLLMENT_PIPELINE_KEY;
    let pipelineName = existingPipeline?.name ?? "Enrollment pipeline";

    if (!pipelineId) {
        const now = new Date().toISOString();
        const { data: created, error } = await supabase
            .from("work_units")
            .insert({
                org_id: orgId,
                department_id: targetDeptId,
                key: normalizeKey(ENROLLMENT_PIPELINE_KEY),
                name: "Enrollment pipeline",
                description: "Full opportunity pipeline for enrollment staff (config-driven queues).",
                sort_order: 0,
                is_active: true,
                queue_definition: validated,
                metadata: {},
                updated_at: now,
            })
            .select("id, key, name")
            .single();
        if (error) throw new Error(error.message);
        pipelineId = (created as any).id as string;
        pipelineKey = (created as any).key as string;
        pipelineName = ((created as any).name as string | null) ?? pipelineName;
        console.log("Created work unit:", pipelineKey, pipelineId);
    } else {
        const { data: updated, error } = await supabase
            .from("work_units")
            .update({ queue_definition: validated, updated_at: new Date().toISOString() })
            .eq("id", pipelineId)
            .eq("org_id", orgId)
            .select("id, key, name")
            .single();
        if (error) throw new Error(error.message);
        pipelineKey = (updated as any).key as string;
        pipelineName = ((updated as any).name as string | null) ?? pipelineName;
        console.log("Updated work unit:", pipelineKey, pipelineId);
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
    console.log("\n--- Final target ---");
    console.log("org_id:      ", orgId);
    console.log("dept:        ", dept ? `${dept.key} — ${dept.name ?? "—"}` : targetDeptId);
    console.log("work_unit_id:", pipelineId);
    console.log("work_unit_key:", pipelineKey);
    console.log("work_unit_name:", pipelineName);
    console.log("queue_definition_applied:", JSON.stringify(validated, null, 2));
    console.log("\nManual smoke test:");
    console.log(`  ${baseUrl}/api/admin/work-units/${pipelineId}/queues`);
    console.log(`  ${baseUrl}/api/admin/queues/${pipelineId}/all`);
    console.log(`  ${baseUrl}/api/admin/queues/${pipelineId}/new_contacted`);
    console.log(`  ${baseUrl}/api/admin/queues/${pipelineId}/tours_in_progress`);
    if (paperworkStatusKeys.length > 0) {
        console.log(`  ${baseUrl}/api/admin/queues/${pipelineId}/paperwork`);
    }
    console.log(`  ${baseUrl}/api/admin/queues/${pipelineId}/ready_waitlist`);
    console.log(`  ${baseUrl}/api/admin/queues/${pipelineId}/needs_attention`);
}

main().catch((e) => {
    console.error(String((e as any)?.stack ?? e));
    process.exit(1);
});


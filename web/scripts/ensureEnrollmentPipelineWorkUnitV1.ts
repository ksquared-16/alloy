#!/usr/bin/env npx tsx
/**
 * Dev/staging helper: ensure a dedicated Enrollment pipeline work unit exists and has
 * the canonical opportunity QueueDefinition v1 (`CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1`).
 * Also seeds **department** `metadata.opportunity_attention_rules.needs_attention_buckets` from
 * `enrollmentNeedsAttentionBucketsSeed.ts` when that key is absent (childcare demo lenses — not platform defaults).
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
import {
    CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1,
    CANONICAL_ENROLLMENT_PIPELINE_STATUS_KEYS,
} from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import {
    CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED,
    CANONICAL_ENROLLMENT_READINESS_ATTENTION_PROJECTION_V1,
} from "@/lib/opportunities/enrollmentNeedsAttentionBucketsSeed";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const ENROLLMENT_PIPELINE_KEY = "enrollment_pipeline";

type StatusDefRow = {
    status_key: string | null;
    status_label: string | null;
    entity_type: string | null;
    is_active: boolean | null;
};

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

    const required = [...CANONICAL_ENROLLMENT_PIPELINE_STATUS_KEYS];
    const missing = required.filter((k) => !oppStatusKeys.includes(k));
    if (missing.length > 0) {
        console.error("Missing required opportunity status keys for canonical enrollment pipeline:");
        for (const k of missing) console.error(`- ${k}`);
        console.error("Active opportunity status keys found:");
        console.error(oppStatusKeys.join(", ") || "—");
        console.error("Refusing to apply queue_definition; fix status_definitions first.");
        process.exit(1);
    }

    const validated = CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1;

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

    let targetDeptId: string | null = deptRows.find(looksEnrollmentishDepartment)?.id ?? null;

    if (!targetDeptId) {
        for (const w of wuRows) {
            if (looksOpportunityWorkUnitKey(w.key)) {
                targetDeptId = w.department_id;
                break;
            }
        }
    }

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
                description:
                    "Canonical enrollment execution surface — lifecycle/status slices are queue pills here; Needs Attention is an operational overlay (same work unit).",
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

    /** Childcare enrollment demo: visible Needs Attention buckets live in department metadata (not platform defaults). */
    const { data: deptForMeta, error: deptMetaErr } = await supabase
        .from("departments")
        .select("id, metadata")
        .eq("id", targetDeptId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptMetaErr) throw new Error(deptMetaErr.message);
    const existingDeptMeta =
        deptForMeta?.metadata != null && typeof deptForMeta.metadata === "object" && !Array.isArray(deptForMeta.metadata)
            ? ({ ...(deptForMeta.metadata as Record<string, unknown>) } as Record<string, unknown>)
            : {};
    const prevRulesRaw = existingDeptMeta.opportunity_attention_rules;
    const prevRules =
        prevRulesRaw != null && typeof prevRulesRaw === "object" && !Array.isArray(prevRulesRaw)
            ? ({ ...(prevRulesRaw as Record<string, unknown>) } as Record<string, unknown>)
            : {};
    let deptMetaDirty = false;
    if (!Object.prototype.hasOwnProperty.call(prevRules, "needs_attention_buckets")) {
        prevRules.needs_attention_buckets = CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED.map((b) => ({
            key: b.key,
            label: b.label,
            description: b.description,
            enabled: b.enabled,
            order: b.order,
            priority: b.priority,
            icon: b.icon,
            reason_codes: [...b.reason_codes],
        }));
        deptMetaDirty = true;
        console.log("Seeding department needs_attention_buckets (childcare enrollment demo).");
    } else {
        console.log("Skipped needs_attention_buckets seed — key already present on department metadata.");
    }

    const prevProjectionRaw = prevRules.readiness_projection_v1;
    const prevProjection =
        prevProjectionRaw != null && typeof prevProjectionRaw === "object" && !Array.isArray(prevProjectionRaw)
            ? ({ ...(prevProjectionRaw as Record<string, unknown>) } as Record<string, unknown>)
            : null;
    if (!prevProjection) {
        prevRules.readiness_projection_v1 = { ...CANONICAL_ENROLLMENT_READINESS_ATTENTION_PROJECTION_V1 };
        deptMetaDirty = true;
        console.log("Seeding readiness_projection_v1 with queue bridge enabled.");
    } else {
        let projectionDirty = false;
        if (prevProjection.version !== 1) {
            prevProjection.version = 1;
            projectionDirty = true;
        }
        if (prevProjection.enabled !== true) {
            prevProjection.enabled = true;
            projectionDirty = true;
        }
        if (prevProjection.flag_missing_required !== true) {
            prevProjection.flag_missing_required = true;
            projectionDirty = true;
        }
        if (prevProjection.readiness_attention_bridge_v1 !== true) {
            prevProjection.readiness_attention_bridge_v1 = true;
            projectionDirty = true;
        }
        if (projectionDirty) {
            prevRules.readiness_projection_v1 = prevProjection;
            deptMetaDirty = true;
            console.log("Updated readiness_projection_v1 — readiness_attention_bridge_v1 enabled.");
        } else {
            console.log("readiness_projection_v1 already has queue bridge enabled.");
        }
    }

    if (deptMetaDirty) {
        existingDeptMeta.opportunity_attention_rules = prevRules;
        const { error: deptUpErr } = await supabase
            .from("departments")
            .update({
                metadata: existingDeptMeta,
                updated_at: new Date().toISOString(),
            })
            .eq("id", targetDeptId)
            .eq("org_id", orgId);
        if (deptUpErr) throw new Error(deptUpErr.message);
        console.log("Updated department opportunity_attention_rules on department:", targetDeptId);
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
    console.log(`  ${baseUrl}/api/admin/queues/${pipelineId}/new_inquiry`);
    console.log(`  ${baseUrl}/api/admin/queues/${pipelineId}/needs_attention`);
}

main().catch((e) => {
    console.error(String((e as any)?.stack ?? e));
    process.exit(1);
});

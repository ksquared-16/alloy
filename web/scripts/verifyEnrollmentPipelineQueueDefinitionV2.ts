#!/usr/bin/env npx tsx
/**
 * Verify enrollment convergence v2 config (Card 5).
 * Run after migrations 20260601100000–20260601140000.
 *
 * Env:
 *   DEV_QUEUE_ORG_ID=... (required)
 *
 * Exit 0 when all checks pass; exit 1 with diagnostics otherwise.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    ENROLLMENT_PIPELINE_V2_DOMAIN_KEYS,
    ENROLLMENT_PIPELINE_V2_QUEUE_ALIASES,
    RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
} from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    loadQueueDefinitionBundle,
    resolveQueueKeyFromDefinition,
} from "@/lib/config/queueDefinitionV2Runtime";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const OCM_REQUIRED_NEW = [
    "new_inquiry",
    "tour_requested",
    "tour_scheduled",
    "tour_completed",
    "offer_pending",
    "withdrawn",
] as const;

const OCM_RETAINED = ["waitlisted", "enrolling", "enrolled", "not_enrolling", "deferred", "interested"] as const;

const OPP_CASE_NEW = ["open", "closed", "inactive", "archived"] as const;

const LEGACY_WU_KEYS = ["pipeline_overview", "early_inquiries", "quoting", "priced_followup", "needs_attention"] as const;

type CheckResult = { ok: boolean; label: string; detail?: string };

function fail(results: CheckResult[], label: string, detail: string) {
    results.push({ ok: false, label, detail });
}

function pass(results: CheckResult[], label: string) {
    results.push({ ok: true, label });
}

async function main() {
    const orgId = process.env.DEV_QUEUE_ORG_ID?.trim() || "";
    if (!orgId) {
        console.error("Set DEV_QUEUE_ORG_ID to the target org UUID.");
        process.exit(1);
    }

    const supabase = createAdminClient();
    const results: CheckResult[] = [];

    const { data: ocmDefs, error: ocmErr } = await supabase
        .from("status_definitions")
        .select("status_key, is_active, metadata")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunity_customer_members");
    if (ocmErr) throw new Error(ocmErr.message);

    const ocmKeys = new Set((ocmDefs ?? []).map((r) => String(r.status_key ?? "")));
    for (const k of [...OCM_RETAINED, ...OCM_REQUIRED_NEW]) {
        if (ocmKeys.has(k)) pass(results, `OCM status exists: ${k}`);
        else fail(results, `OCM status exists: ${k}`, "missing");
    }

    const interested = (ocmDefs ?? []).find((r) => r.status_key === "interested");
    if (interested?.metadata && typeof interested.metadata === "object") {
        const alias = (interested.metadata as Record<string, unknown>).alias_of;
        if (alias === "new_inquiry") pass(results, "OCM interested aliased to new_inquiry");
        else fail(results, "OCM interested aliased to new_inquiry", `alias_of=${String(alias)}`);
    } else {
        fail(results, "OCM interested aliased to new_inquiry", "interested row or metadata missing");
    }

    const { data: oppDefs, error: oppErr } = await supabase
        .from("status_definitions")
        .select("status_key, is_active")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities");
    if (oppErr) throw new Error(oppErr.message);

    const oppKeys = new Set((oppDefs ?? []).map((r) => String(r.status_key ?? "")));
    for (const k of OPP_CASE_NEW) {
        if (oppKeys.has(k)) pass(results, `Opportunity case status exists: ${k}`);
        else fail(results, `Opportunity case status exists: ${k}`, "missing");
    }
    if (oppKeys.has("new_inquiry")) pass(results, "Legacy opportunity status retained: new_inquiry");
    else fail(results, "Legacy opportunity status retained: new_inquiry", "missing");

    const { data: enrollDept } = await supabase
        .from("departments")
        .select("id")
        .eq("org_id", orgId)
        .eq("key", "enrollment")
        .maybeSingle();

    if (!enrollDept?.id) {
        fail(results, "Enrollment department", "not found");
    } else {
        const { data: wu, error: wuErr } = await supabase
            .from("work_units")
            .select("id, key, is_active, queue_definition, metadata")
            .eq("org_id", orgId)
            .eq("department_id", enrollDept.id)
            .eq("key", "enrollment_pipeline")
            .maybeSingle();
        if (wuErr) throw new Error(wuErr.message);

        if (!wu) {
            fail(results, "enrollment_pipeline work unit", "missing");
        } else {
            const raw = wu.queue_definition;
            const version =
                raw != null && typeof raw === "object" && !Array.isArray(raw)
                    ? (raw as Record<string, unknown>).version
                    : null;
            if (version === 2) pass(results, "enrollment_pipeline queue_definition version 2");
            else fail(results, "enrollment_pipeline queue_definition version 2", `version=${String(version)}`);

            let bundle;
            try {
                bundle = loadQueueDefinitionBundle(raw);
                pass(results, "queue_definition loads via v2 runtime bundle");
            } catch (e) {
                fail(results, "queue_definition loads via v2 runtime bundle", String(e));
                bundle = null;
            }

            if (bundle) {
                const sectionKeys = new Set(
                    ENROLLMENT_PIPELINE_V2_DOMAIN_KEYS.map((k) => k)
                );
                for (const domain of ENROLLMENT_PIPELINE_V2_DOMAIN_KEYS) {
                    const hasQueue = bundle.normalized.queues.some((q) => q.domain === domain);
                    if (hasQueue || domain === "needs_attention") pass(results, `Domain queue present: ${domain}`);
                    else fail(results, `Domain queue present: ${domain}`, "no queue with domain");
                }
                void sectionKeys;

                for (const q of bundle.normalized.queues) {
                    const hasV2Only = (q.filters ?? []).some((f) => {
                        if (f == null || typeof f !== "object") return false;
                        const t = (f as { type?: string }).type;
                        return t === "child_lifecycle_status" || t === "candidate_status";
                    });
                    const rawQ =
                        q.raw != null && typeof q.raw === "object" && !Array.isArray(q.raw)
                            ? (q.raw as Record<string, unknown>)
                            : null;
                    const compat = rawQ?.filters_compat_v1;
                    if (hasV2Only && (!Array.isArray(compat) || compat.length === 0)) {
                        fail(
                            results,
                            `filters_compat_v1 on ${q.key}`,
                            "v2-only filters without compat"
                        );
                    } else if (hasV2Only) {
                        pass(results, `filters_compat_v1 on ${q.key}`);
                    }
                }

                for (const [alias, canonical] of Object.entries(ENROLLMENT_PIPELINE_V2_QUEUE_ALIASES)) {
                    const resolution = resolveQueueKeyFromDefinition(alias, bundle.normalized.queues);
                    if (resolution.resolvedKey === canonical && resolution.matchedBy === "alias") {
                        pass(results, `Alias resolves: ${alias} → ${canonical}`);
                    } else if (resolution.resolvedKey === alias && resolution.matchedBy === "exact") {
                        pass(results, `Alias resolves: ${alias} → ${canonical} (exact key)`);
                    } else {
                        fail(
                            results,
                            `Alias resolves: ${alias} → ${canonical}`,
                            `got ${resolution.resolvedKey} (${resolution.matchedBy})`
                        );
                    }
                }

                const coercedKeys = bundle.def.queues.map((q) => q.key).sort();
                const v1CompatKeys = [
                    "new_leads",
                    "communications_followup",
                    "tours",
                    "tours_follow_up",
                    "waitlist",
                    "enrollment_offers",
                    "enrollment_completed",
                    "case_closed",
                    "needs_attention",
                    "pipeline_total",
                    "forms_documents",
                ].sort();
                if (JSON.stringify(coercedKeys) === JSON.stringify(v1CompatKeys)) {
                    pass(results, "Coerced v1 execution queue keys");
                } else {
                    fail(
                        results,
                        "Coerced v1 execution queue keys",
                        `expected ${v1CompatKeys.join(",")} got ${coercedKeys.join(",")}`
                    );
                }
            }

            if (
                wu.metadata &&
                typeof wu.metadata === "object" &&
                (wu.metadata as Record<string, unknown>).queue_definition_rollback_v1 != null
            ) {
                pass(results, "queue_definition rollback snapshot in metadata");
            } else {
                fail(results, "queue_definition rollback snapshot in metadata", "missing (may be ok on fresh seed)");
            }
        }

        const { data: legacyWus, error: legErr } = await supabase
            .from("work_units")
            .select("key, is_active, metadata")
            .eq("org_id", orgId)
            .eq("department_id", enrollDept.id)
            .in("key", [...LEGACY_WU_KEYS]);
        if (legErr) throw new Error(legErr.message);

        for (const lk of LEGACY_WU_KEYS) {
            const row = (legacyWus ?? []).find((w) => w.key === lk);
            if (!row) {
                pass(results, `Legacy WU ${lk}: not present (skip)`);
                continue;
            }
            if (row.is_active === false) pass(results, `Legacy WU deprecated: ${lk}`);
            else fail(results, `Legacy WU deprecated: ${lk}`, "still active");
            const meta = row.metadata as Record<string, unknown> | null;
            if (meta?.deprecated === true && meta?.replacement_work_unit_key === "enrollment_pipeline") {
                pass(results, `Legacy WU metadata pointer: ${lk}`);
            } else if (row.is_active === false) {
                fail(results, `Legacy WU metadata pointer: ${lk}`, "missing replacement metadata");
            }
        }
    }

    const failed = results.filter((r) => !r.ok);
    console.log("\nEnrollment pipeline v2 verification\n");
    for (const r of results) {
        console.log(`${r.ok ? "✓" : "✗"} ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
    }
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    if (failed.length > 0) process.exit(1);
}

void main();

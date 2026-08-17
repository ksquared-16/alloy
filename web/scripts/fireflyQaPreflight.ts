/**
 * READ-ONLY preflight for the approved Firefly Enrollment QA configuration change.
 *
 * Re-proves every precondition immediately before any write, and — because publish applies D-97
 * normalization to the payload it stores — computes locally exactly what the published revision
 * would contain, so the change can be inspected before an immutable artifact exists.
 *
 * Writes nothing. Run with:
 *   npx tsx --tsconfig tsconfig.json scripts/fireflyQaPreflight.ts
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseLifecycleBuilderV1, serializeLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { normalizeBusinessProcessPayloadRequirements } from "@/lib/businessProcesses/configuration/normalizePublishedStageRequirements";
import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import { resolveProcessEntryStage } from "@/lib/lifecycle/processEntryStage";
import { businessProcessPayloadChecksum } from "@/lib/lifecycle/businessProcessPayloadChecksum";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413";
const FORM = "ee75732b-036d-4b3d-8f33-a87c21b78105";
const EXPECTED_CURRENT_REVISION = 12;

function env(): Record<string, string> {
    const text = readFileSync("/Users/Kelly/Alloy/web/.env.local", "utf8");
    return Object.fromEntries(
        text
            .split("\n")
            .filter((l) => l.trim() && !l.trim().startsWith("#"))
            .map((l) => {
                const i = l.indexOf("=");
                let v = l.slice(i + 1).trim();
                if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
                return [l.slice(0, i).trim(), v];
            }),
    );
}

const j = (v: unknown) => JSON.stringify(v);
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
    if (!ok) failures += 1;
    console.log(`${ok ? "  OK  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
    const e = env();
    const supabase = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });

    console.log("=== Preconditions ===");

    // 1. current published revision is still 12
    const { data: pub } = await supabase
        .from("configuration_publications")
        .select("revision_id, revision_number")
        .eq("org_id", ORG)
        .eq("domain_key", "business_process")
        .eq("subject_id", DEPT)
        .order("revision_number", { ascending: false })
        .limit(1)
        .maybeSingle();
    check(
        `current published revision is ${EXPECTED_CURRENT_REVISION}`,
        pub?.revision_number === EXPECTED_CURRENT_REVISION,
        `saw ${pub?.revision_number}`,
    );

    const { data: rev } = await supabase
        .from("business_process_revisions")
        .select("id, revision_number, payload")
        .eq("org_id", ORG)
        .eq("id", pub?.revision_id ?? "")
        .maybeSingle();
    const published = rev?.payload as Record<string, unknown> | undefined;
    check("published revision payload readable", Boolean(published));

    // 2. Form still exists with a published version
    const { data: form } = await supabase
        .from("form_definitions")
        .select("id, name, is_active")
        .eq("org_id", ORG)
        .eq("id", FORM)
        .maybeSingle();
    check("Form definition exists and is active", Boolean(form) && form?.is_active !== false, form?.name ?? "missing");

    const { data: versions } = await supabase
        .from("form_definition_versions")
        .select("id, version_number, status")
        .eq("org_id", ORG)
        .eq("form_definition_id", FORM)
        .eq("status", "published")
        .order("version_number", { ascending: false });
    check("Form has a published version", (versions ?? []).length > 0, j((versions ?? [])[0]));

    // 3. draft state — publish reads THIS, not departments.metadata
    const { data: draft } = await supabase
        .from("business_process_drafts")
        .select("id, draft_revision, draft_status, payload, base_revision_id, validation_errors, updated_at")
        .eq("org_id", ORG)
        .eq("department_id", DEPT)
        .maybeSingle();

    if (!draft) {
        console.log("  ..    no draft row exists — openDraft would seed it from the published projection");
    } else {
        check(
            "draft payload equals published revision (no unrelated edits)",
            j(draft.payload) === j(published),
            draft ? `draft_revision=${draft.draft_revision} status=${draft.draft_status} updated_at=${draft.updated_at}` : "",
        );
        check(
            "draft base_revision_id points at the current publication",
            draft.base_revision_id === pub?.revision_id,
            `${draft.base_revision_id}`,
        );
    }

    // 4. department metadata projection still equals the published payload
    const { data: dept } = await supabase
        .from("departments")
        .select("metadata")
        .eq("org_id", ORG)
        .eq("id", DEPT)
        .maybeSingle();
    const live = (dept?.metadata as Record<string, unknown> | undefined)?.lifecycle_builder_v1;
    check("guarded lifecycle_builder_v1 projection equals published payload", j(live) === j(published));

    console.log("\n=== What publishing would store ===");

    // Apply the two approved edits to the published payload.
    const builder = parseLifecycleBuilderV1(published)!;
    const process = builder.processes.find((p) => p.key === "enrollment")!;
    const edited = {
        ...builder,
        processes: builder.processes.map((p) =>
            p.key !== "enrollment"
                ? p
                : {
                      ...p,
                      entry_points_v1: {
                          version: 1 as const,
                          by_intent: { create_lead: "lead", enrollment_start: "enrolling" },
                      },
                      stages: p.stages.map((s) =>
                          s.key !== "enrolling"
                              ? s
                              : {
                                    ...s,
                                    requirements_v1: {
                                        version: 1 as const,
                                        requirements: [
                                            {
                                                requirement_id: "enrollment_stage_a_form",
                                                ref: { kind: "form" as const, form_definition_id: FORM },
                                                level: "required" as const,
                                            },
                                        ],
                                    },
                                },
                      ),
                  },
        ),
    };
    void process;

    const editedPayload = serializeLifecycleBuilderV1(edited);

    // Publish normalizes before storing (D-97). Compute it here so nothing is a surprise.
    const normalized = normalizeBusinessProcessPayloadRequirements({
        payload: editedPayload,
        departmentMetadata: dept?.metadata ?? null,
    });
    console.log(`  D-97 normalization changed the payload: ${normalized.changed}`);

    const finalPayload = normalized.payload as Record<string, unknown>;
    const finalProc = ((finalPayload.processes as Record<string, unknown>[]) ?? []).find(
        (p) => p.key === "enrollment",
    )!;
    const pubProc = ((published?.processes as Record<string, unknown>[]) ?? []).find(
        (p) => p.key === "enrollment",
    )!;

    console.log("\n  per-stage diff vs published revision 12:");
    for (const stage of (finalProc.stages as Record<string, unknown>[]) ?? []) {
        const before = ((pubProc.stages as Record<string, unknown>[]) ?? []).find((s) => s.key === stage.key);
        const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(stage)]);
        const changed = [...keys].filter((k) => j((before ?? {})[k]) !== j(stage[k]));
        console.log(
            `    ${String(stage.key).padEnd(10)} ${changed.length ? changed.join(", ") : "(unchanged)"}` +
                (changed.includes("requirements_v1")
                    ? `  -> ${j(stage.requirements_v1)}`.slice(0, 400)
                    : ""),
        );
    }

    const procKeys = new Set([...Object.keys(pubProc), ...Object.keys(finalProc)]);
    const procChanged = [...procKeys].filter(
        (k) => k !== "stages" && j(pubProc[k]) !== j(finalProc[k]),
    );
    console.log(`\n  process-level changed keys: ${procChanged.join(", ") || "(none)"}`);

    console.log("\n=== Publish validation of the edited payload ===");
    const validation = validateBusinessProcessForPublish(finalPayload);
    check("no blocking publish errors", validation.errors.length === 0, j(validation.errors.slice(0, 3)));
    console.log(`  warnings: ${validation.warnings.length}`);

    console.log("\n=== Entry intent resolution on the edited payload ===");
    const finalBuilder = parseLifecycleBuilderV1(finalPayload)!;
    const finalProcess = finalBuilder.processes.find((p) => p.key === "enrollment")!;
    const lead = resolveProcessEntryStage(finalProcess, "create_lead");
    const start = resolveProcessEntryStage(finalProcess, "enrollment_start");
    check("create_lead -> lead", lead.ok && lead.stageKey === "lead", j(lead));
    check("enrollment_start -> enrolling", start.ok && start.stageKey === "enrolling", j(start));

    const enrolling = finalProcess.stages.find((s) => s.key === "enrolling")!;
    const formReqs = (enrolling.requirements_v1?.requirements ?? []).filter((r) => r.ref.kind === "form");
    check("enrolling resolves exactly one Form requirement", formReqs.length === 1, j(formReqs));

    console.log(`\n  checksum publish would use: ${businessProcessPayloadChecksum(finalPayload)}`);
    console.log(`\n${failures === 0 ? "PREFLIGHT PASSED" : `PREFLIGHT FAILED (${failures})`}`);
    process.exitCode = failures === 0 ? 0 : 1;
}

void main();

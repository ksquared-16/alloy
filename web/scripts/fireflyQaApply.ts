/**
 * Apply the APPROVED Firefly Enrollment QA configuration change, through the canonical path.
 *
 * Canonical means: edit the DRAFT with `saveDraft`, validate it with the same gate the publish route
 * runs, record that validation, then `publishDraft` — the RPC that owns the CAS, the immutable
 * revision, the publication act, the audit event and the runtime projection in one transaction.
 * Nothing here writes a revision or a projection directly.
 *
 * Everything Firefly-specific is INPUT to this script, and none of it reaches runtime behaviour: the
 * stage keys, requirement id and Form id below are authored into Business Process configuration, and
 * the runtime reads them back through `entry_points_v1` and `requirements_v1` like any tenant's.
 *
 * Refuses to write unless every precondition still holds at the moment of writing.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/fireflyQaApply.ts          # preflight only
 *   npx tsx --tsconfig tsconfig.json scripts/fireflyQaApply.ts --write  # edit, validate, publish
 */

import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
    parseLifecycleBuilderV1,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    publishDraft,
    readDraft,
    recordDraftValidation,
    saveDraft,
} from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";
import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import { resolveProcessEntryStage } from "@/lib/lifecycle/processEntryStage";
import { resolveEffectiveStageRequirements } from "@/lib/lifecycle/effectiveStageRequirements";
import {
    materializeLegacyFieldRequirements,
    normalizeBusinessProcessPayloadRequirements,
} from "@/lib/businessProcesses/configuration/normalizePublishedStageRequirements";
import { serializeLifecycleBuilderV1, asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413";
const PROCESS_KEY = "enrollment";
const FORM_ID = "ee75732b-036d-4b3d-8f33-a87c21b78105";
const REQUIREMENT_ID = "enrollment_stage_a_form";
const ENTRY_POINTS = { create_lead: "lead", enrollment_start: "enrolling" } as const;
const REQUIREMENT_STAGE = "enrolling";
const EXPECTED_CURRENT_REVISION = 12;
const EXPECTED_NEW_REVISION = 13;

const WRITE = process.argv.includes("--write");
/**
 * Resume after a transient failure between the draft edit and the publish.
 *
 * The draft already carries the approved edits, so "draft equals the published revision" is
 * legitimately false and must not be asserted — instead the draft is proved to equal the EXPECTED
 * edited payload exactly, which is a stronger statement: it rules out any other edit having landed
 * in the window. The publish itself is unchanged and still CAS-guarded by the RPC.
 */
const PUBLISH_ONLY = process.argv.includes("--publish-only");

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

/**
 * A fetch that retries once on a dropped keep-alive socket.
 *
 * The hosted PostgREST closes pooled connections aggressively, and undici reuses one anyway: the
 * first small SELECT warms a socket, and the larger PATCH that follows lands on a socket the server
 * has already closed — surfacing as a bare `TypeError: fetch failed` with `UND_ERR_SOCKET: other
 * side closed` underneath, and no PostgREST detail at all. It failed twice at exactly the same
 * statement, which is what ruled out randomness.
 *
 * Retrying is safe for every request this script makes: the draft write is CAS-guarded on
 * `draft_revision`, so a duplicate cannot double-apply, and the publish RPC is CAS-guarded on the
 * base publication and reports `alreadyPublished` rather than cutting a second revision.
 */
const retryingFetch: typeof fetch = async (input, init) => {
    try {
        return await fetch(input, init);
    } catch (e) {
        const cause = (e as { cause?: { code?: string } }).cause;
        if (cause?.code !== "UND_ERR_SOCKET") throw e;
        console.log("    (retrying after a dropped keep-alive socket)");
        return await fetch(input, init);
    }
};

/**
 * Order-insensitive canonical form.
 *
 * `jsonb` reorders object keys on the way into Postgres, so comparing a stored payload byte-for-byte
 * against one serialized in memory compares key ORDER, not content — and would report a difference
 * where there is none. Arrays keep their order, because sequence is meaningful in this payload.
 */
function canon(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === "object") {
        return Object.fromEntries(
            Object.keys(v as object)
                .sort()
                .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
        );
    }
    return v;
}
const c = (v: unknown) => JSON.stringify(canon(v));
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
    if (!ok) failures += 1;
    console.log(`${ok ? "  OK  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
}

type Json = Record<string, unknown>;

function enrollmentProcess(payload: unknown): Json {
    const processes = (payload as Json)?.processes as Json[] | undefined;
    return (processes ?? []).find((p) => p.key === PROCESS_KEY)!;
}

function stageOf(payload: unknown, key: string): Json | undefined {
    return ((enrollmentProcess(payload)?.stages as Json[]) ?? []).find((s) => s.key === key);
}

/** The two approved edits, applied to a parsed builder. Nothing else is touched. */
function applyApprovedEdits(builder: LifecycleBuilderV1): LifecycleBuilderV1 {
    return {
        ...builder,
        processes: builder.processes.map((p) =>
            p.key !== PROCESS_KEY
                ? p
                : {
                      ...p,
                      entry_points_v1: { version: 1 as const, by_intent: { ...ENTRY_POINTS } },
                      stages: p.stages.map((s) =>
                          s.key !== REQUIREMENT_STAGE
                              ? s
                              : {
                                    ...s,
                                    requirements_v1: {
                                        version: 1 as const,
                                        requirements: [
                                            {
                                                requirement_id: REQUIREMENT_ID,
                                                ref: { kind: "form" as const, form_definition_id: FORM_ID },
                                                level: "required" as const,
                                            },
                                        ],
                                    },
                                },
                      ),
                  },
        ),
    };
}

async function currentPublication(supabase: SupabaseClient) {
    const { data } = await supabase
        .from("configuration_publications")
        .select("revision_id, revision_number")
        .eq("org_id", ORG)
        .eq("domain_key", "business_process")
        .eq("subject_id", DEPT)
        .order("revision_number", { ascending: false })
        .limit(1)
        .maybeSingle();
    return data as { revision_id: string; revision_number: number } | null;
}

async function revisionPayload(supabase: SupabaseClient, revisionId: string) {
    const { data } = await supabase
        .from("business_process_revisions")
        .select("id, revision_number, payload, payload_checksum, published_at")
        .eq("org_id", ORG)
        .eq("id", revisionId)
        .maybeSingle();
    return data as
        | { id: string; revision_number: number; payload: Json; payload_checksum: string; published_at: string }
        | null;
}

async function departmentMetadata(supabase: SupabaseClient) {
    const { data } = await supabase
        .from("departments")
        .select("metadata")
        .eq("org_id", ORG)
        .eq("id", DEPT)
        .maybeSingle();
    return ((data as { metadata?: Json } | null)?.metadata ?? null) as Json | null;
}

async function main() {
    const e = env();
    const supabase = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
        global: { fetch: retryingFetch },
    });

    console.log(`=== Preflight (${WRITE ? "WRITE mode" : "dry run"}) ===`);

    const pub = await currentPublication(supabase);
    check(`published revision is ${EXPECTED_CURRENT_REVISION}`, pub?.revision_number === EXPECTED_CURRENT_REVISION, `saw ${pub?.revision_number}`);
    const rev12 = pub ? await revisionPayload(supabase, pub.revision_id) : null;
    check("revision payload readable", Boolean(rev12));

    const { data: form } = await supabase
        .from("form_definitions")
        .select("id, name, is_active")
        .eq("org_id", ORG)
        .eq("id", FORM_ID)
        .maybeSingle();
    check("Form exists and is active", Boolean(form) && (form as Json)?.is_active !== false, String((form as Json)?.name ?? "missing"));

    const { data: pubVersions } = await supabase
        .from("form_definition_versions")
        .select("id, version_number")
        .eq("org_id", ORG)
        .eq("form_definition_id", FORM_ID)
        .eq("status", "published");
    check("Form has a published version", (pubVersions ?? []).length > 0, j((pubVersions ?? [])[0]));

    const draftBefore = await readDraft(supabase, { orgId: ORG, departmentId: DEPT });
    check("draft exists", Boolean(draftBefore));
    if (!PUBLISH_ONLY) {
        check("draft payload equals published revision", c(draftBefore?.payload) === c(rev12?.payload), `draft_revision=${draftBefore?.draftRevision} status=${draftBefore?.status}`);
    } else {
        console.log(`  ..    resume mode — draft_revision=${draftBefore?.draftRevision} status=${draftBefore?.status}`);
    }
    check("draft is based on the current publication", draftBefore?.baseRevisionId === pub?.revision_id);

    const metadata = await departmentMetadata(supabase);
    check("guarded projection equals published revision", c(metadata?.lifecycle_builder_v1) === c(rev12?.payload));

    // What the legacy projector says each stage requires, computed with the SAME function the
    // normalizer calls. Postcondition 6 is then measured against the platform's own projection of
    // Firefly's configured rules, not against the materializer's output describing itself.
    const legacyExpected: Record<string, unknown[]> = {};
    for (const stage of enrollmentProcess(rev12?.payload).stages as Json[]) {
        const operatorStage = asOperatorStageKey(String(stage.key));
        legacyExpected[String(stage.key)] = operatorStage
            ? materializeLegacyFieldRequirements(
                  resolveEffectiveStageRequirements({
                      stage: operatorStage,
                      builder: null,
                      departmentMetadata: metadata,
                  }).legacy.rules,
              )
            : [];
    }
    console.log("\n  legacy projection per stage (what D-97 will materialize):");
    for (const [k, v] of Object.entries(legacyExpected)) {
        console.log(`    ${k.padEnd(10)} ${(v as unknown[]).length} field requirement(s)`);
    }

    // The exact payload publishing should store, computed before anything is written.
    const expectedPayload = normalizeBusinessProcessPayloadRequirements({
        payload: serializeLifecycleBuilderV1(applyApprovedEdits(parseLifecycleBuilderV1(draftBefore!.payload)!)),
        departmentMetadata: metadata,
    }).payload;

    if (PUBLISH_ONLY) {
        // The draft must be EXACTLY the approved edits over revision 12 — no more, no less.
        const expectedDraft = serializeLifecycleBuilderV1(
            applyApprovedEdits(parseLifecycleBuilderV1(rev12!.payload)!),
        );
        check("resume: draft is exactly revision 12 + the two approved edits", c(draftBefore!.payload) === c(expectedDraft));
        check("resume: draft is validated with no errors", draftBefore!.status === "validated" && draftBefore!.validationErrors.length === 0, `status=${draftBefore!.status}`);
    }

    if (failures > 0) {
        console.log(`\nPREFLIGHT FAILED (${failures}) — nothing written.`);
        process.exitCode = 1;
        return;
    }
    console.log("\n  preflight clean.");

    if (!WRITE && !PUBLISH_ONLY) {
        console.log("\nDry run — pass --write to apply.");
        return;
    }

    // ── Canonical draft edit ────────────────────────────────────────────────
    if (!PUBLISH_ONLY) {
    console.log("\n=== Applying the two approved edits to the draft ===");
    const edited = applyApprovedEdits(parseLifecycleBuilderV1(draftBefore!.payload)!);
    const saved = await saveDraft(supabase, {
        orgId: ORG,
        departmentId: DEPT,
        builder: edited,
        expectedDraftRevision: draftBefore!.draftRevision,
    });
    console.log(`  draft saved: draft_revision ${draftBefore!.draftRevision} -> ${saved.draftRevision} (status ${saved.status})`);

    const validation = validateBusinessProcessForPublish(saved.payload);
    console.log(`  validation: ${validation.errors.length} errors, ${validation.warnings.length} warnings`);
    if (validation.errors.length) {
        console.log(j(validation.errors));
        console.log("\nREFUSED to publish — validation errors.");
        process.exitCode = 1;
        return;
    }
    const validated = await recordDraftValidation(supabase, {
        orgId: ORG,
        departmentId: DEPT,
        validationErrors: [],
    });
    console.log(`  draft status: ${validated.status}`);
    }

    // ── One publish ─────────────────────────────────────────────────────────
    console.log("\n=== Publishing ===");
    const result = await publishDraft(supabase, { orgId: ORG, departmentId: DEPT });
    console.log(`  revision ${result.revisionNumber} · ${result.revisionId} · alreadyPublished=${result.alreadyPublished}`);
    check(`published revision is ${EXPECTED_NEW_REVISION}`, result.revisionNumber === EXPECTED_NEW_REVISION, `saw ${result.revisionNumber}`);

    // ── Post-conditions ─────────────────────────────────────────────────────
    console.log("\n=== Verification ===");
    const rev13 = await revisionPayload(supabase, result.revisionId);
    const after = rev13!.payload;
    const before = rev12!.payload;

    // 1 + 2. Only the approved authored additions plus deterministic materialization.
    const diffs: string[] = [];
    const beforeProc = enrollmentProcess(before);
    const afterProc = enrollmentProcess(after);
    for (const key of new Set([...Object.keys(beforeProc), ...Object.keys(afterProc)])) {
        if (key === "stages") continue;
        if (c(beforeProc[key]) !== c(afterProc[key])) diffs.push(`process.${key}`);
    }
    for (const s of afterProc.stages as Json[]) {
        const b = stageOf(before, String(s.key));
        for (const key of new Set([...Object.keys(b ?? {}), ...Object.keys(s)])) {
            if (c((b ?? {})[key]) !== c(s[key])) diffs.push(`stage.${s.key}.${key}`);
        }
    }
    const expectedDiffs = new Set([
        "process.entry_points_v1",
        ...((afterProc.stages as Json[]) ?? []).map((s) => `stage.${s.key}.requirements_v1`),
    ]);
    check(
        "1. only entry_points_v1 + per-stage requirements_v1 changed",
        diffs.every((d) => expectedDiffs.has(d)),
        `changed: ${diffs.join(", ")}`,
    );

    // 1 (strict). The stored revision is EXACTLY the payload computed before the write — the two
    // approved edits plus the projector's own materialization, and nothing else.
    check("1b. revision 13 payload equals the pre-computed expected payload", c(after) === c(expectedPayload));

    // 6 + 2. Every materialized requirement equals the legacy projection captured before the write.
    let materializationExact = true;
    for (const s2 of afterProc.stages as Json[]) {
        const stageKey = String(s2.key);
        if (stageKey === REQUIREMENT_STAGE) continue;
        const actual = ((s2.requirements_v1 as Json)?.requirements as Json[]) ?? [];
        const expected = (legacyExpected[stageKey] as Json[]).map((r) => ({
            requirement_id: r.requirement_id,
            kind: (r.ref as Json).kind,
            rule_id: (r.ref as Json).rule_id,
            level: r.level,
        }));
        const same = c(expected) === c(actual);
        if (!same) materializationExact = false;
        console.log(
            `    ${stageKey.padEnd(10)} materialized ${actual.length} · legacy projection ${expected.length} · ${same ? "exact" : "MISMATCH"}`,
        );
        if (!same) console.log(`      expected ${j(expected)}\n      actual   ${j(actual)}`);
    }
    check("6. materialized requirements equal the legacy projection exactly", materializationExact);
    check(
        "2. no non-field requirement invented on any other stage",
        ((afterProc.stages as Json[]) ?? [])
            .filter((s2) => s2.key !== REQUIREMENT_STAGE)
            .every((s2) => (((s2.requirements_v1 as Json)?.requirements as Json[]) ?? []).every((r) => r.kind === "field")),
    );

    // 3 + 4. Entry intents.
    const afterBuilder = parseLifecycleBuilderV1(after)!;
    const afterProcess = afterBuilder.processes.find((p) => p.key === PROCESS_KEY)!;
    const lead = resolveProcessEntryStage(afterProcess, "create_lead");
    const start = resolveProcessEntryStage(afterProcess, "enrollment_start");
    check("3. create_lead -> lead", lead.ok && lead.stageKey === "lead");
    check("4. enrollment_start -> enrolling", start.ok && start.stageKey === "enrolling");

    // 5. Exactly the approved Form requirement on `enrolling`.
    const enrollingReqs =
        (((stageOf(after, REQUIREMENT_STAGE) as Json)?.requirements_v1 as Json)?.requirements as Json[]) ?? [];
    check(
        "5. enrolling carries exactly the approved Form requirement",
        enrollingReqs.length === 1 &&
            enrollingReqs[0].kind === "form" &&
            enrollingReqs[0].form_definition_id === FORM_ID &&
            enrollingReqs[0].requirement_id === REQUIREMENT_ID,
        j(enrollingReqs),
    );

    // 7. Guarded projection equals revision 13.
    const metaAfter = await departmentMetadata(supabase);
    check("7. guarded lifecycle_builder_v1 projection equals revision 13", c(metaAfter?.lifecycle_builder_v1) === c(after));

    console.log(`\n${failures === 0 ? "PUBLISH VERIFIED" : `VERIFICATION FAILED (${failures})`}`);
    process.exitCode = failures === 0 ? 0 : 1;
}

void main();

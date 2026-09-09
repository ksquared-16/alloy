#!/usr/bin/env npx tsx
/**
 * Emit the governed migration that publishes the corrected tenant Business Process revision.
 *
 * Instruction 3 forbids ad-hoc JSON patching and direct revision updates, and instruction 2 requires
 * the payload to be built by the product's own canonical functions. Those two together mean the
 * transform cannot happen inside the database: the Law 4 checksum is sha256 over a JS-canonical
 * serialization (recursive localeCompare key ordering, then JSON.stringify), and a plpgsql
 * re-implementation would have to match ICU collation and JS string escaping exactly. A digest that
 * is merely close silently breaks the no-op publish guard and stale-draft detection.
 *
 * So this script does the work HERE, with the same code the application publishes through, and
 * emits the result as a literal. The migration it writes contains no transformation logic at all —
 * only a draft write, the sanctioned publish RPC, and a verification block that aborts the
 * transaction if the published revision does not read back correct.
 *
 *   npx tsx scripts/generateEnrollmentGrainCorrectionMigration.ts <census-results.json>
 *
 * It REFUSES to emit when the deployed payload is already correct, or when the corrected payload
 * does not pass publication validation. Neither is an error worth working around: the first means
 * another lane already fixed it, and the second means this repair is wrong.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

import { businessProcessPayloadChecksum } from "@/lib/lifecycle/businessProcessPayloadChecksum";
import {
    parseLifecycleBuilderV1,
    serializeLifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { validateParsedBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import {
    CHILD_ENROLLMENT_STAGE_KEY,
    correctEnrollmentStageGrainDrift,
} from "@/lib/businessProcesses/configuration/correctEnrollmentStageGrainDrift";
import { reassembleCensusPayload } from "@/lib/businessProcesses/configuration/reassembleCensusPayload";
import { ENROLLMENT_START_ENTRY_INTENT } from "@/lib/lifecycle/processEntryPointsV1";

type DeployedRow = {
    department_id: string;
    revision_id: string;
    revision_number: number;
    payload_checksum: string;
    payload: string;
};

/**
 * Read the census artifact and rebuild the deployed payloads from its chunks.
 *
 * The reconstruction is PROVEN complete before anything is returned — every declared chunk present
 * exactly once, and the reassembled length equal to what the database itself reported. A partial
 * reconstruction is refused rather than corrected, because a payload short by one chunk still
 * parses, still validates, and still produces a confident checksum over configuration the tenant
 * does not have. See reassembleCensusPayload.
 */
function readDeployedRows(path: string): DeployedRow[] {
    const censusJson = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const { revisions, failures } = reassembleCensusPayload(censusJson);
    if (failures.length) {
        throw new Error(
            `census payload could not be reassembled, so nothing was generated:\n`
            + failures.map((f) => `  department ${f.department_id ?? "?"}: ${f.reason}`).join("\n"),
        );
    }
    if (!revisions.length) throw new Error(`census returned no deployed revision in ${path}`);
    return revisions.map((r) => ({
        department_id: r.department_id,
        revision_id: r.revision_id,
        revision_number: r.revision_number,
        payload_checksum: r.payload_checksum,
        payload: JSON.stringify(r.payload),
    }));
}

function sqlLiteral(value: string): string {
    // Dollar-quoting, so a payload containing quotes or backslashes needs no escaping at all.
    let tag = "payload";
    while (value.includes(`$${tag}$`)) tag += "x";
    return `$${tag}$${value}$${tag}$`;
}

function main(): void {
    const censusPath = process.argv[2];
    if (!censusPath) throw new Error("usage: generateEnrollmentGrainCorrectionMigration <census-results.json>");
    const orgId = process.env.ALLOY_CERT_ORG_ID?.trim();
    if (!orgId) throw new Error("set ALLOY_CERT_ORG_ID to the tenant org id");

    const rows = readDeployedRows(censusPath);
    const statements: string[] = [];
    const notes: string[] = [];

    for (const row of rows) {
        const deployed = parseLifecycleBuilderV1(JSON.parse(row.payload));
        if (!deployed) {
            notes.push(`-- department ${row.department_id}: payload unreadable by the product parser; SKIPPED`);
            continue;
        }

        const corrected = correctEnrollmentStageGrainDrift(deployed);
        if (corrected.alreadyCorrect) {
            notes.push(`-- department ${row.department_id} (revision ${row.revision_number}): already correct; nothing to publish`);
            continue;
        }

        const payload = serializeLifecycleBuilderV1(corrected.builder);
        const validation = validateParsedBusinessProcessForPublish(corrected.builder, payload);
        if (validation.errors.length) {
            throw new Error(
                `corrected payload for department ${row.department_id} FAILS publication validation:\n`
                + validation.errors.map((e) => `  ${e.code} ${e.path}: ${e.message}`).join("\n"),
            );
        }

        const checksum = businessProcessPayloadChecksum(payload);
        const json = JSON.stringify(payload);
        notes.push(
            `-- department ${row.department_id}: revision ${row.revision_number} (${row.revision_id})`,
            ...corrected.corrections.map((c) => `--   [${c.process_key}] ${c.change}`),
            `--   corrected checksum ${checksum}`,
        );

        statements.push(`
-- ── department ${row.department_id} ───────────────────────────────────────────────
-- Base revision ${row.revision_number} (${row.revision_id}), checksum ${row.payload_checksum}.
-- The draft is opened AGAINST that revision, so the publish RPC's Law 4 staleness check refuses
-- this migration outright if anything was published in between. That is the intended behaviour:
-- a corrected payload computed from a superseded revision must not be published over a newer one.
INSERT INTO public.business_process_drafts (
    org_id, department_id, payload, base_revision_id, draft_status, validation_errors
)
VALUES (
    '${orgId}'::uuid,
    '${row.department_id}'::uuid,
    ${sqlLiteral(json)}::jsonb,
    '${row.revision_id}'::uuid,
    'validated',
    '[]'::jsonb
)
ON CONFLICT (org_id, department_id) DO UPDATE
SET payload           = EXCLUDED.payload,
    base_revision_id  = EXCLUDED.base_revision_id,
    draft_status      = 'validated',
    validation_errors = '[]'::jsonb;

SELECT public.publish_business_process_revision_v1(
    '${orgId}'::uuid,
    '${row.department_id}'::uuid,
    NULL,
    '${checksum}'
);

-- VERIFY, and abort the whole transaction rather than leave a half-correct tenant live.
DO $verify$
DECLARE
    v_payload jsonb;
    v_proc    jsonb;
    v_stage   jsonb;
BEGIN
    SELECT r.payload INTO v_payload
    FROM public.configuration_publications cp
    JOIN public.business_process_revisions r ON r.id = cp.revision_id
    WHERE cp.org_id = '${orgId}'::uuid
      AND cp.domain_key = 'business_process'
      AND cp.subject_id = '${row.department_id}'::uuid
    ORDER BY cp.revision_number DESC
    LIMIT 1;

    SELECT p INTO v_proc
    FROM jsonb_array_elements(v_payload->'processes') p
    WHERE p->>'key' = 'enrollment'
    LIMIT 1;
    IF v_proc IS NULL THEN
        RAISE EXCEPTION 'post-publish: no enrollment process in the newly published revision';
    END IF;

    SELECT s INTO v_stage
    FROM jsonb_array_elements(v_proc->'stages') s
    WHERE s->>'key' = '${CHILD_ENROLLMENT_STAGE_KEY}'
    LIMIT 1;
    IF v_stage IS NULL THEN
        RAISE EXCEPTION 'post-publish: stage ${CHILD_ENROLLMENT_STAGE_KEY} is missing';
    END IF;

    IF v_stage->>'grain' IS DISTINCT FROM 'child'
       OR v_stage->'stage_operating_plan_v1'->>'journey_segment' IS DISTINCT FROM 'child' THEN
        RAISE EXCEPTION
            'post-publish: ${CHILD_ENROLLMENT_STAGE_KEY} still disagrees with itself (metadata=% plan=%)',
            v_stage->>'grain',
            v_stage->'stage_operating_plan_v1'->>'journey_segment';
    END IF;

    IF v_proc->'entry_points_v1'->'by_intent'->>'${ENROLLMENT_START_ENTRY_INTENT}'
       IS DISTINCT FROM '${CHILD_ENROLLMENT_STAGE_KEY}' THEN
        RAISE EXCEPTION 'post-publish: ${ENROLLMENT_START_ENTRY_INTENT} does not enter ${CHILD_ENROLLMENT_STAGE_KEY}';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_stage->'stage_operating_plan_v1'->'outcome_rules') r,
             jsonb_array_elements(r->'targets') t
        WHERE t->>'kind' = 'update_child_enrollment_status'
          AND t->>'disposition_key' = 'enrolled'
    ) THEN
        RAISE EXCEPTION 'post-publish: ${CHILD_ENROLLMENT_STAGE_KEY} carries no outcome that enrols a child';
    END IF;

    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_proc->'stages') s
        WHERE s->>'key' = 'enrollment' AND (s->>'is_active')::boolean
    ) THEN
        RAISE EXCEPTION 'post-publish: the legacy enrollment stage is still active';
    END IF;
END
$verify$;
`);
    }

    if (!statements.length) {
        console.log(notes.join("\n"));
        console.log("\nNothing to publish — every deployed revision is already correct.");
        return;
    }

    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const file = resolve(process.cwd(), `../supabase/migrations/${stamp}_enrollment_stage_grain_correction.sql`);
    writeFileSync(
        file,
        `-- Publish the corrected Enrollment stage grain for this tenant.
--
-- GENERATED by scripts/generateEnrollmentGrainCorrectionMigration.ts from the deployed payload.
-- The transformation, its validation and its Law 4 checksum were all computed by product code
-- (correctEnrollmentStageGrainDrift + validateParsedBusinessProcessForPublish +
-- businessProcessPayloadChecksum). This file contains no transformation logic: only a draft write,
-- the sanctioned publish RPC, and a verification block that aborts on a wrong result.
--
-- Do not hand-edit. Regenerate from a fresh census if the tenant moves on.
--
${notes.join("\n")}

${statements.join("\n")}
`,
        "utf8",
    );
    console.log(notes.join("\n"));
    console.log(`\nwrote ${file}`);
}

main();

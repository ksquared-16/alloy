/**
 * STAGE WORK CARRIES SUBJECT TRUTH, NOT THE PROCESS LIBRARY.
 *
 * MEASURED ON FIREFLY (2026-09-15). The subject-scoped stage-work block was ~74.7 KB and shipped in
 * BOTH the provisioning answer and the drawer Opportunity VM for the same selection — byte-identical
 * subtrees, proven by SHA-256. Inside it, the active lifecycle `process` record was ~26.2 KB and was
 * serialized on every subject answer while **no consumer anywhere read it**: the compiler confirmed
 * that when the field was removed from the type, nothing failed.
 *
 * It was never truth the client needed. Its stated job was to "enable the P6.S2 command authority
 * projection", and that projection is computed from it server-side and already travels as
 * `commandProjection`. The record is also derivable from `departmentMetadata`, which the same payload
 * still carries.
 *
 * What these tests pin is the DISTINCTION, because it is the whole repair: the record may still be
 * used to COMPUTE, it may not be RETRANSMITTED. A future edit that re-adds it to the emitted object
 * silently restores ~26 KB per selection on two payloads at once.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
    join(process.cwd(), "lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork.ts"),
    "utf-8",
);

/** The emitted object literal — everything the client actually receives. */
const returnBlock = SRC.slice(SRC.lastIndexOf("    return {"));

describe("the process record is computed, not retransmitted", () => {
    it("is not emitted in the stage-work payload", () => {
        expect(returnBlock).not.toMatch(/^\s*process[,:]/m);
    });

    it("is still used to build the projection the client DOES read", () => {
        // If this disappears, `commandProjection` lost its input and the removal above stopped being
        // free — the client would be missing command authority rather than missing dead bytes.
        expect(SRC).toContain("projectProcessRuntimeCommands");
        expect(returnBlock).toMatch(/^\s*commandProjection,/m);
    });

    it("is not part of the published contract, so a new consumer is a build error", () => {
        const typeBlock = SRC.slice(
            SRC.indexOf("export type PublishedStageInputsForCurrentWork"),
            SRC.indexOf("function trimOrNull"),
        );
        expect(typeBlock).not.toMatch(/^\s*process\??:/m);
    });
});

describe("every field Current Work settles from is retained", () => {
    /**
     * Named explicitly rather than counted. Each of these was traced to a Current Work consumer in
     * Slice 5/6; dropping any one is a settlement regression, not a payload saving.
     */
    const REQUIRED = [
        "operatingPlan",        // what the stage's work means
        "actionCatalog",        // available actions
        "fieldRules",           // requirement truth
        "processKey",
        "stageKey",
        "departmentMetadata",   // consumed by resolveCurrentWorkChecklistTruthFromPublishedRules
        "processStages",
        "processTracks",
        "operatorGuidance",
        "commandProjection",    // command authority, precomputed
        "commandConfiguration",
    ];
    it.each(REQUIRED)("still emits %s", (field) => {
        expect(returnBlock).toMatch(new RegExp(`^\\s*${field}[,:]`, "m"));
    });
});

describe("no drawer dependency was introduced", () => {
    it("resolves stage inputs without consulting the drawer view model", () => {
        // The convergence removes duplicate BYTES between provisioning and the drawer VM. It must not
        // make provisioning depend on the drawer — Current Work renders from the answer alone.
        expect(SRC).not.toMatch(/view-models\/drawer|composeOpportunityDrawerViewModel|drawerVm/i);
    });

    it("does not reach for queue-row preview data to replace removed configuration", () => {
        expect(SRC).not.toMatch(/queuePreviewSeed|_queue_row_context|queueRow/i);
    });
});

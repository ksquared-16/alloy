/**
 * THREE INDEPENDENT READS, AND THE THINGS THAT MUST SURVIVE MAKING THEM CONCURRENT.
 *
 * Measured deployed: CRM 186ms + children 224ms + personal_seen 106ms = 517ms, reconciling 98% of
 * the 526ms cohort_rows wall. They summed to the wall, which is what proved they were serial.
 *
 * Concurrency is the easy part. What is easy to lose is everything around it:
 *   - each read is independently BEST-EFFORT; Promise.all would make one degrade blank the page
 *   - merge precedence is raw < CRM < children, and arrival order must not decide it
 *   - the occurrence key must keep ONE definition, resolved from raw columns
 *   - UNAVAILABLE must stay distinct from ACKNOWLEDGED
 * These gates pin those, because a scheduling change that quietly alters any of them would look
 * like a pure win in the timings and be a correctness regression.
 */
import { describe, expect, it } from "vitest";

import { resolveQueueRowOccurrenceIdentity } from "@/lib/workUnits/buildPartialQueueRowContext";
import { occurrenceKeyForAck, personalSeenFromOccurrence } from "@/lib/queues/operatorStageMembershipAck";

const QUEUE = { key: "lifecycle_lead", label: "New", lifecycle_key: "enrollment", subject_grain: "case" as const, stage_labels_by_key: {} };
const ROW = {
    id: "case-1",
    org_id: "org-1",
    stage_key: "lead",
    stage_entered_at: "2026-09-13T14:02:39.832Z",
    created_at: "2026-09-01T00:00:00.000Z",
};

describe("the occurrence identity comes from RAW columns", () => {
    it("resolves from the raw projection alone -- no enrichment output", () => {
        // This is what makes the three reads independent. If it needed a CRM or children field,
        // parallelising would be wrong rather than merely fast.
        const id = resolveQueueRowOccurrenceIdentity(ROW, QUEUE);
        expect(id).not.toBeNull();
        expect(id!.subjectId).toBe("case-1");
        expect(id!.stageKey).toBe("lead");
        expect(id!.enteredAtIso).toBe("2026-09-13T14:02:39.832Z");
    });

    it("LOSING stage_entered_at CHANGES THE OCCURRENCE", () => {
        // Falling back to intake time silently re-dates the occurrence and re-opens a seen row.
        const withEntry = resolveQueueRowOccurrenceIdentity(ROW, QUEUE)!;
        const without = resolveQueueRowOccurrenceIdentity({ ...ROW, stage_entered_at: null }, QUEUE)!;
        expect(without.enteredAtIso).not.toBe(withEntry.enteredAtIso);
    });

    it("LOSING created_at is visible when there is no persisted entry", () => {
        const noBoth = resolveQueueRowOccurrenceIdentity(
            { ...ROW, stage_entered_at: null, created_at: null },
            QUEUE,
        )!;
        const intakeOnly = resolveQueueRowOccurrenceIdentity({ ...ROW, stage_entered_at: null }, QUEUE)!;
        expect(noBoth.enteredAtIso).not.toBe(intakeOnly.enteredAtIso);
    });

    it("a row without an id yields no identity rather than a partial key", () => {
        expect(resolveQueueRowOccurrenceIdentity({ ...ROW, id: "" }, QUEUE)).toBeNull();
    });

    it("the key built from the identity matches the canonical builder", () => {
        // One definition: composition and the endpoint must produce the same string.
        const id = resolveQueueRowOccurrenceIdentity(ROW, QUEUE)!;
        expect(
            occurrenceKeyForAck({
                orgId: "org-1",
                userId: "user-1",
                subjectType: id.subjectType,
                subjectId: id.subjectId,
                stageKey: id.stageKey,
                stageEnteredAtIso: id.enteredAtIso!,
            }),
        ).toBe(
            occurrenceKeyForAck({
                orgId: "org-1",
                userId: "user-1",
                subjectType: "case",
                subjectId: "case-1",
                stageKey: "lead",
                stageEnteredAtIso: "2026-09-13T14:02:39.832Z",
            }),
        );
    });
});

describe("UNAVAILABLE is not ACKNOWLEDGED", () => {
    it("an unacknowledged occurrence is UNSEEN, and that is an answer", () => {
        const k = occurrenceKeyForAck({
            orgId: "org-1", userId: "user-1", subjectType: "case", subjectId: "case-1",
            stageKey: "lead", stageEnteredAtIso: "2026-09-13T14:02:39.832Z",
        });
        expect(personalSeenFromOccurrence({ occurrenceKey: k, acknowledgedKeys: new Set() })).toEqual({
            unseen: true,
            occurrence_key: k,
        });
    });
});

describe("the concurrent implementation keeps its contracts", () => {
    const SRC = (() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { readFileSync } = require("node:fs") as typeof import("node:fs");
        const { join } = require("node:path") as typeof import("node:path");
        const raw = readFileSync(
            join(process.cwd(), "lib/runtime/provisioning/operationalProjectionEnrichment.ts"),
            "utf8",
        );
        return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    })();

    it("ALL THREE READS START BEFORE ANY IS AWAITED", () => {
        // The defect this whole change exists to remove: an await between two starts re-serialises
        // them and every timing gate would still pass.
        const crmStart = SRC.indexOf("const crmP =");
        const childrenStart = SRC.indexOf("const childrenP =");
        const seenStart = SRC.indexOf("const seenP:");
        const firstAwait = SRC.indexOf("await crmP");
        expect(crmStart).toBeGreaterThan(-1);
        expect(childrenStart).toBeGreaterThan(crmStart);
        expect(seenStart).toBeGreaterThan(childrenStart);
        expect(firstAwait).toBeGreaterThan(seenStart);
    });

    it("FAILURE ISOLATION SURVIVES — no Promise.all over the three reads", () => {
        // Promise.all turns three independent best-effort reads into one fail-together read.
        expect(SRC).not.toMatch(/Promise\.all\(\s*\[?\s*crmP/);
        expect(SRC).not.toContain("Promise.all([crmP");
        /*
         * COUNTED, NOT MEASURED BY DISTANCE. The first version asserted a rejection handler within
         * 400 characters of each start; the real distance is 495 and the gate failed on formatting
         * rather than on behaviour. What matters is that each of the two enrichment reads owns a
         * rejection path, and that the acknowledgement read degrades to null.
         */
        expect((SRC.match(/ok:\s*false as const/g) ?? []).length).toBe(2);
        expect(SRC).toMatch(/seenP[\s\S]*?\(\)\s*=>\s*null/);
    });

    it("MERGE PRECEDENCE stays raw < CRM < children", () => {
        // Children must still fold OVER the CRM map, and the row merge must still let the
        // projection win over raw. Arrival order must not decide this.
        expect(SRC).toContain("{ ...prior, ...projection }");
        expect(SRC).toContain("{ ...r, ...p }");
    });

    it("the acknowledgement read keeps ONE definition", () => {
        expect(SRC).toContain("resolveQueueRowOccurrenceIdentity");
        expect(SRC).toContain("occurrenceKeyForAck");
        expect(SRC).toContain("loadAcknowledgedOccurrenceKeys");
        expect(SRC).toContain("personalSeenFromOccurrence");
        // and does not re-derive the stage/entry fallback beside it
        expect(SRC).not.toContain("intakeCreatedAt");
    });

    it("a failed acknowledgement read writes NO verdict", () => {
        // Exactly one place may assign personal_seen: the success fold.
        expect((SRC.match(/personal_seen\s*=/g) ?? []).length).toBe(1);
    });

    it("each read is issued exactly once", () => {
        expect((SRC.match(/enrichOpportunityRowsWithCrmProjection\(/g) ?? []).length).toBe(1);
        expect((SRC.match(/enrichOpportunityRowsWithChildrenForCompactQueue\(/g) ?? []).length).toBe(1);
        expect((SRC.match(/loadAcknowledgedOccurrenceKeys\(/g) ?? []).length).toBe(1);
    });

    it("resolves the whole page in one acknowledgement query", () => {
        expect(SRC).toContain("occurrenceKeys: [...keyByRowId.values()]");
    });
});

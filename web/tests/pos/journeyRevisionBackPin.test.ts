/**
 * ESTABLISHING IMMUTABLE REVISION AUTHORITY IS NOT A MIGRATION.
 *
 * A journey with no `business_process_revision_id` still runs — configuration falls back to the live
 * projection — but it cannot produce participant paperwork, because D-96 requires a packet's
 * governing requirements to be immutable. That refusal is correct and is not weakened anywhere.
 *
 * The repair writes ONE column on journeys already governed in substance by the very configuration
 * the revision froze. These guard the two ways that could go wrong: pinning something the revision
 * cannot represent, and pinning when the revision and the live configuration are not the same thing.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { classifyJourneyForPin, type RevisionStage } from "@/lib/process/backPinJourneyRevision";

/** The real Enrollment revision 35 stage set, as measured. */
const STAGES: RevisionStage[] = [
    { key: "lead", grain: "family", is_active: true },
    { key: "tour", grain: "family", is_active: true },
    { key: "decision", grain: "family", is_active: true },
    { key: "waitlist", grain: "child", is_active: true },
    { key: "enrolling", grain: "child", is_active: true },
    { key: "enrolled", grain: "child", is_active: true },
];

const MATCHES = { configurationMatchesLive: true };
const journey = (o: Partial<Parameters<typeof classifyJourneyForPin>[0]> = {}) => ({
    id: "pi-1",
    subject_id: "cm-1",
    subject_type: "child",
    stage_key: "enrolling",
    state: "active",
    ...o,
});

describe("what may be pinned", () => {
    it("pins a child journey at a child-grain stage the revision declares", () => {
        const c = classifyJourneyForPin(journey(), STAGES, MATCHES);
        expect(c.classification).toBe("safe_to_pin");
        expect(c.reason).toContain("enrolling");
    });

    it("pins a family journey at a family-grain stage", () => {
        const c = classifyJourneyForPin(journey({ subject_type: "family", stage_key: "lead" }), STAGES, MATCHES);
        expect(c.classification).toBe("safe_to_pin");
    });
});

describe("what must NOT be pinned", () => {
    it("refuses a stage the revision has never heard of", () => {
        const c = classifyJourneyForPin(journey({ stage_key: "offer_made" }), STAGES, MATCHES);
        expect(c.classification).toBe("incompatible");
        expect(c.reason).toContain("no stage");
    });

    it("refuses a stage the revision retired", () => {
        const retired = [...STAGES, { key: "old_stage", grain: "child", is_active: false }];
        const c = classifyJourneyForPin(journey({ stage_key: "old_stage" }), retired, MATCHES);
        expect(c.classification).toBe("incompatible");
    });

    it("refuses a grain change, which would silently reinterpret completed work", () => {
        // A child journey sitting at a family-grain stage: every requirement it has already
        // satisfied would be re-read against a different subject.
        const c = classifyJourneyForPin(journey({ subject_type: "child", stage_key: "lead" }), STAGES, MATCHES);
        expect(c.classification).toBe("incompatible");
        expect(c.reason).toContain("family-grain");
    });

    it("refuses to guess when the department has unpublished changes", () => {
        const c = classifyJourneyForPin(journey(), STAGES, { configurationMatchesLive: false });
        expect(c.classification).toBe("ambiguous");
        expect(c.reason).toContain("unpublished");
    });

    it("refuses to guess when a journey names no stage", () => {
        expect(classifyJourneyForPin(journey({ stage_key: null }), STAGES, MATCHES).classification).toBe("ambiguous");
    });
});

describe("what needs no pin at all", () => {
    it("leaves a terminal journey alone — nothing further is realized from it", () => {
        for (const state of ["completed", "cancelled", "archived", "abandoned"]) {
            const c = classifyJourneyForPin(journey({ state }), STAGES, MATCHES);
            expect(c.classification, state).toBe("terminal_no_pin_needed");
        }
    });

    it("classifies a terminal journey terminal even at an unknown stage", () => {
        // Terminal is checked FIRST: a finished journey is not a compatibility problem.
        const c = classifyJourneyForPin(journey({ state: "completed", stage_key: "offer_made" }), STAGES, MATCHES);
        expect(c.classification).toBe("terminal_no_pin_needed");
    });
});

describe("the operation's shape", () => {
    const src = readFileSync(new URL("../../lib/process/backPinJourneyRevision.ts", import.meta.url).pathname, "utf8");
    const route = readFileSync(
        new URL("../../app/api/admin/enrollment-process/revision-backpin/route.ts", import.meta.url).pathname,
        "utf8",
    );

    it("writes only the revision column — no stage, no status, no work", () => {
        const at = src.indexOf(".update({");
        expect(at).toBeGreaterThan(0);
        // The UPDATE block itself — `stage_key` and `state` appear legitimately in the SELECT and
        // in the candidate type, so asserting on the whole file would be asserting on the census.
        const update = src.slice(at, src.indexOf(";", at));
        expect(update).toContain("business_process_revision_id: input.targetRevisionId");
        expect(update).not.toMatch(/stage_key|state:/);
        expect(src, "a repair that inserts rows is fabricating work").not.toContain(".insert(");
    });

    it("pins ONLY what the census called safe", () => {
        expect(src).toContain('c.classification === "safe_to_pin"');
    });

    it("never overwrites a pin something else established", () => {
        const at = src.indexOf(".update({");
        expect(src.slice(at, at + 420)).toContain('.is("business_process_revision_id", null)');
    });

    it("is idempotent — a second run finds nothing left to do", () => {
        // The census only ever considers journeys whose revision is null.
        expect(src).toContain('!(r.business_process_revision_id ?? "").trim()');
    });

    it("is org- and process-scoped", () => {
        const at = src.indexOf('.from("process_instances")');
        const block = src.slice(at, at + 400);
        expect(block).toContain('.eq("org_id", input.orgId)');
        expect(block).toContain('.eq("process_key", input.processKey)');
    });

    it("dry-runs by default and writes nothing on GET", () => {
        expect(route).toContain("return run(request, true);");
        expect(src).toContain("if (!input.dryRun)");
    });

    it("never lets the caller choose the revision", () => {
        // A caller that could name one could pin a journey to configuration it never ran under.
        expect(route).toContain("latestPublication");
        expect(route).not.toMatch(/body\.revision_id|searchParams\.get\("revision/);
    });

    it("requires the Business Process configure capability", () => {
        expect(route).toContain("BUSINESS_PROCESS_CONFIGURE");
    });
});

describe("the D-96 refusal is not weakened", () => {
    it("launchParticipantEnrollment still refuses an unpinned journey", () => {
        const launch = readFileSync(
            new URL("../../lib/enrollment/participantLaunch/launchParticipantEnrollment.ts", import.meta.url).pathname,
            "utf8",
        );
        expect(launch).toContain("no_governing_revision");
        expect(launch).toContain("is not pinned to a published Business Process revision");
    });
});

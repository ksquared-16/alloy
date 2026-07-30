/**
 * R1 — THE ROW SOURCE IS THE RESOLVED GRAIN'S, and a child row carries child identities.
 *
 * Before this, the provisioning answer resolved a lens's Row Grain and then read `opportunities`
 * unconditionally, so a `child` lens could only ever be empty — and empty for the wrong reason. Firefly
 * publishes two such lenses in production navigation.
 *
 * These are unit-level guards over the boundary logic and the routing structure. The behavioural proof
 * (the provider really runs against 11 real child participations on the certified tenant) lives in the
 * certification record, because it needs a real database.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeChildRow } from "@/lib/runtime/provisioning/childGrainProvisioningRows";
import { provisioningErrorKind } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const ANSWER = "lib/runtime/provisioning/workUnitProvisioningAnswer.ts";

const PI_ROW = {
    id: "pi-1", // the upstream mapper puts the PI id here when there is no legacy OCM row
    _process_instance_id: "pi-1",
    customer_member_id: "cm-lennon",
    opportunity_id: "opp-kurzman",
    outcome_status_key: null,
    updated_at: "2026-07-30T00:00:00Z",
    customer_members: { id: "cm-lennon", display_name: "Lennon Kurzman", first_name: "Lennon" },
    opportunities: { id: "opp-kurzman", stage_key: "lead", name: "Kurzman Family" },
};

describe("child identity is normalized at the boundary", () => {
    it("the SUBJECT is the durable child, not the participation and not the case", () => {
        const row = normalizeChildRow(PI_ROW)!;
        expect(row.subjectId).toBe("cm-lennon"); // customer_members.id
        expect(row.participationId).toBe("pi-1"); // process_instances.id
        expect(row.contextId).toBe("opp-kurzman"); // opportunities.id
        // All three are different things. Carrying them in one field is what made
        // `opportunity_customer_member_id` a process-instance id with nothing to say so.
        expect(new Set([row.subjectId, row.participationId, row.contextId]).size).toBe(3);
    });

    it("legacyOcmId stays null when there is no OCM row — it does not repeat the old lie", () => {
        expect(normalizeChildRow(PI_ROW)!.legacyOcmId).toBeNull();
    });

    it("legacyOcmId is populated only when a GENUINE legacy id survived the migration", () => {
        const migrated = { ...PI_ROW, id: "ocm-legacy-9", _process_instance_id: "pi-1" };
        const row = normalizeChildRow(migrated)!;
        expect(row.legacyOcmId).toBe("ocm-legacy-9");
        expect(row.participationId).toBe("pi-1");
        expect(row.subjectId).toBe("cm-lennon");
    });

    it("effective stage reports the family's stage when the child rides it", () => {
        // All 11 of Firefly's child participations have `stage_key = NULL` and ride their family's `lead`.
        expect(normalizeChildRow(PI_ROW)!.stageKey).toBe("lead");
    });

    it("a row with no child identity is DROPPED, never guessed", () => {
        expect(normalizeChildRow({ ...PI_ROW, customer_member_id: null })).toBeNull();
    });

    it("the child name comes from the child, not from the family case", () => {
        expect(normalizeChildRow(PI_ROW)!.title).toBe("Lennon Kurzman");
        // The opportunity is called "Kurzman Family" — a child row must never borrow it.
        expect(normalizeChildRow(PI_ROW)!.title).not.toBe("Kurzman Family");
    });
});

describe("the child path reuses the production provider and cannot degrade to family", () => {
    it("it calls the existing provider rather than re-implementing its SQL", () => {
        const src = read("lib/runtime/provisioning/childGrainProvisioningRows.ts");
        expect(src).toContain("queryEnrollmentProcessInstanceTrackRows");
        // A second definition of what a child row IS would be exactly the drift this removes.
        expect(src).not.toContain('.from("process_instances")');
    });

    it("a failed child read becomes an honest terminal — never family rows", () => {
        const src = read(ANSWER);
        const branch = src.slice(src.indexOf("if (subjectGrain.grain === \"child\")"));
        expect(branch).toContain("child records unavailable");
        expect(provisioningErrorKind("records_unavailable")).toBe("records");
    });

    it("child membership is NOT re-evaluated through the opportunity lens", () => {
        const src = read(ANSWER);
        // computeOperationalProjection must sit on the family side of the branch only.
        const childBranch = src.slice(
            src.indexOf('if (subjectGrain.grain === "child")'),
            src.indexOf("} else {"),
        );
        expect(childBranch).not.toContain("computeOperationalProjection");
        expect(childBranch).toContain("loadChildGrainProvisioningRows");
    });

    it("child rows are never presented through the opportunity-shaped downstream", () => {
        // The honest edge of this slice: rows resolve, but the subject path below is still
        // opportunity-shaped, so a child lens WITH rows refuses instead of looking like success.
        const src = read(ANSWER);
        expect(src).toContain("subject_surface_unavailable");
        expect(provisioningErrorKind("subject_surface_unavailable")).toBe("configuration");
    });

    it("both grains read the lens the SAME way — one definition of what it selects", () => {
        const src = read(ANSWER);
        expect(src).toContain("export function lensStageKeys");
        // The grain resolver and the child row source both go through it.
        expect(src.split("lensStageKeys(").length - 1).toBeGreaterThanOrEqual(2);
    });
});

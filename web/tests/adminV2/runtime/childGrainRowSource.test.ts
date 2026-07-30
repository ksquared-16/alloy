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
        // The branch reaches the provider through the SHARED membership rule — the same one the count
        // path obeys — rather than deriving the rule inline where only it could see it.
        expect(childBranch).toContain("loadChildGrainMembersForLens");
    });

    it("child rows are never presented through the opportunity-shaped downstream", () => {
        // PHASE 4 replaced the refusal with the real child path. The INVARIANT the refusal protected is
        // unchanged, and it is what this asserts: nothing opportunity-shaped may be applied to a child.
        const src = read(ANSWER);

        // The scaffolding is gone — including from the error vocabulary, so it cannot return by being
        // thrown from somewhere new.
        expect(src).not.toContain("subject_surface_unavailable");

        // Scope resolution: a child goes through the child-grain resolver. Running the lens's
        // opportunity-shaped predicates over a child row matches nothing, which renders as "this record
        // moved out of your lens" plus a destination chosen by the same broken comparison.
        expect(src).toContain("resolveChildGrainFocusPanelScope");

        // Enrichment resolves CRM labels by OPPORTUNITY id. A child row's id is not one, so the child
        // branch must not enter it — otherwise the family's contact is attached to the child.
        expect(src).toContain("childRows\n            ? Promise.resolve([])");

        // The child's business state comes from the child composer, never from the family block.
        expect(src).toContain("composeChildGrainSurface");
    });

    it("a child subject is addressed by its PARTICIPATION, never by a row `.id` it does not have", () => {
        // `ChildProvisioningRow` has no `id` field at all. Reading one yielded the string "undefined"
        // for every row, so selection, deep links and next/previous all addressed one phantom subject.
        const src = read(ANSWER);
        expect(src).toContain('id: String(r.participationId ?? "")');
    });

    it("the error vocabulary still classifies the refusals that remain", () => {
        expect(provisioningErrorKind("grain_ambiguous")).toBe("configuration");
        expect(provisioningErrorKind("no_truthful_primary_action")).toBe("configuration");
        expect(provisioningErrorKind("subject_unavailable")).toBe("subject");
        expect(provisioningErrorKind("records_unavailable")).toBe("records");
    });

    it("both grains read the lens the SAME way — one definition of what it selects", () => {
        // `lensStageKeys` moved to its own module so the COUNT path could import it without a cycle.
        // The invariant is unchanged and is what matters: exactly ONE definition exists.
        const shared = read("lib/lifecycle/lensStageKeys.ts");
        expect(shared).toContain("export function lensStageKeys");

        const src = read(ANSWER);
        expect(src).toContain('from "@/lib/lifecycle/lensStageKeys"');
        // The answer re-exports it, so existing importers are unaffected.
        expect(src).toContain("export { lensStageKeys }");
        // …and does not carry a second copy.
        expect(src).not.toContain("export function lensStageKeys");
    });

    it("ROWS AND COUNTS SHARE ONE MEMBERSHIP RULE — the 13-rows-under-a-pill-of-8 defect", () => {
        // The rule was inline in the answer, so the totals route could not ask what a child lens
        // selects and counted the opportunity lane instead. One module now answers for both.
        const membership = read("lib/runtime/provisioning/childGrainMembership.ts");
        expect(membership).toContain("export function childRowMembershipForLens");
        expect(membership).toContain("export async function loadChildGrainMembersForLens");
        expect(membership).toContain("export async function countChildGrainMembersForLens");
        // Counting is defined AS the projected members — not a second query that could disagree.
        expect(membership).toContain("await loadChildGrainMembersForLens(params)");

        // The answer takes its rows from it…
        expect(read(ANSWER)).toContain("loadChildGrainMembersForLens");
        // …and the totals route takes its count from it, never from the opportunity lane.
        const totals = read("app/api/admin/queue-view-totals/route.ts");
        expect(totals).toContain("countChildGrainMembersForLens");
        expect(totals).toContain("workViews: laneViews");
        expect(totals).not.toContain("workViews: requestedViews");
    });
});

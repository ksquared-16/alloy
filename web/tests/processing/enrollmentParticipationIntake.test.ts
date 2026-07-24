import { describe, expect, it } from "vitest";
import { IDENTITY_COMMAND_KEYS } from "@/lib/pos/processingIdentity/commands";
import {
    buildRecommendations,
    deriveResolutionSetFromResolutions,
    type IdentityResolutionSet,
} from "@/lib/pos/processingIdentity/operator";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";

/**
 * Phase 6 — lead → enrollment realization.
 *
 * Committing an intake case (public form / Create Lead) must enroll each committed child by
 * emitting the frozen `create_process_participation` command, so a public-form lead is an
 * *enrollable* lead (has an enrollment process_instance) exactly like manual Create Lead.
 * These lock in that buildRecommendations synthesizes the participation op — the seam that
 * was previously missing (household/parent/child/lead were committed, but never participation).
 */
const PARTICIPATION = IDENTITY_COMMAND_KEYS.createProcessParticipation;

function participationOps(set: IdentityResolutionSet) {
    return buildRecommendations(set).operations.filter((o) => o.commandKey === PARTICIPATION);
}

describe("intake-commit enrollment participation", () => {
    it("enrolls a new-family child: participation op references the created child + lead by @ref", () => {
        const set: IdentityResolutionSet = {
            subjects: [
                { ref: "household:0", role: "household", decision: "create", values: { household_name: "H" } },
                { ref: "parent:0", role: "parent", decision: "create", householdRef: "household:0", values: { first_name: "Ann" } },
                { ref: "child:0", role: "child", decision: "create", householdRef: "household:0", values: { display_name: "Kid" } },
                { ref: "lead:0", role: "lead", decision: "create", householdRef: "household:0", dependsOn: ["parent:0"], values: { name: "L" } },
            ],
        };
        const ops = participationOps(set);
        expect(ops).toHaveLength(1);
        expect(ops[0].payload).toMatchObject({ child_id: "@child:0", lead_id: "@lead:0" });
        // Ordering must let child + lead commit first.
        expect(ops[0].dependsOnRefs).toEqual(expect.arrayContaining(["child:0", "lead:0"]));
    });

    it("enrolls a returning-family child (linked to an existing record) using its literal id, not @ref", () => {
        const set: IdentityResolutionSet = {
            subjects: [
                { ref: "household:0", role: "household", decision: "link", selectedRecordId: "cust-9" },
                { ref: "child:0", role: "child", decision: "link", selectedRecordId: "cm-7", householdRef: "household:0" },
                { ref: "lead:0", role: "lead", decision: "create", householdRef: "household:0", values: { name: "L" } },
            ],
        };
        const ops = participationOps(set);
        expect(ops).toHaveLength(1);
        // Linked child → literal id (an unresolved "@child:0" would fail command validation).
        expect(ops[0].payload).toMatchObject({ child_id: "cm-7", lead_id: "@lead:0" });
    });

    it("emits one participation op per child (one process_instance per child)", () => {
        const set: IdentityResolutionSet = {
            subjects: [
                { ref: "household:0", role: "household", decision: "create" },
                { ref: "child:0", role: "child", decision: "create", householdRef: "household:0", values: { display_name: "A" } },
                { ref: "child:1", role: "child", decision: "create", householdRef: "household:0", values: { display_name: "B" } },
                { ref: "lead:0", role: "lead", decision: "create", householdRef: "household:0" },
            ],
        };
        const ops = participationOps(set);
        expect(ops.map((o) => (o.payload as { child_id: string }).child_id).sort()).toEqual(["@child:0", "@child:1"]);
    });

    it("does not enroll when there is no lead (nothing to participate in)", () => {
        const set: IdentityResolutionSet = {
            subjects: [
                { ref: "household:0", role: "household", decision: "create" },
                { ref: "child:0", role: "child", decision: "create", householdRef: "household:0" },
            ],
        };
        expect(participationOps(set)).toHaveLength(0);
    });

    it("does not enroll a child left unresolved (request_information)", () => {
        const set: IdentityResolutionSet = {
            subjects: [
                { ref: "household:0", role: "household", decision: "create" },
                { ref: "child:0", role: "child", decision: "request_information", householdRef: "household:0" },
                { ref: "lead:0", role: "lead", decision: "create", householdRef: "household:0" },
            ],
        };
        expect(participationOps(set)).toHaveLength(0);
    });

    it("does not duplicate a participation the operator/set already specified", () => {
        const set: IdentityResolutionSet = {
            subjects: [
                { ref: "child:0", role: "child", decision: "create", householdRef: "household:0" },
                { ref: "lead:0", role: "lead", decision: "create", householdRef: "household:0" },
                { ref: "child:0:participation", role: "participation", decision: "create", childRef: "child:0", leadRef: "lead:0" },
            ],
        };
        expect(participationOps(set)).toHaveLength(1);
    });

    it("public-form intake resolutions (household/parent/child/lead) yield an enrollment participation at commit", () => {
        // Mirrors what runCanonicalIdentityResolution persists for a public-form submission:
        // household + parent + child + lead, no participation row — participation is derived at commit.
        const rows: Partial<ProcessingResolutionRow>[] = [
            { id: "res-hh", subject_ref: "household:0", subject_role: "household", decision_action: "create_new", selected_candidate_id: null, candidates: [], provisional: { household_name: "Ann Household" } },
            { id: "res-p", subject_ref: "parent:0", subject_role: "parent", decision_action: "create_new", selected_candidate_id: null, candidates: [], provisional: { first_name: "Ann" } },
            { id: "res-c", subject_ref: "child:0", subject_role: "child", decision_action: "create_new", selected_candidate_id: null, candidates: [], provisional: { display_name: "Kid" } },
            { id: "res-l", subject_ref: "household:0:lead", subject_role: "lead", decision_action: "create_new", selected_candidate_id: null, candidates: [], provisional: { name: "Ann — Lead" } },
        ];
        const set = deriveResolutionSetFromResolutions(rows as unknown as ProcessingResolutionRow[]);
        // derive's own contract is unchanged (no synthetic participation subject persisted).
        expect(set.subjects.map((s) => s.role).sort()).toEqual(["child", "household", "lead", "parent"]);
        // ...but the plan built from it enrolls the child.
        const ops = participationOps(set);
        expect(ops).toHaveLength(1);
        expect(ops[0].payload).toMatchObject({ child_id: "@child:0", lead_id: "@household:0:lead" });
    });
});

/**
 * A SIBLING THE FAMILY ADDED BECOMES A CANONICAL CHILD — after an operator says so.
 *
 * The repeated-party pipeline already produced and reviewed a respondent-added child proposal
 * correctly; there was no way to act on one. `buildExistingChildCommitPlan` refuses any
 * `origin !== "existing_record"` — "Only existing child proposals may commit in P5B" — and that
 * refusal is right for what that plan MEANS: reconciling changes onto a child Alloy already holds.
 * Creating one is a different act, so it got its own plan rather than a loosened old one.
 *
 * These guard that the new path stays an approval-and-orchestration layer over the registered
 * `add_child` capability, and never becomes a second child writer.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { childDraftFromFacts } from "@/lib/pos/processingCase/commit/executeNewChildProposalCommit";
import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";
import { relationshipActionRegistryEntry } from "@/lib/admin/relationship/relationshipActionRegistry";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url).pathname, "utf8");
const EXECUTOR = read("../../lib/pos/processingCase/commit/executeNewChildProposalCommit.ts");
const ROUTE = read(
    "../../app/api/admin/processing/cases/[caseId]/related-record-proposals/[proposalId]/commit/route.ts",
);
const EXISTING_PLAN = read("../../lib/pos/processingCase/commit/children/planExistingChildCommit.ts");

const siblings = {
    id: "household_children",
    type: "group",
    label: "Children in your household",
    repeat: { min: 0 },
    party_collection: { action_key: "add_child", subject: "child", show_known: true, allow_add: true },
    fields: [{ id: "sib_name", type: "text", label: "Full name" }],
} as unknown as FormField;

const SCHEMA = {
    schema_version: 1,
    title: "Enrollment Application",
    fields: [siblings],
    sections: [{ id: "s1", title: "Your family", field_ids: ["household_children"] }],
} as unknown as FormSchemaV1;

const KNOWN_CHILD = "5118bdc0-9526-4ea3-a51e-f6bdf76347fa";

function row(instance_key: string, name: string, origin: "existing" | "respondent_added", item_id?: string) {
    return {
        instance_key,
        values: { sib_name: name },
        groups: {},
        signatures: {},
        collection: {
            provider_ref: "children",
            origin,
            iteration_entity_type: "customer_member",
            ...(item_id ? { item_id } : {}),
        },
    };
}

const bundle = (rows: unknown[]) =>
    adaptFormSubmissionToRelatedRecordProposals(SCHEMA, { values: {}, groups: { household_children: rows } } as never, {
        formSubmissionId: "11111111-1111-4111-8111-111111111111",
        formDefinitionVersionId: "22222222-2222-4222-8222-222222222222",
    }).collections.find((c) => c.collection_key === "household_children")!.instances;

describe("which plan a child proposal gets", () => {
    const instances = bundle([
        row("known:bea", "Bea Disposable0913", "existing", KNOWN_CHILD),
        row("e-dax", "Dax Disposable0913", "respondent_added"),
    ]);
    const bea = instances.find((i) => i.instance_key === "known:bea")!;
    const dax = instances.find((i) => i.instance_key === "e-dax")!;

    it("a respondent-added child asks to be created on the household", () => {
        expect(dax.membership_intent?.identity_action).toBe("create_household_child");
        expect(dax.membership_intent?.apply_command_key).toBe("add_child");
        expect(dax.membership_intent?.apply_scope).toBe("household");
        expect(dax.existing_record_id).toBeUndefined();
    });

    it("an existing child asks to be LINKED, never created", () => {
        expect(bea.membership_intent?.identity_action).toBe("link_existing_child");
        expect(bea.membership_intent?.existing_child_member_id).toBe(KNOWN_CHILD);
    });

    it("the route diverts only on a create intent — an existing child keeps its own plan", () => {
        expect(ROUTE).toContain(
            'if (proposalContext?.proposal.membership_intent?.identity_action === "create_household_child") {',
        );
        expect(ROUTE.indexOf("await executeNewChildProposalCommit({")).toBeLessThan(
            ROUTE.indexOf("await executeExistingChildProposalCommit({"),
        );
    });

    it("leaves the existing-child plan's refusal exactly as it was", () => {
        // Not loosened. Creating a child is a different act, with a different plan.
        expect(EXISTING_PLAN).toContain(
            'if (proposal.origin !== "existing_record") skipped.push(skip("*", "Only existing records can be committed in P5B.", "unsupported"));',
        );
    });

    it("carries the child's identity as a canonical fact, from the question the Form declared", () => {
        expect(dax.membership_intent?.proposed_child_facts).toEqual([
            { entity_type: "customer_member", field_key: "full_name", value: "Dax Disposable0913" },
        ]);
    });
});

describe("two added children keep independent identity", () => {
    // Guards against a hidden child_1 / child_2 positional assumption.
    const instances = bundle([row("e-dax", "Dax Disposable0913", "respondent_added"), row("e-eve", "Eve Disposable0913", "respondent_added")]);

    it("each gets its own stable proposal id", () => {
        expect(instances).toHaveLength(2);
        expect(instances[0].proposal_id).not.toBe(instances[1].proposal_id);
        expect(instances[0].proposal_id).toContain("e-dax");
        expect(instances[1].proposal_id).toContain("e-eve");
    });

    it("each carries only its own child's identity", () => {
        expect(instances[0].membership_intent?.proposed_child_facts[0]?.value).toBe("Dax Disposable0913");
        expect(instances[1].membership_intent?.proposed_child_facts[0]?.value).toBe("Eve Disposable0913");
    });

    it("ordering the rows the other way does not change either identity", () => {
        const flipped = bundle([row("e-eve", "Eve Disposable0913", "respondent_added"), row("e-dax", "Dax Disposable0913", "respondent_added")]);
        const daxId = instances.find((i) => i.instance_key === "e-dax")!.proposal_id;
        expect(flipped.find((i) => i.instance_key === "e-dax")!.proposal_id).toBe(daxId);
    });
});

describe("the identity add_child is given", () => {
    it("splits a full name into the first and last name the capability requires", () => {
        expect(childDraftFromFacts([{ entity_type: "customer_member", field_key: "full_name", value: "Dax Disposable0913" }])).toEqual({
            first_name: "Dax",
            last_name: "Disposable0913",
        });
    });

    it("carries a date of birth when the Form collected one, and omits it when it did not", () => {
        expect(
            childDraftFromFacts([
                { entity_type: "customer_member", field_key: "full_name", value: "Dax Disposable0913" },
                { entity_type: "customer_member", field_key: "date_of_birth", value: "2019-04-02" },
            ]),
        ).toEqual({ first_name: "Dax", last_name: "Disposable0913", date_of_birth: "2019-04-02" });
    });

    it("refuses rather than inventing a name it was not given", () => {
        expect(childDraftFromFacts([])).toBeNull();
        expect(childDraftFromFacts([{ entity_type: "customer_member", field_key: "phone", value: "5415557788" }])).toBeNull();
    });
});

describe("Processing orchestrates the canonical capability and never replaces it", () => {
    it("invokes the registered add_child command through the runtime", () => {
        expect(EXECUTOR).toContain("executeCommandInvocation");
        expect(EXECUTOR).toContain("commandKey: intent.apply_command_key");
        expect(relationshipActionRegistryEntry("add_child")?.executorKind).toBe("add_child");
    });

    it("never writes a child row itself", () => {
        expect(EXECUTOR, "a direct insert would make Processing a second child authority").not.toMatch(
            /\.from\("customer_members"\)|\.from\("persons"\)|\.insert\(/,
        );
    });

    it("sends household scope from the server-derived intent, not from the caller", () => {
        const at = EXECUTOR.indexOf("executeCommandInvocation({");
        const call = EXECUTOR.slice(at, at + 1800);
        expect(call).toContain("scope: intent.apply_scope");
        expect(call).toContain("createChildDraft: draft");
        expect(call).not.toContain("args.scope");
    });
});

describe("nothing canonical happens without an operator", () => {
    it("refuses any decision that is not an explicit approval", () => {
        const at = EXECUTOR.indexOf('args.decision.instance_decision !== "approve"');
        expect(at).toBeGreaterThan(0);
        expect(EXECUTOR.slice(at, at + 260)).toContain("proposal_not_approved");
    });

    it("checks approval BEFORE resolving a household or building a draft", () => {
        const approvalAt = EXECUTOR.indexOf('args.decision.instance_decision !== "approve"');
        expect(approvalAt).toBeLessThan(EXECUTOR.indexOf("resolveCommitHousehold({"));
        expect(approvalAt).toBeLessThan(EXECUTOR.indexOf("childDraftFromFacts(intent.proposed_child_facts)"));
        expect(approvalAt).toBeLessThan(EXECUTOR.indexOf("executeCommandInvocation({"));
    });

    it("refuses a proposal that is not a create, and one that names an existing child", () => {
        expect(EXECUTOR).toContain('intent.identity_action !== "create_household_child"');
        expect(EXECUTOR).toContain("proposal.existing_record_id");
        expect(EXECUTOR).toContain("not_a_new_child_proposal");
    });
});

describe("the household is resolved, never supplied", () => {
    it("uses the same household authority the relationship commit uses", () => {
        expect(EXECUTOR).toContain("loadResolvedProcessingCaseContext");
        expect(EXECUTOR).toContain("resolveCommitHousehold({");
        expect(EXECUTOR).toContain("submissionCustomerId: proposalContext.expectedCustomerId");
    });

    it("creates the child against the resolved household, whatever the subject record is", () => {
        const at = EXECUTOR.indexOf("executeCommandInvocation({");
        const call = EXECUTOR.slice(at, at + 1800);
        // The household is what `household` scope writes against; the subject is only the record
        // the command is invoked from. The adapter recognises child|person|opportunity, never a
        // customer — measured as `Unsupported source entity type "customer"`.
        expect(call).toContain("sourceCustomerId: customerId");
        expect(call).toContain('sourceEntityType: "opportunity"');
        expect(call).not.toContain('sourceEntityType: "customer"');
    });

    it("names the opportunity as subject but never as the destination", () => {
        const at = EXECUTOR.indexOf("executeCommandInvocation({");
        const call = EXECUTOR.slice(at, at + 1800);
        // `household` scope is what decides where the child lands. The capability writes
        // opportunity participation only under `this_opportunity`.
        expect(call).toContain("scope: intent.apply_scope");
        expect(call).not.toContain('scope: "this_opportunity"');
    });

    it("refuses when the case and the submission disagree about the family", () => {
        // `resolveCommitHousehold` returns resolution_conflict; the executor surfaces it, never picks.
        expect(EXECUTOR).toContain("household.code === \"resolution_conflict\"");
        expect(EXECUTOR).not.toContain("?? submissionCustomerId");
    });
});

describe("replay cannot create a second child", () => {
    it("short-circuits on a ledger entry that already applied", () => {
        const at = EXECUTOR.indexOf("const prior = ledgerFrom(args.metadata)[key];");
        expect(at).toBeGreaterThan(0);
        expect(EXECUTOR.slice(at, at + 240)).toContain('outcome: "already_applied"');
    });

    it("short-circuits before the draft and before the command runs", () => {
        const ledgerAt = EXECUTOR.indexOf("const prior = ledgerFrom(args.metadata)[key];");
        expect(ledgerAt).toBeLessThan(EXECUTOR.indexOf("childDraftFromFacts(intent.proposed_child_facts)"));
        expect(ledgerAt).toBeLessThan(EXECUTOR.indexOf("executeCommandInvocation({"));
    });

    it("keys the ledger on the household, so the same proposal into another family is not a retry", () => {
        expect(EXECUTOR).toContain("return `child:${proposalId}:${commandKey}:${customerId}`;");
    });
});

describe("provenance travels with the committed child", () => {
    it("carries the submission, the version, the packet session, the step and the entry", () => {
        for (const part of [
            "form_submission_id: proposalContext.provenance.formSubmissionId",
            "form_definition_version_id",
            "packet_session_id",
            "packet_step_index",
            "instance_key: proposal.instance_key",
        ]) {
            expect(EXECUTOR).toContain(part);
        }
    });

    it("records which household resolution the commit consumed", () => {
        expect(EXECUTOR).toContain("resolution_revision: household.revision");
        expect(EXECUTOR).toContain("resolved_customer_id: customerId");
    });
});

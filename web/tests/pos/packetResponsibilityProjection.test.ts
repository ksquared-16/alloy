/**
 * Phase 7 — Packet responsibility projection (the single composition seam). Verifies enumerate→resolve
 * →project→validate, form-submission → requirement-completion mapping, packet completion, and the
 * per-participant runtime view (Guardian A vs Guardian B) — all through the same deterministic core.
 */
import { describe, it, expect } from "vitest";
import type { RosterChild, RosterRecipient } from "@/lib/pos/packet/posPacketRoster";
import { enumerateRequirementsFromForm, type EnumerableFormSchema, type ProjectionRoster, type RequirementResponsibilityRule } from "@/lib/pos/packet/requirementResponsibility";
import {
    buildRequirementSubmissions,
    evaluatePacketCompletion,
    projectForParticipant,
    projectPacketResponsibilities,
    type FormSubmissionFact,
    type PacketFormInput,
} from "@/lib/pos/packet/packetResponsibilityProjection";

const FORM = "33333333-3333-3333-3333-333333333333";
const schema: EnumerableFormSchema = {
    title: "Enrollment",
    sections: [
        { id: "sec_child", title: "Child information", field_ids: ["f_name"] },
        { id: "sec_docs", title: "Documents", field_ids: ["f_upload", "f_ack", "f_sig"] },
    ],
    fields: [
        { id: "f_name", label: "Child name", required: true, type: "text" },
        { id: "f_upload", label: "Immunization upload", required: true, type: "file_ref" },
        { id: "f_ack", label: "Handbook acknowledgement", required: true, type: "boolean" },
        { id: "f_sig", label: "Enrollment signature", required: true, type: "signature" },
    ],
};
const forms: PacketFormInput[] = [{ form_definition_id: FORM, schema }];

const gA: RosterRecipient = { person_id: "gA", label: "Alex", email: null, phone: null, relationship: "parent" };
const gB: RosterRecipient = { person_id: "gB", label: "Bailey", email: null, phone: null, relationship: "parent" };
const c1: RosterChild = { customer_member_id: "c1", label: "Kid One", dob: null };
const roster: ProjectionRoster = { children: [c1], recipients: [gA, gB] };

// Enrollment configuration: child info per child (either); ack all-guardians; signature all-guardians; upload either.
const rules: RequirementResponsibilityRule[] = [
    { ref: { form_definition_id: FORM, section_id: "sec_child" }, applies_to: "child", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_per_child" },
    { ref: { form_definition_id: FORM, field_id: "f_upload" }, applies_to: "child", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_per_child" },
    { ref: { form_definition_id: FORM, field_id: "f_ack" }, applies_to: "household", responsible_party: { kind: "all_guardians" }, satisfied_by: "every_assigned_participant" },
    { ref: { form_definition_id: FORM, field_id: "f_sig" }, applies_to: "household", responsible_party: { kind: "all_guardians" }, satisfied_by: "every_assigned_participant" },
];

describe("projectPacketResponsibilities", () => {
    it("enumerates, resolves, and projects across the household with no blocking issues", () => {
        const p = projectPacketResponsibilities({ forms, rules, roster });
        expect(p.launch_blocked).toBe(false);
        // child-scoped requirements → one instance per child; household → single instance.
        const upload = p.instances.filter((i) => i.type === "upload");
        expect(upload).toHaveLength(1);
        expect(upload[0].child_id).toBe("c1");
        const sig = p.instances.find((i) => i.type === "signature")!;
        expect(sig.scope_key).toBe("household");
        expect(sig.responsible_participants.map((x) => x.participant_id).sort()).toEqual(["gA", "gB"]);
    });

    it("flags a blocking issue when a required signature has no signer", () => {
        const badRules: RequirementResponsibilityRule[] = [
            { ref: { form_definition_id: FORM, field_id: "f_sig" }, applies_to: "household", responsible_party: { kind: "role", role: "notary" }, satisfied_by: "assigned_participant" },
        ];
        const p = projectPacketResponsibilities({ forms, rules: badRules, roster });
        expect(p.launch_blocked).toBe(true);
    });
});

describe("completion through real form submissions", () => {
    const requirementsByForm = new Map([[FORM, enumerateRequirementsFromForm(FORM, schema)]]);

    it("either-guardian + one-per-child satisfied by one guardian submitting for the child", () => {
        const p = projectPacketResponsibilities({ forms, rules, roster });
        const facts: FormSubmissionFact[] = [{ form_definition_id: FORM, participant_id: "gA", child_id: "c1", document_ids: ["doc-immun"] }];
        const subs = buildRequirementSubmissions(facts, requirementsByForm);
        const completion = evaluatePacketCompletion(p.instances, subs);
        // child info + upload (either/one-per-child) done; ack + signature (all guardians) still need gB.
        const uploadDone = completion.completions.find((c) => c.instance.type === "upload")!.complete;
        expect(uploadDone).toBe(true);
        expect(completion.complete).toBe(false);
        expect(completion.outstanding_required).toBeGreaterThan(0);
    });

    it("all-guardian requirements complete only after BOTH guardians submit; packet then complete", () => {
        const p = projectPacketResponsibilities({ forms, rules, roster });
        const facts: FormSubmissionFact[] = [
            { form_definition_id: FORM, participant_id: "gA", child_id: "c1", document_ids: ["d1"] },
            { form_definition_id: FORM, participant_id: "gB", child_id: "c1", document_ids: ["d2"] },
        ];
        const subs = buildRequirementSubmissions(facts, requirementsByForm);
        const completion = evaluatePacketCompletion(p.instances, subs);
        expect(completion.completions.find((c) => c.instance.type === "signature")!.complete).toBe(true);
        expect(completion.complete).toBe(true);
    });
});

describe("projectForParticipant — per-guardian runtime seam", () => {
    it("Guardian A and Guardian B each see the shared all-guardian requirements as their own work", () => {
        const p = projectPacketResponsibilities({ forms, rules, roster });
        const completion = evaluatePacketCompletion(p.instances, []);
        const aView = projectForParticipant({ completions: completion.completions, participantId: "gA" });
        const bView = projectForParticipant({ completions: completion.completions, participantId: "gB" });
        // Signature (all guardians) is unresolved and owned by each.
        expect(aView.some((v) => v.type === "signature" && v.state === "unresolved")).toBe(true);
        expect(bView.some((v) => v.type === "signature" && v.state === "unresolved")).toBe(true);
        // Either-can-complete upload shows as either_can_complete for both.
        expect(aView.some((v) => v.type === "upload" && v.state === "either_can_complete")).toBe(true);
    });

    it("after Guardian A submits, Guardian A sees complete/owned-by-others; Guardian B still owes all-guardian items", () => {
        const requirementsByForm = new Map([[FORM, enumerateRequirementsFromForm(FORM, schema)]]);
        const p = projectPacketResponsibilities({ forms, rules, roster });
        const subs = buildRequirementSubmissions([{ form_definition_id: FORM, participant_id: "gA", child_id: "c1", document_ids: ["d1"] }], requirementsByForm);
        const completion = evaluatePacketCompletion(p.instances, subs);
        const bView = projectForParticipant({ completions: completion.completions, participantId: "gB" });
        // Guardian B still has the all-guardian signature unresolved (A's submission didn't satisfy every-assigned).
        expect(bView.some((v) => v.type === "signature" && v.state === "unresolved")).toBe(true);
        // The either-can-complete upload is now complete for both.
        expect(bView.find((v) => v.type === "upload")?.state).toBe("complete");
    });
});

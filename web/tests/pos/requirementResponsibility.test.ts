/**
 * Phase 7 — Requirement Responsibility core. Covers the enrollment proving-journey scenarios:
 * household vs child-specific requirements; either / both / specific guardian; financial guardian;
 * signature/acknowledgement/upload ownership; resolution order; completion per satisfaction rule;
 * and safe round-trip of rules through packet metadata.
 */
import { describe, it, expect } from "vitest";
import type { RosterChild, RosterRecipient } from "@/lib/pos/packet/posPacketRoster";
import {
    DEFAULT_RESPONSIBILITY,
    deriveParticipantRequirements,
    evaluateCompletion,
    parseRequirementResponsibilityRules,
    refKey,
    resolveResponsibility,
    type EnumeratedRequirement,
    type ProjectionRoster,
    type RequirementResponsibilityRule,
    type RequirementSubmission,
} from "@/lib/pos/packet/requirementResponsibility";

const FORM_MEDICAL = "11111111-1111-1111-1111-111111111111";
const FORM_AGREEMENT = "22222222-2222-2222-2222-222222222222";

const guardianA: RosterRecipient = { person_id: "gA", label: "Alex Guardian", email: "a@x.com", phone: null, relationship: "parent" };
const guardianB: RosterRecipient = { person_id: "gB", label: "Bailey Guardian", email: "b@x.com", phone: null, relationship: "financial guardian" };
const child1: RosterChild = { customer_member_id: "c1", label: "Kid One", dob: "2021-05-01" };
const child2: RosterChild = { customer_member_id: "c2", label: "Kid Two", dob: "2023-02-01" };

const roster: ProjectionRoster = { children: [child1, child2], recipients: [guardianA, guardianB] };

describe("resolveResponsibility — resolution order", () => {
    const rules: RequirementResponsibilityRule[] = [
        { ref: { form_definition_id: FORM_MEDICAL }, applies_to: "child", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_per_child" },
        { ref: { form_definition_id: FORM_MEDICAL, section_key: "signature" }, applies_to: "child", responsible_party: { kind: "all_guardians" }, satisfied_by: "every_assigned_participant" },
    ];

    it("prefers a section-specific rule over the form-level default", () => {
        const r = resolveResponsibility(rules, { form_definition_id: FORM_MEDICAL, section_key: "signature" });
        expect(r.responsible_party).toEqual({ kind: "all_guardians" });
        expect(r.satisfied_by).toBe("every_assigned_participant");
    });

    it("falls back to the form-level default for other sections", () => {
        const r = resolveResponsibility(rules, { form_definition_id: FORM_MEDICAL, section_key: "allergies" });
        expect(r.responsible_party).toEqual({ kind: "either_guardian" });
    });

    it("falls back to packet default, then built-in default", () => {
        const packetDefault = { ...DEFAULT_RESPONSIBILITY, applies_to: "household" as const };
        expect(resolveResponsibility(rules, { form_definition_id: FORM_AGREEMENT }, packetDefault).applies_to).toBe("household");
        expect(resolveResponsibility([], { form_definition_id: FORM_AGREEMENT })).toEqual(DEFAULT_RESPONSIBILITY);
    });
});

describe("deriveParticipantRequirements — the enrollment proving journey", () => {
    const requirements: EnumeratedRequirement[] = [
        { ref: { form_definition_id: FORM_AGREEMENT }, label: "Family Agreement", disposition: "acknowledgement" },
        { ref: { form_definition_id: FORM_MEDICAL }, label: "Medical Form", disposition: "fields" },
    ];

    it("household requirement → one family instance owned by either guardian", () => {
        const rules: RequirementResponsibilityRule[] = [
            { ref: { form_definition_id: FORM_AGREEMENT }, applies_to: "household", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_participant" },
        ];
        const instances = deriveParticipantRequirements({ requirements: [requirements[0]], rules, roster });
        expect(instances).toHaveLength(1);
        expect(instances[0].scope_key).toBe("household");
        expect(instances[0].child_id).toBeNull();
        expect(instances[0].responsible_participants.map((p) => p.participant_id).sort()).toEqual(["gA", "gB"]);
        expect(instances[0].disposition).toBe("acknowledgement");
    });

    it("child-specific requirement → one instance per child", () => {
        const rules: RequirementResponsibilityRule[] = [
            { ref: { form_definition_id: FORM_MEDICAL }, applies_to: "child", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_per_child" },
        ];
        const instances = deriveParticipantRequirements({ requirements: [requirements[1]], rules, roster });
        expect(instances.map((i) => i.child_id).sort()).toEqual(["c1", "c2"]);
        expect(instances.every((i) => i.scope_key.startsWith("child:"))).toBe(true);
    });

    it("specific guardian → only that guardian owns it", () => {
        const rules: RequirementResponsibilityRule[] = [
            { ref: { form_definition_id: FORM_AGREEMENT }, applies_to: "household", responsible_party: { kind: "specific_guardian", person_id: "gA" }, satisfied_by: "assigned_participant" },
        ];
        const [inst] = deriveParticipantRequirements({ requirements: [requirements[0]], rules, roster });
        expect(inst.responsible_participants).toHaveLength(1);
        expect(inst.responsible_participants[0].participant_id).toBe("gA");
    });

    it("financial guardian → resolved from relationship when no id given", () => {
        const rules: RequirementResponsibilityRule[] = [
            { ref: { form_definition_id: FORM_AGREEMENT }, applies_to: "household", responsible_party: { kind: "financial_guardian" }, satisfied_by: "assigned_participant" },
        ];
        const [inst] = deriveParticipantRequirements({ requirements: [requirements[0]], rules, roster });
        expect(inst.responsible_participants.map((p) => p.participant_id)).toEqual(["gB"]); // "financial guardian" relationship
    });

    it("both guardians (all_guardians + every_assigned) → both are responsible", () => {
        const rules: RequirementResponsibilityRule[] = [
            { ref: { form_definition_id: FORM_AGREEMENT }, applies_to: "household", responsible_party: { kind: "all_guardians" }, satisfied_by: "every_assigned_participant" },
        ];
        const [inst] = deriveParticipantRequirements({ requirements: [requirements[0]], rules, roster });
        expect(inst.responsible_participants).toHaveLength(2);
    });
});

describe("evaluateCompletion — per satisfaction rule", () => {
    const requirements: EnumeratedRequirement[] = [{ ref: { form_definition_id: FORM_AGREEMENT }, label: "Agreement", disposition: "signature" }];
    const sub = (participant_id: string, extra?: Partial<RequirementSubmission>): RequirementSubmission => ({
        ref_key: refKey({ form_definition_id: FORM_AGREEMENT }),
        scope_key: "household",
        participant_id,
        ...extra,
    });

    it("one_participant: any submission completes it", () => {
        const rules: RequirementResponsibilityRule[] = [{ ref: { form_definition_id: FORM_AGREEMENT }, applies_to: "household", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_participant" }];
        const inst = deriveParticipantRequirements({ requirements, rules, roster });
        expect(evaluateCompletion(inst, [])[0].complete).toBe(false);
        expect(evaluateCompletion(inst, [sub("gA")])[0].complete).toBe(true);
    });

    it("every_assigned_participant: complete only when all responsible have submitted; reports outstanding", () => {
        const rules: RequirementResponsibilityRule[] = [{ ref: { form_definition_id: FORM_AGREEMENT }, applies_to: "household", responsible_party: { kind: "all_guardians" }, satisfied_by: "every_assigned_participant" }];
        const inst = deriveParticipantRequirements({ requirements, rules, roster });
        const partial = evaluateCompletion(inst, [sub("gA")])[0];
        expect(partial.complete).toBe(false);
        expect(partial.outstanding_participants.map((p) => p.participant_id)).toEqual(["gB"]);
        const full = evaluateCompletion(inst, [sub("gA"), sub("gB")])[0];
        expect(full.complete).toBe(true);
        expect(full.outstanding_participants).toHaveLength(0);
    });

    it("assigned_participant: only a responsible participant's submission counts", () => {
        const rules: RequirementResponsibilityRule[] = [{ ref: { form_definition_id: FORM_AGREEMENT }, applies_to: "household", responsible_party: { kind: "specific_guardian", person_id: "gA" }, satisfied_by: "assigned_participant" }];
        const inst = deriveParticipantRequirements({ requirements, rules, roster });
        expect(evaluateCompletion(inst, [sub("gB")])[0].complete).toBe(false); // wrong guardian
        expect(evaluateCompletion(inst, [sub("gA")])[0].complete).toBe(true);
    });

    it("one_per_document: needs a submission carrying a document_id", () => {
        const rules: RequirementResponsibilityRule[] = [{ ref: { form_definition_id: FORM_AGREEMENT }, applies_to: "document", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_per_document" }];
        const inst = deriveParticipantRequirements({ requirements, rules, roster });
        expect(evaluateCompletion(inst, [sub("gA")])[0].complete).toBe(false);
        expect(evaluateCompletion(inst, [sub("gA", { document_id: "doc1" })])[0].complete).toBe(true);
    });
});

describe("parseRequirementResponsibilityRules — safe round-trip from packet metadata", () => {
    it("keeps valid rules and drops malformed ones", () => {
        const metadata = {
            requirement_responsibilities: [
                { ref: { form_definition_id: FORM_MEDICAL, section_key: "signature" }, applies_to: "child", responsible_party: { kind: "specific_guardian", person_id: "gA" }, satisfied_by: "every_assigned_participant" },
                { ref: { form_definition_id: FORM_AGREEMENT }, applies_to: "household", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_participant" },
                { ref: {}, applies_to: "child", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_participant" }, // no form id
                { ref: { form_definition_id: FORM_MEDICAL }, applies_to: "bogus", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_participant" }, // bad scope
                { ref: { form_definition_id: FORM_MEDICAL }, applies_to: "child", responsible_party: { kind: "specific_guardian" }, satisfied_by: "one_participant" }, // missing person_id
            ],
        };
        const parsed = parseRequirementResponsibilityRules(metadata);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].ref.section_key).toBe("signature");
        expect(parsed[1].responsible_party).toEqual({ kind: "either_guardian" });
    });

    it("returns [] for absent/invalid metadata", () => {
        expect(parseRequirementResponsibilityRules(null)).toEqual([]);
        expect(parseRequirementResponsibilityRules({})).toEqual([]);
        expect(parseRequirementResponsibilityRules({ requirement_responsibilities: "nope" })).toEqual([]);
    });
});

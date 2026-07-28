/**
 * Phase 7 — Requirement Responsibility core. Covers requirement enumeration/identity, the enrollment
 * proving-journey scenarios (household vs child-specific; either/both/specific/financial/primary
 * guardian; signature/ack/upload ownership), resolution order (field → section → form), blocking
 * validation, completion per satisfaction rule, packet completion, and safe metadata round-trip.
 */
import { describe, it, expect } from "vitest";
import type { RosterChild, RosterRecipient } from "@/lib/pos/packet/posPacketRoster";
import {
    DEFAULT_RESPONSIBILITY,
    deriveParticipantRequirements,
    enumerateRequirementsFromForm,
    evaluateCompletion,
    isPacketComplete,
    parseRequirementResponsibilityRules,
    refKey,
    resolveResponsibility,
    validateProjection,
    type EnumerableFormSchema,
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

describe("enumerateRequirementsFromForm — stable identity + type inference", () => {
    const schema: EnumerableFormSchema = {
        title: "Enrollment",
        sections: [
            { id: "sec_info", title: "Child information", field_ids: ["f_name", "f_dob"] },
            { id: "sec_docs", title: "Documents", field_ids: ["f_immun", "f_ack", "f_sig"] },
        ],
        fields: [
            { id: "f_name", label: "Child name", required: true, type: "text" },
            { id: "f_dob", label: "Date of birth", required: true, type: "date" },
            { id: "f_immun", label: "Immunization record", required: true, type: "file_ref" },
            { id: "f_ack", label: "Handbook acknowledgement", required: true, type: "boolean" },
            { id: "f_sig", label: "Signature", required: true, type: "signature" },
        ],
    };

    it("emits field-grain requirements for upload/ack/signature and a section-grain info requirement", () => {
        const reqs = enumerateRequirementsFromForm(FORM_MEDICAL, schema);
        const byType = reqs.map((r) => `${r.type}:${r.ref.field_id ?? r.ref.section_id}`);
        expect(byType).toContain("upload:f_immun");
        expect(byType).toContain("acknowledgement:f_ack");
        expect(byType).toContain("signature:f_sig");
        expect(byType).toContain("information:sec_info");
        // The info section collapses plain inputs into ONE requirement, not one per field.
        expect(reqs.filter((r) => r.type === "information")).toHaveLength(1);
    });

    it("assigns sensible, type-based default responsibility", () => {
        const reqs = enumerateRequirementsFromForm(FORM_MEDICAL, schema);
        const upload = reqs.find((r) => r.type === "upload")!;
        const ack = reqs.find((r) => r.type === "acknowledgement")!;
        expect(upload.default_responsibility.responsible_party).toEqual({ kind: "either_guardian" });
        expect(ack.default_responsibility).toMatchObject({ responsible_party: { kind: "all_guardians" }, satisfied_by: "every_assigned_participant" });
    });

    it("uses stable schema ids (not labels/positions) for the ref", () => {
        const reqs = enumerateRequirementsFromForm(FORM_MEDICAL, schema);
        expect(reqs.every((r) => r.ref.form_definition_id === FORM_MEDICAL)).toBe(true);
        expect(reqs.find((r) => r.type === "upload")!.ref.field_id).toBe("f_immun");
    });
});

describe("resolveResponsibility — field → section → form → packet → built-in", () => {
    const rules: RequirementResponsibilityRule[] = [
        { ref: { form_definition_id: FORM_MEDICAL }, applies_to: "child", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_per_child" },
        { ref: { form_definition_id: FORM_MEDICAL, section_id: "sec_docs" }, applies_to: "household", responsible_party: { kind: "all_guardians" }, satisfied_by: "every_assigned_participant" },
        { ref: { form_definition_id: FORM_MEDICAL, field_id: "f_sig" }, applies_to: "household", responsible_party: { kind: "specific_guardian", person_id: "gA" }, satisfied_by: "assigned_participant" },
    ];

    it("field-specific rule wins", () => {
        expect(resolveResponsibility(rules, { form_definition_id: FORM_MEDICAL, field_id: "f_sig", section_id: "sec_docs" }).responsible_party).toEqual({ kind: "specific_guardian", person_id: "gA" });
    });
    it("section rule beats form-level default", () => {
        expect(resolveResponsibility(rules, { form_definition_id: FORM_MEDICAL, section_id: "sec_docs" }).responsible_party).toEqual({ kind: "all_guardians" });
    });
    it("form-level default applies elsewhere", () => {
        expect(resolveResponsibility(rules, { form_definition_id: FORM_MEDICAL, section_id: "sec_info" }).satisfied_by).toBe("one_per_child");
    });
    it("packet default then built-in default", () => {
        const pd = { ...DEFAULT_RESPONSIBILITY, applies_to: "household" as const };
        expect(resolveResponsibility(rules, { form_definition_id: FORM_AGREEMENT }, pd).applies_to).toBe("household");
        expect(resolveResponsibility([], { form_definition_id: FORM_AGREEMENT })).toEqual(DEFAULT_RESPONSIBILITY);
    });
});

describe("deriveParticipantRequirements — proving-journey projection", () => {
    const infoReq: EnumeratedRequirement = { ref: { form_definition_id: FORM_AGREEMENT, section_id: "s1" }, type: "information", label: "Household info", required: true, default_responsibility: DEFAULT_RESPONSIBILITY };
    const childReq: EnumeratedRequirement = { ref: { form_definition_id: FORM_MEDICAL, section_id: "s2" }, type: "information", label: "Child info", required: true, default_responsibility: DEFAULT_RESPONSIBILITY };

    it("household → one family instance; both guardians for either_guardian", () => {
        const rules: RequirementResponsibilityRule[] = [{ ref: infoReq.ref, applies_to: "household", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_participant" }];
        const [inst] = deriveParticipantRequirements({ requirements: [infoReq], rules, roster });
        expect(inst.scope_key).toBe("household");
        expect(inst.responsible_participants.map((p) => p.participant_id).sort()).toEqual(["gA", "gB"]);
    });
    it("child scope → one instance per child", () => {
        const rules: RequirementResponsibilityRule[] = [{ ref: childReq.ref, applies_to: "child", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_per_child" }];
        const inst = deriveParticipantRequirements({ requirements: [childReq], rules, roster });
        expect(inst.map((i) => i.child_id).sort()).toEqual(["c1", "c2"]);
    });
    it("specific / financial / primary guardian resolve correctly", () => {
        const mk = (party: RequirementResponsibilityRule["responsible_party"]): RequirementResponsibilityRule => ({ ref: infoReq.ref, applies_to: "household", responsible_party: party, satisfied_by: "assigned_participant" });
        expect(deriveParticipantRequirements({ requirements: [infoReq], rules: [mk({ kind: "specific_guardian", person_id: "gB" })], roster })[0].responsible_participants.map((p) => p.participant_id)).toEqual(["gB"]);
        expect(deriveParticipantRequirements({ requirements: [infoReq], rules: [mk({ kind: "financial_guardian" })], roster })[0].responsible_participants.map((p) => p.participant_id)).toEqual(["gB"]);
        expect(deriveParticipantRequirements({ requirements: [infoReq], rules: [mk({ kind: "primary_guardian" })], roster })[0].responsible_participants.map((p) => p.participant_id)).toEqual(["gA"]);
    });
});

describe("validateProjection — blocking responsibility errors", () => {
    const req: EnumeratedRequirement = { ref: { form_definition_id: FORM_AGREEMENT, field_id: "f_sig" }, type: "signature", label: "Signature", required: true, default_responsibility: DEFAULT_RESPONSIBILITY };
    it("flags a required signature nobody can satisfy (missing role) as blocking", () => {
        const rules: RequirementResponsibilityRule[] = [{ ref: req.ref, applies_to: "household", responsible_party: { kind: "role", role: "notary" }, satisfied_by: "assigned_participant" }];
        const inst = deriveParticipantRequirements({ requirements: [req], rules, roster });
        const issues = validateProjection(inst, roster);
        expect(issues.some((i) => i.blocking && i.code === "role_not_present")).toBe(true);
    });
    it("warns (non-blocking) on all-guardians with a single guardian", () => {
        const soloRoster: ProjectionRoster = { children: [child1], recipients: [guardianA] };
        const rules: RequirementResponsibilityRule[] = [{ ref: req.ref, applies_to: "household", responsible_party: { kind: "all_guardians" }, satisfied_by: "every_assigned_participant" }];
        const inst = deriveParticipantRequirements({ requirements: [req], rules, roster: soloRoster });
        const issues = validateProjection(inst, soloRoster);
        expect(issues.some((i) => i.code === "all_guardians_with_one_guardian" && !i.blocking)).toBe(true);
    });
    it("clean projection produces no blocking issues", () => {
        const rules: RequirementResponsibilityRule[] = [{ ref: req.ref, applies_to: "household", responsible_party: { kind: "all_guardians" }, satisfied_by: "every_assigned_participant" }];
        const inst = deriveParticipantRequirements({ requirements: [req], rules, roster });
        expect(validateProjection(inst, roster).filter((i) => i.blocking)).toHaveLength(0);
    });
});

describe("evaluateCompletion + isPacketComplete", () => {
    const req: EnumeratedRequirement = { ref: { form_definition_id: FORM_AGREEMENT, field_id: "f_sig" }, type: "signature", label: "Signature", required: true, default_responsibility: DEFAULT_RESPONSIBILITY };
    const sub = (participant_id: string, extra?: Partial<RequirementSubmission>): RequirementSubmission => ({ ref_key: refKey(req.ref), scope_key: "household", participant_id, ...extra });

    it("either-guardian: first completion satisfies", () => {
        const inst = deriveParticipantRequirements({ requirements: [req], rules: [{ ref: req.ref, applies_to: "household", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_participant" }], roster });
        expect(evaluateCompletion(inst, [])[0].complete).toBe(false);
        expect(isPacketComplete(evaluateCompletion(inst, [sub("gA")]))).toBe(true);
    });
    it("all-guardians: needs every responsible guardian; reports outstanding", () => {
        const inst = deriveParticipantRequirements({ requirements: [req], rules: [{ ref: req.ref, applies_to: "household", responsible_party: { kind: "all_guardians" }, satisfied_by: "every_assigned_participant" }], roster });
        const partial = evaluateCompletion(inst, [sub("gA")])[0];
        expect(partial.complete).toBe(false);
        expect(partial.outstanding_participants.map((p) => p.participant_id)).toEqual(["gB"]);
        expect(isPacketComplete(evaluateCompletion(inst, [sub("gA"), sub("gB")]))).toBe(true);
    });
    it("one-per-child: a completion per child instance", () => {
        const childReq: EnumeratedRequirement = { ...req, ref: { form_definition_id: FORM_MEDICAL, section_id: "s2" }, type: "information" };
        const inst = deriveParticipantRequirements({ requirements: [childReq], rules: [{ ref: childReq.ref, applies_to: "child", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_per_child" }], roster });
        const one = evaluateCompletion(inst, [{ ref_key: refKey(childReq.ref), scope_key: "child:c1", participant_id: "gA" }]);
        expect(one.find((c) => c.instance.child_id === "c1")!.complete).toBe(true);
        expect(one.find((c) => c.instance.child_id === "c2")!.complete).toBe(false);
        expect(isPacketComplete(one)).toBe(false);
    });
    it("one-per-document: needs a submission with a document_id", () => {
        const inst = deriveParticipantRequirements({ requirements: [{ ...req, type: "generated_review" }], rules: [{ ref: req.ref, applies_to: "document", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_per_document" }], roster });
        expect(evaluateCompletion(inst, [sub("gA")])[0].complete).toBe(false);
        expect(evaluateCompletion(inst, [sub("gA", { document_id: "doc1" })])[0].complete).toBe(true);
    });
});

describe("parseRequirementResponsibilityRules — safe round-trip incl. field_id", () => {
    it("keeps valid rules (field_id + section_id) and drops malformed", () => {
        const metadata = {
            requirement_responsibilities: [
                { ref: { form_definition_id: FORM_MEDICAL, field_id: "f_sig" }, applies_to: "household", responsible_party: { kind: "specific_guardian", person_id: "gA" }, satisfied_by: "assigned_participant" },
                { ref: { form_definition_id: FORM_MEDICAL, section_id: "sec_info" }, applies_to: "child", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_per_child" },
                { ref: {}, applies_to: "child", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_participant" },
                { ref: { form_definition_id: FORM_MEDICAL }, applies_to: "bogus", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_participant" },
                { ref: { form_definition_id: FORM_MEDICAL }, applies_to: "child", responsible_party: { kind: "specific_guardian" }, satisfied_by: "one_participant" },
            ],
        };
        const parsed = parseRequirementResponsibilityRules(metadata);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].ref.field_id).toBe("f_sig");
        expect(parsed[1].ref.section_id).toBe("sec_info");
    });
    it("returns [] for absent/invalid metadata", () => {
        expect(parseRequirementResponsibilityRules(null)).toEqual([]);
        expect(parseRequirementResponsibilityRules({ requirement_responsibilities: "nope" })).toEqual([]);
    });
});

import { describe, expect, it } from "vitest";
import {
    buildEntityConnectionRows,
    buildIntakeOperatorSummary,
    buildSubmissionIntakeSection,
    describeDocumentOutcome,
    describeSubmissionLifecycle,
    documentGenerationBlockedByIntake,
    intakeFollowUpNotes,
    payloadHasCapturedSignatures,
    recommendedNextAction,
    submissionHasDocumentAttachTarget,
} from "@/lib/forms/submissionOutcomeSummary";

describe("submissionOutcomeSummary", () => {
    it("detects signatures on payload", () => {
        expect(payloadHasCapturedSignatures(null)).toBe(false);
        expect(payloadHasCapturedSignatures({ values: {} })).toBe(false);
        expect(
            payloadHasCapturedSignatures({
                values: {},
                signatures: {
                    sig: { kind: "typed", typed_full_name: "A", acknowledged_at: new Date().toISOString() },
                },
            })
        ).toBe(true);
    });

    it("describeSubmissionLifecycle — draft vs submitted", () => {
        const d = describeSubmissionLifecycle({
            status: "draft",
            payloadHasSignatures: false,
        });
        expect(d.headline).toBe("Draft");
        expect(d.notes.some((l) => /not finished/i.test(l))).toBe(true);

        const s = describeSubmissionLifecycle({
            status: "submitted",
            payloadHasSignatures: true,
        });
        expect(s.headline).toBe("Submitted");
        expect(s.notes.some((l) => /signature/i.test(l))).toBe(true);
    });

    it("buildEntityConnectionRows marks linked vs not", () => {
        const rows = buildEntityConnectionRows({
            person_id: "p1",
            customer_id: null,
            customer_member_id: null,
            opportunity_id: null,
            created_via_public_link_id: "link1",
        });
        expect(rows.find((r) => r.key === "person")?.recordId).toBe("p1");
        expect(rows.find((r) => r.key === "customer")?.recordId).toBeNull();
        expect(rows.find((r) => r.key === "public_link")?.recordId).toBe("link1");
    });

    it("describeDocumentOutcome — submitted with no document", () => {
        const o = describeDocumentOutcome({
            linkedDocumentsCount: 0,
            submissionStatus: "submitted",
            canMutate: true,
        });
        expect(o.headline.toLowerCase()).toContain("no document");
        expect(o.bullets.some((b) => /generate document/i.test(b))).toBe(true);
    });

    it("describeDocumentOutcome — blocked does not promise Generate yet", () => {
        const o = describeDocumentOutcome({
            linkedDocumentsCount: 0,
            submissionStatus: "submitted",
            canMutate: true,
            documentGenerationBlocked: true,
        });
        expect(o.bullets.some((b) => /blocked/i.test(b))).toBe(true);
        expect(o.bullets.some((b) => /generate document below/i.test(b))).toBe(false);
    });

    it("describeDocumentOutcome — submitted with linked doc", () => {
        const o = describeDocumentOutcome({
            linkedDocumentsCount: 2,
            submissionStatus: "submitted",
            canMutate: true,
        });
        expect(o.headline.toLowerCase()).toContain("stored");
        expect(o.bullets.some((b) => /2 linked/i.test(b))).toBe(true);
    });

    it("describeDocumentOutcome — draft", () => {
        const o = describeDocumentOutcome({
            linkedDocumentsCount: 0,
            submissionStatus: "draft",
            canMutate: true,
        });
        expect(o.bullets.some((b) => /submit/i.test(b))).toBe(true);
    });

    it("recommendedNextAction — draft", () => {
        const r = recommendedNextAction({
            status: "draft",
            linkedDocumentsCount: 0,
            canMutate: true,
            hasAnyCrmEntityLink: false,
        });
        expect(r.join(" ").toLowerCase()).toContain("wait");
    });

    it("recommendedNextAction — submitted no doc without CRM asks to link first", () => {
        const r = recommendedNextAction({
            status: "submitted",
            linkedDocumentsCount: 0,
            canMutate: true,
            hasAnyCrmEntityLink: false,
        });
        expect(r.some((l) => /link this submission to the correct crm record/i.test(l))).toBe(true);
        expect(r.some((l) => /generate a document when your process requires/i.test(l))).toBe(false);
    });

    it("recommendedNextAction — submitted no doc with intake-clear attach suggests generate", () => {
        const r = recommendedNextAction({
            status: "submitted",
            linkedDocumentsCount: 0,
            canMutate: true,
            hasAnyCrmEntityLink: true,
            attachRow: {
                person_id: "p1",
                customer_id: null,
                customer_member_id: null,
                opportunity_id: null,
            },
            payloadMeta: {
                intake_resolution_path: "matched_email",
                intake_needs_review: false,
            },
        });
        expect(r.some((l) => /generate a document/i.test(l))).toBe(true);
    });

    it("recommendedNextAction — submitted with doc", () => {
        const r = recommendedNextAction({
            status: "submitted",
            linkedDocumentsCount: 1,
            canMutate: true,
            hasAnyCrmEntityLink: false,
        });
        expect(r.join(" ").toLowerCase()).toMatch(/open|linked|workflow/);
    });

    it("recommendedNextAction — CRM hint when links exist", () => {
        const r = recommendedNextAction({
            status: "submitted",
            linkedDocumentsCount: 1,
            canMutate: false,
            hasAnyCrmEntityLink: true,
        });
        expect(r.some((l) => /open/i.test(l) && /person|crm/i.test(l))).toBe(true);
    });

    it("buildIntakeOperatorSummary — matched_email linked", () => {
        const s = buildIntakeOperatorSummary({
            intake_resolution_path: "matched_email",
            intake_match_strategy: "matched_email",
            intake_match_confidence: "high",
            intake_needs_review: false,
        });
        expect(s?.statusLabel).toBe("Linked");
        expect(s?.strategyLabel).toMatch(/email/i);
    });

    it("buildIntakeOperatorSummary — needs_human_review shows operator warning", () => {
        const s = buildIntakeOperatorSummary({
            intake_resolution_path: "needs_human_review",
            intake_match_strategy: "no_match",
            intake_match_confidence: "none",
            intake_needs_review: true,
            intake_review_reason: "No matching person",
        });
        expect(s?.statusLabel).toBe("Needs review");
        expect(s?.detailLines.some((l) => /do not generate a document/i.test(l))).toBe(true);
    });

    it("buildIntakeOperatorSummary — ambiguous_contact blocks document copy", () => {
        const s = buildIntakeOperatorSummary({
            intake_resolution_path: "ambiguous_contact",
            intake_match_strategy: "ambiguous_email",
            intake_match_confidence: "none",
            intake_needs_review: true,
        });
        expect(s?.statusLabel).toBe("Needs review");
        expect(s?.detailLines.some((l) => /do not generate a document until the correct person/i.test(l))).toBe(true);
    });

    it("documentGenerationBlockedByIntake — ambiguous path blocks even with CRM row", () => {
        const row = { person_id: "p1", customer_id: "c1", customer_member_id: null, opportunity_id: null };
        expect(submissionHasDocumentAttachTarget(row)).toBe(true);
        const r = documentGenerationBlockedByIntake(
            { intake_resolution_path: "ambiguous_contact", intake_needs_review: true },
            row
        );
        expect(r.blocked).toBe(true);
        expect(r.reason?.toLowerCase()).toMatch(/human review|linked correctly/);
    });

    it("documentGenerationBlockedByIntake — linked matched_email with attach target allows", () => {
        const row = { person_id: "p1", customer_id: null, customer_member_id: null, opportunity_id: null };
        const r = documentGenerationBlockedByIntake(
            {
                intake_resolution_path: "matched_email",
                intake_match_strategy: "matched_email",
                intake_needs_review: false,
            },
            row
        );
        expect(r.blocked).toBe(false);
    });

    it("documentGenerationBlockedByIntake — intake_needs_review blocks", () => {
        const row = { person_id: "p1", customer_id: "c1", customer_member_id: null, opportunity_id: null };
        const r = documentGenerationBlockedByIntake(
            { intake_resolution_path: "matched_phone", intake_needs_review: true },
            row
        );
        expect(r.blocked).toBe(true);
    });

    it("documentGenerationBlockedByIntake — operator confirmed clears intake_needs_review block", () => {
        const row = { person_id: "p1", customer_id: null, customer_member_id: null, opportunity_id: null };
        const r = documentGenerationBlockedByIntake(
            {
                intake_resolution_path: "matched_email",
                intake_needs_review: false,
                intake_review_result: "confirmed",
            },
            row
        );
        expect(r.blocked).toBe(false);
    });

    it("documentGenerationBlockedByIntake — manually_linked allows when attach parent exists", () => {
        const row = { person_id: null, customer_id: null, customer_member_id: "m1", opportunity_id: null };
        const r = documentGenerationBlockedByIntake(
            {
                intake_resolution_path: "manually_linked",
                intake_match_strategy: "operator_selected",
                intake_match_confidence: "human_reviewed",
                intake_needs_review: false,
                intake_review_result: "corrected",
            },
            row
        );
        expect(r.blocked).toBe(false);
    });

    it("documentGenerationBlockedByIntake — skipped_intake_disabled blocks without attach parent", () => {
        const row = { person_id: null, customer_id: null, customer_member_id: null, opportunity_id: null };
        const r = documentGenerationBlockedByIntake({ intake_resolution_path: "skipped_intake_disabled" }, row);
        expect(r.blocked).toBe(true);
    });

    it("documentGenerationBlockedByIntake — skipped_intake_disabled allows when CRM row present", () => {
        const row = { person_id: "p1", customer_id: null, customer_member_id: null, opportunity_id: null };
        const r = documentGenerationBlockedByIntake({ intake_resolution_path: "skipped_intake_disabled" }, row);
        expect(r.blocked).toBe(false);
    });

    it("buildIntakeOperatorSummary — skipped_intake_disabled", () => {
        const s = buildIntakeOperatorSummary({
            intake_resolution_path: "skipped_intake_disabled",
            intake_skip_reason: "x",
        });
        expect(s?.statusLabel).toBe("Skipped");
        expect(s?.detailLines.some((l) => /lead_capture/i.test(l))).toBe(true);
    });

    it("intakeFollowUpNotes — matched_email via buildIntakeOperatorSummary detailLines", () => {
        const n = intakeFollowUpNotes({
            intake_resolution_path: "matched_email",
            intake_match_strategy: "matched_email",
            intake_match_confidence: "high",
            intake_needs_review: false,
        });
        expect(n.length).toBeGreaterThan(0);
        expect(n.some((l) => /resolution path: matched_email/i.test(l))).toBe(true);
    });

    it("intakeFollowUpNotes — skipped_missing_config uses operator copy", () => {
        const n = intakeFollowUpNotes({
            intake_resolution_path: "skipped_missing_config",
            intake_skip_reason: "Public link is missing default_vertical_id",
        });
        expect(n.some((l) => /not configured to create\/link records yet/i.test(l))).toBe(true);
        expect(n.some((l) => /detail:/i.test(l))).toBe(true);
    });

    it("intakeFollowUpNotes — skipped_error", () => {
        const n = intakeFollowUpNotes({
            intake_resolution_path: "skipped_error",
            intake_error: "Opportunity insert failed",
        });
        expect(n.some((l) => /skipped/i.test(l))).toBe(true);
        expect(n.some((l) => /Opportunity insert failed/.test(l))).toBe(true);
    });

    it("intakeFollowUpNotes — no server intake explains absence", () => {
        const n = intakeFollowUpNotes({});
        expect(n.some((l) => /no intake_resolution_path/i.test(l))).toBe(true);
    });

    it("buildSubmissionIntakeSection — synthetic when meta missing path", () => {
        const s = buildSubmissionIntakeSection({});
        expect(s.hasServerIntakeRecord).toBe(false);
        expect(s.statusLabel).toBe("No record");
    });

    it("buildIntakeOperatorSummary — manually_linked uses operator strategy label", () => {
        const s = buildIntakeOperatorSummary({
            intake_resolution_path: "manually_linked",
            intake_match_strategy: "operator_selected",
            intake_match_confidence: "human_reviewed",
            intake_needs_review: false,
            intake_review_result: "corrected",
        });
        expect(s?.statusLabel).toBe("Linked");
        expect(s?.strategyLabel.toLowerCase()).toContain("operator");
        expect(s?.detailLines.some((l) => /corrected manually/i.test(l))).toBe(true);
    });
});

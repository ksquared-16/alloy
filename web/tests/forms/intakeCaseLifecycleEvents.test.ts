import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    buildIntakeCaseLifecycleEventPayload,
    intakeOutcomeEligibleForLifecycleEvents,
    resolveIntakeCaseAnchorFromSubmission,
    resolveIntakeCaseLifecycleEventTypes,
    emitIntakeCaseLifecycleEventsSafe,
} from "@/lib/forms/workflow/intakeCaseLifecycleEvents";
import type { FormSubmissionRowLike } from "@/lib/forms/workflow/formSubmissionEvents";
import { DEMO_CHILDCARE_MED_INTAKE_LINK_METADATA } from "@/lib/forms/intakeRuntimeTestFixtures";

const ORG = "11111111-1111-4111-8111-111111111111";
const FORM = "22222222-2222-4222-8222-222222222222";
const SUB = "33333333-3333-4333-8333-333333333333";
const OPP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const emitEventMock = vi.hoisted(() => vi.fn(async () => "evt-1"));
vi.mock("@/lib/emitEvent", () => ({
    emitEvent: (...args: unknown[]) => emitEventMock(...(args as [])),
}));

function submission(overrides: Partial<FormSubmissionRowLike> = {}): FormSubmissionRowLike {
    return {
        id: SUB,
        org_id: ORG,
        form_definition_id: FORM,
        form_definition_version_id: "44444444-4444-4444-8444-444444444444",
        person_id: "person-1",
        customer_id: "customer-1",
        customer_member_id: null,
        opportunity_id: OPP,
        created_via_public_link_id: null,
        ...overrides,
    };
}

describe("intakeCaseLifecycleEvents IC-5", () => {
    beforeEach(() => {
        emitEventMock.mockClear();
    });

    it("legacy review-required submit resolves intake_case_created + intake_case_review_required", () => {
        const meta = {
            intake_resolution_path: "created_records",
            intake_needs_review: true,
            intake_auto_operationalized: false,
            intake_confidence: "medium",
            intake_review_decision: {
                review_mode: "legacy_default",
                reasons: ["new_person_created"],
            },
        };

        expect(resolveIntakeCaseLifecycleEventTypes(meta)).toEqual([
            "intake_case_created",
            "intake_case_review_required",
        ]);
    });

    it("configured auto-operationalized submit resolves intake_case_operationalized", () => {
        const meta = {
            intake_resolution_path: "created_records",
            intake_needs_review: false,
            intake_auto_operationalized: true,
            intake_confidence: "high",
            intake_opportunity_match: "created",
            intake_review_decision: {
                review_mode: "exception_only",
                reasons: ["clean_new_opportunity_create"],
                auto_operationalized: true,
            },
        };

        expect(resolveIntakeCaseLifecycleEventTypes(meta)).toEqual([
            "intake_case_created",
            "intake_case_operationalized",
        ]);
    });

    it("confident duplicate attach resolves intake_case_linked", () => {
        const meta = {
            intake_resolution_path: "matched_email",
            intake_needs_review: false,
            intake_auto_operationalized: false,
            intake_opportunity_match: "attached_existing",
            intake_match_strategy: "matched_email",
        };

        expect(resolveIntakeCaseLifecycleEventTypes(meta)).toEqual([
            "intake_case_created",
            "intake_case_linked",
        ]);
    });

    it("builds payload with case key and anchor fields", () => {
        const payload = buildIntakeCaseLifecycleEventPayload({
            submission: submission(),
            payloadMeta: {
                intake_resolution_path: "created_records",
                intake_needs_review: true,
                intake_confidence: "high",
                intake_review_decision: { review_mode: "legacy_default", reasons: ["new_person_created"] },
            },
            linkMetadata: DEMO_CHILDCARE_MED_INTAKE_LINK_METADATA,
        });

        expect(payload).toMatchObject({
            org_id: ORG,
            form_id: FORM,
            form_submission_id: SUB,
            case_key: `opportunity:${OPP}`,
            case_anchor_type: "opportunity",
            case_anchor_id: OPP,
            opportunity_id: OPP,
            review_mode: "legacy_default",
            intake_needs_review: true,
            intake_review_reasons: ["new_person_created"],
            source: "forms_intake",
        });
    });

    it("uses packet_session anchor when no opportunity is present", () => {
        const anchor = resolveIntakeCaseAnchorFromSubmission({
            submission: submission({ opportunity_id: null }),
            payloadMeta: { packet_session_id: SESS },
            packetSessionId: SESS,
        });

        expect(anchor.case_key).toBe(`packet_session:${SESS}`);
        expect(anchor.case_anchor_type).toBe("packet_session");
    });

    it("does not emit when org/form/submission missing", async () => {
        await emitIntakeCaseLifecycleEventsSafe({
            submission: submission({ org_id: "", id: SUB }),
            payloadMeta: { intake_resolution_path: "created_records", intake_needs_review: true },
        });
        expect(emitEventMock).not.toHaveBeenCalled();
    });

    it("does not emit for skipped intake paths", async () => {
        expect(intakeOutcomeEligibleForLifecycleEvents({ intake_resolution_path: "skipped_error" })).toBe(false);
        expect(intakeOutcomeEligibleForLifecycleEvents({ intake_resolution_path: "skipped_intake_disabled" })).toBe(
            false
        );

        await emitIntakeCaseLifecycleEventsSafe({
            submission: submission(),
            payloadMeta: { intake_resolution_path: "skipped_error" },
        });
        expect(emitEventMock).not.toHaveBeenCalled();
    });

    it("emitIntakeCaseLifecycleEventsSafe emits distinct lifecycle events once each", async () => {
        await emitIntakeCaseLifecycleEventsSafe({
            submission: submission(),
            payloadMeta: {
                intake_resolution_path: "created_records",
                intake_needs_review: false,
                intake_auto_operationalized: true,
                intake_confidence: "high",
                intake_review_decision: {
                    review_mode: "exception_only",
                    reasons: ["clean_new_opportunity_create"],
                },
            },
            linkMetadata: DEMO_CHILDCARE_MED_INTAKE_LINK_METADATA,
        });

        expect(emitEventMock).toHaveBeenCalledTimes(2);
        const types = emitEventMock.mock.calls.map(
            (call) => (call[0] as { event_type: string }).event_type
        );
        expect(types).toEqual(["intake_case_created", "intake_case_operationalized"]);

        const firstPayload = (emitEventMock.mock.calls[0]![0] as { payload: Record<string, unknown> }).payload;
        expect(firstPayload.case_key).toBe(`opportunity:${OPP}`);
        expect(firstPayload.source).toBe("forms_intake");
    });

    it("Demo Childcare auto-operationalized metadata resolves operationalized lifecycle", () => {
        const types = resolveIntakeCaseLifecycleEventTypes({
            intake_resolution_path: "created_records",
            intake_needs_review: false,
            intake_auto_operationalized: true,
            intake_confidence: "high",
            intake_opportunity_match: "created",
            intake_review_decision: {
                review_mode: "exception_only",
                reasons: ["clean_new_opportunity_create"],
                auto_operationalized: true,
            },
        });
        expect(types).toContain("intake_case_operationalized");
        expect(types).not.toContain("intake_case_review_required");
    });
});

describe("form_submitted unchanged (IC-5 isolation)", () => {
    it("intake lifecycle module does not emit form_submitted", async () => {
        emitEventMock.mockClear();
        await emitIntakeCaseLifecycleEventsSafe({
            submission: submission(),
            payloadMeta: {
                intake_resolution_path: "matched_email",
                intake_needs_review: false,
                intake_opportunity_match: "attached_existing",
                intake_match_strategy: "matched_email",
            },
        });

        const types = emitEventMock.mock.calls.map(
            (call) => (call[0] as { event_type: string }).event_type
        );
        expect(types).not.toContain("form_submitted");
        expect(types).toEqual(["intake_case_created", "intake_case_linked"]);
    });
});

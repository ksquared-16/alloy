/**
 * Staff qualification commands.
 *
 * FOUR COMMANDS, NOT A CRUD SURFACE. Each names something an operator does:
 * record a qualification, verify it, revoke it, attach evidence to it. Renewal is
 * `record` carrying `supersedes_qualification_id`, because a renewal IS a new
 * qualification that replaces an old one — modelling it as an update would
 * destroy the history the schema exists to keep.
 *
 * THERE IS DELIBERATELY NO "MARK EXPIRED". Expiration is derived from
 * `expires_on` against the organization's calendar day. A command to toggle it
 * would create a second, editable expiry truth beside the date, and the two would
 * disagree the moment anyone forgot to run it.
 *
 * Every command addresses the PERSON subject and names the employment in its
 * payload, matching `employment.update` — the qualification belongs to the
 * employment, and the employment is reached through the person the operator is
 * looking at.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { isValidIsoDateString } from "@/lib/childcareOperational/effectiveDating";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import {
    attachQualificationEvidence,
    recordQualification,
    StaffQualificationError,
    verifyQualification,
} from "@/lib/staffQualifications/staffQualificationService";

export const QUALIFICATION_RECORD_ACTION_KEY = "staff_qualification.record";
export const QUALIFICATION_VERIFY_ACTION_KEY = "staff_qualification.verify";
export const QUALIFICATION_REVOKE_ACTION_KEY = "staff_qualification.revoke";
export const QUALIFICATION_ATTACH_EVIDENCE_ACTION_KEY = "staff_qualification.attach_evidence";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** One translation of service failures into operator-safe results. */
function failureResult(actionKey: string, correlationId: string, err: unknown): ActionResult {
    const known = err instanceof StaffQualificationError;
    return {
        ok: false,
        actionKey,
        correlationId,
        error: {
            code: known ? (err as StaffQualificationError).code : "internal_error",
            message: known
                ? (err as StaffQualificationError).message
                : "That qualification change could not be completed.",
        },
    } as unknown as ActionResult;
}

const baseShape = {
    supportedEntityTypes: ["person"] as const,
    supportedProcessKeys: [] as const,
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed" as const, category: "record" as const, mutates: true },
    confirmationPolicy: "none" as const,
    bosProposalSupport: false,
};

export const staffQualificationRecordAction: RegisteredAction = {
    ...baseShape,
    actionKey: QUALIFICATION_RECORD_ACTION_KEY,
    defaultLabel: "Record qualification",
    description:
        "Record a qualification held by this employment. Renewing passes the qualification it replaces, which keeps the earlier record.",

    validatePayload(payload) {
        const src = payload ?? {};
        const blockers: { code: string; message: string; field?: string }[] = [];
        for (const [field, value] of [
            ["issued_on", t(src.issued_on)],
            ["expires_on", t(src.expires_on)],
        ] as const) {
            if (value && !isValidIsoDateString(value)) {
                blockers.push({ code: `invalid_${field}`, message: `${field} must be YYYY-MM-DD`, field });
            }
        }
        const issued = t(src.issued_on);
        const expires = t(src.expires_on);
        if (issued && expires && expires < issued) {
            blockers.push({
                code: "expiry_before_issue",
                message: "A qualification cannot expire before it was issued.",
                field: "expires_on",
            });
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: src };
    },

    async resolveEligibility({ payload }) {
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!t(payload?.employment_id)) {
            blockers.push({ code: "missing_employment", message: "employment_id is required", field: "employment_id" });
        }
        if (!t(payload?.qualification_type_id)) {
            blockers.push({
                code: "missing_type",
                message: "qualification_type_id is required",
                field: "qualification_type_id",
            });
        }
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        const renewing = !!t(payload?.supersedes_qualification_id);
        return {
            summary: renewing ? "Renew this qualification." : "Record a held qualification.",
            changes: renewing
                ? ["Record the new qualification", "Keep the qualification it replaces as history"]
                : ["Record the qualification against this employment"],
        };
    },

    async execute({ supabase, ctx, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const row = await recordQualification(supabase, {
                orgId: ctx.orgId,
                employmentId: t(payload.employment_id),
                qualificationTypeId: t(payload.qualification_type_id),
                issuedOn: t(payload.issued_on) || null,
                expiresOn: t(payload.expires_on) || null,
                supersedesQualificationId: t(payload.supersedes_qualification_id) || null,
                actorUserId: ctx.userId ?? null,
            });
            return { ok: true, actionKey: QUALIFICATION_RECORD_ACTION_KEY, correlationId, data: { qualification: row } } as unknown as ActionResult;
        } catch (err) {
            return failureResult(QUALIFICATION_RECORD_ACTION_KEY, correlationId, err);
        }
    },
};

export const staffQualificationVerifyAction: RegisteredAction = {
    ...baseShape,
    actionKey: QUALIFICATION_VERIFY_ACTION_KEY,
    defaultLabel: "Verify qualification",
    description: "Record that an operator has checked this qualification, or rejected it.",

    validatePayload(payload) {
        const state = t(payload?.verification_state) || "verified";
        if (!["verified", "rejected"].includes(state)) {
            return {
                ok: false,
                blockers: [
                    { code: "invalid_state", message: "verification_state must be verified or rejected", field: "verification_state" },
                ],
            };
        }
        return { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ payload }) {
        const blockers = t(payload?.qualification_id)
            ? []
            : [{ code: "missing_qualification", message: "qualification_id is required", field: "qualification_id" }];
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview() {
        return { summary: "Record a verification decision.", changes: ["Set verification state, with who and when"] };
    },

    async execute({ supabase, ctx, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const state = (t(payload.verification_state) || "verified") as "verified" | "rejected";
            const row = await verifyQualification(supabase, ctx.orgId, t(payload.qualification_id), state, ctx.userId ?? null);
            return { ok: true, actionKey: QUALIFICATION_VERIFY_ACTION_KEY, correlationId, data: { qualification: row } } as unknown as ActionResult;
        } catch (err) {
            return failureResult(QUALIFICATION_VERIFY_ACTION_KEY, correlationId, err);
        }
    },
};

export const staffQualificationAttachEvidenceAction: RegisteredAction = {
    ...baseShape,
    actionKey: QUALIFICATION_ATTACH_EVIDENCE_ACTION_KEY,
    defaultLabel: "Attach evidence",
    description:
        "Reference an existing document as evidence for this qualification. The document is not copied and no second artifact is created.",

    validatePayload(payload) {
        const blockers = t(payload?.document_id)
            ? []
            : [{ code: "missing_document", message: "document_id is required", field: "document_id" }];
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ payload }) {
        const blockers = t(payload?.qualification_id)
            ? []
            : [{ code: "missing_qualification", message: "qualification_id is required", field: "qualification_id" }];
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview() {
        return {
            summary: "Reference an existing document as evidence.",
            changes: ["Link the qualification to a document that already exists", "Create no copy of the artifact"],
        };
    },

    async execute({ supabase, ctx, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            await attachQualificationEvidence(
                supabase,
                ctx.orgId,
                t(payload.qualification_id),
                t(payload.document_id),
                t(payload.form_submission_id) || null,
                ctx.userId ?? null,
            );
            return { ok: true, actionKey: QUALIFICATION_ATTACH_EVIDENCE_ACTION_KEY, correlationId, data: {} } as unknown as ActionResult;
        } catch (err) {
            return failureResult(QUALIFICATION_ATTACH_EVIDENCE_ACTION_KEY, correlationId, err);
        }
    },
};

export const STAFF_QUALIFICATION_ACTIONS = [
    staffQualificationRecordAction,
    staffQualificationVerifyAction,
    staffQualificationAttachEvidenceAction,
] as const;

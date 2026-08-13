/**
 * Registered actions: End employment (`employment.end`) and amend employment
 * (`employment.update`).
 *
 * Ending is history-preserving by construction — the service closes the window
 * on the existing row. Nothing here deletes, and `employments` carries no DELETE
 * policy for authenticated roles.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { isValidIsoDateString } from "@/lib/childcareOperational/effectiveDating";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { EmploymentServiceError, employmentErrorStatus } from "@/lib/employment/employmentErrors";
import { endEmployment, updateEmployment } from "@/lib/employment/employmentService";
import { EMPLOYMENT_TYPES } from "@/lib/employment/employmentTypes";
import { saveEmploymentConfiguredFacts } from "@/lib/employment/employmentConfiguredFacts";

export const EMPLOYMENT_END_ACTION_KEY = "employment.end";
export const EMPLOYMENT_UPDATE_ACTION_KEY = "employment.update";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function toActionError(err: unknown, correlationId: string): ActionResult | null {
    if (err instanceof EmploymentServiceError) {
        return {
            ok: false,
            correlationId,
            status: employmentErrorStatus(err.code),
            error: err.message,
        };
    }
    return null;
}

export const employmentEndAction: RegisteredAction = {
    actionKey: EMPLOYMENT_END_ACTION_KEY,
    defaultLabel: "End employment",
    description: "Close the employment window on an effective date. History is preserved.",
    supportedEntityTypes: ["person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        const endDate = t(payload?.end_date);
        if (endDate && !isValidIsoDateString(endDate)) {
            return {
                ok: false,
                blockers: [{ code: "invalid_end_date", message: "end_date must be YYYY-MM-DD", field: "end_date" }],
            };
        }
        return { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ payload }) {
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!t(payload?.employment_id)) {
            blockers.push({
                code: "missing_employment",
                message: "employment_id is required",
                field: "employment_id",
            });
        }
        return {
            eligible: blockers.length === 0,
            blockers,
            availableTransitions: [],
            requiredInputs: [
                { key: "end_date", label: "Last day", type: "date", required: true },
                { key: "end_reason_key", label: "Reason", type: "text", required: false },
            ],
        };
    },

    async buildPreview({ payload }) {
        return {
            summary: `End employment effective ${t(payload?.end_date) || "today"}.`,
            changes: [
                "Close the employment window on the existing record",
                "Employment history, start date and prior facts are preserved",
                "New staff assignments after this date will no longer be eligible",
                "Existing assignments and any Alloy user account are unaffected",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const row = await endEmployment(supabase, {
                orgId: ctx.orgId,
                employmentId: t(payload.employment_id),
                endDate: t(payload.end_date) || todayYmd,
                endReasonKey: t(payload.end_reason_key) || null,
                actorUserId: ctx.userId ?? null,
                todayYmd,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: EMPLOYMENT_END_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: row.person_id,
                    affectedId: row.id,
                    detail: {
                        employment_id: row.id,
                        end_date: row.end_date,
                        employment_status: row.employment_status,
                    },
                },
            };
        } catch (err) {
            const mapped = toActionError(err, correlationId);
            if (mapped) return mapped;
            throw err;
        }
    },
};

export const employmentUpdateAction: RegisteredAction = {
    actionKey: EMPLOYMENT_UPDATE_ACTION_KEY,
    defaultLabel: "Edit employment",
    description: "Amend position, employment type, primary location or start date on open employment.",
    supportedEntityTypes: ["person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "none",
    bosProposalSupport: false,

    validatePayload(payload) {
        const src = payload ?? {};
        const startDate = t(src.start_date);
        if (startDate && !isValidIsoDateString(startDate)) {
            return {
                ok: false,
                blockers: [
                    { code: "invalid_start_date", message: "start_date must be YYYY-MM-DD", field: "start_date" },
                ],
            };
        }
        const employmentType = t(src.employment_type);
        if (employmentType && !(EMPLOYMENT_TYPES as readonly string[]).includes(employmentType)) {
            return {
                ok: false,
                blockers: [
                    {
                        code: "invalid_employment_type",
                        message: `employment_type must be one of: ${EMPLOYMENT_TYPES.join(", ")}`,
                        field: "employment_type",
                    },
                ],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ payload }) {
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!t(payload?.employment_id)) {
            blockers.push({
                code: "missing_employment",
                message: "employment_id is required",
                field: "employment_id",
            });
        }
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview() {
        return {
            summary: "Update employment details.",
            changes: ["Amend the open employment record", "Employment history is unchanged"],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const employmentId = t(payload.employment_id);
            const row = await updateEmployment(supabase, {
                orgId: ctx.orgId,
                employmentId,
                positionId: payload.position_id !== undefined ? t(payload.position_id) || null : undefined,
                employmentType:
                    payload.employment_type !== undefined ? t(payload.employment_type) || null : undefined,
                primaryLocationId:
                    payload.primary_location_id !== undefined
                        ? t(payload.primary_location_id) || null
                        : undefined,
                externalEmployeeId:
                    payload.external_employee_id !== undefined
                        ? t(payload.external_employee_id) || null
                        : undefined,
                startDate: payload.start_date !== undefined ? t(payload.start_date) : undefined,
                actorUserId: ctx.userId ?? null,
                todayYmd,
            });

            if (payload.configured_facts && typeof payload.configured_facts === "object") {
                await saveEmploymentConfiguredFacts(
                    supabase,
                    ctx.orgId,
                    row.id,
                    payload.configured_facts as Record<string, unknown>
                );
            }

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: EMPLOYMENT_UPDATE_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: row.person_id,
                    affectedId: row.id,
                    detail: { employment_id: row.id, employment_status: row.employment_status },
                },
            };
        } catch (err) {
            const mapped = toActionError(err, correlationId);
            if (mapped) return mapped;
            throw err;
        }
    },
};

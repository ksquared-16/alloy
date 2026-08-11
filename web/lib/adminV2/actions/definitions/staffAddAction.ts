/**
 * Registered action: Add Staff (`staff.add`).
 *
 * Capture-first, like create_lead: the employment does not exist yet, and the
 * person may or may not. Preview shows exactly which of the two paths will run
 * so the operator confirms an identity decision rather than discovering it.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { isValidIsoDateString } from "@/lib/childcareOperational/effectiveDating";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { EmploymentServiceError, employmentErrorStatus } from "@/lib/employment/employmentErrors";
import { EMPLOYMENT_TYPES } from "@/lib/employment/employmentTypes";
import { addStaff, StaffIdentityChoiceRequiredError } from "@/lib/staff/addStaffService";
import { resolveStaffPersonCandidates } from "@/lib/staff/resolveStaffPersonCandidates";

export const STAFF_ADD_ACTION_KEY = "staff.add";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export const staffAddAction: RegisteredAction = {
    actionKey: STAFF_ADD_ACTION_KEY,
    defaultLabel: "Add staff",
    description:
        "Link a person to this organization as staff, creating the person only when no existing one matches.",
    supportedEntityTypes: ["person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        const src = payload ?? {};
        const value: Record<string, unknown> = { ...src };
        for (const key of ["first_name", "last_name", "email", "phone", "person_id"]) {
            if (src[key] != null) value[key] = t(src[key]);
        }

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

        return { ok: true, value };
    },

    async resolveEligibility({ payload }) {
        const blockers: { code: string; message: string; field?: string }[] = [];
        const personId = t(payload?.person_id);

        if (!personId) {
            if (!t(payload?.first_name)) {
                blockers.push({
                    code: "missing_first_name",
                    message: "Select an existing person, or provide a first name",
                    field: "first_name",
                });
            }
            if (!t(payload?.last_name)) {
                blockers.push({
                    code: "missing_last_name",
                    message: "Select an existing person, or provide a last name",
                    field: "last_name",
                });
            }
        }
        if (!t(payload?.start_date)) {
            blockers.push({
                code: "missing_start_date",
                message: "Employment start date is required",
                field: "start_date",
            });
        }

        return {
            eligible: blockers.length === 0,
            blockers,
            availableTransitions: [],
            requiredInputs: [
                { key: "start_date", label: "Start date", type: "date", required: true },
                { key: "position_id", label: "Position", type: "select", required: false },
                {
                    key: "employment_type",
                    label: "Employment type",
                    type: "select",
                    required: false,
                    options: EMPLOYMENT_TYPES.map((v) => ({ value: v, label: v.replace("_", " ") })),
                },
                { key: "primary_location_id", label: "Primary location", type: "select", required: false },
            ],
        };
    },

    /**
     * Preview runs the identity resolver read-only. The operator sees "this will
     * reuse Jane Wilson" or "this will create a new person" before confirming —
     * the duplicate decision is never a surprise consequence of pressing save.
     */
    async buildPreview({ supabase, ctx, payload }) {
        const personId = t(payload?.person_id);
        const startDate = t(payload?.start_date) || "the selected date";

        if (personId) {
            return {
                summary: `Add employment to the selected existing person, effective ${startDate}.`,
                changes: [
                    "Link the existing person to this organization as staff",
                    "No new person record is created",
                    "No Alloy user account, role, or permission is granted",
                ],
            };
        }

        const resolution = await resolveStaffPersonCandidates(supabase, ctx.orgId, {
            firstName: t(payload?.first_name),
            lastName: t(payload?.last_name),
            email: t(payload?.email) || null,
            phone: t(payload?.phone) || null,
        });

        if (resolution.decision === "operator_choice_required") {
            const names = resolution.candidates.map((c) => `${c.display_name} (${c.confidence_band})`);
            return {
                summary: `${resolution.candidates.length} existing person(s) may already be this human.`,
                changes: [
                    `Possible matches: ${names.join(", ")}`,
                    "Select one to add employment to the existing person",
                    "Creating a new person instead requires an explicit reason",
                ],
                before: { candidates: resolution.candidates },
            };
        }

        return {
            summary: `Create a new person and add employment effective ${startDate}.`,
            changes: [
                "No existing person matched this identity",
                "Create exactly one person record",
                "Create one employment relationship",
                "No Alloy user account, role, or permission is granted",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const result = await addStaff(supabase, {
                orgId: ctx.orgId,
                personId: t(payload.person_id) || null,
                firstName: t(payload.first_name) || null,
                lastName: t(payload.last_name) || null,
                email: t(payload.email) || null,
                phone: t(payload.phone) || null,
                createNewPerson: payload.create_new_person === true,
                createNewReason: t(payload.create_new_reason) || null,
                startDate: t(payload.start_date) || todayYmd,
                positionId: t(payload.position_id) || null,
                employmentType: t(payload.employment_type) || null,
                primaryLocationId: t(payload.primary_location_id) || null,
                externalEmployeeId: t(payload.external_employee_id) || null,
                configuredFacts:
                    payload.configured_facts && typeof payload.configured_facts === "object"
                        ? (payload.configured_facts as Record<string, unknown>)
                        : undefined,
                actorUserId: ctx.userId ?? null,
                todayYmd,
            });

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: STAFF_ADD_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: result.personId,
                    affectedId: result.employment.id,
                    detail: {
                        person_id: result.personId,
                        employment_id: result.employment.id,
                        identity_outcome: result.identityOutcome,
                        start_date: result.employment.start_date,
                        employment_status: result.employment.employment_status,
                    },
                },
            };
        } catch (err) {
            if (err instanceof StaffIdentityChoiceRequiredError) {
                return {
                    ok: false,
                    correlationId,
                    status: 409,
                    error: err.message,
                    // Candidates ride the blocker channel so the operator UI can
                    // render the choice without a bespoke error shape.
                    blockers: err.candidates.map((c) => ({
                        code: "identity_choice_required",
                        message: `${c.display_name} — ${c.confidence_band} match`,
                        field: c.person_id,
                    })),
                };
            }
            if (err instanceof EmploymentServiceError) {
                return {
                    ok: false,
                    correlationId,
                    status: employmentErrorStatus(err.code),
                    error: err.message,
                };
            }
            throw err;
        }
    },
};

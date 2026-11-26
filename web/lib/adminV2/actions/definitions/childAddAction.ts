/**
 * Registered action: Add Child (`child.add`).
 *
 * Capture-first, like `staff.add` and `create_lead`: the child record does not
 * exist yet, and the person may never exist at all. Preview runs the identity
 * gate read-only so the operator confirms an identity DECISION rather than
 * discovering one after the fact.
 *
 * What this action never does, by construction: create an Opportunity, a
 * `process_instances` row, an `opportunity_customer_members` bridge, or a Work
 * Unit. Enrollment is a separate, explicit second command.
 * @see web/lib/records/addChildService.ts
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { isValidIsoDateString } from "@/lib/childcareOperational/effectiveDating";
import {
    addChild,
    ChildIdentityChoiceRequiredError,
} from "@/lib/records/addChildService";
import { RecordCreationError, recordCreationErrorStatus } from "@/lib/records/recordCreationErrors";
import { resolvePersonCandidates } from "@/lib/identity/resolveIdentityCandidates";

export const CHILD_ADD_ACTION_KEY = "child.add";

/** Sentinel entity_id — Add Child is capture-first, so no target record exists yet. */
export const CHILD_ADD_ACTION_ENTITY_ID = "__child_add__";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export const childAddAction: RegisteredAction = {
    actionKey: CHILD_ADD_ACTION_KEY,
    defaultLabel: "Add child",
    description:
        "Establish a child record in a household, reusing an existing identity when one matches. Creates no enrollment.",
    supportedEntityTypes: ["child"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        const src = payload ?? {};
        const value: Record<string, unknown> = { ...src };
        for (const key of [
            "first_name",
            "last_name",
            "customer_id",
            "person_id",
            "customer_member_id",
            "create_new_reason",
        ]) {
            if (src[key] != null) value[key] = t(src[key]);
        }

        const dob = t(src.date_of_birth);
        if (dob && !isValidIsoDateString(dob)) {
            return {
                ok: false,
                blockers: [
                    {
                        code: "invalid_date_of_birth",
                        message: "date_of_birth must be YYYY-MM-DD",
                        field: "date_of_birth",
                    },
                ],
            };
        }

        return { ok: true, value };
    },

    async resolveEligibility({ payload }) {
        const blockers: { code: string; message: string; field?: string }[] = [];

        if (!t(payload?.customer_id)) {
            blockers.push({
                code: "missing_household",
                message: "Select the household this child belongs to",
                field: "customer_id",
            });
        }

        // A chosen record supplies its own identity; only the create path needs names.
        const chosen = t(payload?.customer_member_id) || t(payload?.person_id);
        if (!chosen) {
            if (!t(payload?.first_name)) {
                blockers.push({
                    code: "missing_first_name",
                    message: "Select an existing child, or provide a first name",
                    field: "first_name",
                });
            }
            if (!t(payload?.last_name)) {
                blockers.push({
                    code: "missing_last_name",
                    message: "Select an existing child, or provide a last name",
                    field: "last_name",
                });
            }
        }

        return {
            eligible: blockers.length === 0,
            blockers,
            availableTransitions: [],
            requiredInputs: [
                { key: "customer_id", label: "Household", type: "text", required: true },
                { key: "first_name", label: "First name", type: "text", required: false },
                { key: "last_name", label: "Last name", type: "text", required: false },
                { key: "date_of_birth", label: "Date of birth", type: "date", required: false },
            ],
        };
    },

    /**
     * Preview runs the identity resolver read-only, so "this will reuse Emma
     * Chen" or "this will create a new child" is a statement the operator reads
     * before confirming — never a consequence they discover afterwards.
     */
    async buildPreview({ supabase, ctx, payload }) {
        const NEVER = [
            "No enrollment, opportunity or process participation is created",
            "Starting enrollment is a separate, explicit action",
        ];

        if (t(payload?.customer_member_id)) {
            return {
                summary: "Use the existing child record already on this household.",
                changes: ["No new child record is created", "No duplicate membership is created", ...NEVER],
            };
        }

        if (t(payload?.person_id)) {
            return {
                summary: "Link the selected existing person to this household as a child.",
                changes: [
                    "Reuse the existing person — no second identity is created",
                    "Create one household child record",
                    ...NEVER,
                ],
            };
        }

        const firstName = t(payload?.first_name);
        const lastName = t(payload?.last_name);
        const resolution = await resolvePersonCandidates(supabase, ctx.orgId, {
            kind: "child",
            subjectRef: "child_add",
            firstName,
            lastName,
            dob: t(payload?.date_of_birth) || null,
            householdCustomerId: t(payload?.customer_id) || null,
        });

        if (resolution.decision === "operator_choice_required") {
            const names = resolution.candidates.map(
                (c) => `${c.display_name} (${c.confidence_band}${c.in_household ? ", this household" : ""})`
            );
            return {
                summary: `${resolution.candidates.length} existing record(s) may already be this child.`,
                changes: [
                    `Possible matches: ${names.join(", ")}`,
                    "Select one to reuse the record that already exists",
                    "Creating a new child instead requires an explicit reason",
                ],
                before: { candidates: resolution.candidates },
            };
        }

        return {
            summary: `Create a new child record for ${[firstName, lastName].filter(Boolean).join(" ")}.`,
            changes: [
                "No existing record matched this child",
                "Create exactly one household child record",
                "No person record is created — the child record does not require one",
                ...NEVER,
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const result = await addChild(supabase, {
                orgId: ctx.orgId,
                customerId: t(payload.customer_id),
                customerMemberId: t(payload.customer_member_id) || null,
                personId: t(payload.person_id) || null,
                firstName: t(payload.first_name) || null,
                lastName: t(payload.last_name) || null,
                dob: t(payload.date_of_birth) || null,
                createNewChild: payload.create_new_child === true,
                createNewReason: t(payload.create_new_reason) || null,
            });

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: CHILD_ADD_ACTION_KEY,
                    entityType: invocation.entityType,
                    // The durable child subject — `customer_members.id`, never person_id.
                    entityId: result.customerMemberId,
                    affectedId: result.customerMemberId,
                    detail: {
                        customer_member_id: result.customerMemberId,
                        person_id: result.personId,
                        customer_id: result.customerId,
                        display_name: result.displayName,
                        identity_outcome: result.identityOutcome,
                        members_created: result.membersCreated,
                    },
                },
            };
        } catch (err) {
            if (err instanceof ChildIdentityChoiceRequiredError) {
                return {
                    ok: false,
                    correlationId,
                    status: 409,
                    error: err.message,
                    // Candidates ride the blocker channel so the operator UI can render
                    // the choice without a bespoke error shape — same as `staff.add`.
                    blockers: err.candidates.map((c) => ({
                        code: "identity_choice_required",
                        message: `${c.display_name} — ${c.confidence_band} match`,
                        field: c.customer_member_id ?? c.person_id ?? c.record_id,
                    })),
                };
            }
            if (err instanceof RecordCreationError) {
                return {
                    ok: false,
                    correlationId,
                    status: recordCreationErrorStatus(err.code),
                    error: err.message,
                };
            }
            throw err;
        }
    },
};

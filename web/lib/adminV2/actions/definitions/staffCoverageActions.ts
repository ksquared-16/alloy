/**
 * Registered actions for day-specific Staff Coverage.
 *
 * Four operator intents, and they are four because an operator distinguishes them:
 *
 *   plan     — this person works here, on this day, at these hours
 *   change   — the plan changed (a genuine revision; both versions are true history)
 *   correct  — the plan never was what we recorded (a mistake, not a change)
 *   cancel   — withdraw the plan with nothing replacing it
 *
 * `change` and `correct` share one mechanism and differ only in the transition they
 * record, which is exactly the distinction an audit needs later: "we moved her" and
 * "we typed the wrong room" are not the same fact about the day.
 *
 * ── ATOMICITY LIVES IN THE DATABASE, NOT HERE ──
 *
 * Every mutation delegates to a Coverage RPC. A revision retires one allocation and
 * writes its replacement, and if that pair could half-commit an operator would be
 * shown success over a day with no plan at all — or with two. supabase-js has no
 * multi-statement transaction, so the only honest place for that pair is inside one
 * database function. These handlers therefore make exactly one call each.
 *
 * ── AUTHORIZATION IS CHECKED HERE, ON THE SERVER ──
 *
 * Site scope is enforced in `execute`, not merely surfaced as a blocker, so a direct
 * API invocation meets the same refusal a rendered surface would. For the
 * lifecycle commands the scope check reads the TARGET's site — the site you are
 * acting on, not one you supplied.
 */

import { randomUUID } from "crypto";

import type { ActionBlocker, ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { isValidIsoDateString } from "@/lib/childcareOperational/effectiveDating";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { coverageSiteWriteAllowed } from "@/lib/staffCoverage/staffCoverageAuthorization";
import {
    CoverageConflictError,
    CoverageRejectedError,
    cancelCoverage,
    planCoverage,
    supersedeCoverage,
    type CoverageTransition,
} from "@/lib/staffCoverage/staffCoverageService";
import { resolveCoveringEmployment } from "@/lib/staffPresence/staffPresenceService";
import type { SupabaseClient } from "@supabase/supabase-js";

export const STAFF_COVERAGE_PLAN_ACTION_KEY = "staff_coverage.plan";
export const STAFF_COVERAGE_CHANGE_ACTION_KEY = "staff_coverage.change";
export const STAFF_COVERAGE_CORRECT_ACTION_KEY = "staff_coverage.correct";
export const STAFF_COVERAGE_CANCEL_ACTION_KEY = "staff_coverage.cancel";

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function blocker(code: string, message: string, field?: string): ActionBlocker {
    return { code, message, field: field ?? null };
}

/**
 * Coverage refusals are operator-facing by design — the storage layer speaks in
 * constraint names and minute ranges, and an operator who is told "this person is
 * already planned somewhere else then" can act, where one told
 * `staff_coverage_allocations_no_overlap` cannot.
 */
function mapCoverageError(err: unknown, correlationId: string): ActionResult | null {
    if (err instanceof CoverageConflictError) {
        return {
            ok: false,
            correlationId,
            status: 409,
            error: err.message,
            blockers: [blocker("coverage_conflict", err.message)],
        };
    }
    if (err instanceof CoverageRejectedError) {
        return {
            ok: false,
            correlationId,
            status: 422,
            error: err.message,
            blockers: [blocker("coverage_rejected", err.message)],
        };
    }
    return null;
}

function denied(correlationId: string, code: string, message: string): ActionResult {
    return { ok: false, correlationId, status: 403, error: message, blockers: [blocker(code, message)] };
}

function validateTimeShape(payload: Record<string, unknown> | undefined): ActionBlocker[] {
    const src = payload ?? {};
    const out: ActionBlocker[] = [];
    const date = t(src.service_date);
    if (date && !isValidIsoDateString(date)) {
        out.push(blocker("invalid_service_date", "service_date must be YYYY-MM-DD", "service_date"));
    }
    for (const key of ["start_time", "end_time"] as const) {
        const v = t(src[key]);
        if (v && !HHMM.test(v)) {
            out.push(blocker(`invalid_${key}`, `${key} must be HH:MM in 24-hour form`, key));
        }
    }
    const start = t(src.start_time);
    const end = t(src.end_time);
    if (start && end && HHMM.test(start) && HHMM.test(end) && end <= start) {
        // Overnight Coverage is out of scope for V1; the database refuses it too,
        // but saying so here costs nothing and explains itself better.
        out.push(
            blocker(
                "invalid_interval",
                "Coverage must end after it starts. Overnight coverage is not supported yet.",
                "end_time"
            )
        );
    }
    return out;
}

/** The allocation a lifecycle command targets, read for its org and its site. */
async function readTarget(
    supabase: SupabaseClient,
    orgId: string,
    coverageId: string
): Promise<{
    id: string;
    site_location_id: string;
    lifecycle_state: string;
    service_date: string;
    employment_id: string;
} | null> {
    const { data, error } = await supabase
        .from("staff_coverage_allocations")
        .select("id, site_location_id, lifecycle_state, service_date, employment_id")
        .eq("org_id", orgId)
        .eq("id", coverageId)
        .maybeSingle();
    if (error) return null;
    return (data as never) ?? null;
}

/**
 * Resolve the employment Coverage attaches to.
 *
 * A caller may name the employment directly; otherwise the person's employment
 * covering that service date is used. Coverage outside employment is not a fact
 * about staff, so an absent employment is refused by name rather than left to the
 * schema's foreign key.
 */
async function resolveEmploymentId(
    supabase: SupabaseClient,
    orgId: string,
    payload: Record<string, unknown>,
    personId: string,
    serviceDate: string
): Promise<string | null> {
    const explicit = t(payload.employment_id);
    if (explicit) return explicit;
    if (!personId) return null;
    const covering = await resolveCoveringEmployment(supabase, orgId, personId, serviceDate);
    return covering?.id ?? null;
}

// ────────────────────────────── PLAN ──────────────────────────────

export const staffCoveragePlanAction: RegisteredAction = {
    actionKey: STAFF_COVERAGE_PLAN_ACTION_KEY,
    defaultLabel: "Plan coverage",
    description: "Plan where a staff member works on a specific day, for a specific stretch of time.",
    supportedEntityTypes: ["person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "none",
    bosProposalSupport: false,

    validatePayload(payload) {
        const blockers = validateTimeShape(payload);
        if (blockers.length > 0) return { ok: false, blockers };
        return { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ payload, invocation }) {
        const blockers: ActionBlocker[] = [];
        if (!t(payload?.person_id) && !t(invocation?.entityId) && !t(payload?.employment_id)) {
            blockers.push(blocker("missing_person", "person_id is required", "person_id"));
        }
        if (!t(payload?.site_location_id)) {
            blockers.push(blocker("missing_site", "site_location_id is required", "site_location_id"));
        }
        if (!t(payload?.start_time)) blockers.push(blocker("missing_start", "start_time is required", "start_time"));
        if (!t(payload?.end_time)) blockers.push(blocker("missing_end", "end_time is required", "end_time"));
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        const room = t(payload?.room_location_id);
        return {
            summary: `Plan coverage ${t(payload?.start_time) || "??:??"}–${t(payload?.end_time) || "??:??"} on ${
                t(payload?.service_date) || "the selected day"
            }.`,
            changes: [
                room ? "Planned in a specific room" : "Planned at the site, with no specific room",
                "This person cannot be planned in two places at once during those hours",
                "The durable assignment is not changed",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const site = t(payload.site_location_id);

        const verdict = coverageSiteWriteAllowed(ctx.accessScope, site);
        if (!verdict.allowed) return denied(correlationId, verdict.code, verdict.message);

        try {
            const serviceDate =
                t(payload.service_date) || (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));
            const personId = t(payload.person_id) || t(invocation.entityId);
            const employmentId = await resolveEmploymentId(supabase, ctx.orgId, payload, personId, serviceDate);
            if (!employmentId) {
                return {
                    ok: false,
                    correlationId,
                    status: 422,
                    error: "This person held no employment on that date, so coverage cannot be planned.",
                    blockers: [
                        blocker(
                            "no_covering_employment",
                            "This person held no employment on that date, so coverage cannot be planned.",
                            "service_date"
                        ),
                    ],
                };
            }

            const coverageId = await planCoverage(supabase, {
                orgId: ctx.orgId,
                employmentId,
                serviceDate,
                startTime: t(payload.start_time),
                endTime: t(payload.end_time),
                siteLocationId: site,
                roomLocationId: t(payload.room_location_id) || null,
                reasonKey: t(payload.reason_key) || null,
                note: t(payload.note) || null,
                sourceKey: "operator_action",
                actorUserId: ctx.userId ?? null,
            });

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: STAFF_COVERAGE_PLAN_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: personId,
                    affectedId: coverageId,
                    detail: {
                        staff_coverage_id: coverageId,
                        employment_id: employmentId,
                        service_date: serviceDate,
                        start_time: t(payload.start_time),
                        end_time: t(payload.end_time),
                        site_location_id: site,
                        room_location_id: t(payload.room_location_id) || null,
                        lifecycle_operation: "CREATED",
                    },
                },
            };
        } catch (err) {
            const mapped = mapCoverageError(err, correlationId);
            if (mapped) return mapped;
            throw err;
        }
    },
};

// ──────────────────────── CHANGE / CORRECT ────────────────────────

/**
 * Both supersession commands are one implementation. The only difference the
 * operator sees is the verb; the only difference the record keeps is the
 * transition, and keeping them as two registered keys is what lets a surface offer
 * "the plan changed" and "we recorded it wrong" as the distinct choices they are.
 */
function supersedeActionFor(
    actionKey: string,
    transition: CoverageTransition,
    label: string,
    description: string,
    previewSummary: string,
    previewChanges: string[]
): RegisteredAction {
    return {
        actionKey,
        defaultLabel: label,
        description,
        supportedEntityTypes: ["person"],
        supportedProcessKeys: [],
        requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
        audit: { eventType: "action_executed", category: "record", mutates: true },
        confirmationPolicy: "required",
        bosProposalSupport: false,

        validatePayload(payload) {
            const blockers = validateTimeShape(payload);
            if (blockers.length > 0) return { ok: false, blockers };
            return { ok: true, value: payload ?? {} };
        },

        async resolveEligibility({ payload }) {
            const blockers: ActionBlocker[] = [];
            if (!t(payload?.coverage_id)) {
                blockers.push(
                    blocker(
                        "missing_coverage",
                        "coverage_id is required — this replaces a specific existing allocation",
                        "coverage_id"
                    )
                );
            }
            return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
        },

        async buildPreview() {
            return { summary: previewSummary, changes: previewChanges };
        },

        async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
            const correlationId = randomUUID();
            const coverageId = t(payload.coverage_id);

            const target = await readTarget(supabase, ctx.orgId, coverageId);
            if (!target) {
                return {
                    ok: false,
                    correlationId,
                    status: 404,
                    error: "That coverage allocation was not found.",
                    blockers: [blocker("coverage_not_found", "That coverage allocation was not found.", "coverage_id")],
                };
            }

            // Scope is checked against where the allocation IS, and — when the caller
            // moves it — also against where it is going. Either one out of scope is a
            // refusal; a permitted origin must not license an unpermitted destination.
            const here = coverageSiteWriteAllowed(ctx.accessScope, target.site_location_id);
            if (!here.allowed) return denied(correlationId, here.code, here.message);
            const movingTo = t(payload.site_location_id);
            if (movingTo) {
                const there = coverageSiteWriteAllowed(ctx.accessScope, movingTo);
                if (!there.allowed) return denied(correlationId, there.code, there.message);
            }

            try {
                const roomExplicit = Object.prototype.hasOwnProperty.call(payload, "room_location_id");
                const replacementId = await supersedeCoverage(supabase, {
                    coverageId,
                    transition,
                    serviceDate: t(payload.service_date) || undefined,
                    startTime: t(payload.start_time) || undefined,
                    endTime: t(payload.end_time) || undefined,
                    siteLocationId: movingTo || undefined,
                    ...(roomExplicit ? { roomLocationId: t(payload.room_location_id) || null } : {}),
                    reasonKey: t(payload.reason_key) || null,
                    note: t(payload.note) || null,
                    actorUserId: ctx.userId ?? null,
                });

                return {
                    ok: true,
                    correlationId,
                    result: {
                        actionKey,
                        entityType: invocation.entityType,
                        entityId: t(payload.person_id) || t(invocation.entityId),
                        affectedId: replacementId,
                        detail: {
                            staff_coverage_id: replacementId,
                            supersedes_coverage_id: coverageId,
                            transition_type: transition,
                            employment_id: target.employment_id,
                            lifecycle_operation: transition === "correction" ? "CORRECTED" : "REVISED",
                        },
                    },
                };
            } catch (err) {
                const mapped = mapCoverageError(err, correlationId);
                if (mapped) return mapped;
                throw err;
            }
        },
    };
}

export const staffCoverageChangeAction = supersedeActionFor(
    STAFF_COVERAGE_CHANGE_ACTION_KEY,
    "revision",
    "Change coverage",
    "Change where or when a staff member is planned on a specific day. The previous plan stays in history.",
    "Replace this coverage with a changed plan.",
    [
        "The previous plan is kept and marked superseded",
        "The replacement becomes the effective plan",
        "Recorded as a genuine change of plan, not a correction",
    ]
);

export const staffCoverageCorrectAction = supersedeActionFor(
    STAFF_COVERAGE_CORRECT_ACTION_KEY,
    "correction",
    "Correct coverage",
    "Fix a coverage allocation that was recorded incorrectly. The original entry stays in history.",
    "Replace this coverage with a corrected record.",
    [
        "The mistaken entry is kept and marked superseded",
        "The corrected record becomes the effective plan",
        "Recorded as a correction, so it stays distinguishable from a real change of plan",
    ]
);

// ───────────────────────────── CANCEL ─────────────────────────────

export const staffCoverageCancelAction: RegisteredAction = {
    actionKey: STAFF_COVERAGE_CANCEL_ACTION_KEY,
    defaultLabel: "Cancel coverage",
    description: "Withdraw a planned coverage allocation with nothing replacing it. History is preserved.",
    supportedEntityTypes: ["person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "destructive",
    bosProposalSupport: false,

    validatePayload(payload) {
        return { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ payload }) {
        const blockers: ActionBlocker[] = [];
        if (!t(payload?.coverage_id)) {
            blockers.push(blocker("missing_coverage", "coverage_id is required", "coverage_id"));
        }
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview() {
        return {
            summary: "Withdraw this coverage. Nothing replaces it.",
            changes: [
                "Nobody is planned for that place and time afterwards",
                "The allocation stays in history as cancelled",
                "The durable assignment is not changed",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const coverageId = t(payload.coverage_id);

        const target = await readTarget(supabase, ctx.orgId, coverageId);
        if (!target) {
            return {
                ok: false,
                correlationId,
                status: 404,
                error: "That coverage allocation was not found.",
                blockers: [blocker("coverage_not_found", "That coverage allocation was not found.", "coverage_id")],
            };
        }
        const verdict = coverageSiteWriteAllowed(ctx.accessScope, target.site_location_id);
        if (!verdict.allowed) return denied(correlationId, verdict.code, verdict.message);

        try {
            await cancelCoverage(supabase, coverageId, t(payload.reason_key) || null, ctx.userId ?? null);
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: STAFF_COVERAGE_CANCEL_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(payload.person_id) || t(invocation.entityId),
                    affectedId: coverageId,
                    detail: {
                        staff_coverage_id: coverageId,
                        employment_id: target.employment_id,
                        service_date: target.service_date,
                        lifecycle_operation: "CANCELLED",
                    },
                },
            };
        } catch (err) {
            const mapped = mapCoverageError(err, correlationId);
            if (mapped) return mapped;
            throw err;
        }
    },
};

export const STAFF_COVERAGE_ACTIONS: RegisteredAction[] = [
    staffCoveragePlanAction,
    staffCoverageChangeAction,
    staffCoverageCorrectAction,
    staffCoverageCancelAction,
];

/**
 * Registered actions for staff presence.
 *
 * `staff_presence.record` authors an original fact (check in / check out /
 * present / absence). `staff_presence.correct` authors a correction or reversal
 * referencing a prior fact — never an edit in place.
 *
 * These are the only sanctioned writers. The table is append-only at the
 * database level regardless, so a UI that tried to mutate would fail loudly.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { isValidIsoDateString } from "@/lib/childcareOperational/effectiveDating";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { EmploymentServiceError, employmentErrorStatus } from "@/lib/employment/employmentErrors";
import { recordStaffPresence } from "@/lib/staffPresence/staffPresenceService";
import {
    STAFF_PRESENCE_EVENT_KINDS,
    isStaffPresenceEventKind,
} from "@/lib/staffPresence/staffPresenceVocabulary";

export const STAFF_PRESENCE_RECORD_ACTION_KEY = "staff_presence.record";
export const STAFF_PRESENCE_CORRECT_ACTION_KEY = "staff_presence.correct";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function mapError(err: unknown, correlationId: string): ActionResult | null {
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

export const staffPresenceRecordAction: RegisteredAction = {
    actionKey: STAFF_PRESENCE_RECORD_ACTION_KEY,
    defaultLabel: "Record staff presence",
    description: "Record that a staff member checked in, checked out, or is absent.",
    supportedEntityTypes: ["person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "none",
    bosProposalSupport: false,

    validatePayload(payload) {
        const src = payload ?? {};
        const kind = t(src.event_kind);
        if (kind && !isStaffPresenceEventKind(kind)) {
            return {
                ok: false,
                blockers: [
                    {
                        code: "invalid_event_kind",
                        message: `event_kind must be one of: ${STAFF_PRESENCE_EVENT_KINDS.join(", ")}`,
                        field: "event_kind",
                    },
                ],
            };
        }
        const serviceDate = t(src.service_date);
        if (serviceDate && !isValidIsoDateString(serviceDate)) {
            return {
                ok: false,
                blockers: [
                    { code: "invalid_service_date", message: "service_date must be YYYY-MM-DD", field: "service_date" },
                ],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ payload, invocation }) {
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!t(payload?.person_id) && !t(invocation?.entityId)) {
            blockers.push({ code: "missing_person", message: "person_id is required", field: "person_id" });
        }
        if (!t(payload?.site_location_id)) {
            blockers.push({
                code: "missing_site",
                message: "site_location_id is required",
                field: "site_location_id",
            });
        }
        if (!t(payload?.event_kind)) {
            blockers.push({ code: "missing_event_kind", message: "event_kind is required", field: "event_kind" });
        }
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        const kind = t(payload?.event_kind) || "presence";
        return {
            summary: `Record ${kind.replace("_", " ")} for this staff member.`,
            changes: [
                "Append one immutable presence fact",
                "Employment covering the service date is required",
                "Nothing is overwritten — corrections are separate facts",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const row = await recordStaffPresence(supabase, {
                orgId: ctx.orgId,
                personId: t(payload.person_id) || invocation.entityId,
                siteLocationId: t(payload.site_location_id),
                roomLocationId: t(payload.room_location_id) || null,
                eventKind: t(payload.event_kind) as never,
                serviceDate: t(payload.service_date) || todayYmd,
                eventAt: t(payload.event_at) || null,
                reasonKey: t(payload.reason_key) || null,
                note: t(payload.note) || null,
                actorType: "operator",
                sourceType: "operator_action",
                sourceKey: "operator_action",
                actorUserId: ctx.userId ?? null,
                correlationId,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: STAFF_PRESENCE_RECORD_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: row.person_id,
                    affectedId: row.id,
                    detail: {
                        staff_presence_event_id: row.id,
                        person_id: row.person_id,
                        employment_id: row.employment_id,
                        event_kind: row.event_kind,
                        service_date: row.service_date,
                        event_at: row.event_at,
                        room_location_id: row.room_location_id,
                    },
                },
            };
        } catch (err) {
            const mapped = mapError(err, correlationId);
            if (mapped) return mapped;
            throw err;
        }
    },
};

export const staffPresenceCorrectAction: RegisteredAction = {
    actionKey: STAFF_PRESENCE_CORRECT_ACTION_KEY,
    defaultLabel: "Correct staff presence",
    description: "Restate or reverse a prior staff presence fact. The original is preserved.",
    supportedEntityTypes: ["person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        const entry = t(payload?.entry_type) || "correction";
        if (entry !== "correction" && entry !== "reversal") {
            return {
                ok: false,
                blockers: [
                    { code: "invalid_entry_type", message: "entry_type must be correction or reversal", field: "entry_type" },
                ],
            };
        }
        return { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ payload }) {
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!t(payload?.corrects_event_id)) {
            blockers.push({
                code: "missing_target",
                message: "corrects_event_id is required — a correction must reference the fact it supersedes",
                field: "corrects_event_id",
            });
        }
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        const entry = t(payload?.entry_type) || "correction";
        return {
            summary:
                entry === "reversal"
                    ? "Reverse a prior presence fact."
                    : "Restate a prior presence fact with corrected values.",
            changes: [
                "The original fact is preserved and stays in history",
                "A new fact referencing it becomes effective truth",
                entry === "reversal"
                    ? "The reversed fact contributes nothing to current state"
                    : "The corrected values become current state",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const entryType = (t(payload.entry_type) || "correction") as "correction" | "reversal";
            const row = await recordStaffPresence(supabase, {
                orgId: ctx.orgId,
                personId: t(payload.person_id) || invocation.entityId,
                siteLocationId: t(payload.site_location_id),
                roomLocationId: t(payload.room_location_id) || null,
                eventKind: t(payload.event_kind) as never,
                entryType,
                correctsEventId: t(payload.corrects_event_id),
                serviceDate: t(payload.service_date) || todayYmd,
                eventAt: t(payload.event_at) || null,
                reasonKey: t(payload.reason_key) || null,
                note: t(payload.note) || null,
                actorType: "operator",
                sourceType: "operator_action",
                sourceKey: "operator_correction",
                actorUserId: ctx.userId ?? null,
                correlationId,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: STAFF_PRESENCE_CORRECT_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: row.person_id,
                    affectedId: row.id,
                    detail: {
                        staff_presence_event_id: row.id,
                        entry_type: row.entry_type,
                        corrects_event_id: row.corrects_event_id,
                        event_at: row.event_at,
                    },
                },
            };
        } catch (err) {
            const mapped = mapError(err, correlationId);
            if (mapped) return mapped;
            throw err;
        }
    },
};

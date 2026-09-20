/**
 * Registered actions for the accounting calendar: `billing.adopt_accounting_calendar` and
 * `billing.close_accounting_period`.
 *
 * ── WHY THESE EXIST ───────────────────────────────────────────────────────────────────────────
 *
 * Every rule that decides accounting attribution was already canonical and enforced in the
 * database — one active calendar per org, non-overlapping periods, frozen boundaries once posted,
 * and the `attribute_financial_journal_entry` trigger. None of it could be reached: no INSERT,
 * UPDATE or DELETE against either accounting table existed anywhere in application code. A tenant
 * with no calendar stamps every journal entry `no_calendar`, so the whole system sat inert behind
 * a read-only screen that honestly said so and offered nothing.
 *
 * ── WHAT CLOSING MEANS HERE, AND WHAT IT DOES NOT ─────────────────────────────────────────────
 *
 * It does NOT refuse later postings. The platform's doctrine, argued in the migration, is that a
 * closed period DEFERS: an entry effective inside it is attributed to the earliest later OPEN
 * period and stamped with where it came from, because a reporting boundary must not be able to
 * stop a family being charged. Refusal happens only when there is no later open period to defer
 * to, and the preview warns before that becomes true.
 *
 * Closing moves nothing already attributed. It changes `status` and stamps who and when — the
 * database freezes boundaries once entries exist, and this never tries to change them.
 */

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import {
    adoptCalendarMonthCalendar,
    closeAccountingPeriod,
    previewClosePeriod,
    readActiveCalendar,
} from "@/lib/financials/accounting/accountingCalendarService";

export const ACCOUNTING_CALENDAR_ADOPT_ACTION_KEY = "billing.adopt_accounting_calendar";
export const ACCOUNTING_PERIOD_CLOSE_ACTION_KEY = "billing.close_accounting_period";

/*
 * Configuring the books and closing them are financial mutations, not portal admission. `fin.write`
 * is the existing Financials write grant and no new role check is invented here.
 */
export const ACCOUNTING_PERIOD_PERMISSION = "fin.write" as const;

const t = (v: unknown): string => (v != null ? String(v).trim() : "");

async function permitted(supabase: SupabaseClient, orgId: string, userId: string | null | undefined): Promise<boolean> {
    const grants = await resolveActorPermissionGrants(supabase, orgId, userId ?? null);
    return (grants.permissionKeys ?? []).includes(ACCOUNTING_PERIOD_PERMISSION);
}

function denied(correlationId: string, code: string): ActionResult {
    return {
        ok: false,
        correlationId,
        status: 403,
        error: `Requires ${ACCOUNTING_PERIOD_PERMISSION}.`,
        blockers: [{ code, message: `Requires ${ACCOUNTING_PERIOD_PERMISSION}.` }],
    };
}

const BASE: Pick<
    RegisteredAction,
    "supportedEntityTypes" | "supportedProcessKeys" | "requiredContext" | "audit" | "bosProposalSupport" | "confirmationPolicy"
> = {
    /*
     * The accounting calendar belongs to the organisation, and `ActionEntityType` has no org
     * member — the runtime's entity vocabulary is about records an operator opens. These need no
     * entity at all (`requiresEntityId: false`); `person` is named only so the action is
     * invocable from a surface that must name something.
     */
    supportedEntityTypes: ["person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",
};

const adoptAction: RegisteredAction = {
    ...BASE,
    actionKey: ACCOUNTING_CALENDAR_ADOPT_ACTION_KEY,
    defaultLabel: "Adopt accounting calendar",
    description:
        "Adopt a calendar-month accounting calendar and materialise its twelve periods, so posted "
        + "financial history can be attributed to a reporting period. Posts nothing and moves no money.",
    validatePayload: (payload) => ({ ok: true, value: { ...(payload ?? {}) } }),

    async resolveEligibility({ supabase, ctx }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId);
        return {
            eligible: ok,
            blockers: ok ? [] : [{ code: "accounting_permission_required", message: `Requires ${ACCOUNTING_PERIOD_PERMISSION}.` }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ supabase, ctx, payload }) {
        const existing = await readActiveCalendar(supabase as SupabaseClient, ctx.orgId);
        const year = Number(t(payload?.start_year)) || new Date().getUTCFullYear();
        return {
            summary: existing
                ? `${existing.name} is already the active calendar; missing periods will be materialised.`
                : `Adopt a calendar-month accounting calendar for ${year} and open its twelve periods.`,
            changes: existing ? [] : [`New calendar FY${year}`, "12 monthly periods, all open"],
        };
    },

    async execute({ supabase, ctx, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return denied(correlationId, "accounting_permission_required");
        }
        const year = Number(t(payload?.start_year)) || new Date().getUTCFullYear();
        const month = Number(t(payload?.start_month)) || 1;
        try {
            const out = await adoptCalendarMonthCalendar(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                actorUserId: ctx.userId ?? null,
                startYear: year,
                startMonth: month,
                name: t(payload?.name) || undefined,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: ACCOUNTING_CALENDAR_ADOPT_ACTION_KEY,
                    entityType: "person",
                    entityId: ctx.orgId,
                    affectedId: out.calendarId,
                    detail: { calendar_created: out.created, periods_materialised: out.inserted, start_year: year },
                },
            };
        } catch (e) {
            return { ok: false, correlationId, status: 400, error: (e as Error).message, blockers: [{ code: "adopt_failed", message: (e as Error).message }] };
        }
    },
};

const closeAction: RegisteredAction = {
    ...BASE,
    actionKey: ACCOUNTING_PERIOD_CLOSE_ACTION_KEY,
    defaultLabel: "Close accounting period",
    description:
        "Close an accounting period. Entries already attributed to it are untouched; later entries "
        + "effective inside it defer to the next open period.",
    validatePayload: (payload) =>
        t(payload?.period_id)
            ? { ok: true, value: { period_id: t(payload?.period_id) } }
            : { ok: false, blockers: [{ code: "missing_period", message: "Name the accounting period to close.", field: "period_id" }] },

    async resolveEligibility({ supabase, ctx, payload }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId);
        if (!ok) {
            return {
                eligible: false,
                blockers: [{ code: "accounting_permission_required", message: `Requires ${ACCOUNTING_PERIOD_PERMISSION}.` }],
                availableTransitions: [], requiredInputs: [],
            };
        }
        const periodId = t(payload?.period_id);
        if (!periodId) {
            return { eligible: false, blockers: [{ code: "missing_period", message: "Name the accounting period to close." }], availableTransitions: [], requiredInputs: [] };
        }
        const pv = await previewClosePeriod(supabase as SupabaseClient, { orgId: ctx.orgId, periodId });
        const hard = pv.blockers.filter((b) => b.code === "already_closed");
        return { eligible: hard.length === 0, blockers: hard, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ supabase, ctx, payload }) {
        const pv = await previewClosePeriod(supabase as SupabaseClient, { orgId: ctx.orgId, periodId: t(payload?.period_id) });
        const name = pv.label ?? pv.periodKey;
        return {
            summary: pv.blockers.length > 0 ? `Cannot close ${name}` : `Ready to close ${name}`,
            changes: [
                `${name} · ${pv.startsOn} to ${pv.endsOn} · currently ${pv.status}`,
                `${pv.attributedEntries} posted ${pv.attributedEntries === 1 ? "entry stays" : "entries stay"} attributed here`,
                pv.defersTo
                    ? `Later entries effective in it will post to ${pv.defersTo.periodKey}`
                    : "No later open period — such entries would be refused",
                ...pv.blockers.map((b) => b.message),
            ],
        };
    },

    async execute({ supabase, ctx, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return denied(correlationId, "accounting_permission_required");
        }
        const periodId = t(payload?.period_id);
        try {
            const out = await closeAccountingPeriod(supabase as SupabaseClient, {
                orgId: ctx.orgId, periodId, actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: ACCOUNTING_PERIOD_CLOSE_ACTION_KEY,
                    entityType: "person",
                    entityId: ctx.orgId,
                    affectedId: periodId,
                    detail: { period_key: out.periodKey, status: out.status, closed_at: out.closedAt },
                },
            };
        } catch (e) {
            const msg = (e as Error).message;
            const code = msg.includes("not_open") ? "accounting_period_not_open" : "close_failed";
            return { ok: false, correlationId, status: code === "accounting_period_not_open" ? 409 : 400, error: msg, blockers: [{ code, message: msg }] };
        }
    },
};

export const accountingPeriodActions: RegisteredAction[] = [adoptAction, closeAction];

import { normalizeFocusPanelChildrenRowsFromTruth } from "@/lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation";
import {
    forbidden, known, knownEmpty, unavailable, unknown,
    type FirstOrderField,
} from "@/lib/runtime/firstOrder/firstOrderWorkUnitProjection";
import type {
    FirstOrderCapability, FirstOrderProjectionContext, FirstOrderScalar,
} from "@/lib/runtime/firstOrder/firstOrderCapability";
import type { AccountLedgerPosition } from "@/lib/runtime/firstOrder/readAccountLedgerPosition";

/**
 * THE REGISTERED FIRST-ORDER CAPABILITIES.
 *
 * One entry per semantic fact the platform can answer at Stage 1. Configuration selects from this
 * set by naming semantic keys; it can never extend it. A configured key with no entry here is an
 * UNSUPPORTED CAPABILITY and fails the compile explicitly — it is not omitted, not zero, not
 * empty, and emphatically not UNKNOWN, because UNKNOWN means "the platform tried and could not
 * say", which is a lie about a fact nobody implemented.
 *
 * ADDING A CAPABILITY IS THE ONE PLACE CODE IS REQUIRED. Recomposing existing capabilities onto
 * different cards, in a different order, for a different business process, is configuration and
 * touches nothing in this file or in the composer.
 *
 * SEMANTIC KEYS ARE NAMESPACED BY THE CONCEPT, NOT BY THE CARD. `household.label` is the
 * household's label wherever it is placed; moving it onto a Billing "Account" card does not make
 * it `account.label`. Keying by card would make every card move a code change, which is the exact
 * coupling this registry exists to remove.
 */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A string fact: present is KNOWN, absent-but-readable is KNOWN EMPTY. */
const strField = (v: string | null | undefined): FirstOrderField<FirstOrderScalar> =>
    (v ?? "").trim() ? known((v as string).trim()) : knownEmpty<FirstOrderScalar>();

/** No resolved subject is UNKNOWN. It is never an empty record — that would be a wrong answer. */
const needSubject = (
    ctx: FirstOrderProjectionContext,
    fn: (truth: Record<string, unknown>) => FirstOrderField<FirstOrderScalar>,
): FirstOrderField<FirstOrderScalar> => (ctx.subjectTruth ? fn(ctx.subjectTruth) : unknown<FirstOrderScalar>());

const childRowsOf = (truth: Record<string, unknown>) => normalizeFocusPanelChildrenRowsFromTruth(truth).rows;

const CAPABILITIES: readonly FirstOrderCapability[] = [
    // ── HOUSEHOLD ────────────────────────────────────────────────────────────────────────────
    {
        semanticKey: "household.label",
        canonicalOwner: "lib/runtime/provisioning/workUnitProcessPopulation",
        grain: "record", prerequisites: ["population"], authorization: "none",
        project: (c) => needSubject(c, (t) => strField(str(t.name) || str(t.title))),
    },
    {
        semanticKey: "household.updated_at",
        canonicalOwner: "lib/runtime/provisioning/workUnitProcessPopulation",
        grain: "record", prerequisites: ["population"], authorization: "none",
        project: (c) => needSubject(c, (t) => (str(t.updated_at) ? known(str(t.updated_at)) : unknown<FirstOrderScalar>())),
    },
    {
        semanticKey: "person.primary_contact_name",
        canonicalOwner: "lib/workspace/enrichOpportunityQueueProjection",
        grain: "record", prerequisites: ["population", "crm_projection"], authorization: "none",
        project: (c) => needSubject(c, (t) => strField(str(t._primary_contact_name))),
    },
    {
        semanticKey: "person.primary_contact_line",
        canonicalOwner: "lib/workspace/enrichOpportunityQueueProjection",
        grain: "record", prerequisites: ["population", "crm_projection"], authorization: "none",
        project: (c) => needSubject(c, (t) => strField(str(t._primary_contact_line))),
    },
    {
        semanticKey: "record.location_label",
        canonicalOwner: "lib/workspace/enrichOpportunityQueueProjection",
        grain: "record", prerequisites: ["population", "crm_projection"], authorization: "none",
        project: (c) => needSubject(c, (t) => strField(str(t._location_label))),
    },

    // ── CHILDREN ─────────────────────────────────────────────────────────────────────────────
    {
        semanticKey: "children.count",
        canonicalOwner: "lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation",
        grain: "record", prerequisites: ["population", "children_projection"], authorization: "none",
        project: (c) => {
            if (c.childrenRead === false) return unavailable<FirstOrderScalar>("children unavailable");
            return needSubject(c, (t) => known(childRowsOf(t).length));
        },
    },
    {
        semanticKey: "children.enrolling_count",
        canonicalOwner: "lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards",
        grain: "record", prerequisites: ["population", "children_projection"], authorization: "none",
        project: (c) => {
            if (c.childrenRead === false) return unavailable<FirstOrderScalar>("children unavailable");
            return needSubject(c, (t) => known(childRowsOf(t).filter((r) => r.outcome_status_key !== "declined").length));
        },
    },

    // ── BUSINESS PROCESS ─────────────────────────────────────────────────────────────────────
    {
        semanticKey: "process.name",
        canonicalOwner: "lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail",
        grain: "work_unit", prerequisites: ["process_config"], authorization: "none",
        project: (c) => {
            if (c.processConfigRead === false) return unavailable<FirstOrderScalar>("process configuration unavailable");
            // A department declaring no active process is a CONFIGURED ABSENCE — a real answer.
            if (!c.rail) return knownEmpty<FirstOrderScalar>();
            return strField(c.rail.process_name ?? null);
        },
    },
    {
        semanticKey: "process.stage_count",
        canonicalOwner: "lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail",
        grain: "work_unit", prerequisites: ["process_config"], authorization: "none",
        project: (c) => {
            if (c.processConfigRead === false) return unavailable<FirstOrderScalar>("process configuration unavailable");
            if (!c.rail) return knownEmpty<FirstOrderScalar>();
            return known(c.rail.stages.length);
        },
    },
    {
        semanticKey: "process.current_stage_key",
        canonicalOwner: "lib/runtime/provisioning/workUnitProcessPopulation",
        grain: "record", prerequisites: ["population"], authorization: "none",
        project: (c) => (c.subjectRow ? strField(str(c.subjectRow.stage_key)) : unknown<FirstOrderScalar>()),
    },
    {
        semanticKey: "process.stage_entered_at",
        canonicalOwner: "lib/runtime/provisioning/workUnitProcessPopulation",
        grain: "record", prerequisites: ["population"], authorization: "none",
        project: (c) => (c.subjectRow ? strField(str(c.subjectRow.stage_entered_at)) : unknown<FirstOrderScalar>()),
    },
    {
        semanticKey: "process.current_stage_label",
        canonicalOwner: "lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail",
        grain: "record", prerequisites: ["population", "process_config"], authorization: "none",
        project: (c) => {
            if (c.processConfigRead === false) return unavailable<FirstOrderScalar>("process configuration unavailable");
            if (!c.rail) return knownEmpty<FirstOrderScalar>();
            if (!c.subjectRow) return unknown<FirstOrderScalar>();
            const key = str(c.subjectRow.stage_key);
            const found = key ? c.rail.stages.find((s) => s.key === key) : undefined;
            // A stage the rail does not declare is UNKNOWN to the rail, not the first stage.
            return found ? known(found.label) : unknown<FirstOrderScalar>();
        },
    },
    {
        semanticKey: "process.stage_position",
        canonicalOwner: "lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail",
        grain: "record", prerequisites: ["population", "process_config"], authorization: "none",
        project: (c) => {
            if (c.processConfigRead === false) return unavailable<FirstOrderScalar>("process configuration unavailable");
            if (!c.rail) return knownEmpty<FirstOrderScalar>();
            if (!c.subjectRow) return unknown<FirstOrderScalar>();
            const key = str(c.subjectRow.stage_key);
            const i = key ? c.rail.stages.findIndex((s) => s.key === key) : -1;
            return i >= 0 ? known(i + 1) : unknown<FirstOrderScalar>();
        },
    },

    // ── ATTENDANCE ───────────────────────────────────────────────────────────────────────────
    {
        semanticKey: "attendance.state",
        canonicalOwner: "lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM",
        grain: "child", prerequisites: ["attendance_fold"], authorization: "none",
        project: (c) => (c.attendance ? known(c.attendance.state) : unavailable<FirstOrderScalar>("attendance unavailable")),
    },
    {
        semanticKey: "attendance.date",
        canonicalOwner: "lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM",
        grain: "child", prerequisites: ["attendance_fold"], authorization: "none",
        project: (c) => (c.attendance ? known(c.attendance.date) : unavailable<FirstOrderScalar>("attendance unavailable")),
    },
    {
        semanticKey: "attendance.expected_room_label",
        canonicalOwner: "lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM",
        grain: "child", prerequisites: ["attendance_fold"], authorization: "none",
        project: (c) => (c.attendance ? strField(c.attendance.expected.roomLabel) : unavailable<FirstOrderScalar>("attendance unavailable")),
    },
    {
        semanticKey: "attendance.unavailable_reason",
        canonicalOwner: "lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM",
        grain: "child", prerequisites: ["attendance_fold"], authorization: "none",
        // Null reason means attendance IS recordable. That is a real answer, not an absent one.
        project: (c) => (c.attendance ? strField(c.attendance.unavailableReason) : unavailable<FirstOrderScalar>("attendance unavailable")),
    },

    // ── HEALTH & SAFETY ──────────────────────────────────────────────────────────────────────
    {
        semanticKey: "health.profile_fact_count",
        canonicalOwner: "lib/completion/loadCustomerMemberProfileFields",
        grain: "child", prerequisites: ["health_profile"], authorization: "health_view",
        project: (c) => (c.healthProfile
            ? known(Object.keys(c.healthProfile.get(c.customerMemberId ?? "") ?? {}).length)
            : unavailable<FirstOrderScalar>("health profile unavailable")),
    },
    {
        semanticKey: "health.requirements_satisfied",
        canonicalOwner: "lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM",
        grain: "child", prerequisites: ["health_supplements"], authorization: "health_view",
        project: (c) => (c.healthSupplements
            ? known(c.healthSupplements.requirementsSatisfied)
            : unavailable<FirstOrderScalar>("health supplements unavailable")),
    },
    {
        semanticKey: "health.requirements_total",
        canonicalOwner: "lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM",
        grain: "child", prerequisites: ["health_supplements"], authorization: "health_view",
        project: (c) => (c.healthSupplements
            ? known(c.healthSupplements.requirementsTotal)
            : unavailable<FirstOrderScalar>("health supplements unavailable")),
    },
    {
        semanticKey: "health.emergency_contact_count",
        canonicalOwner: "lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM",
        grain: "child", prerequisites: ["health_supplements"], authorization: "health_view",
        project: (c) => (c.healthSupplements
            ? known(c.healthSupplements.emergencyContactCount)
            : unavailable<FirstOrderScalar>("health supplements unavailable")),
    },

    // ── FINANCIALS (prepaid position) ────────────────────────────────────────────────────────
    ...(["available", "pending", "held"] as const).map((slot): FirstOrderCapability => ({
        semanticKey: `financials.prepaid_${slot}_cents`,
        canonicalOwner: "lib/financials/prepaid/readAccountPrepaidPosition",
        grain: "household", prerequisites: ["prepaid_position"], authorization: "financials_read",
        project: (c) => {
            if (!c.prepaid) return unavailable<FirstOrderScalar>("prepaid reader failed");
            const o = c.prepaid.outcome;
            if (o.state === "forbidden") return forbidden<FirstOrderScalar>();
            if (o.state !== "ok") return unavailable<FirstOrderScalar>(o.reason);
            const cents = slot === "available" ? o.position.availableCents
                : slot === "pending" ? o.position.pendingCents
                : o.position.heldCents;
            return known(cents);
        },
    })),

    // ── FINANCIALS (account ledger) ──────────────────────────────────────────────────────────
    /*
     * These four are the reason the account-scoped charges reader was extracted. Every one of
     * them is a projection of `AccountLedgerPosition`, which is itself composition over
     * `reconcileRows` and `pastDueFor` — the same two functions the Financials card calls, on
     * rows produced by the same reader. There is no A′ arithmetic here.
     *
     * A PARTIAL FINANCIAL READ IS NOT MONEY. The position is UNAVAILABLE as a whole when either
     * of its two reads fails, so none of these can publish a figure derived from half a ledger.
     */
    ...([
        ["financials.billing_period_key", (p) => known(p.periodKey)],
        ["financials.responsibility_cents", (p) => known(p.reconciliation.responsibilityCents)],
        ["financials.balance_cents", (p) => known(p.reconciliation.balanceCents)],
        /*
         * NO PAST DUE IS A REAL ZERO, NOT AN ABSENCE. `pastDueFor` returns null when nothing is
         * overdue, and that is the account genuinely owing nothing late — a known fact an operator
         * can act on. UNKNOWN here would say "we could not tell", which is a different and worse
         * answer for a collections figure.
         */
        ["financials.past_due_cents", (p) => known(p.pastDue?.amountCents ?? 0)],
    ] as Array<[string, (p: Extract<AccountLedgerPosition, { state: "ok" }>) => FirstOrderField<FirstOrderScalar>]>)
        .map(([semanticKey, project]): FirstOrderCapability => ({
            semanticKey,
            canonicalOwner: "lib/financials/account/accountChargeLedger + buildFinancialsCardVM.reconcileRows",
            grain: "household", prerequisites: ["account_ledger"], authorization: "financials_read",
            project: (c) => {
                if (!c.accountLedger) return unavailable<FirstOrderScalar>("account ledger reader failed");
                if (c.accountLedger.state !== "ok") return unavailable<FirstOrderScalar>(c.accountLedger.reason);
                return project(c.accountLedger);
            },
        })),
];

const BY_KEY: ReadonlyMap<string, FirstOrderCapability> = new Map(CAPABILITIES.map((c) => [c.semanticKey, c]));

export function findFirstOrderCapability(semanticKey: string): FirstOrderCapability | undefined {
    return BY_KEY.get(semanticKey.trim());
}

/** Every registered semantic key. Diagnostics and certification only — never dispatch. */
export function registeredFirstOrderSemanticKeys(): string[] {
    return [...BY_KEY.keys()].sort();
}

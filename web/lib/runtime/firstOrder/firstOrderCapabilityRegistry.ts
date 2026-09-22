import { normalizeFocusPanelChildrenRowsFromTruth } from "@/lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation";
import {
    forbidden, known, knownEmpty, unavailable, unknown,
    type FirstOrderField,
} from "@/lib/runtime/firstOrder/firstOrderWorkUnitProjection";
import {
    KPI_CAPABILITY_FAMILY, WORK_VIEW_CAPABILITY_FAMILY,
    type FirstOrderCapability, type FirstOrderProjectionContext, type FirstOrderScalar,
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

/**
 * THE CHILDREN OF THIS RECORD — from the enricher's own unified projection.
 *
 * ── THE DEFECT THIS REPLACES, FOUND BY LIVE FACT IDENTITY ──
 *
 * This read `normalizeFocusPanelChildrenRowsFromTruth`, which resolves
 * `_inquiry_children ?? _durable_child_rows`. `enrichOpportunityRowsWithChildrenForCompactQueue`
 * writes `_inquiry_children` only for children seeded from `metadata.inquiry_children`; children
 * reached through the HOUSEHOLD (`customer_members`) land under `_household_children`. The
 * normalizer never reads that key, so on the deployed specimen the projection reported
 * `known(0)` children while the operator's own frame rendered "1 child Specee Specq0913".
 *
 * Honest state, wrong fact — which a state-shape oracle passes and only a fact-identity check
 * catches. It is the third time this programme has produced that shape.
 *
 * `_crm_compact_children` is the enricher's UNIFIED answer: both branches populate it, so it is
 * the one key that means "the children of this queue record" regardless of how they were reached.
 * That makes it the right source here, and it keeps a single owner — the enricher — rather than
 * teaching A′ a precedence of its own.
 */
const compactChildrenOf = (truth: Record<string, unknown>): Array<Record<string, unknown>> => {
    const compact = truth._crm_compact_children;
    return Array.isArray(compact) ? (compact as Array<Record<string, unknown>>) : [];
};

/**
 * Children the record carries an ENROLMENT OUTCOME for.
 *
 * Only the inquiry roster carries `outcome_status_key`; a child reached through the household is
 * a household member, not an inquiry participant, and has no outcome to report. So this answers
 * only when the roster that carries outcomes is present — otherwise the count is genuinely
 * UNKNOWN, and saying "0 enrolling" about children whose status nobody recorded would be the same
 * false-fact mistake in a new place.
 */
const inquiryChildRowsOf = (truth: Record<string, unknown>) =>
    normalizeFocusPanelChildrenRowsFromTruth(truth).rows;

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
            return needSubject(c, (t) => known(compactChildrenOf(t).length));
        },
    },
    {
        semanticKey: "children.enrolling_count",
        canonicalOwner: "lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards",
        grain: "record", prerequisites: ["population", "children_projection"], authorization: "none",
        project: (c) => {
            if (c.childrenRead === false) return unavailable<FirstOrderScalar>("children unavailable");
            return needSubject(c, (t) => {
                const withOutcome = inquiryChildRowsOf(t);
                // No outcome-bearing roster: nobody recorded an enrolment status, so the count is
                // unknown. Reporting 0 would state a fact about children nobody has assessed.
                if (withOutcome.length === 0 && compactChildrenOf(t).length > 0) return unknown<FirstOrderScalar>();
                return known(withOutcome.filter((r) => r.outcome_status_key !== "declined").length);
            });
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

    // ── KPI VALUES (family) ──────────────────────────────────────────────────────────────────
    /*
     * ONE capability for the whole family, selected per configured slot. The configured
     * `sourceKey` is the member; `resolveWorkUnitHeaderKpis` is the canonical owner and
     * `workUnitHeaderKpiKeysFromSlots` already validates members against `isKnownOipMetricKey`,
     * so an unknown KPI key is rejected by the platform's own vocabulary rather than by a list
     * kept here.
     */
    {
        semanticKey: `${KPI_CAPABILITY_FAMILY}:*`,
        canonicalOwner: "lib/runtime/provisioning/workUnitHeaderKpiResolution.resolveWorkUnitHeaderKpis",
        grain: "work_unit", prerequisites: ["header_kpis"], authorization: "analytics_read",
        project: () => unknown<FirstOrderScalar>(),
        projectMember: (identity, c) => {
            if (!c.headerKpis) return unavailable<FirstOrderScalar>("KPI resolution failed");
            if (c.headerKpis.status === "forbidden") return forbidden<FirstOrderScalar>();
            if (c.headerKpis.status !== "ok") return unavailable<FirstOrderScalar>(`KPI status ${c.headerKpis.status}`);
            const v = c.headerKpis.values[identity];
            // A KPI the resolver did not answer is UNKNOWN. Zero is a real operational figure and
            // must never stand in for "not resolved" on a metric an operator acts on.
            if (v == null) return unknown<FirstOrderScalar>();
            const n = typeof v === "number" ? v : Number((v as { value?: unknown })?.value);
            return Number.isFinite(n) ? known(n) : unknown<FirstOrderScalar>();
        },
    },

    // ── WORK VIEW VALUES (family) ────────────────────────────────────────────────────────────
    /*
     * `resolveWorkViewTotalsSeed` delegates to `evaluateWorkViewTotalsForGroup`, the ONE canonical
     * evaluator. Nothing is re-implemented here — the QVT duplication this programme already
     * closed stays closed.
     */
    {
        semanticKey: `${WORK_VIEW_CAPABILITY_FAMILY}:*`,
        canonicalOwner: "lib/runtime/provisioning/workViewTotalsSeed.resolveWorkViewTotalsSeed",
        grain: "work_unit", prerequisites: ["work_view_totals"], authorization: "none",
        project: () => unknown<FirstOrderScalar>(),
        projectMember: (identity, c) => {
            if (!c.workViewTotals) return unavailable<FirstOrderScalar>("work view totals unavailable");
            if (c.workViewTotals.status !== "ok") return unavailable<FirstOrderScalar>(c.workViewTotals.reason);
            const v = c.workViewTotals.totalsByViewId[identity];
            if (v == null) return unknown<FirstOrderScalar>();
            return known(v);
        },
    },
];

const BY_KEY: ReadonlyMap<string, FirstOrderCapability> = new Map(CAPABILITIES.map((c) => [c.semanticKey, c]));

export function findFirstOrderCapability(semanticKey: string): FirstOrderCapability | undefined {
    return BY_KEY.get(semanticKey.trim());
}

/** Every registered semantic key. Diagnostics and certification only — never dispatch. */
export function registeredFirstOrderSemanticKeys(): string[] {
    return [...BY_KEY.keys()].sort();
}

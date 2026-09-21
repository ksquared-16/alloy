import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAttendanceCardVM } from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import { readAccountPrepaidPosition } from "@/lib/financials/prepaid/readAccountPrepaidPosition";
import { loadCustomerMemberProfileFieldsByMemberId } from "@/lib/completion/loadCustomerMemberProfileFields";
import { loadWorkUnitProcessPopulation } from "@/lib/runtime/provisioning/workUnitProcessPopulation";
import { enrichOpportunityRowsWithCrmProjection } from "@/lib/workspace/enrichOpportunityQueueProjection";
import { enrichOpportunityRowsWithChildrenForCompactQueue } from "@/lib/runtime/provisioning/enrichOpportunityRowsWithChildrenForCompactQueue";
import { loadAcknowledgedOccurrenceKeys } from "@/lib/queues/operatorStageMembershipAck";
import { buildOpportunityWorkspaceLifecycleRail } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail";
import { readWorkUnitProcessConfiguration } from "@/lib/runtime/firstOrder/readWorkUnitProcessConfiguration";
import { readHealthFirstOrderSupplements } from "@/lib/runtime/firstOrder/readHealthFirstOrderSupplements";
import { readAccountLedgerPosition } from "@/lib/runtime/firstOrder/readAccountLedgerPosition";
import {
    compileFirstOrderPlan, type FirstOrderPlan, type FirstOrderSurfaceConfiguration,
} from "@/lib/runtime/firstOrder/compileFirstOrderPlan";
import type {
    FirstOrderPrerequisiteKey, FirstOrderProjectionContext, FirstOrderScalar,
    FirstOrderUnsupportedCapability,
} from "@/lib/runtime/firstOrder/firstOrderCapability";
import {
    forbidden, known, unavailable, unknown,
    type FirstOrderCardSummary, type FirstOrderConfigurationIdentity, type FirstOrderField,
    type FirstOrderQueueRow, type FirstOrderWorkUnitProjection,
} from "@/lib/runtime/firstOrder/firstOrderWorkUnitProjection";

/**
 * THE STAGE-1 RUNTIME (P0-7.6 · A′) — a CONFIGURATION COMPILER, not a projection for six cards.
 *
 * It executes a PLAN:
 *
 *   configuration → semantic keys → registered capabilities → deduplicated prerequisites
 *                 → concurrent execution → projection → configuration-owned geometry.
 *
 * SHADOW ONLY: nothing renders from this and it is not a fallback for the existing answer.
 *
 * ── WHAT THIS FILE IS NOT ALLOWED TO CONTAIN, AND WHY ──
 *
 * No card key. No semantic key. No field list. No `switch (cardKey)`. It iterates the plan the
 * compiler produced and asks each capability for its own value. The previous version branched
 * per card and populated named facts by hand: card membership was configurable while FIELD
 * membership was not, so moving one field between two cards, or giving Billing a different
 * surface, meant editing this file. That is the difference between a configurable surface and a
 * configuration compiler, and it is the whole point of the refactor.
 *
 * Gates enforce this by reading the source: no semantic-key literal, no card-key membership list,
 * no `"collapsed"` literal (the Stage-1/Stage-2 line belongs to configuration).
 *
 * ── WHAT IT STILL OWNS ──
 *
 * Dependency execution. The compiler says WHICH reads are needed and which wait on which; this
 * runs them with the measured concurrency, and reports read time and assembly time separately
 * because the remaining product margin is small enough that one total would hide the term that
 * decides cutover.
 */

export type FirstOrderComposeInput = {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    viewerId: string;
    /** The focused subject's child grain, when one is focused. */
    customerMemberId: string | null;
    /** The focused subject's household, for money. */
    householdId: string | null;
    /** The COMPILED surface: cards in order, each with its first-order semantic keys in order. */
    configuration: FirstOrderSurfaceConfiguration;
    /** Request-time decisions, resolved by the caller's gate. Never decided here. */
    authority: { financialsRead: boolean; healthView: boolean };
};

export type FirstOrderComposeTiming = {
    /** Compiling configuration into a plan. Measured on its own — never hidden inside assembly. */
    planMs: number;
    readDagMs: number;
    assemblyMs: number;
    totalMs: number;
    /** Offsets from compose start, so concurrency is visible rather than inferred. */
    spans: Array<{ name: string; at: number; end: number }>;
    /** Prerequisites that actually ran. An unselected prerequisite must not appear here. */
    executedResolvers: string[];
    queryCount: number;
};

export type FirstOrderComposeResult = {
    projection: FirstOrderWorkUnitProjection;
    timing: FirstOrderComposeTiming;
    plan: FirstOrderPlan;
};

/**
 * A configured capability nobody implements is a COMPILE FAILURE, surfaced as a throw.
 *
 * Not a silent omission, not zero, not empty, and not UNKNOWN. UNKNOWN is the platform saying it
 * tried and could not answer; here nothing tried, because the fact has no implementation. The two
 * are indistinguishable on a surface and must not be indistinguishable in the runtime.
 */
export class FirstOrderUnsupportedCapabilityError extends Error {
    readonly unsupported: readonly FirstOrderUnsupportedCapability[];
    constructor(unsupported: readonly FirstOrderUnsupportedCapability[]) {
        super(`first-order configuration names ${unsupported.length} unsupported capability/capabilities: `
            + unsupported.map((u) => `${u.cardKey}/${u.semanticKey}`).join(", "));
        this.name = "FirstOrderUnsupportedCapabilityError";
        this.unsupported = unsupported;
    }
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Query cost per prerequisite. Stated once, so the census is derived from the plan. */
const PREREQUISITE_QUERY_COST: Readonly<Record<FirstOrderPrerequisiteKey, number>> = {
    population: 1, crm_projection: 2, children_projection: 2, personal_seen: 1,
    attendance_fold: 2, health_profile: 2, health_supplements: 2, process_config: 1, prepaid_position: 7,
    // agreements · paged charges · batched applications · batched payment statuses
    account_ledger: 4,
};

export async function composeFirstOrderWorkUnitProjection(
    input: FirstOrderComposeInput,
): Promise<FirstOrderComposeResult> {
    const { supabase, orgId, workUnitId, configuration: cfg } = input;
    const t0 = performance.now();
    const at = () => Math.round(performance.now() - t0);
    const spans: FirstOrderComposeTiming["spans"] = [];
    const executedResolvers: string[] = [];
    let queryCount = 0;

    // ── COMPILE ────────────────────────────────────────────────────────────────────────────────
    const plan = compileFirstOrderPlan(cfg);
    if (!plan.ok) throw new FirstOrderUnsupportedCapabilityError(plan.unsupported);

    /*
     * AUTHORIZATION IS EVALUATED HERE, AT REQUEST TIME — AND IT PRUNES THE PLAN.
     *
     * A capability declares a REQUIREMENT; the caller's gate supplies the verdict. Fields the
     * caller may not see are answered FORBIDDEN, and — because they are removed before the
     * prerequisite set is computed — the reads that would only have served them never execute. A
     * refused caller costs zero queries for refused data, which is both the honest cost and the
     * safer one.
     *
     * No verdict is written back into the plan. A compiled plan is configuration; a permission is
     * not, and storing one would make a cached authorization out of a cached layout.
     */
    const authorized = (requirement: string): boolean =>
        requirement === "none"
        || (requirement === "financials_read" && input.authority.financialsRead)
        || (requirement === "health_view" && input.authority.healthView);

    const runnable = plan.fields.filter((f) => authorized(f.capability.authorization));
    const needed = new Set<FirstOrderPrerequisiteKey>(["population", "personal_seen"]);
    for (const f of runnable) for (const p of f.capability.prerequisites) needed.add(p);
    if (needed.has("crm_projection") || needed.has("children_projection") || needed.has("personal_seen")) needed.add("population");

    /*
     * A PREREQUISITE ALSO NEEDS ITS SUBJECT. `attendance` and the health reads are child-grain;
     * `prepaid` is household-grain. With no such subject in the request the read cannot be issued
     * at all — so it is dropped from the executable set rather than called with an empty id, and
     * its capabilities report UNAVAILABLE. Issuing it anyway would spend a round trip to learn
     * something the request already knew.
     */
    const hasChild = Boolean(input.customerMemberId);
    const hasHousehold = Boolean(input.householdId);
    const executable = new Set<FirstOrderPrerequisiteKey>(
        [...needed].filter((p) => {
            if (p === "attendance_fold" || p === "health_profile" || p === "health_supplements") return hasChild;
            if (p === "prepaid_position" || p === "account_ledger") return hasHousehold;
            return true;
        }),
    );
    const planMs = at();

    // ── EXECUTE ────────────────────────────────────────────────────────────────────────────────
    const run = async <T,>(name: FirstOrderPrerequisiteKey, fn: () => Promise<T>): Promise<T | null> => {
        executedResolvers.push(name);
        queryCount += PREREQUISITE_QUERY_COST[name];
        const a = at();
        try {
            const v = await fn();
            spans.push({ name, at: a, end: at() });
            return v;
        } catch {
            // A prerequisite that throws yields UNAVAILABLE downstream; never an empty value.
            spans.push({ name, at: a, end: at() });
            return null;
        }
    };
    const maybe = <T,>(key: FirstOrderPrerequisiteKey, fn: () => Promise<T>): Promise<T | null> =>
        (executable.has(key) ? run(key, fn) : Promise.resolve(null));

    /*
     * THE REPAIRED DAG, NOW DRIVEN BY THE PLAN.
     *
     * Phase 2 chains off the POPULATION ALONE. The first composer awaited the whole of phase 1
     * before starting population-dependent work: population finished at 127ms while CRM, children
     * and personal_seen did not start until 328ms, waiting on `prepaid` — which none of them
     * consume — and children bound the DAG at 576ms instead of ~375ms. Two hundred milliseconds
     * on a dependency that does not exist, out of a budget with ~170ms of margin.
     *
     * The edge now also exists as DATA (`PREREQUISITE_DEPENDENCIES`), so a capability added later
     * cannot reintroduce the defect by naming the wrong phase.
     */
    const populationPromise = executable.has("population")
        ? run("population", () => loadWorkUnitProcessPopulation({ supabase, orgId, workUnitId }))
        : Promise.resolve(null);

    const dependentPromise = populationPromise.then(async (pop) => {
        const depRows = ((pop?.rows ?? []) as Array<Record<string, unknown>>);
        if (!depRows.length) return { crm: null, children: null, seen: null, rows: depRows };
        const [c, ch, sn] = await Promise.all([
            maybe("crm_projection", () => enrichOpportunityRowsWithCrmProjection(supabase, orgId,
                depRows.map((r) => ({ id: str(r.id), primary_person_id: (r.primary_person_id ?? null) as string | null,
                    location_id: (r.location_id ?? null) as string | null })))),
            maybe("children_projection", () => enrichOpportunityRowsWithChildrenForCompactQueue(supabase, orgId,
                depRows.map((r) => ({ id: str(r.id), customer_id: (r.customer_id ?? null) as string | null, metadata: r.metadata })))),
            maybe("personal_seen", () => loadAcknowledgedOccurrenceKeys({
                supabase, orgId, userId: input.viewerId,
                occurrenceKeys: depRows.map((r) => `${str(r.id)}:${str(r.stage_key)}:${str(r.stage_entered_at)}`),
            })),
        ]);
        return { crm: c, children: ch, seen: sn, rows: depRows };
    });

    const [population, attendance, healthProfile, healthSupplements, processConfig, prepaid, accountLedger, dependent] =
        await Promise.all([
            populationPromise,
            maybe("attendance_fold", () => buildAttendanceCardVM(supabase, {
                orgId, customerMemberId: input.customerMemberId!, recentDays: 5,
            })),
            maybe("health_profile", () =>
                loadCustomerMemberProfileFieldsByMemberId(supabase, orgId, [input.customerMemberId!])),
            maybe("health_supplements", () =>
                readHealthFirstOrderSupplements({ supabase, orgId, customerMemberId: input.customerMemberId! })),
            maybe("process_config", () => readWorkUnitProcessConfiguration({ supabase, orgId, workUnitId })),
            maybe("prepaid_position", () => readAccountPrepaidPosition(supabase, {
                orgId, householdId: input.householdId!, authorized: input.authority.financialsRead,
            })),
            maybe("account_ledger", () => readAccountLedgerPosition(supabase, {
                orgId, customerId: input.householdId, customerMemberId: input.customerMemberId,
            })),
            dependentPromise,
        ]);

    const rows = dependent.rows;
    const { crm, children, seen } = dependent;
    const readDagMs = at();

    // ── ASSEMBLE ───────────────────────────────────────────────────────────────────────────────
    const aStart = at();

    const queueRows: FirstOrderQueueRow[] = rows.map((r) => {
        const id = str(r.id);
        const key = `${id}:${str(r.stage_key)}:${str(r.stage_entered_at)}`;
        return {
            id,
            title: known(str(r.name) || str(r.title)),
            stageKey: known(str(r.stage_key)),
            // A failed acknowledgement read is UNKNOWN, never "not seen" — an unavailable read
            // must not tell an operator they have not looked at something.
            personalSeen: seen ? known(seen.has(key)) : unknown<boolean>(),
        };
    });

    /*
     * THE FOCUSED SUBJECT'S RECORD. Resolved by the identity the request already named, which is
     * the same identity the money reader is scoped by — so Household and Financials cannot
     * disagree about whose family is on screen. NO FALLBACK TO `rows[0]`: a household not present
     * in the population yields NO subject, and the capabilities say UNKNOWN. Answering about
     * whichever record came back first would render a confident label belonging to another family.
     */
    const subjectRow: Record<string, unknown> | null = input.householdId
        ? (rows.find((r) => str(r.customer_id) === input.householdId) ?? null)
        : null;
    const subjectId = subjectRow ? str(subjectRow.id) : "";
    const subjectTruth: Record<string, unknown> | null = subjectRow
        ? {
              ...subjectRow,
              ...((crm?.get(subjectId) ?? {}) as Record<string, unknown>),
              ...((children?.get(subjectId) ?? {}) as Record<string, unknown>),
          }
        : null;

    /*
     * The lifecycle rail, from the owner that already decides it. `statusDefs: []` and
     * `statusKey: null` are the canonical answer composer's own arguments: that pair exists only
     * to turn a status key into a stage, and the record's own `stage_key` — already on the
     * population row — is what the current marker reads.
     */
    const rail = processConfig
        ? buildOpportunityWorkspaceLifecycleRail({
              departmentMetadata: processConfig.departmentMetadata,
              statusKey: null,
              statusDefs: [],
              record: subjectTruth,
              annotationLabels: {
                  locationLabel: subjectTruth ? ((subjectTruth._location_label as string | null) ?? null) : null,
                  ownerLabel: null,
              },
          })
        : null;

    const ctx: FirstOrderProjectionContext = {
        subjectTruth,
        subjectRow,
        customerMemberId: input.customerMemberId,
        householdId: input.householdId,
        attendance,
        healthProfile,
        healthSupplements,
        prepaid,
        accountLedger,
        rail,
        processConfigRead: executable.has("process_config") ? processConfig !== null : undefined,
        childrenRead: executable.has("children_projection") ? children !== null : undefined,
    };

    /*
     * PROJECTION — one loop over the plan. No card is named, no field is named.
     *
     * Card identity and field order come from the plan, which came from configuration. A card
     * with no configured first-order fields still appears, with an empty fact set: it is a
     * configured card whose collapsed face says nothing, which is a real answer and a reserved
     * region, not an absent card.
     */
    const cards: Record<string, FirstOrderCardSummary> = {};
    for (const card of cfg.cards) {
        cards[card.cardKey] = { cardKey: card.cardKey, insight: unknown<string>(), facts: {} };
    }
    for (const field of plan.fields) {
        const summary = cards[field.cardKey];
        if (!summary) continue;
        const value: FirstOrderField<FirstOrderScalar> = authorized(field.capability.authorization)
            ? field.capability.project(ctx)
            // A refusal is a REFUSAL, never an empty region: empty reads as "no allergies".
            : forbidden<FirstOrderScalar>();
        (summary.facts as Record<string, FirstOrderField<string | number>>)[field.semanticKey] = value;
    }

    const cardFields: Record<string, readonly string[]> = {};
    for (const card of cfg.cards) cardFields[card.cardKey] = card.semanticKeys;
    const cardOrder = cfg.cards.map((c) => c.cardKey);

    const identity: FirstOrderConfigurationIdentity = {
        cardKeys: cardOrder, cardFields, kpiKeys: cfg.kpiKeys,
        workViewIds: cfg.workViewIds, siteScopeId: cfg.siteScopeId,
    };

    const projection: FirstOrderWorkUnitProjection = {
        workUnitId,
        subjectId: input.customerMemberId ? known(input.customerMemberId) : unknown<string>(),
        configurationIdentity: identity,
        // GEOMETRY IS CONFIGURATION'S, not the plan's execution outcome: the slots exist whether or
        // not a provider resolved, so a slow read changes a value and never a layout.
        geometry: {
            cardOrder, cardFieldSlots: cardFields,
            kpiSlotCount: cfg.kpiKeys.length, workViewCount: cfg.workViewIds.length,
        },
        queueRows: population ? known(queueRows) : unavailable<readonly FirstOrderQueueRow[]>("population unavailable"),
        // Not yet resolved by this runtime; declared UNKNOWN rather than defaulted to zero, which
        // is the only state Stage 2 is permitted to replace.
        kpiValues: Object.fromEntries(cfg.kpiKeys.map((k) => [k, unknown<number>()])),
        workViewTotals: Object.fromEntries(cfg.workViewIds.map((k) => [k, unknown<number>()])),
        cards,
    };

    const assemblyMs = at() - aStart;
    return {
        projection,
        timing: { planMs, readDagMs, assemblyMs, totalMs: at(), spans, executedResolvers, queryCount },
        plan,
    };
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAttendanceCardVM } from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import { readAccountPrepaidPosition } from "@/lib/financials/prepaid/readAccountPrepaidPosition";
import { loadCustomerMemberProfileFieldsByMemberId } from "@/lib/completion/loadCustomerMemberProfileFields";
import { loadWorkUnitProcessPopulation } from "@/lib/runtime/provisioning/workUnitProcessPopulation";
import { enrichOpportunityRowsWithCrmProjection } from "@/lib/workspace/enrichOpportunityQueueProjection";
import { enrichOpportunityRowsWithChildrenForCompactQueue } from "@/lib/runtime/provisioning/enrichOpportunityRowsWithChildrenForCompactQueue";
import { loadAcknowledgedOccurrenceKeys } from "@/lib/queues/operatorStageMembershipAck";
import {
    forbidden, known, knownEmpty, unavailable, unknown,
    type FirstOrderCardSummary, type FirstOrderConfigurationIdentity, type FirstOrderField,
    type FirstOrderQueueRow, type FirstOrderWorkUnitProjection,
} from "@/lib/runtime/firstOrder/firstOrderWorkUnitProjection";

/**
 * THE STAGE-1 COMPOSER (P0-7.6 · A′).
 *
 * Produces the FirstOrderWorkUnitProjection by executing the MEASURED A′ read DAG directly against
 * canonical owners. SHADOW ONLY: nothing renders from this, the existing Work Unit answer remains
 * authoritative, and this composer is not a fallback for it.
 *
 * WHAT IT DELIBERATELY DOES NOT CALL, because calling any of them would restore the coupling the
 * architecture exists to remove: the full Work Unit composer, drawer view models, the full
 * Financials VM, the payment-views prepaid path, and the legacy three-hop Health profile chain.
 *
 * CONFIGURATION DRIVES EXECUTION. Resolvers run for CONFIGURED cards only — an absent card costs
 * nothing, because its resolver is never reached. Today's six-card set is a specimen, not the
 * architecture, so membership arrives as configuration and is never written down here.
 *
 * THE DAG'S SHAPE IS MEASURED, NOT CONVENIENT. Independent work starts together; only genuinely
 * dependent work waits. Writing this sequentially would be easier and would silently cost the
 * ~170ms of margin the product model has left, so the independent phase is one `Promise.all` and
 * the dependent phase is another.
 *
 * READ TIME AND ASSEMBLY TIME ARE REPORTED SEPARATELY. The product model's remaining headroom is
 * small enough that hiding assembly inside a single total would conceal exactly the term that
 * decides cutover.
 */

export type FirstOrderConfiguration = {
    /** Configured card keys IN ORDER, from the published Focus Panel doc. */
    readonly cardKeys: readonly string[];
    readonly kpiKeys: readonly string[];
    readonly workViewIds: readonly string[];
    readonly siteScopeId: string | null;
};

export type FirstOrderComposeInput = {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    viewerId: string;
    /** The focused subject's child grain, when one is focused. */
    customerMemberId: string | null;
    /** The focused subject's household, for money. */
    householdId: string | null;
    configuration: FirstOrderConfiguration;
    /** Request-time decisions, resolved by the caller's gate. Never decided here. */
    authority: { financialsRead: boolean; healthView: boolean };
};

export type FirstOrderComposeTiming = {
    readDagMs: number;
    assemblyMs: number;
    totalMs: number;
    /** Offsets from compose start, so concurrency is visible rather than inferred. */
    spans: Array<{ name: string; at: number; end: number }>;
    /** Resolvers that actually ran. An unconfigured card must not appear here. */
    executedResolvers: string[];
    queryCount: number;
};

export type FirstOrderComposeResult = {
    projection: FirstOrderWorkUnitProjection;
    timing: FirstOrderComposeTiming;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Money as an operator-facing scalar, in cents, carrying its own state. */
const centsField = (v: number | null | undefined): FirstOrderField<number> =>
    typeof v === "number" ? known(v) : unknown<number>();

export async function composeFirstOrderWorkUnitProjection(
    input: FirstOrderComposeInput,
): Promise<FirstOrderComposeResult> {
    const { supabase, orgId, workUnitId, configuration: cfg } = input;
    const t0 = performance.now();
    const at = () => Math.round(performance.now() - t0);
    const spans: FirstOrderComposeTiming["spans"] = [];
    const executedResolvers: string[] = [];
    let queryCount = 0;

    const configured = (cardKey: string) => cfg.cardKeys.includes(cardKey);
    const run = async <T,>(name: string, queries: number, fn: () => Promise<T>): Promise<T | null> => {
        executedResolvers.push(name);
        queryCount += queries;
        const a = at();
        try {
            const v = await fn();
            spans.push({ name, at: a, end: at() });
            return v;
        } catch {
            // A resolver that throws yields UNAVAILABLE downstream; it never yields an empty value.
            spans.push({ name, at: a, end: at() });
            return null;
        }
    };

    /*
     * PHASE 2 CHAINS OFF POPULATION ALONE, NOT OFF ALL OF PHASE 1.
     *
     * The first version awaited the whole phase-1 `Promise.all` before starting the
     * population-dependent work. Shadow measurement showed the cost: population finished at 127 ms
     * but CRM, children and personal_seen did not start until 328 ms, because they were waiting on
     * `prepaid` — a resolver none of them consume. Children then bound the DAG at 576 ms instead of
     * ~375 ms. Two hundred milliseconds spent on a dependency that does not exist, out of a product
     * budget with ~170 ms of margin.
     *
     * The gate I had written asserted that phase-1 resolvers share a start offset. They did. It
     * tested the property I was thinking about rather than the one that mattered, and only the
     * measured offsets caught it — which is the argument for measuring concurrency instead of
     * reading it off the source.
     */
    // ── PHASE 1 — everything that depends on nothing but the request. ───────────────────────────
    const populationPromise = run("population", 1, () =>
        loadWorkUnitProcessPopulation({ supabase, orgId, workUnitId }));

    // ── PHASE 2 — starts the moment the population lands, independently of the rest of phase 1. ──
    const dependentPromise = populationPromise.then(async (pop) => {
        const depRows = ((pop?.rows ?? []) as Array<Record<string, unknown>>);
        if (!depRows.length) return { crm: null, children: null, seen: null, rows: depRows };
        const [c, ch, sn] = await Promise.all([
            run("crm", 2, () => enrichOpportunityRowsWithCrmProjection(supabase, orgId,
                depRows.map((r) => ({ id: str(r.id), primary_person_id: (r.primary_person_id ?? null) as string | null,
                    location_id: (r.location_id ?? null) as string | null })))),
            configured("children")
                ? run("children", 2, () => enrichOpportunityRowsWithChildrenForCompactQueue(supabase, orgId,
                    depRows.map((r) => ({ id: str(r.id), customer_id: (r.customer_id ?? null) as string | null, metadata: r.metadata }))))
                : Promise.resolve(null),
            run("personal_seen", 1, () => loadAcknowledgedOccurrenceKeys({
                supabase, orgId, userId: input.viewerId,
                occurrenceKeys: depRows.map((r) => `${str(r.id)}:${str(r.stage_key)}:${str(r.stage_entered_at)}`),
            })),
        ]);
        return { crm: c, children: ch, seen: sn, rows: depRows };
    });

    const [population, attendance, healthProfile, prepaid, dependent] = await Promise.all([
        populationPromise,
        configured("attendance") && input.customerMemberId
            ? run("attendance", 2, () => buildAttendanceCardVM(supabase, {
                  orgId, customerMemberId: input.customerMemberId!, recentDays: 5,
              }))
            : Promise.resolve(null),
        configured("health_safety") && input.authority.healthView && input.customerMemberId
            ? run("health_profile", 2, () =>
                  loadCustomerMemberProfileFieldsByMemberId(supabase, orgId, [input.customerMemberId!]))
            : Promise.resolve(null),
        configured("financials") && input.householdId
            ? run("prepaid", 7, () => readAccountPrepaidPosition(supabase, {
                  orgId, householdId: input.householdId!, authorized: input.authority.financialsRead,
              }))
            : Promise.resolve(null),
        dependentPromise,
    ]);

    const rows = dependent.rows;
    const { crm, children, seen } = dependent;

    const readDagMs = at();

    // ── ASSEMBLY — pure, measured separately because it consumes the remaining margin. ──────────
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

    const cards: Record<string, FirstOrderCardSummary> = {};
    for (const cardKey of cfg.cardKeys) {
        const facts: Record<string, FirstOrderField<string | number>> = {};
        let insight: FirstOrderField<string> = unknown<string>();

        if (cardKey === "financials") {
            if (!input.authority.financialsRead) {
                insight = forbidden<string>();
                facts.availableCents = forbidden<number>();
            } else if (!prepaid) {
                facts.availableCents = unavailable<number>("prepaid reader failed");
            } else if (prepaid.outcome.state === "ok") {
                facts.availableCents = known(prepaid.outcome.position.availableCents);
                facts.pendingCents = known(prepaid.outcome.position.pendingCents);
                facts.heldCents = known(prepaid.outcome.position.heldCents);
                insight = knownEmpty<string>();
            } else if (prepaid.outcome.state === "forbidden") {
                facts.availableCents = forbidden<number>();
            } else {
                facts.availableCents = unavailable<number>(prepaid.outcome.reason);
            }
        } else if (cardKey === "attendance") {
            facts.today = attendance ? known(String((attendance as { todayLabel?: unknown }).todayLabel ?? "")) : unavailable<string>("attendance unavailable");
        } else if (cardKey === "health_safety") {
            facts.profileFactCount = healthProfile
                ? known(Object.keys(healthProfile.get(input.customerMemberId ?? "") ?? {}).length)
                : unavailable<number>("health profile unavailable");
        } else if (cardKey === "children") {
            facts.childCount = children ? known(children.size) : unavailable<number>("children unavailable");
        }
        cards[cardKey] = { cardKey, insight, facts };
    }

    const identity: FirstOrderConfigurationIdentity = {
        cardKeys: cfg.cardKeys, kpiKeys: cfg.kpiKeys, workViewIds: cfg.workViewIds, siteScopeId: cfg.siteScopeId,
    };

    const projection: FirstOrderWorkUnitProjection = {
        workUnitId,
        subjectId: input.customerMemberId ? known(input.customerMemberId) : unknown<string>(),
        configurationIdentity: identity,
        geometry: { cardOrder: cfg.cardKeys, kpiSlotCount: cfg.kpiKeys.length, workViewCount: cfg.workViewIds.length },
        queueRows: population ? known(queueRows) : unavailable<readonly FirstOrderQueueRow[]>("population unavailable"),
        // Not yet resolved by this composer; declared UNKNOWN rather than defaulted to zero, which
        // is the only state Stage 2 is permitted to replace.
        kpiValues: Object.fromEntries(cfg.kpiKeys.map((k) => [k, unknown<number>()])),
        workViewTotals: Object.fromEntries(cfg.workViewIds.map((k) => [k, unknown<number>()])),
        cards,
    };

    const assemblyMs = at() - aStart;
    void crm;
    return { projection, timing: { readDagMs, assemblyMs, totalMs: at(), spans, executedResolvers, queryCount } };
}

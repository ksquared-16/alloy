import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAttendanceCardVM } from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import { readAccountPrepaidPosition } from "@/lib/financials/prepaid/readAccountPrepaidPosition";
import { loadCustomerMemberProfileFieldsByMemberId } from "@/lib/completion/loadCustomerMemberProfileFields";
import { loadWorkUnitProcessPopulation } from "@/lib/runtime/provisioning/workUnitProcessPopulation";
import { enrichOpportunityRowsWithCrmProjection } from "@/lib/workspace/enrichOpportunityQueueProjection";
import { enrichOpportunityRowsWithChildrenForCompactQueue } from "@/lib/runtime/provisioning/enrichOpportunityRowsWithChildrenForCompactQueue";
import { loadAcknowledgedOccurrenceKeys } from "@/lib/queues/operatorStageMembershipAck";
import { buildOpportunityWorkspaceLifecycleRail } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail";
import { buildChildrenCardModel, buildHouseholdCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { normalizeFocusPanelChildrenRowsFromTruth } from "@/lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation";
import { readWorkUnitProcessConfiguration } from "@/lib/runtime/firstOrder/readWorkUnitProcessConfiguration";
import { readHealthFirstOrderSupplements } from "@/lib/runtime/firstOrder/readHealthFirstOrderSupplements";
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

    /*
     * THE THREE FIRST-ORDER SUPPLEMENTS ALSO BELONG IN PHASE 1.
     *
     * None of them consumes the population: the process configuration is addressed by work unit,
     * and both health supplements by the focused child. Chaining them behind anything would buy
     * serialization for nothing, which is the defect this DAG was already repaired for once.
     *
     * Each is gated on its own card being CONFIGURED, so an unconfigured Health & Safety card
     * costs zero queries rather than running and being discarded.
     */
    const [population, attendance, healthProfile, healthSupplements, processConfig, prepaid, dependent] =
        await Promise.all([
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
        configured("health_safety") && input.authority.healthView && input.customerMemberId
            ? run("health_supplements", 2, () =>
                  readHealthFirstOrderSupplements({ supabase, orgId, customerMemberId: input.customerMemberId! }))
            : Promise.resolve(null),
        configured("business_process")
            ? run("process_config", 1, () =>
                  readWorkUnitProcessConfiguration({ supabase, orgId, workUnitId }))
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

    /*
     * ── THE FOCUSED SUBJECT'S RECORD ──────────────────────────────────────────────────────────
     *
     * Household, Children and Business Process all answer about ONE record, not about the
     * population. That record is the one whose account the request already named: `householdId`
     * is the same identity `opportunities.customer_id` carries, and it is the identity the money
     * reader is already scoped by, so resolving the row this way cannot disagree with Financials
     * about whose family is on screen.
     *
     * NO FALLBACK TO `rows[0]`. A request with no household, or a population that does not contain
     * it, yields NO subject record — and every fact those three cards state is then UNKNOWN. The
     * tempting alternative is to answer about whichever record came back first, which would render
     * a confident household label belonging to a different family.
     */
    const subjectRow: Record<string, unknown> | null = input.householdId
        ? (rows.find((r) => str(r.customer_id) === input.householdId) ?? null)
        : null;
    const subjectId = subjectRow ? str(subjectRow.id) : "";

    /*
     * The enriched record the canonical card owners read.
     *
     * `buildHouseholdCardModel` and `buildChildrenCardModel` are the Focus Panel's own pure card
     * owners and they read a single flat truth record: the opportunity row plus its CRM and
     * children enrichment. A′ already produces all three, so assembling them here is a projection
     * and not a fourth source. Spread order matters — enrichment is layered ON the row, never
     * under it, so an enriched contact never loses to a raw column.
     */
    const subjectTruth: Record<string, unknown> | null = subjectRow
        ? {
              ...subjectRow,
              ...((crm?.get(subjectId) ?? {}) as Record<string, unknown>),
              ...((children?.get(subjectId) ?? {}) as Record<string, unknown>),
          }
        : null;

    /*
     * THE LIFECYCLE RAIL, FROM THE OWNER THAT ALREADY DECIDES IT.
     *
     * `statusDefs: []` and `statusKey: null` are the canonical answer composer's own arguments
     * (`workUnitProvisioningAnswer.ts`): that pair exists only to turn a status key into a stage
     * for the rail's `current_stage_key`, and the record's own `stage_key` — which A′ holds on the
     * population row — is what the card's current marker reads. Passing them would buy an answer
     * already in hand at the cost of a read.
     */
    const rail = processConfig
        ? buildOpportunityWorkspaceLifecycleRail({
              departmentMetadata: processConfig.departmentMetadata,
              statusKey: null,
              statusDefs: [],
              record: subjectTruth,
              annotationLabels: {
                  locationLabel: subjectTruth
                      ? ((subjectTruth._location_label as string | null | undefined) ?? null)
                      : null,
                  ownerLabel: null,
              },
          })
        : null;

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
            /*
             * `state` IS THE ANSWER. The first version of this read `todayLabel`, a property
             * `AttendanceCardVM` does not have: the cast made it typecheck, `?? ""` made it
             * `known("")`, and a SUCCESSFUL attendance read therefore published a known-empty
             * string. A false KNOWN is worse than an honest UNKNOWN, and it was produced here by
             * naming a field the owner never declared.
             */
            if (!attendance) {
                facts.state = unavailable<string>("attendance unavailable");
            } else {
                facts.state = known(attendance.state);
                facts.date = known(attendance.date);
                facts.expectedRoomLabel = attendance.expected.roomLabel
                    ? known(attendance.expected.roomLabel)
                    : knownEmpty<string>();
                /*
                 * WHY NO RECORD IS RECORDABLE — projected from the owner, with no second
                 * attendance read. `unavailableReason` is null when attendance IS recordable, and
                 * that is a real answer (`known_empty`), not an absent one.
                 */
                facts.unavailableReason = attendance.unavailableReason
                    ? known(attendance.unavailableReason)
                    : knownEmpty<string>();
                insight = known(attendance.state);
            }
        } else if (cardKey === "health_safety") {
            facts.profileFactCount = healthProfile
                ? known(Object.keys(healthProfile.get(input.customerMemberId ?? "") ?? {}).length)
                : unavailable<number>("health profile unavailable");
            if (!input.authority.healthView) {
                // A refusal is NOT an empty health card. Empty reads as "no allergies".
                facts.profileFactCount = forbidden<number>();
                facts.requirementsSatisfied = forbidden<number>();
                facts.emergencyContactCount = forbidden<number>();
                insight = forbidden<string>();
            } else if (healthSupplements) {
                facts.requirementsSatisfied = known(healthSupplements.requirementsSatisfied);
                facts.requirementsTotal = known(healthSupplements.requirementsTotal);
                facts.emergencyContactCount = known(healthSupplements.emergencyContactCount);
            } else {
                facts.requirementsSatisfied = unavailable<number>("health supplements unavailable");
                facts.requirementsTotal = unavailable<number>("health supplements unavailable");
                facts.emergencyContactCount = unavailable<number>("health supplements unavailable");
            }
        } else if (cardKey === "children") {
            /*
             * THE COUNT IS OF CHILDREN, NOT OF ENRICHED ROWS. This read `children.size` — the size
             * of the enrichment MAP, which is one entry per opportunity. On a population of
             * fourteen families it reported fourteen children for a family with two.
             *
             * The count now comes from the canonical normalizer the Children card itself uses, so
             * "what is a child of this record" has one answer.
             */
            if (!children) {
                facts.childCount = unavailable<number>("children unavailable");
            } else if (!subjectTruth) {
                facts.childCount = unknown<number>();
            } else {
                const { rows: childRows } = normalizeFocusPanelChildrenRowsFromTruth(subjectTruth);
                const model = buildChildrenCardModel(subjectTruth);
                facts.childCount = known(childRows.length);
                facts.enrollingCount = known(
                    childRows.filter((r) => r.outcome_status_key !== "declined").length,
                );
                insight = model.insight ? known(model.insight) : knownEmpty<string>();
            }
        } else if (cardKey === "household") {
            if (!subjectTruth) {
                // No resolved subject is UNKNOWN, never an empty household.
                facts.label = unknown<string>();
                facts.updatedAt = unknown<string>();
                facts.primaryContactName = unknown<string>();
            } else {
                const label = str(subjectTruth.name) || str(subjectTruth.title);
                const model = buildHouseholdCardModel(subjectTruth, label);
                facts.label = label ? known(label) : knownEmpty<string>();
                facts.updatedAt = str(subjectTruth.updated_at)
                    ? known(str(subjectTruth.updated_at))
                    : unknown<string>();
                const contact = str(subjectTruth._primary_contact_name);
                facts.primaryContactName = contact ? known(contact) : knownEmpty<string>();
                const line = str(subjectTruth._primary_contact_line);
                facts.primaryContactLine = line ? known(line) : knownEmpty<string>();
                const loc = str(subjectTruth._location_label);
                facts.locationLabel = loc ? known(loc) : knownEmpty<string>();
                facts.childCount = children
                    ? known(normalizeFocusPanelChildrenRowsFromTruth(subjectTruth).rows.length)
                    : unavailable<number>("children unavailable");
                insight = model.insight ? known(model.insight) : knownEmpty<string>();
            }
        } else if (cardKey === "business_process") {
            if (!processConfig) {
                const reason = "process configuration unavailable";
                facts.processName = unavailable<string>(reason);
                facts.stageCount = unavailable<number>(reason);
                facts.currentStageLabel = unavailable<string>(reason);
                facts.stagePosition = unavailable<number>(reason);
                insight = unavailable<string>(reason);
            } else if (!rail) {
                /*
                 * The builder returns null when the department declares no active process, or one
                 * with fewer than two stages. That is a CONFIGURED ABSENCE — a real answer about
                 * this tenant — so it is `known_empty`, not `unavailable`.
                 */
                facts.processName = knownEmpty<string>();
                facts.stageCount = knownEmpty<number>();
                facts.currentStageLabel = knownEmpty<string>();
                facts.stagePosition = knownEmpty<number>();
                insight = knownEmpty<string>();
            } else {
                facts.processName = rail.process_name ? known(rail.process_name) : knownEmpty<string>();
                facts.stageCount = known(rail.stages.length);
                /*
                 * THE MARKER COMES FROM THE RECORD, NOT FROM THE WORK UNIT. A work unit answers
                 * "which lens did I open?" and cannot answer "which stage is this record in?" —
                 * the rail's own contract makes that point at length. With no subject record there
                 * is no position, and saying so is the honest answer.
                 */
                const stageKey = subjectRow ? str(subjectRow.stage_key) : "";
                const index = stageKey ? rail.stages.findIndex((st) => st.key === stageKey) : -1;
                if (!subjectRow) {
                    facts.currentStageKey = unknown<string>();
                    facts.currentStageLabel = unknown<string>();
                    facts.stagePosition = unknown<number>();
                    facts.stageEnteredAt = unknown<string>();
                } else {
                    facts.currentStageKey = stageKey ? known(stageKey) : knownEmpty<string>();
                    // A stage the rail does not declare is UNKNOWN to the rail, not stage zero.
                    facts.currentStageLabel = index >= 0 ? known(rail.stages[index].label) : unknown<string>();
                    facts.stagePosition = index >= 0 ? known(index + 1) : unknown<number>();
                    const entered = str(subjectRow.stage_entered_at);
                    facts.stageEnteredAt = entered ? known(entered) : knownEmpty<string>();
                }
                insight = rail.process_name ? known(rail.process_name) : knownEmpty<string>();
            }
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

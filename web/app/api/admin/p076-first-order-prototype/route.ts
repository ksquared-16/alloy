import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { CUSTOMER_MEMBER_CONFIG_FIELD_KEYS } from "@/lib/fields/customerMemberFieldRegistry";
import { loadCustomerMemberProfileFieldsByMemberId } from "@/lib/completion/loadCustomerMemberProfileFields";
import { loadWorkUnitProcessPopulation } from "@/lib/runtime/provisioning/workUnitProcessPopulation";
import { enrichOpportunityRowsWithCrmProjection } from "@/lib/workspace/enrichOpportunityQueueProjection";
import { enrichOpportunityRowsWithChildrenForCompactQueue } from "@/lib/runtime/provisioning/enrichOpportunityRowsWithChildrenForCompactQueue";
import { loadAcknowledgedOccurrenceKeys } from "@/lib/queues/operatorStageMembershipAck";
import { buildAttendanceCardVM } from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import { readAccountPrepaidPosition } from "@/lib/financials/prepaid/readAccountPrepaidPosition";
import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { resolveHouseholdPaymentViews } from "@/lib/financials/paymentApplicationView";
import { composeFirstOrderWorkUnitProjection } from "@/lib/runtime/firstOrder/composeFirstOrderWorkUnitProjection";
import { resolveFirstOrderSurfaceConfiguration } from "@/lib/runtime/firstOrder/resolveFirstOrderSurfaceConfiguration";
import { resolveQueueRecordScopeConstraints } from "@/lib/admin/resolveQueueRecordScopeConstraints";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { fetchEffectiveUserDisplayTimezoneCached } from "@/lib/admin/timezoneContract";
import { resolveAccountPrepaidPosition } from "@/lib/financials/prepaid/availableFunds";
import { heldCentsFor, readHoldsForPayments } from "@/lib/financials/prepaid/heldDeposits";

/**
 * P0-7.6 — FIRST-ORDER READ-DAG PROTOTYPE. DIAGNOSTIC ONLY, NOT A PRODUCT SURFACE.
 *
 * The architecture model says the operator's first authoritative frame needs ~30 scalars plus the
 * queue rows, and that two of today's reads are round-trip defects rather than slow queries:
 *
 *   · the Health profile read is THREE SERIAL round trips (customer_members, then field_definitions,
 *     then field_values) at ~399 ms, where two of the three are independent;
 *   · prepaid is resolved by building full payment views, which issue TWO QUERIES PER PAYMENT
 *     (refunded, unapplied) — an N+1 whose measured 313 ms is the FLOOR, on a specimen with no
 *     payments at all.
 *
 * A model cannot settle whether the repaired shapes are actually faster, so this measures them.
 * It creates NO maintained state: both repairs are query shapes over the same tables with the same
 * filters, so nothing here is a second semantic owner and nothing needs a freshness contract.
 *
 * Off unless ALLOY_ROUTE_TIMING=1, and it answers 404 otherwise so it cannot become a surface.
 * Authorization is the ordinary request-time admin gate — the prototype does not get a softer door
 * than the product, which is the whole point of measuring the real path.
 */
export const dynamic = "force-dynamic";

type Span = { name: string; ms: number; rows: number | null; note?: string };

export async function GET(req: NextRequest) {
    if (process.env.ALLOY_ROUTE_TIMING !== "1") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const access = await getAdminAccessContextCached();
    if (!access.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const supabase = createAdminClient();
    const orgId = access.orgId;
    const memberId = req.nextUrl.searchParams.get("member_id");
    const customerId = req.nextUrl.searchParams.get("customer_id");

    const spans: Span[] = [];
    const t0 = performance.now();
    const time = async <T,>(name: string, run: () => PromiseLike<T>, count?: (v: T) => number): Promise<T | null> => {
        const s = performance.now();
        try {
            const v = await run();
            spans.push({ name, ms: Math.round(performance.now() - s), rows: count ? count(v) : null });
            return v;
        } catch (e) {
            spans.push({ name, ms: Math.round(performance.now() - s), rows: null, note: `failed: ${String(e).slice(0, 80)}` });
            return null;
        }
    };

    /*
     * REPAIR 1 — the Health profile read as TWO hops instead of three.
     *
     * `customer_members` and `field_definitions` do not depend on each other; only `field_values`
     * depends on the definition ids. Today all three are serial. The floor for this shape is
     * max(members, definitions) + values.
     */
    const profileRepaired = await time("health_profile_repaired_2hop", async () => {
        const [members, defs] = await Promise.all([
            supabase.from("customer_members").select("id, person_id, first_name, last_name, dob")
                .eq("org_id", orgId).in("id", memberId ? [memberId] : []),
            supabase.from("field_definitions").select("id, field_key, field_type")
                .eq("org_id", orgId).eq("entity_type", "customer_member").eq("is_active", true)
                .in("field_key", [...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS]),
        ]);
        const ids = ((defs.data ?? []) as Array<{ id: string }>).map((d) => d.id);
        const values = ids.length
            ? await supabase.from("field_values").select("entity_id, field_definition_id, value_text, value_number, value_date, value_json")
                .eq("org_id", orgId).eq("entity_type", "customer_member")
                .in("entity_id", memberId ? [memberId] : []).in("field_definition_id", ids)
            : { data: [] };
        return { members: members.data?.length ?? 0, defs: ids.length, values: (values.data ?? []).length };
    });

    /*
     * REPAIR 1b — the same answer as ONE hop, by filtering field_values through an embedded
     * definition rather than resolving ids first. If this is sound, the profile read is one round
     * trip and no maintained health fact is needed at all.
     */
    await time("health_profile_repaired_1hop", () =>
        supabase.from("field_values")
            .select("entity_id, field_definition_id, value_text, value_number, value_date, value_json, field_definitions!inner(field_key, entity_type, is_active)")
            .eq("org_id", orgId).eq("entity_type", "customer_member")
            .in("entity_id", memberId ? [memberId] : [])
            .eq("field_definitions.is_active", true)
            .in("field_definitions.field_key", [...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS]),
        (v) => (v.data ?? []).length);

    // The three Health reads that are already single round trips, for comparison in the same run.
    await time("health_documents", () =>
        supabase.from("documents").select("id, doc_type, title, status, created_at")
            .eq("org_id", orgId).eq("entity_type", "customer_member").eq("entity_id", memberId ?? ""),
        (v) => (v.data ?? []).length);
    await time("health_contacts", () =>
        supabase.from("person_child_relationships").select("person_id, relationship_type, priority, status")
            .eq("org_id", orgId).eq("customer_member_id", memberId ?? "").eq("status", "active"),
        (v) => (v.data ?? []).length);

    /*
     * REPAIR 2 — prepaid as ONE aggregate read instead of N+1 payment views.
     *
     * The first-order card consumes available/pending/held cents, not the view list. Payments and
     * their allocations are read once each and summed here; the current path issues two further
     * queries PER PAYMENT. Held money is read separately because it is a different authority.
     */
    await time("prepaid_aggregate_2hop", async () => {
        const pays = await supabase.from("payments").select("id, amount_cents, status")
            .eq("org_id", orgId).eq("customer_id", customerId ?? "");
        const ids = ((pays.data ?? []) as Array<{ id: string }>).map((p) => p.id);
        const allocs = ids.length
            ? await supabase.from("payment_allocations").select("payment_id, amount_cents")
                .eq("org_id", orgId).in("payment_id", ids)
            : { data: [] };
        return { payments: ids.length, allocations: (allocs.data ?? []).length };
    });

    /*
     * SEMANTIC ORACLE — old shape vs new shape, SAME REQUEST, SAME DATA.
     *
     * The architecture changes exactly two read SHAPES; every other Stage-1 read reuses its
     * existing canonical owner unchanged, so this is the whole parity surface. Comparing the two
     * shapes against each other on one request is stronger evidence than comparing either against
     * a rendered frame, because nothing else can drift between them.
     *
     * THE SPECIMEN MUST NOT BE EMPTY. The default subject has zero profile values and zero
     * payments, so an equality check on it passes for the wrong reason — it compares nothing with
     * nothing. `discover` finds a subject that actually has rows, and the answer reports whether
     * it succeeded, so a vacuous PASS cannot be mistaken for a real one.
     */
    const discover = req.nextUrl.searchParams.get("discover") === "1";
    let parity: Record<string, unknown> | null = null;
    if (discover) {
        const defs = await supabase.from("field_definitions").select("id")
            .eq("org_id", orgId).eq("entity_type", "customer_member").eq("is_active", true)
            .in("field_key", [...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS]);
        const defIds = ((defs.data ?? []) as Array<{ id: string }>).map((d) => d.id);
        const withValues = defIds.length
            ? await supabase.from("field_values").select("entity_id")
                .eq("org_id", orgId).eq("entity_type", "customer_member")
                .in("field_definition_id", defIds).limit(25)
            : { data: [] };
        const candidates = [...new Set(((withValues.data ?? []) as Array<{ entity_id: string }>).map((r) => r.entity_id))];

        const rows: Array<Record<string, unknown>> = [];
        for (const id of candidates.slice(0, 5)) {
            const [oldShape, newShape] = await Promise.all([
                loadCustomerMemberProfileFieldsByMemberId(supabase, orgId, [id]),
                supabase.from("field_values")
                    .select("entity_id, field_definition_id, value_text, value_number, value_date, value_json, field_definitions!inner(field_key, entity_type, is_active)")
                    .eq("org_id", orgId).eq("entity_type", "customer_member").in("entity_id", [id])
                    .eq("field_definitions.is_active", true)
                    .in("field_definitions.field_key", [...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS]),
            ]);
            const oldRow = (oldShape.get(id) ?? {}) as Record<string, unknown>;
            const newKeys = ((newShape.data ?? []) as Array<{ field_definitions?: { field_key?: string } }>)
                .map((r) => r.field_definitions?.field_key).filter(Boolean).sort();
            const oldKeys = Object.keys(oldRow).filter((k) => oldRow[k] != null && !["person_id", "first_name", "last_name", "dob"].includes(k)).sort();
            rows.push({
                memberId: id,
                oldConfigKeys: oldKeys,
                newConfigKeys: newKeys,
                match: JSON.stringify(oldKeys) === JSON.stringify(newKeys),
                nonEmpty: newKeys.length > 0,
            });
        }
        parity = {
            candidatesFound: candidates.length,
            compared: rows.length,
            nonEmptyCompared: rows.filter((r) => r.nonEmpty === true).length,
            allMatch: rows.length > 0 && rows.every((r) => r.match === true),
            rows,
            caveat: "A comparison over zero rows is not parity. Read nonEmptyCompared before allMatch.",
        };
    }

    /*
     * THE COMPLETE A' STAGE-1 DAG.
     *
     * Measuring two fast queries does not answer the architecture question. This executes the
     * proposed Stage-1 read set with its REAL parallel structure and reports a WALL, because the
     * budget is a wall and concurrent durations must never be summed.
     *
     * Two paths run concurrently, which is the architecture's whole claim:
     *   QUEUE  process population -> { CRM || children || personal_seen }
     *   CARD   participant scope  -> { attendance || health reads || prepaid aggregate }
     *
     * Canonical owners are CALLED, not reimplemented, so the DAG measures the real cost of the
     * real reads. Nothing here writes, and no maintained state exists.
     */
    const workUnitId = req.nextUrl.searchParams.get("work_unit_id");
    let dag: Record<string, unknown> | null = null;
    if (workUnitId) {
        const origin = performance.now();
        const at = () => Math.round(performance.now() - origin);
        const marks: Array<{ name: string; at: number; end: number; ms: number; n: number | null }> = [];
        const step = async <T,>(name: string, run: () => Promise<T>, count?: (v: T) => number): Promise<T | null> => {
            const a = at();
            try {
                const v = await run();
                marks.push({ name, at: a, end: at(), ms: at() - a, n: count ? count(v) : null });
                return v;
            } catch (e) {
                marks.push({ name, at: a, end: at(), ms: at() - a, n: null });
                return null;
            }
        };

        const queuePath = (async () => {
            const pop = await step("population", () =>
                loadWorkUnitProcessPopulation({ supabase, orgId, workUnitId }), (v) => v?.rows.length ?? 0);
            const rows = (pop?.rows ?? []) as Array<Record<string, unknown>>;
            const crmSource = rows.map((r) => ({
                id: String(r.id), primary_person_id: (r.primary_person_id ?? null) as string | null,
                location_id: (r.location_id ?? null) as string | null,
            }));
            const childSource = rows.map((r) => ({
                id: String(r.id), customer_id: (r.customer_id ?? null) as string | null, metadata: r.metadata,
            }));
            // The three enrichments are INDEPENDENT of one another. Cohort SCHEDULING is closed as
            // serial in the product; this measures the reads themselves, not a scheduling change.
            await Promise.all([
                step("crm", () => enrichOpportunityRowsWithCrmProjection(supabase, orgId, crmSource), (v) => v?.size ?? 0),
                step("children", () => enrichOpportunityRowsWithChildrenForCompactQueue(supabase, orgId, childSource), (v) => v?.size ?? 0),
                step("personal_seen", () => loadAcknowledgedOccurrenceKeys({
                    supabase, orgId, userId: access.userId,
                    occurrenceKeys: rows.map((r) => `${String(r.id)}:${String(r.stage_key ?? "")}:${String(r.stage_entered_at ?? "")}`),
                }), (v) => v?.size ?? 0),
            ]);
            return rows.length;
        })();

        const cardPath = (async () => {
            if (!memberId) return 0;
            await Promise.all([
                step("attendance", () => buildAttendanceCardVM(supabase, { orgId, customerMemberId: memberId, recentDays: 5 }), () => 1),
                step("health_profile_1hop", () => Promise.resolve(
                    supabase.from("field_values")
                        .select("entity_id, field_definition_id, value_text, value_number, value_date, value_json, field_definitions!inner(field_key, entity_type, is_active)")
                        .eq("org_id", orgId).eq("entity_type", "customer_member").in("entity_id", [memberId])
                        .eq("field_definitions.is_active", true)
                        .in("field_definitions.field_key", [...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS])),
                    (v) => (v?.data ?? []).length),
                step("health_docs", () => Promise.resolve(supabase.from("documents")
                    .select("id, doc_type, title, status, created_at")
                    .eq("org_id", orgId).eq("entity_type", "customer_member").eq("entity_id", memberId)),
                    (v) => (v?.data ?? []).length),
                step("health_contacts", () => Promise.resolve(supabase.from("person_child_relationships")
                    .select("person_id, relationship_type, priority, status")
                    .eq("org_id", orgId).eq("customer_member_id", memberId).eq("status", "active")),
                    (v) => (v?.data ?? []).length),
                step("prepaid_aggregate", async () => {
                    const pays = await supabase.from("payments").select("id, amount_cents, status")
                        .eq("org_id", orgId).eq("customer_id", customerId ?? "");
                    const ids = ((pays.data ?? []) as Array<{ id: string }>).map((x) => x.id);
                    const allocs = ids.length
                        ? await supabase.from("payment_allocations").select("payment_id, amount_cents")
                            .eq("org_id", orgId).in("payment_id", ids)
                        : { data: [] };
                    return { payments: ids.length, allocations: (allocs.data ?? []).length };
                }, (v) => v?.payments ?? 0),
            ]);
            return 1;
        })();

        const [queueRows] = await Promise.all([queuePath, cardPath]);
        const wall = at();
        const byName = Object.fromEntries(marks.map((m) => [m.name, m]));
        const queueWall = Math.max(0, ...marks.filter((m) => ["population", "crm", "children", "personal_seen"].includes(m.name)).map((m) => m.end));
        const cardWall = Math.max(0, ...marks.filter((m) => !["population", "crm", "children", "personal_seen"].includes(m.name)).map((m) => m.end));
        dag = {
            wallMs: wall,
            queuePathEndMs: queueWall,
            cardPathEndMs: cardWall,
            bindingPath: queueWall >= cardWall ? "queue" : "card",
            queueRows,
            marks,
            reconciledPct: wall > 0 ? Math.round((100 * Math.max(queueWall, cardWall)) / wall) : null,
            queryCount: marks.length + 1,
            note: "WALL, not a sum. Concurrent steps overlap; read `at`/`end` offsets rather than adding `ms`.",
        };
        void byName;
    }

    /*
     * THE PREPAID READER MEASUREMENT GATE.
     *
     * The reader's cost was DERIVED from a hop constant, never measured, and the account this
     * lane's specimen points at has no receipts at all — so it exercises the 3-hop short circuit
     * and says nothing about the 5-hop path an account with money takes. Deriving a budget from
     * the empty case would be the same error as the retracted diagnostic timings.
     *
     * `discover_money=1` finds a money-bearing household READ-ONLY, by reading existing receipts
     * and resolving their billable source back to a household. Nothing is written: manufacturing
     * coverage by mutating staging financial data is forbidden, and would be wrong anyway.
     */
    const measurePrepaid = req.nextUrl.searchParams.get("discover_money") === "1";
    let prepaid: Record<string, unknown> | null = null;
    if (measurePrepaid) {
        // Find households that actually hold childcare receipts.
        const recent = await supabase
            .from("payments")
            .select("id, billable_source_type, billable_source_id")
            .eq("org_id", orgId)
            .eq("direction", "inbound")
            .is("refunds_payment_id", null)
            .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
            .limit(50);

        const bySource = new Map<string, { type: string; id: string }>();
        for (const r of ((recent.data ?? []) as Array<Record<string, unknown>>)) {
            const type = String(r.billable_source_type ?? "");
            const id = String(r.billable_source_id ?? "");
            if (type && id) bySource.set(`${type}:${id}`, { type, id });
        }
        // Resolve each distinct source to its household, so agreement-sourced receipts are
        // represented and not only the direct-customer ones.
        const households = new Set<string>();
        for (const { type, id } of [...bySource.values()].slice(0, 12)) {
            if (type === "customer") { households.add(id); continue; }
            const ag = await supabase
                .from("child_enrollment_agreements")
                .select("customer_id, customer_member_id")
                .eq("org_id", orgId).eq("id", id).maybeSingle();
            const row = (ag.data ?? null) as { customer_id?: string | null; customer_member_id?: string | null } | null;
            if (row?.customer_id) { households.add(String(row.customer_id)); continue; }
            if (row?.customer_member_id) {
                const m = await supabase.from("customer_members").select("customer_id")
                    .eq("org_id", orgId).eq("id", String(row.customer_member_id)).maybeSingle();
                const cid = (m.data as { customer_id?: string | null } | null)?.customer_id;
                if (cid) households.add(String(cid));
            }
        }

        const measured: Array<Record<string, unknown>> = [];
        for (const hh of [...households].slice(0, 5)) {
            const started = performance.now();
            const r = await readAccountPrepaidPosition(supabase, {
                orgId, householdId: hh, authorized: true, measure: true,
            });
            /*
             * THE LIVE ORACLE — the canonical VM's own prepaid answer, on the same account, in the
             * same request.
             *
             * Fixture parity proves the ARITHMETIC matches. It says nothing about whether the new
             * reader ACQUIRES the same receipts as `resolveHouseholdPaymentViews`, which scans the
             * org and resolves billable sources afterwards. Those are different claims and only a
             * live comparison settles the second.
             *
             * Constructed exactly as buildFinancialsCardVM does it, held money included, so a
             * difference is a difference in acquisition and not in how the oracle was assembled.
             */
            let oracle: Record<string, unknown> | null = null;
            try {
                const views = await resolveHouseholdPaymentViews(supabase, { orgId, customerId: hh });
                const oHolds = await readHoldsForPayments(supabase, { orgId, paymentIds: views.map((v) => v.paymentId) });
                const heldByPayment: Record<string, number> = {};
                for (const v of views) {
                    const held = heldCentsFor(v.paymentId, oHolds);
                    if (held > 0) heldByPayment[v.paymentId] = held;
                }
                const pos = resolveAccountPrepaidPosition(views, heldByPayment);
                oracle = {
                    viewCount: views.length,
                    availableCents: pos.availableCents,
                    pendingCents: pos.pendingCents,
                    heldCents: pos.heldCents,
                };
            } catch (e) {
                oracle = { error: String(e).slice(0, 120) };
            }
            const mine = r.outcome.state === "ok" ? r.outcome.position : null;
            const parity = oracle && mine && !oracle.error
                ? {
                      available: oracle.availableCents === mine.availableCents,
                      pending: oracle.pendingCents === mine.pendingCents,
                      held: oracle.heldCents === mine.heldCents,
                      receiptCountMatches: oracle.viewCount === r.diagnostics.paymentCount,
                  }
                : null;

            measured.push({
                oracle,
                parity,
                household: hh,
                wallMs: Math.round(performance.now() - started),
                queryCount: r.diagnostics.queryCount,
                agreementCount: r.diagnostics.agreementCount,
                paymentCount: r.diagnostics.paymentCount,
                outcomeState: r.outcome.state,
                position: r.outcome.state === "ok" ? r.outcome.position : null,
                phases: r.phases ?? [],
            });
        }
        // The zero-receipt case, for the short-circuit comparison.
        const zeroStart = performance.now();
        const zero = await readAccountPrepaidPosition(supabase, {
            orgId, householdId: customerId ?? "", authorized: true, measure: true,
        });
        prepaid = {
            candidateSources: bySource.size,
            householdsFound: households.size,
            measured,
            zeroReceipt: {
                wallMs: Math.round(performance.now() - zeroStart),
                queryCount: zero.diagnostics.queryCount,
                paymentCount: zero.diagnostics.paymentCount,
                outcomeState: zero.outcome.state,
                phases: zero.phases ?? [],
            },
            note: "READ-ONLY discovery. No financial data is written. A measured sample with paymentCount 0 exercises the 3-hop short circuit and must not be read as the money path.",
        };
    }

    /*
     * SHADOW EXECUTION of the real Stage-1 composer.
     *
     * Runs BESIDE the product path and renders nothing: the existing Work Unit answer stays
     * authoritative, this is not a fallback, and no client state is touched.
     *
     * CONFIGURATION IS PASSED IN, not resolved here. The caller reads the configured card keys off
     * the RENDERED frame, so the composer is exercised against the configuration the operator
     * actually has rather than one a diagnostic invented — and this route does not acquire a
     * second opinion about what is configured.
     */
    const shadowCards = (req.nextUrl.searchParams.get("cards") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
    let shadow: Record<string, unknown> | null = null;
    if (shadowCards.length && workUnitId) {
        const csv = (name: string) => (req.nextUrl.searchParams.get(name) ?? "")
            .split(",").map((v) => v.trim()).filter(Boolean);
        const shadowKpiKeys = csv("kpi_keys");
        const shadowViewIds = csv("view_ids");
        const kpis = Number(req.nextUrl.searchParams.get("kpis") ?? "0") || 0;
        const views = Number(req.nextUrl.searchParams.get("views") ?? "0") || 0;
        /*
         * Resolved BEFORE the frame so the diagnostic asks production's question. `active_view`
         * is a caller parameter because the surface's active lens is a property of the
         * navigation, not of the work unit.
         */
        const scopeAndTz = await Promise.all([
            resolveQueueRecordScopeConstraints(supabase, orgId, scopeDimensionsFromAccess(access), null),
            fetchEffectiveUserDisplayTimezoneCached(supabase, { orgId, userId: access.userId }),
        ]).catch(() => null);
        const workViewCaller = scopeAndTz
            ? {
                  recordScopeConstraints: scopeAndTz[0].recordScopeConstraints,
                  recordScopeImpossible: scopeAndTz[0].recordScopeImpossible,
                  viewerDisplayTimeZone: scopeAndTz[1],
                  activeWorkViewId: req.nextUrl.searchParams.get("active_view") ?? (shadowViewIds[0] ?? ""),
              }
            : null;

        const started = performance.now();
        try {
            const r = await composeFirstOrderWorkUnitProjection({
                supabase, orgId, workUnitId, viewerId: access.userId,
                customerMemberId: memberId, householdId: customerId,
                /*
                 * The published surface is RESOLVED, not asserted. `resolveFirstOrderSurfaceConfiguration`
                 * reads each card's configured collapsed fields and falls back to the card's own
                 * registry declaration — so this diagnostic exercises the same compile path the
                 * product would, rather than a card list with the fields implied.
                 */
                configuration: resolveFirstOrderSurfaceConfiguration({
                    cardKeys: shadowCards,
                    /*
                     * REAL CONFIGURED IDENTITIES, supplied by the caller.
                     *
                     * These were synthesised as `kpi_0..n` and `view_0..n`. Synthetic KPI keys are
                     * not known metric keys, so `isKnownOipMetricKey` rejected every one and the
                     * frame reported UNKNOWN — correct runtime behaviour, and worthless as parity
                     * evidence. The probe reads the tenant's own `sourceKey`s off the rendered
                     * frame and passes them here, so the diagnostic asks the SAME question the
                     * product asks. The `kpis`/`views` counts remain only as a scaling knob for
                     * configuration-cost experiments.
                     */
                    kpiKeys: shadowKpiKeys.length
                        ? shadowKpiKeys
                        : Array.from({ length: kpis }, (_, i) => `kpi_${i}`),
                    workViewIds: shadowViewIds.length
                        ? shadowViewIds
                        : Array.from({ length: views }, (_, i) => `view_${i}`),
                    siteScopeId: null,
                }),
                // Request-time decisions, resolved by this route's own gate. The composer never
                // decides authorization itself.
                authority: { financialsRead: true, healthView: true },
                /*
                 * THE SAME CALLER-OWNED INPUTS PRODUCTION RESOLVES, FROM THE SAME OWNERS.
                 *
                 * `composeProvisioningAnswerForRoute` resolves record scope and viewer timezone at
                 * its gate and passes them into the Work View seed, noting they are "request-time
                 * by construction". This route now does exactly that — same functions, same
                 * `workspaceSiteId: null`. Without them the Work View prerequisite never runs and
                 * all seven views report UNAVAILABLE: correct behaviour, useless as parity
                 * evidence, and the same trap the synthetic KPI keys already sprang once.
                 */
                workViewCaller: workViewCaller ?? undefined,
            });
            const p = r.projection;
            shadow = {
                outerWallMs: Math.round(performance.now() - started),
                timing: r.timing,
                geometry: p.geometry,
                configurationIdentity: p.configurationIdentity,
                queueRowCount: p.queueRows.state === "known" ? p.queueRows.value.length : null,
                queueRowsState: p.queueRows.state,
                cardStates: Object.fromEntries(Object.entries(p.cards).map(([k, c]) => [k, {
                    insight: c.insight.state,
                    facts: Object.fromEntries(Object.entries(c.facts).map(([fk, f]) => [fk, f.state === "known" ? { state: f.state, value: f.value } : { state: f.state }])),
                }])),
                kpiStates: Object.fromEntries(Object.entries(p.kpiValues).map(([k, f]) => [k, f.state])),
                workViewStates: Object.fromEntries(Object.entries(p.workViewTotals).map(([k, f]) => [k, f.state])),
                serializedBytes: new TextEncoder().encode(JSON.stringify(p)).length,
            };
        } catch (e) {
            shadow = { error: String(e).slice(0, 200) };
        }
    }

    return NextResponse.json({
        ok: true,
        shadow,
        prepaid,
        dag,
        parity,
        orgId_present: Boolean(orgId),
        memberId_present: Boolean(memberId),
        customerId_present: Boolean(customerId),
        totalMs: Math.round(performance.now() - t0),
        spans,
        profileRepaired,
        note: "DIAGNOSTIC. Measures repaired READ SHAPES only. No maintained state is created and no product path is changed.",
    });
}

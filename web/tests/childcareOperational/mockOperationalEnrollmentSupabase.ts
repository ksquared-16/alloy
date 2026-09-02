/**
 * In-memory Supabase mock for childcare operational enrollment service tests.
 */

import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}

function nextId(prefix: string, n: number): string {
    return `${prefix}-${n}`;
}

export type OperationalEnrollmentMockStore = {
    child_enrollment_agreements: Row[];
    child_placements: Row[];
    schedule_patterns: Row[];
    schedule_assignments: Row[];
    child_attendance_events: Row[];
    charges: Row[];
    childcare_rate_plans: Row[];
    childcare_rate_rules: Row[];
    childcare_capacity_rules: Row[];
    childcare_ratio_rules: Row[];
    childcare_ratio_rule_tiers: Row[];
    childcare_operating_windows: Row[];
    childcare_schedule_rules: Row[];
    financial_services: Row[];
    financial_charge_templates: Row[];
    financial_policies: Row[];
    consumption_event_types: Row[];
    consumption_events: Row[];
    resolved_obligations: Row[];
    locations: Row[];
    location_program_categories: Row[];
    persons: Row[];
    employments: Row[];
    customer_members: Row[];
    opportunities: Row[];
    opportunity_customer_members: Row[];
    org_settings: Row[];
    // Commercial V1 (Phase 9 — consumption prices tuition from Commercial Execution).
    program_offerings: Row[];
    program_offering_variants: Row[];
    commercial_tuition_rates: Row[];
    commercial_products: Row[];
    commercial_revenue_categories: Row[];
    commercial_policies: Row[];
    option_sets: Row[];
    option_set_items: Row[];
    gl_accounts: Row[];
};

export function createOperationalEnrollmentMockStore(
    seed?: Partial<OperationalEnrollmentMockStore>
): OperationalEnrollmentMockStore {
    return {
        child_enrollment_agreements: seed?.child_enrollment_agreements ?? [],
        child_placements: seed?.child_placements ?? [],
        schedule_patterns: seed?.schedule_patterns ?? [],
        schedule_assignments: seed?.schedule_assignments ?? [],
        child_attendance_events: seed?.child_attendance_events ?? [],
        charges: seed?.charges ?? [],
        childcare_rate_plans: seed?.childcare_rate_plans ?? [],
        childcare_rate_rules: seed?.childcare_rate_rules ?? [],
        childcare_capacity_rules: seed?.childcare_capacity_rules ?? [],
        childcare_ratio_rules: seed?.childcare_ratio_rules ?? [],
        childcare_ratio_rule_tiers: seed?.childcare_ratio_rule_tiers ?? [],
        childcare_operating_windows: seed?.childcare_operating_windows ?? [],
        childcare_schedule_rules: seed?.childcare_schedule_rules ?? [],
        financial_services: seed?.financial_services ?? [],
        financial_charge_templates: seed?.financial_charge_templates ?? [],
        financial_policies: seed?.financial_policies ?? [],
        consumption_event_types: seed?.consumption_event_types ?? [],
        consumption_events: seed?.consumption_events ?? [],
        resolved_obligations: seed?.resolved_obligations ?? [],
        locations: seed?.locations ?? [],
        location_program_categories: seed?.location_program_categories ?? [],
        persons: seed?.persons ?? [],
        employments: seed?.employments ?? [],
        customer_members: seed?.customer_members ?? [],
        opportunities: seed?.opportunities ?? [],
        opportunity_customer_members: seed?.opportunity_customer_members ?? [],
        org_settings: seed?.org_settings ?? [],
        program_offerings: seed?.program_offerings ?? [],
        program_offering_variants: seed?.program_offering_variants ?? [],
        commercial_tuition_rates: seed?.commercial_tuition_rates ?? [],
        commercial_products: seed?.commercial_products ?? [],
        commercial_revenue_categories: seed?.commercial_revenue_categories ?? [],
        commercial_policies: seed?.commercial_policies ?? [],
        option_sets: seed?.option_sets ?? [],
        option_set_items: seed?.option_set_items ?? [],
        gl_accounts: seed?.gl_accounts ?? [],
    };
}

/**
 * Phase 9 test helper — Commercial V1 config that reproduces a set of
 * scheduleBasis → amount mappings, so consumption prices tuition from Commercial
 * Execution (frozen V1). Wires the enrollment → program via a placement, and maps
 * each basis to an offering/variant/rate. Returns a Partial<Store> to spread into
 * createOperationalEnrollmentMockStore.
 *
 * `rates`: one entry per basis, e.g. { basis: "three_day", cadenceKey: "monthly", rateCents: 82000 }.
 */
export function commercialTuitionSeed(opts: {
    orgId: string;
    agreementId: string;
    programKey?: string;
    rates: { basis: string; cadenceKey: string; rateCents: number }[];
}): Partial<OperationalEnrollmentMockStore> {
    const programKey = opts.programKey ?? "prog-1";
    const catId = "cat-1";
    const offerings: Row[] = [];
    const variants: Row[] = [];
    const tuitionRates: Row[] = [];
    const offeringByAttendance = new Map<string, string>();

    const ensureOffering = (attendanceType: string): string => {
        const existing = offeringByAttendance.get(attendanceType);
        if (existing) return existing;
        const id = `off-${attendanceType}`;
        offerings.push({ id, org_id: opts.orgId, program_key: programKey, label: attendanceType, attendance_type: attendanceType, status: "active", is_active: true, effective_start: "2026-01-01", effective_end: null, sort_order: offerings.length, metadata: {} });
        offeringByAttendance.set(attendanceType, id);
        return id;
    };
    const BASIS_DAYS: Record<string, number> = { three_day: 3, four_day: 4, five_day: 5 };
    const BASIS_ATTENDANCE: Record<string, string> = { full_day: "full_day", half_day: "part_day", drop_in: "drop_in", hourly: "hourly" };

    for (const r of opts.rates) {
        const days = BASIS_DAYS[r.basis];
        let variantId: string;
        if (days != null) {
            const offeringId = ensureOffering("full_day");
            variantId = `var-${days}d`;
            if (!variants.find((v) => v.id === variantId)) variants.push({ id: variantId, org_id: opts.orgId, offering_id: offeringId, label: `${days} days/week`, quantity_type: "days", quantity_value: days, status: "active", is_active: true, sort_order: days, metadata: {} });
        } else {
            const attendance = BASIS_ATTENDANCE[r.basis] ?? r.basis;
            const offeringId = ensureOffering(attendance);
            variantId = `var-${attendance}-def`;
            if (!variants.find((v) => v.id === variantId)) variants.push({ id: variantId, org_id: opts.orgId, offering_id: offeringId, label: "Default", quantity_type: null, quantity_value: null, status: "active", is_active: true, sort_order: 0, metadata: {} });
        }
        tuitionRates.push({ id: `rate-${r.basis}-${r.cadenceKey}`, org_id: opts.orgId, location_id: null, variant_id: variantId, cadence_key: r.cadenceKey, payer_type: "private_pay", rate_cents: r.rateCents, not_offered: false, is_active: true, effective_start: "2026-01-01", effective_end: null, revenue_category_id: null, metadata: {} });
    }

    return {
        child_placements: [{ id: "plc-1", org_id: opts.orgId, enrollment_agreement_id: opts.agreementId, program_category_id: catId, start_date: "2026-01-01", end_date: null, status: "active", metadata: {} }],
        location_program_categories: [{ id: catId, org_id: opts.orgId, key: programKey, label: "Program", is_active: true, sort_order: 0, metadata: {} }],
        program_offerings: offerings,
        program_offering_variants: variants,
        commercial_tuition_rates: tuitionRates,
    };
}

/**
 * In-memory emulation of the `reconcile_consumption_correction` RPC — kept
 * SEMANTICALLY IDENTICAL to
 *   supabase/migrations/20260716000000_consumption_correction_lineage_and_reconcile_rpc.sql
 * (they are two encodings of ONE contract). It mirrors the SQL step-for-step:
 *   1. locate + "lock" the prior consumption event by (org, source_entity_id);
 *   2. upsert the correction event by (org, idempotency_key) with corrects_event_id;
 *   3. reparent/upsert same-key obligations (create/recalc draft charge);
 *   4. supersede absent-key orphans (+ superseded_by_event_id, review_status='stale');
 *   5. retire orphan/planned DRAFT charges in place (draft -> void, metadata.retirement);
 *   6. retire the prior event.
 * All-or-nothing: it snapshots the three mutable tables at entry and, on any thrown
 * (or injected) failure, restores them so a fault-injection test observes ZERO
 * partial state — exactly what the SQL transaction guarantees.
 */
export type ReconcileFault = (phase: "after_event" | "after_reparent" | "after_supersede" | "after_retire") => void;

function emulateReconcileConsumptionCorrection(
    store: OperationalEnrollmentMockStore,
    orgId: string,
    actorUserId: string | null,
    plan: Record<string, unknown>,
    counters: Record<string, number>,
    fault?: ReconcileFault,
): { data: Record<string, unknown> | null; error: { message: string } | null } {
    const ce = (plan.correction_event ?? {}) as Record<string, unknown>;
    const priorFactId = plan.prior_fact_id as string;
    const sourceFamily = (ce.source_family as string) ?? null;
    const now = new Date().toISOString();

    // Snapshot for all-or-nothing restore.
    const snap = {
        consumption_events: clone(store.consumption_events),
        resolved_obligations: clone(store.resolved_obligations),
        charges: clone(store.charges),
    };

    try {
        // 1. Locate the prior consumption event by its fact anchor.
        const priorCandidates = store.consumption_events
            .filter(
                (e) =>
                    e.org_id === orgId &&
                    e.source_entity_id === priorFactId &&
                    (sourceFamily == null || e.source_family === sourceFamily),
            )
            .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
        const prior = priorCandidates[0];
        if (!prior) throw new Error("reconcile_consumption:no_prior_event");
        const priorEventId = prior.id as string;

        // 2. Upsert the correction's OWN consumption event by (org, idempotency_key).
        let e1: string;
        const existingEvent = store.consumption_events.find(
            (e) => e.org_id === orgId && e.idempotency_key === ce.idempotency_key,
        );
        if (existingEvent) {
            existingEvent.status = (ce.status as string) ?? existingEvent.status;
            existingEvent.context = (ce.context as Record<string, unknown>) ?? existingEvent.context;
            existingEvent.corrects_event_id = priorEventId;
            existingEvent.updated_by = actorUserId;
            e1 = existingEvent.id as string;
        } else {
            counters.consumption_events = (counters.consumption_events ?? 0) + 1;
            const id = `consumption_events-${counters.consumption_events}`;
            store.consumption_events.push({
                id,
                org_id: orgId,
                location_id: ce.location_id ?? null,
                event_type_id: ce.event_type_id ?? null,
                source_family: ce.source_family,
                event_key: ce.event_key,
                source_entity_type: ce.source_entity_type,
                source_entity_id: ce.source_entity_id,
                subject_type: ce.subject_type ?? null,
                subject_id: ce.subject_id ?? null,
                occurs_on: ce.occurs_on,
                effective_on: ce.effective_on ?? null,
                status: ce.status ?? "resolved",
                context: ce.context ?? {},
                idempotency_key: ce.idempotency_key,
                corrects_event_id: priorEventId,
                created_by: actorUserId,
                created_at: now,
                updated_at: now,
            });
            e1 = id;
        }

        // 3. Reparent + upsert each new obligation.
        const reparented: string[] = [];
        const upserted: string[] = [];
        const createdChg: string[] = [];
        const newKeys: string[] = [];
        for (const rawObl of (plan.new_obligations ?? []) as Record<string, unknown>[]) {
            const reso = rawObl.resolution_key as string | null;
            if (reso != null) newKeys.push(reso);
            const charge = rawObl.charge as Record<string, unknown> | null;
            const existingObl = store.resolved_obligations.find(
                (o) => o.org_id === orgId && o.resolution_key === reso,
            );
            const prevEvent = existingObl?.consumption_event_id ?? null;
            // prevCharge is the LOCKED obligation's own draft charge — the create-vs-recalc
            // anchor (mirrors the RPC's FOR UPDATE read; never a pre-lock plan hint). F1.
            const prevCharge = (existingObl?.draft_charge_id as string | null) ?? null;
            let newChargeId: string | null = prevCharge;

            if (charge && typeof charge === "object" && charge.amount_cents != null) {
                newChargeId = null;
                // Recalc the obligation's live DRAFT charge in place; else create one.
                if (prevCharge) {
                    const c = store.charges.find(
                        (x) => x.id === prevCharge && x.org_id === orgId && x.status === "draft",
                    );
                    if (c) {
                        c.amount_cents = charge.amount_cents ?? null;
                        c.occurs_on = charge.occurs_on ?? null;
                        c.billable_on = charge.billable_on ?? null;
                        c.service_date = charge.service_date ?? null;
                        c.metadata = (charge.metadata as Record<string, unknown>) ?? c.metadata;
                        c.updated_at = now;
                        newChargeId = prevCharge;
                    }
                }
                if (newChargeId == null) {
                    counters.charges = (counters.charges ?? 0) + 1;
                    const cid = `charges-${counters.charges}`;
                    store.charges.push({
                        id: cid,
                        org_id: orgId,
                        job_id: null,
                        billable_source_type: (charge.billable_source_type as string) ?? "enrollment_agreement",
                        billable_source_id: charge.billable_source_id ?? null,
                        charge_type: charge.charge_type ?? "fee",
                        charge_category: charge.charge_category ?? null,
                        status: "draft",
                        currency_code: charge.currency_code ?? "USD",
                        amount_cents: charge.amount_cents ?? null,
                        service_date: charge.service_date ?? null,
                        occurs_on: charge.occurs_on ?? null,
                        billable_on: charge.billable_on ?? null,
                        charge_template_id: charge.charge_template_id ?? null,
                        service_id: charge.service_id ?? null,
                        description: charge.description ?? null,
                        metadata: (charge.metadata as Record<string, unknown>) ?? {},
                        created_at: now,
                        updated_at: now,
                    });
                    newChargeId = cid;
                    createdChg.push(cid);
                }
            }

            if (existingObl) {
                existingObl.consumption_event_id = e1;
                existingObl.charge_template_id = rawObl.charge_template_id ?? null;
                existingObl.service_id = rawObl.service_id ?? null;
                existingObl.amount_cents = rawObl.amount_cents ?? null;
                existingObl.currency_code = rawObl.currency_code ?? "USD";
                existingObl.responsibility_key = rawObl.responsibility_key ?? null;
                existingObl.occurs_on = rawObl.occurs_on ?? null;
                existingObl.billable_on = rawObl.billable_on ?? null;
                existingObl.period_start = rawObl.period_start ?? null;
                existingObl.period_end = rawObl.period_end ?? null;
                existingObl.status = (rawObl.status as string) ?? existingObl.status;
                existingObl.review_required = rawObl.review_required ?? existingObl.review_required;
                existingObl.explanation = rawObl.explanation ?? existingObl.explanation;
                existingObl.obligation_kind = rawObl.obligation_kind ?? null;
                existingObl.draft_charge_id = newChargeId;
                existingObl.superseded_by_event_id = null;
                if (rawObl.review_status_stale === true) existingObl.review_status = "stale";
                existingObl.updated_by = actorUserId;
                existingObl.updated_at = now;
                if (prevEvent !== e1) reparented.push(existingObl.id as string);
                upserted.push(existingObl.id as string);
            } else {
                counters.resolved_obligations = (counters.resolved_obligations ?? 0) + 1;
                const oid = `resolved_obligations-${counters.resolved_obligations}`;
                store.resolved_obligations.push({
                    id: oid,
                    org_id: orgId,
                    consumption_event_id: e1,
                    charge_template_id: rawObl.charge_template_id ?? null,
                    service_id: rawObl.service_id ?? null,
                    amount_cents: rawObl.amount_cents ?? null,
                    currency_code: rawObl.currency_code ?? "USD",
                    responsibility_key: rawObl.responsibility_key ?? null,
                    occurs_on: rawObl.occurs_on ?? null,
                    billable_on: rawObl.billable_on ?? null,
                    period_start: rawObl.period_start ?? null,
                    period_end: rawObl.period_end ?? null,
                    status: rawObl.status ?? "previewed",
                    review_required: rawObl.review_required ?? false,
                    explanation: rawObl.explanation ?? {},
                    draft_charge_id: newChargeId,
                    resolution_key: reso,
                    obligation_kind: rawObl.obligation_kind ?? null,
                    superseded_by_event_id: null,
                    review_status: rawObl.review_required ? "review_required" : "pending",
                    created_by: actorUserId,
                    created_at: now,
                    updated_at: now,
                });
                upserted.push(oid);
            }
        }
        fault?.("after_reparent");

        // 4. Supersede orphans (prior obligations whose key is absent from the new pass).
        const superseded: string[] = [];
        const retired: string[] = [];
        const orphans = store.resolved_obligations.filter(
            (o) =>
                o.org_id === orgId &&
                o.consumption_event_id === priorEventId &&
                (o.resolution_key == null || !newKeys.includes(o.resolution_key as string)),
        );
        for (const orphan of orphans) {
            orphan.status = "superseded";
            orphan.superseded_by_event_id = e1;
            orphan.review_status = "stale";
            orphan.updated_by = actorUserId;
            orphan.updated_at = now;
            superseded.push(orphan.id as string);
            if (orphan.draft_charge_id) retired.push(orphan.draft_charge_id as string);
        }
        for (const rid of (plan.retire_charge_ids ?? []) as string[]) {
            if (!retired.includes(rid)) retired.push(rid);
        }
        fault?.("after_supersede");

        // 5. Retire draft charges in place (draft -> void). Posted/non-draft => no-op.
        for (const cid of retired) {
            const c = store.charges.find(
                (x) =>
                    x.id === cid &&
                    x.org_id === orgId &&
                    x.billable_source_type === "enrollment_agreement" &&
                    x.status === "draft",
            );
            if (c) {
                c.status = "void";
                c.voided_at = now;
                c.metadata = {
                    ...((c.metadata as Record<string, unknown>) ?? {}),
                    retirement: {
                        reason: "obligation_superseded",
                        actor_user_id: actorUserId,
                        superseded_by_consumption_event_id: e1,
                        retired_at: now,
                    },
                };
                c.updated_at = now;
            }
        }
        fault?.("after_retire");

        // 6. Retire the prior event.
        prior.status = "superseded";
        prior.updated_by = actorUserId;
        prior.updated_at = now;

        return {
            data: {
                ok: true,
                consumption_event_id: e1,
                prior_consumption_event_id: priorEventId,
                obligation_ids: upserted,
                reparented_obligation_ids: reparented,
                superseded_obligation_ids: superseded,
                retired_charge_ids: retired,
                created_charge_ids: createdChg,
            },
            error: null,
        };
    } catch (e) {
        // All-or-nothing: restore the pre-call snapshot (no partial state persists).
        store.consumption_events.splice(0, store.consumption_events.length, ...snap.consumption_events);
        store.resolved_obligations.splice(0, store.resolved_obligations.length, ...snap.resolved_obligations);
        store.charges.splice(0, store.charges.length, ...snap.charges);
        return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
}

type Filter = { col: string; op: "eq" | "in"; value: unknown };

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
    return rows.filter((row) => {
        for (const f of filters) {
            if (f.op === "eq" && row[f.col] !== f.value) return false;
            if (f.op === "in") {
                const set = f.value as unknown[];
                if (!set.includes(row[f.col])) return false;
            }
        }
        return true;
    });
}

export function createOperationalEnrollmentMockSupabase(
    store: OperationalEnrollmentMockStore,
    opts?: { reconcileFault?: ReconcileFault }
): SupabaseClient {
    const counters: Record<string, number> = {
        child_enrollment_agreements: 0,
        child_placements: 0,
        schedule_assignments: 0,
    };

    function tableRows(table: string): Row[] {
        return (store as Record<string, Row[]>)[table] ?? [];
    }

    function buildChain(table: string) {
        const filters: Filter[] = [];
        let orderCol: string | null = null;
        let orderAsc = true;
        let limitN: number | null = null;
        let pendingInsert: Row | Row[] | null = null;
        let pendingUpdate: Row | null = null;
        let isUpdate = false;
        let isInsert = false;
        let isDelete = false;
        let isSelect = false;

        const chain: Record<string, unknown> = {};

        const self = () => chain;

        chain.select = vi.fn((cols?: string) => {
            isSelect = true;
            return chain;
        });

        chain.insert = vi.fn((row: Row | Row[]) => {
            isInsert = true;
            pendingInsert = row;
            return chain;
        });

        chain.delete = vi.fn(() => {
            isDelete = true;
            return chain;
        });

        function insertRows(payload: Row | Row[]): Row[] {
            const list = Array.isArray(payload) ? payload : [payload];
            const inserted: Row[] = [];
            for (const item of list) {
                counters[table] = (counters[table] ?? 0) + 1;
                const now = new Date().toISOString();
                const row = {
                    ...item,
                    id: item.id ?? nextId(table, counters[table]),
                    created_at: now,
                    updated_at: now,
                    metadata: item.metadata ?? {},
                };
                tableRows(table).push(row);
                inserted.push(row);
            }
            return inserted;
        }

        function deleteRows(): Row[] {
            const rows = tableRows(table);
            const removed: Row[] = [];
            for (let i = rows.length - 1; i >= 0; i--) {
                if (applyFilters([rows[i]], filters).length === 1) {
                    removed.push(rows[i]);
                    rows.splice(i, 1);
                }
            }
            return removed;
        }

        chain.update = vi.fn((row: Row) => {
            isUpdate = true;
            pendingUpdate = row;
            return chain;
        });

        chain.eq = vi.fn((col: string, value: unknown) => {
            filters.push({ col, op: "eq", value });
            return chain;
        });

        chain.in = vi.fn((col: string, value: unknown[]) => {
            filters.push({ col, op: "in", value });
            return chain;
        });

        chain.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
            orderCol = col;
            orderAsc = opts?.ascending !== false;
            return chain;
        });

        chain.limit = vi.fn((n: number) => {
            limitN = n;
            return chain;
        });

        chain.maybeSingle = vi.fn(async () => {
            /*
             * `maybeSingle` after a MUTATION returns what the mutation touched — and NULL, not an
             * error, when the filters matched nothing. That is exactly how PostgREST behaves, and it
             * is the shape a guarded update relies on: `update(...).eq('status','draft')` matching
             * zero rows is the signal that someone else already advanced the row, not a failure.
             * Without this, the mock silently performed no update and answered with the unchanged
             * row it had merely read.
             */
            if (isInsert && pendingInsert) {
                const inserted = insertRows(pendingInsert);
                return { data: clone(inserted[0]) ?? null, error: null };
            }
            if (isUpdate && pendingUpdate) {
                const rows = tableRows(table);
                const idx = rows.findIndex((r) => applyFilters([r], filters).length === 1);
                if (idx < 0) return { data: null, error: null };
                const updated = { ...rows[idx], ...pendingUpdate, updated_at: new Date().toISOString() };
                rows[idx] = updated;
                return { data: clone(updated), error: null };
            }
            const rows = applyFilters(tableRows(table), filters);
            let sorted = rows;
            if (orderCol) {
                sorted = [...rows].sort((a, b) => {
                    const av = String(a[orderCol!] ?? "");
                    const bv = String(b[orderCol!] ?? "");
                    return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
                });
            }
            if (limitN != null) sorted = sorted.slice(0, limitN);
            return { data: sorted[0] ?? null, error: null };
        });

        chain.single = vi.fn(async () => {
            if (isInsert && pendingInsert) {
                const inserted = insertRows(pendingInsert);
                return { data: clone(inserted[0]), error: null };
            }

            if (isUpdate && pendingUpdate) {
                const rows = tableRows(table);
                const idx = rows.findIndex((r) =>
                    applyFilters([r], filters).length === 1
                );
                if (idx < 0) {
                    return { data: null, error: { message: "not found" } };
                }
                const updated = {
                    ...rows[idx],
                    ...pendingUpdate,
                    updated_at: new Date().toISOString(),
                };
                rows[idx] = updated;
                return { data: clone(updated), error: null };
            }

            const result = await (chain.maybeSingle as () => Promise<{ data: Row | null }>)();
            if (!result.data) {
                return { data: null, error: { message: "not found" } };
            }
            return { data: result.data, error: null };
        });

        chain.then = (onFulfilled: (v: { data: Row[] | Row | null; error: null | { message: string } }) => unknown) => {
            if (isInsert && pendingInsert) {
                const inserted = insertRows(pendingInsert);
                return Promise.resolve(onFulfilled({ data: clone(inserted), error: null }));
            }

            if (isDelete) {
                const removed = deleteRows();
                return Promise.resolve(onFulfilled({ data: clone(removed), error: null }));
            }

            if (isUpdate && pendingUpdate) {
                const rows = tableRows(table);
                const idx = rows.findIndex((r) => applyFilters([r], filters).length === 1);
                if (idx < 0) {
                    return Promise.resolve(onFulfilled({ data: null, error: { message: "not found" } }));
                }
                const updated = {
                    ...rows[idx],
                    ...pendingUpdate,
                    updated_at: new Date().toISOString(),
                };
                rows[idx] = updated;
                return Promise.resolve(onFulfilled({ data: clone(updated), error: null }));
            }

            const rows = applyFilters(tableRows(table), filters);
            let sorted = rows;
            if (orderCol) {
                sorted = [...rows].sort((a, b) => {
                    const av = String(a[orderCol!] ?? "");
                    const bv = String(b[orderCol!] ?? "");
                    return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
                });
            }
            if (limitN != null) sorted = sorted.slice(0, limitN);
            return Promise.resolve(onFulfilled({ data: clone(sorted), error: null }));
        };

        return chain;
    }

    const from = vi.fn((table: string) => buildChain(table));

    const rpc = vi.fn(async (fnName: string, params: Record<string, unknown>) => {
        if (fnName === "reconcile_consumption_correction") {
            return emulateReconcileConsumptionCorrection(
                store,
                params.p_org_id as string,
                (params.p_actor_user_id as string | null) ?? null,
                params.p_plan as Record<string, unknown>,
                counters,
                opts?.reconcileFault,
            );
        }
        if (fnName === "person_is_employed_on") {
            // Mirrors public.person_is_employed_on: window-based, so an ENDED
            // employment still covers dates inside its own window.
            const onDate = String(params.p_on_date);
            const employed = (store.employments ?? []).some(
                (e) =>
                    e.org_id === params.p_org_id &&
                    e.person_id === params.p_person_id &&
                    e.employment_status !== "canceled" &&
                    String(e.start_date) <= onDate &&
                    (e.end_date == null || String(e.end_date) >= onDate),
            );
            return { data: employed, error: null };
        }
        return { data: null, error: { message: `unknown rpc: ${fnName}` } };
    });

    return { from, rpc } as unknown as SupabaseClient;
}

export const ORG_ID = "org-1";
export const SITE_ID = "site-1";
export const UNIT_ID = "unit-1";
export const MEMBER_ID = "member-1";
export const PROGRAM_ID = "program-1";
export const PATTERN_ID = "pattern-1";

export function seedOperationalEnrollmentFixtures(): OperationalEnrollmentMockStore {
    return createOperationalEnrollmentMockStore({
        customer_members: [
            {
                id: MEMBER_ID,
                org_id: ORG_ID,
                customer_id: "cust-1",
                person_id: "person-1",
            },
        ],
        locations: [
            { id: SITE_ID, org_id: ORG_ID, label: "Main Campus", location_type: "site" },
            {
                id: UNIT_ID,
                org_id: ORG_ID,
                label: "Infant A",
                location_type: "unit",
                parent_location_id: SITE_ID,
            },
        ],
        location_program_categories: [
            {
                id: PROGRAM_ID,
                org_id: ORG_ID,
                location_id: SITE_ID,
                key: "infant",
                label: "Infant",
                is_active: true,
            },
        ],
        schedule_patterns: [
            {
                id: PATTERN_ID,
                org_id: ORG_ID,
                site_location_id: SITE_ID,
                key: "full_time",
                label: "Full Time",
                schedule_type_key: "full_time",
                weekdays: [1, 2, 3, 4, 5],
                sort_order: 10,
                is_active: true,
                metadata: {},
                created_at: "2026-01-01T00:00:00Z",
                updated_at: null,
            },
        ],
    });
}

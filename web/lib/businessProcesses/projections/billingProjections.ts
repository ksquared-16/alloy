/**
 * Billing · review projections (BP V2 Slice 5) — households a director should look at, read from
 * Financials' OWN readers and classifications. Nothing here computes money: no balance, no collectible,
 * no due date, no variance. Each projection names the household and carries the authoritative source.
 *
 *   - `payment_exceptions` (V1): collections the provider confirmed that Financials has NOT recognized
 *     as money (`readUnrecognizedCollections` — `processor_state='succeeded'`, no canonical payment).
 *     Provider telemetry is never shown as a payment; it is shown as the exception it is. Failed
 *     attempts, failed autopay and disputes have no cross-household Financials reader yet and are NOT
 *     included (named prerequisites, see the Business Process system document).
 *   - `funding_variances`: posted charges with an OPEN (unresolved, non-zero) subsidy variance — positions
 *     from Financials (`resolveCollectiblePositionsForCharges`) under the Subsidy section's own rule
 *     (`financialSubsidyReason === "variance"`). A variance never changes what a family owes.
 *
 * Both are gated by `fin.read` here (a Work View answer route is not a Financials route) and narrow by
 * the actor's sites ∩ the `/workspace` selection through Financials' own location rule
 * (`resolveFinancialWorkLocation` / `isFinancialWorkVisible`). Rows are per HOUSEHOLD (`customers`);
 * a source with no attributable household is not shown under another one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readUnrecognizedCollections, type UnrecognizedCollection } from "@/lib/financials/payments/collectionRecognition";
import { resolveCollectiblePositionsForCharges } from "@/lib/financials/workspace/resolveFinancialPosition";
import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { readAccountDuePositions } from "@/lib/financials/account/accountDuePositions";
import { fetchOrgBusinessDate } from "@/lib/financials/businessDate";
import { financialSubsidyReason } from "@/lib/financials/subsidy/subsidyReason";
import { isFinancialWorkVisible, resolveFinancialWorkLocation } from "@/lib/financials/workspace/financialWorkLocation";
import {
    effectiveProjectionSiteIds,
    type DomainProjectionContext,
    type DomainProjectionDefinition,
    type DomainProjectionRow,
} from "@/lib/businessProcesses/projections/domainProjectionTypes";

/** The recognition queue's own maximum (`readUnrecognizedCollections` caps at 200). */
export const UNRECOGNIZED_COLLECTION_READ_LIMIT = 200;
const ID_BATCH = 100;

type Loaded =
    | { ok: true; rows: DomainProjectionRow[]; truncated: boolean }
    | { ok: false; code: "projection_forbidden" | "projection_unavailable"; message: string };

type Deps = {
    assertRead?: typeof assertFinancialsReadAllowed;
    readUnrecognized?: typeof readUnrecognizedCollections;
    readPositions?: typeof resolveCollectiblePositionsForCharges;
};

function chunk<T>(items: T[]): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += ID_BATCH) out.push(items.slice(i, i + ID_BATCH));
    return out;
}

async function agreementsById(supabase: SupabaseClient, orgId: string, ids: string[]) {
    const out = new Map<string, { customerId: string | null; siteLocationId: string | null }>();
    for (const batch of chunk([...new Set(ids)])) {
        const { data, error } = await supabase.from("child_enrollment_agreements").select("id, customer_id, site_location_id").eq("org_id", orgId).in("id", batch);
        if (error) throw new Error(error.message);
        for (const a of (data ?? []) as Array<{ id: string; customer_id: string | null; site_location_id: string | null }>) {
            out.set(a.id, { customerId: a.customer_id, siteLocationId: a.site_location_id });
        }
    }
    return out;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** fin.read, then the scope Financials readers take; `null` scope means "nothing visible", not an error. */
async function financialScope(supabase: SupabaseClient, ctx: DomainProjectionContext, deps: Deps) {
    const verdict = await (deps.assertRead ?? assertFinancialsReadAllowed)({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!verdict.ok) return { ok: false as const, message: verdict.message };
    const selected = ctx.scope.selectedSiteId?.trim() || null;
    if (selected && effectiveProjectionSiteIds(ctx.scope)?.length === 0) return { ok: true as const, scope: null };
    return {
        ok: true as const,
        scope: {
            siteScope: ctx.scope.siteScope,
            allowedSiteLocationIds: ctx.scope.allowedSiteLocationIds,
            activeSiteLocationId: selected,
        },
    };
}

async function householdNames(supabase: SupabaseClient, orgId: string, ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (let i = 0; i < ids.length; i += ID_BATCH) {
        const { data, error } = await supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", ids.slice(i, i + ID_BATCH));
        if (error) throw new Error(error.message);
        for (const r of (data ?? []) as Array<{ id: string; name: string | null }>) if (r.name?.trim()) out.set(r.id, r.name.trim());
    }
    return out;
}

export async function loadPaymentExceptions(supabase: SupabaseClient, ctx: DomainProjectionContext, deps: Deps = {}): Promise<Loaded> {
    const gate = await financialScope(supabase, ctx, deps);
    if (!gate.ok) return { ok: false, code: "projection_forbidden", message: gate.message };
    if (!gate.scope) return { ok: true, rows: [], truncated: false };
    const scope = gate.scope;

    let collections: UnrecognizedCollection[];
    try {
        collections = await (deps.readUnrecognized ?? readUnrecognizedCollections)(supabase, {
            orgId: ctx.orgId,
            limit: UNRECOGNIZED_COLLECTION_READ_LIMIT,
            failClosed: true,
        });
    } catch (e) {
        return { ok: false, code: "projection_unavailable", message: e instanceof Error ? e.message : String(e) };
    }

    try {
        // Household and site come from the attempt's billable source, exactly as Financials locates a charge:
        // an enrollment agreement's household and site, or a household account (org-scoped).
        const agreements = await agreementsById(
            supabase,
            ctx.orgId,
            collections.filter((c) => c.billableSourceType === "enrollment_agreement" && c.billableSourceId).map((c) => c.billableSourceId!),
        );

        type Group = { customerId: string; siteLocationId: string | null; items: UnrecognizedCollection[] };
        const groups = new Map<string, Group>();
        for (const c of collections) {
            const agreement = c.billableSourceType === "enrollment_agreement" ? agreements.get(c.billableSourceId ?? "") ?? null : null;
            const customerId = c.billableSourceType === "customer" ? c.customerId : agreement?.customerId ?? null;
            const location = resolveFinancialWorkLocation({ billableSourceType: c.billableSourceType, agreementSiteLocationId: agreement?.siteLocationId ?? null });
            if (!customerId || !location) continue;
            if (!isFinancialWorkVisible({ location, ...scope })) continue;
            const g = groups.get(customerId) ?? { customerId, siteLocationId: location.siteLocationId, items: [] };
            g.items.push(c);
            groups.set(customerId, g);
        }
        const names = await householdNames(supabase, ctx.orgId, [...groups.keys()]);
        const rows: DomainProjectionRow[] = [...groups.values()].map((g) => {
            const ordered = [...g.items].sort((x, y) => String(x.providerStateAt ?? "").localeCompare(String(y.providerStateAt ?? "")) || x.attemptId.localeCompare(y.attemptId));
            const rep = ordered[0]!;
            const reason = `Collected by the provider, not yet recorded${ordered.length > 1 ? ` · ${plural(ordered.length, "collection")}` : ""}`;
            return {
                subject: { type: "household", id: g.customerId },
                label: names.get(g.customerId) ?? "Household",
                source: { kind: "collection_attempt", id: rep.attemptId, count: ordered.length, statusLabel: reason },
                siteLocationId: g.siteLocationId,
                sortKey: String(rep.providerStateAt ?? ""),
                detail: { reason, siteLocationId: g.siteLocationId },
            };
        });
        // The reader is a bounded queue: a full page means there may be more than it returned.
        return { ok: true, rows, truncated: collections.length >= UNRECOGNIZED_COLLECTION_READ_LIMIT };
    } catch (e) {
        return { ok: false, code: "projection_unavailable", message: e instanceof Error ? e.message : String(e) };
    }
}

const VARIANCE_STATE_LABEL: Record<string, string> = {
    short_paid: "short paid",
    overpaid: "overpaid",
    denied: "denied",
    unapplied: "unapplied",
    recouped: "recouped",
    under_review: "under review",
    pending: "pending",
};

/** Open (unresolved) variance rows read per request; more than this is reported as truncated. */
export const FUNDING_VARIANCE_READ_CAP = 2000;
const PAGE = 1000;

/**
 * Funding variances.
 *
 * The org-wide position cohort reads the NEWEST 2,000 posted charges, so on a real ledger an older
 * charge with an open variance would sit beyond its cap. This view therefore starts from the open
 * variances themselves (resolution not decided — a lookup, not a calculation), locates their posted
 * childcare charges through Financials' location rule, and lets Financials decide membership: positions
 * from `resolveCollectiblePositionsForCharges` (the set-based form of the same calculation the cohort
 * runs) under the Subsidy section's rule (`financialSubsidyReason === "variance"`).
 */
export async function loadFundingVariances(supabase: SupabaseClient, ctx: DomainProjectionContext, deps: Deps = {}): Promise<Loaded> {
    const gate = await financialScope(supabase, ctx, deps);
    if (!gate.ok) return { ok: false, code: "projection_forbidden", message: gate.message };
    if (!gate.scope) return { ok: true, rows: [], truncated: false };
    const scope = gate.scope;

    try {
        // 1. Open variances → their claim lines → candidate charges.
        const lineIds = new Set<string>();
        let truncated = false;
        for (let from = 0; ; from += PAGE) {
            const take = Math.min(PAGE, FUNDING_VARIANCE_READ_CAP - from);
            if (take <= 0) {
                const probe = await supabase.from("financial_subsidy_variances").select("id").eq("org_id", ctx.orgId).is("resolution_kind", null).order("id", { ascending: true }).range(from, from);
                if (probe.error) throw new Error(probe.error.message);
                truncated = (probe.data ?? []).length > 0;
                break;
            }
            const { data, error } = await supabase
                .from("financial_subsidy_variances")
                .select("id, claim_line_id")
                .eq("org_id", ctx.orgId)
                .is("resolution_kind", null)
                .order("id", { ascending: true })
                .range(from, from + take - 1);
            if (error) throw new Error(error.message);
            const got = (data ?? []) as Array<{ claim_line_id: string }>;
            for (const v of got) lineIds.add(v.claim_line_id);
            if (got.length < take) break;
        }
        const chargeIds = new Set<string>();
        for (const batch of chunk([...lineIds])) {
            const { data, error } = await supabase.from("financial_subsidy_claim_lines").select("id, charge_id").eq("org_id", ctx.orgId).in("id", batch);
            if (error) throw new Error(error.message);
            for (const l of (data ?? []) as Array<{ charge_id: string | null }>) if (l.charge_id) chargeIds.add(l.charge_id);
        }

        // 2. The posted childcare charges among them, located by Financials' rule and narrowed to scope.
        type Candidate = { id: string; customerId: string; siteLocationId: string | null; serviceDate: string | null; currencyCode: string; status: string; amountCents: number };
        const charges: Array<{ id: string; billable_source_type: string; billable_source_id: string; service_date: string | null; currency_code: string; status: string; amount_cents: number }> = [];
        for (const batch of chunk([...chargeIds])) {
            const { data, error } = await supabase
                .from("charges")
                .select("id, billable_source_type, billable_source_id, service_date, currency_code, status, amount_cents")
                .eq("org_id", ctx.orgId)
                .eq("status", "posted")
                .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
                .in("id", batch);
            if (error) throw new Error(error.message);
            charges.push(...((data ?? []) as typeof charges));
        }
        const agreements = await agreementsById(supabase, ctx.orgId, charges.filter((c) => c.billable_source_type === "enrollment_agreement").map((c) => c.billable_source_id));
        const candidates: Candidate[] = [];
        for (const c of charges) {
            const agreement = c.billable_source_type === "enrollment_agreement" ? agreements.get(c.billable_source_id) ?? null : null;
            const customerId = c.billable_source_type === "customer" ? c.billable_source_id : agreement?.customerId ?? null;
            const location = resolveFinancialWorkLocation({ billableSourceType: c.billable_source_type, agreementSiteLocationId: agreement?.siteLocationId ?? null });
            if (!customerId || !location || !isFinancialWorkVisible({ location, ...scope })) continue;
            candidates.push({ id: c.id, customerId, siteLocationId: location.siteLocationId, serviceDate: c.service_date, currencyCode: c.currency_code, status: c.status, amountCents: Number(c.amount_cents) });
        }

        // 3. Financials decides: its positions, under the Subsidy section's rule.
        const positions = candidates.length
            ? await (deps.readPositions ?? resolveCollectiblePositionsForCharges)(supabase, {
                  orgId: ctx.orgId,
                  charges: candidates.map((c) => ({ id: c.id, currencyCode: c.currencyCode, status: c.status, amountCents: c.amountCents })),
              })
            : new Map();
        type Group = { customerId: string; siteLocationId: string | null; items: Array<{ c: Candidate; states: string[] }> };
        const groups = new Map<string, Group>();
        for (const c of candidates) {
            const position = positions.get(c.id);
            if (!position || financialSubsidyReason({ position }) !== "variance") continue;
            const g = groups.get(c.customerId) ?? { customerId: c.customerId, siteLocationId: c.siteLocationId, items: [] };
            g.items.push({ c, states: position.explanation.openVarianceStates });
            groups.set(c.customerId, g);
        }
        const names = await householdNames(supabase, ctx.orgId, [...groups.keys()]);
        const rows: DomainProjectionRow[] = [...groups.values()].map((g) => {
            const ordered = [...g.items].sort((x, y) => String(x.c.serviceDate ?? "").localeCompare(String(y.c.serviceDate ?? "")) || x.c.id.localeCompare(y.c.id));
            const rep = ordered[0]!.c;
            const states = [...new Set(ordered.flatMap((i) => i.states))].filter((st) => st !== "matched").map((st) => VARIANCE_STATE_LABEL[st] ?? st);
            const reason = `Agency paid something else${states.length ? ` · ${states.join(", ")}` : ""}${ordered.length > 1 ? ` · ${plural(ordered.length, "charge")}` : ""}`;
            return {
                subject: { type: "household", id: g.customerId },
                label: names.get(g.customerId) ?? "Household",
                source: { kind: "charge", id: rep.id, count: ordered.length, statusLabel: reason },
                siteLocationId: g.siteLocationId,
                sortKey: String(rep.serviceDate ?? ""),
                detail: { reason, siteLocationId: g.siteLocationId, startDate: rep.serviceDate },
            };
        });
        return { ok: true, rows, truncated };
    } catch (e) {
        return { ok: false, code: "projection_unavailable", message: e instanceof Error ? e.message : String(e) };
    }
}

/** BP V2 S6A — the Payments due window: today and the next six calendar days. */
export const PAYMENTS_DUE_WINDOW_DAYS = 7;

const shortDate = (ymd: string) => {
    const d = new Date(`${ymd}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};
const addDaysYmd = (ymd: string, n: number) => {
    const d = new Date(`${ymd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};

/**
 * Payments due and Overdue payments — the Financials card's own Due / Past due classification across
 * households (`readAccountDuePositions`: the card's ledger, applied-money rule, `pastDueFor` /
 * `dueWithinFor`). Amounts are Financials'; this only formats them. One read serves both views.
 */
async function loadDueCohort(
    supabase: SupabaseClient,
    ctx: DomainProjectionContext,
    kind: "due" | "overdue",
    deps: Deps & { readDue?: typeof readAccountDuePositions; businessDate?: typeof fetchOrgBusinessDate },
): Promise<Loaded> {
    const gate = await financialScope(supabase, ctx, deps);
    if (!gate.ok) return { ok: false, code: "projection_forbidden", message: gate.message };
    if (!gate.scope) return { ok: true, rows: [], truncated: false };
    let today: string;
    try {
        // The card's business date. A failed read is unavailable here — a guessed date would move charges between Due and Past due.
        today = await (deps.businessDate ?? fetchOrgBusinessDate)(supabase, ctx.orgId);
    } catch (e) {
        return { ok: false, code: "projection_unavailable", message: e instanceof Error ? e.message : String(e) };
    }
    const windowEnd = addDaysYmd(today, PAYMENTS_DUE_WINDOW_DAYS - 1);
    const read = await (deps.readDue ?? readAccountDuePositions)(supabase, { orgId: ctx.orgId, today, windowEnd, ...gate.scope });
    if (read.state !== "ok") return { ok: false, code: "projection_unavailable", message: read.reason };
    const rows: DomainProjectionRow[] = [];
    for (const a of read.accounts) {
        if (kind === "overdue") {
            // The card shows Past due only when it is positive; so does this view.
            if (!a.pastDue || a.pastDue.amountCents <= 0 || a.pastDueChargeIds.length === 0) continue;
            const reason = `${money(a.pastDue.amountCents)} past due · since ${shortDate(a.pastDue.oldestDueDate)} · ${plural(a.pastDue.agingDays, "day")}`;
            rows.push({
                subject: { type: "household", id: a.customerId },
                label: a.householdName ?? "Household",
                source: { kind: "charge", id: a.pastDueChargeIds[0]!, count: a.pastDueChargeIds.length, statusLabel: reason },
                siteLocationId: a.siteLocationId,
                sortKey: a.pastDue.oldestDueDate,
                detail: { reason, siteLocationId: a.siteLocationId, endDate: a.pastDue.oldestDueDate, daysUntil: -a.pastDue.agingDays },
            });
        } else {
            if (!a.dueWithin || a.dueWithin.amountCents <= 0) continue;
            const span = a.dueWithin.nextDueDate === a.dueWithin.lastDueDate ? "" : ` · through ${shortDate(a.dueWithin.lastDueDate)}`;
            const when = a.dueWithin.nextDueDate === today ? "today" : shortDate(a.dueWithin.nextDueDate);
            const reason = `${money(a.dueWithin.amountCents)} due ${when}${span}`;
            rows.push({
                subject: { type: "household", id: a.customerId },
                label: a.householdName ?? "Household",
                source: { kind: "charge", id: a.dueWithin.chargeIds[0]!, count: a.dueWithin.chargeIds.length, statusLabel: reason },
                siteLocationId: a.siteLocationId,
                sortKey: a.dueWithin.nextDueDate,
                detail: { reason, siteLocationId: a.siteLocationId, startDate: a.dueWithin.nextDueDate, endDate: a.dueWithin.lastDueDate },
            });
        }
    }
    return { ok: true, rows, truncated: read.truncated };
}

/** Presentation of a Financials-decided amount (cents → "$12.50"); no arithmetic beyond the unit. */
function money(cents: number): string {
    return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export const loadPaymentsDue = (supabase: SupabaseClient, ctx: DomainProjectionContext, deps: Parameters<typeof loadDueCohort>[3] = {}) =>
    loadDueCohort(supabase, ctx, "due", deps);
export const loadOverduePayments = (supabase: SupabaseClient, ctx: DomainProjectionContext, deps: Parameters<typeof loadDueCohort>[3] = {}) =>
    loadDueCohort(supabase, ctx, "overdue", deps);

export const PAYMENTS_DUE_PROJECTION: DomainProjectionDefinition = {
    key: "payments_due",
    domain: "billing",
    label: "Payments due",
    subjectTypes: ["household"],
    load: (supabase, ctx) => loadPaymentsDue(supabase, ctx),
};

export const OVERDUE_PAYMENTS_PROJECTION: DomainProjectionDefinition = {
    key: "overdue_payments",
    domain: "billing",
    label: "Overdue payments",
    subjectTypes: ["household"],
    load: (supabase, ctx) => loadOverduePayments(supabase, ctx),
};

export const PAYMENT_EXCEPTIONS_PROJECTION: DomainProjectionDefinition = {
    key: "payment_exceptions",
    domain: "billing",
    label: "Payment exceptions",
    subjectTypes: ["household"],
    load: (supabase, ctx) => loadPaymentExceptions(supabase, ctx),
};

export const FUNDING_VARIANCES_PROJECTION: DomainProjectionDefinition = {
    key: "funding_variances",
    domain: "billing",
    label: "Funding variances",
    subjectTypes: ["household"],
    load: (supabase, ctx) => loadFundingVariances(supabase, ctx),
};

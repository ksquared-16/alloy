/**
 * FINANCIALS HISTORICAL DRAFT FIXTURE — ensure, verify and reset ONE historical template draft inside
 * the reserved namespace `financials-cert.alloy.invalid`, in an isolated certification environment.
 *
 * What it certifies is the W7 identity rule: a draft written from a charge TEMPLATE (before manual
 * Add Charge moved to the Catalog) stays that template's draft — edited under its template, never
 * re-pointed at a Catalog item that happens to carry the same name. So the fixture stands up
 * exactly that hazard: a household, its enrolled child, a template "Financials cert registration
 * fee", and an OFFERABLE Catalog item with the same name at a different price and account. The draft
 * is written by the product's own `writeTemplateDraftCharge`; verify reads it back through the
 * product's own `loadCatalogChargeOptions` and `resolveDraftEditIdentity`. Nothing here re-states
 * the rule.
 *
 * IDENTITY IS NEVER A NAME. Every row has a fixed id and an ownership marker (the household's
 * `external_source`/`external_id`, the child's reserved email, the template's key, the namespace
 * stamped in metadata). Ensure probes EVERY row before writing ANY: a row at a fixture id that does
 * not carry its marker, a second household bound to the namespace, or a same-named household,
 * template or Catalog item outside the fixture is an identity conflict — refused for the operator,
 * never adopted, never overwritten.
 *
 * RESET NEVER DELETES LEDGER. It removes only fixture-owned DRAFT charges, the household's OPEN
 * billing periods and the fixture's own configuration — at most RESET_LIMIT rows, counted before the
 * first delete. A posted/void charge on the fixture's sources, a fixture template used by any other
 * source, a payment, a journal entry or a closed period on the household refuses the whole reset:
 * that is history, and history is not a fixture's to remove.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadCatalogChargeOptions } from "@/lib/financials/catalogCharges/catalogChargeOffer";
import { draftIdentityFromCharge, resolveDraftEditIdentity } from "@/lib/financials/catalogCharges/draftEditIdentity";
import { writeTemplateDraftCharge } from "@/lib/financials/chargeLifecycle/chargeLifecycleService";

export const NAMESPACE = "financials-cert.alloy.invalid";
export const RESET_LIMIT = 50;
export const FIXTURE_KEY = "historical_draft_v1";

/** The certification tenant every financials live suite runs in. */
export const ORG = "00000000-0000-4000-8000-000000000001";
const P = "fc0d0000-0000-4000-8000-";
export const IDS = Object.freeze({
    customer: `${P}00000000c001`,
    site: `${P}00000000b001`,
    person: `${P}00000000e001`,
    member: `${P}00000000d001`,
    agreement: `${P}00000000a001`,
    calendarPolicy: `${P}00000000f101`,
    reviewPolicy: `${P}00000000f102`,
    glAccount: `${P}00000000f001`,
    glMapping: `${P}00000000f201`,
    revenueCategory: `${P}00000000e101`,
    sameNameProduct: `${P}00000000d101`,
    template: `${P}000000000101`,
});

export const HOUSEHOLD_NAME = "Financials Cert Historical Draft";
export const FEE_LABEL = "Financials cert registration fee";
export const TEMPLATE_KEY = "fincert_hist_registration";
export const CHILD_EMAIL = `child@${NAMESPACE}`;
const SITE_LABEL = "Financials cert site";
const GL_CODE = "FINCERT-4790";
const MAPPING_KEY = "fincert_hist_fee";
const RC_LABEL = "Financials cert fees";
export const TEMPLATE_AMOUNT_CENTS = 7500;
export const CATALOG_AMOUNT_CENTS = 9900;
/** The draft's service date — before the Catalog switch, which is what makes it historical. */
export const HISTORICAL_SERVICE_DATE = "2026-03-16";
export const BUSINESS_DATE = "2026-03-31";

type Row = Record<string, unknown>;
type Planned = { table: string; id: string; row: Row; owned: (r: Row) => boolean };

const ns = { cert_namespace: NAMESPACE, cert_fixture: FIXTURE_KEY };
const meta = (r: Row) => (r.metadata ?? {}) as Row;
const inOrg = (r: Row) => r.org_id === ORG;

/** Every fixture row, in insert order, with the marker that proves the row is the fixture's. */
export function plannedRows(): Planned[] {
    return [
        {
            table: "customers", id: IDS.customer,
            row: { org_id: ORG, name: HOUSEHOLD_NAME, customer_type: "household", external_source: NAMESPACE, external_id: FIXTURE_KEY, metadata: ns },
            owned: (r) => r.external_source === NAMESPACE && r.external_id === FIXTURE_KEY,
        },
        {
            table: "locations", id: IDS.site,
            row: { org_id: ORG, customer_id: IDS.customer, label: SITE_LABEL, location_type: "site", is_active: true },
            owned: (r) => r.customer_id === IDS.customer && r.label === SITE_LABEL,
        },
        {
            table: "persons", id: IDS.person,
            row: { org_id: ORG, first_name: "Cert", last_name: "Historical", email: CHILD_EMAIL },
            owned: (r) => r.email === CHILD_EMAIL,
        },
        {
            table: "customer_members", id: IDS.member,
            row: { org_id: ORG, customer_id: IDS.customer, person_id: IDS.person, display_name: "Cert Historical", relationship: "child", is_active: true },
            owned: (r) => r.customer_id === IDS.customer && r.person_id === IDS.person,
        },
        {
            table: "child_enrollment_agreements", id: IDS.agreement,
            row: {
                org_id: ORG, customer_id: IDS.customer, customer_member_id: IDS.member, person_id: IDS.person,
                site_location_id: IDS.site, status: "active", start_date: "2026-01-01",
            },
            owned: (r) => r.customer_id === IDS.customer && r.customer_member_id === IDS.member,
        },
        ...([
            ["calendarPolicy", "billing_calendar", { cadence: "monthly", anchor_on: null }],
            ["reviewPolicy", "posting_review", { required: false }],
        ] as const).map(([key, policy_type, value]) => ({
            table: "financial_policies", id: IDS[key],
            row: {
                org_id: ORG, scope_type: "customer", customer_id: IDS.customer, location_id: null, policy_type,
                is_active: true, effective_start: "2026-01-01", effective_end: null, value, metadata: ns,
            },
            owned: (r: Row) => r.customer_id === IDS.customer && r.policy_type === policy_type,
        })),
        {
            table: "gl_accounts", id: IDS.glAccount,
            row: { org_id: ORG, code: GL_CODE, name: "Financials cert fee revenue", type: "revenue", currency: "USD", is_active: true },
            owned: (r) => r.code === GL_CODE,
        },
        {
            table: "gl_account_mappings", id: IDS.glMapping,
            row: { org_id: ORG, key: MAPPING_KEY, gl_account_id: IDS.glAccount, is_active: true },
            owned: (r) => r.key === MAPPING_KEY && r.gl_account_id === IDS.glAccount,
        },
        {
            table: "commercial_revenue_categories", id: IDS.revenueCategory,
            row: { org_id: ORG, label: RC_LABEL, mapped_gl_account_id: IDS.glAccount, is_active: true },
            owned: (r) => r.label === RC_LABEL,
        },
        {
            /* The hazard: an OFFERABLE Catalog item with the template's exact name, at another price. */
            table: "commercial_products", id: IDS.sameNameProduct,
            row: {
                org_id: ORG, location_id: null, program_key: null, name: FEE_LABEL, commercial_type: "fee",
                amount_cents: CATALOG_AMOUNT_CENTS, cadence_key: null, revenue_category_id: IDS.revenueCategory,
                behavior: {}, is_active: true, metadata: ns,
            },
            owned: (r) => meta(r).cert_namespace === NAMESPACE,
        },
        {
            table: "financial_charge_templates", id: IDS.template,
            row: {
                org_id: ORG, template_key: TEMPLATE_KEY, label: FEE_LABEL, charge_category: "fee", trigger_type: "manual",
                amount_strategy: "fixed", amount_cents: TEMPLATE_AMOUNT_CENTS, currency_code: "USD", occurs_on_strategy: "now",
                billable_on_strategy: "immediate", review_required: false, is_active: true, effective_start: "2026-01-01",
                effective_end: null, metadata: ns,
            },
            owned: (r) => r.template_key === TEMPLATE_KEY && meta(r).cert_namespace === NAMESPACE,
        },
    ];
}

export type Check = { ok: boolean; check: string };
export type FixtureOutcome = {
    /** 0 ok · 1 failed · 3 identity conflict (operator decision). */
    exitCode: 0 | 1 | 3;
    checks: Check[];
    lines: string[];
};

/** The executor reads an identity conflict out of these words; keep them. */
function identityConflict(detail: string): FixtureOutcome {
    return { exitCode: 3, checks: [{ ok: false, check: `identity conflict — ${detail}` }], lines: [`refused: identity ${detail}`] };
}

async function rows(db: SupabaseClient, table: string, build: (q: any) => any): Promise<Row[]> {
    const { data, error } = await build(db.from(table).select("*"));
    if (error) throw new Error(`${table} read failed: ${String(error.message ?? error).slice(0, 160)}`);
    return (data ?? []) as Row[];
}

async function byId(db: SupabaseClient, table: string, id: string): Promise<Row | null> {
    return (await rows(db, table, (q) => q.eq("id", id)))[0] ?? null;
}

/** Same-named or namespace-bound rows that are NOT the fixture's — the ambiguity this never resolves by name. */
async function ambiguityProbe(db: SupabaseClient): Promise<string | null> {
    const other = (rs: Row[], id: string) => rs.filter((r) => r.id !== id);
    const bound = other(await rows(db, "customers", (q) => q.eq("org_id", ORG).eq("external_source", NAMESPACE)), IDS.customer);
    if (bound.length) return `ambiguous: ${bound.length} other household(s) are bound to ${NAMESPACE}`;
    const named = other(await rows(db, "customers", (q) => q.eq("org_id", ORG).eq("name", HOUSEHOLD_NAME)), IDS.customer);
    if (named.length) return `ambiguous: ${named.length} household(s) outside the fixture are named "${HOUSEHOLD_NAME}"`;
    const keyed = other(await rows(db, "financial_charge_templates", (q) => q.eq("org_id", ORG).eq("template_key", TEMPLATE_KEY)), IDS.template);
    if (keyed.length) return `ambiguous: ${keyed.length} other template(s) carry template_key ${TEMPLATE_KEY}`;
    const sameName = other(await rows(db, "commercial_products", (q) => q.eq("org_id", ORG).eq("name", FEE_LABEL)), IDS.sameNameProduct);
    if (sameName.length) return `ambiguous: ${sameName.length} Catalog item(s) outside the fixture are named "${FEE_LABEL}"`;
    return null;
}

async function fixtureDrafts(db: SupabaseClient): Promise<Row[]> {
    return rows(db, "charges", (q) => q.eq("org_id", ORG).eq("billable_source_id", IDS.agreement).eq("status", "draft"));
}

export async function ensureHistoricalDraft(db: SupabaseClient): Promise<FixtureOutcome> {
    if (!(await byId(db, "orgs", ORG))) return { exitCode: 1, checks: [{ ok: false, check: `certification org ${ORG} is absent` }], lines: [] };
    const ambiguous = await ambiguityProbe(db);
    if (ambiguous) return identityConflict(ambiguous);

    /* Probe every row before writing any: a conflict found halfway would leave half a fixture. */
    const plan = plannedRows();
    const missing: Planned[] = [];
    for (const p of plan) {
        const existing = await byId(db, p.table, p.id);
        if (!existing) missing.push(p);
        else if (!inOrg(existing) || !p.owned(existing)) return identityConflict(`${p.table} ${p.id} already exists and is not the fixture's`);
    }
    for (const p of missing) {
        const { error } = await db.from(p.table).insert({ id: p.id, ...p.row });
        if (error) return { exitCode: 1, checks: [{ ok: false, check: `seeding ${p.table}: ${String(error.message).slice(0, 160)}` }], lines: [] };
    }

    const written = await writeTemplateDraftCharge(db, ORG, {
        templateId: IDS.template,
        agreementId: IDS.agreement,
        billableSource: { type: "enrollment_agreement", id: IDS.agreement },
        operatorServiceDate: HISTORICAL_SERVICE_DATE,
        today: BUSINESS_DATE,
    });
    const lines = [`customer=${IDS.customer}`, `agreement=${IDS.agreement}`, `seeded ${missing.length} of ${plan.length} fixture row(s)`];
    if (written.status !== "created" && written.status !== "unchanged") {
        return { exitCode: 1, checks: [{ ok: false, check: `template draft not written: ${written.status}${"reason" in written ? ` (${written.reason})` : ""}` }], lines };
    }
    lines.push(`draft=${written.chargeId} ${written.status}`);
    const verified = await verifyHistoricalDraft(db);
    return { ...verified, lines: [...lines, ...verified.lines] };
}

export async function verifyHistoricalDraft(db: SupabaseClient): Promise<FixtureOutcome> {
    const checks: Check[] = [];
    const check = (ok: boolean, label: string) => {
        checks.push({ ok, check: label });
        return ok;
    };
    const household = await byId(db, "customers", IDS.customer);
    check(Boolean(household && inOrg(household) && plannedRows()[0].owned(household)), `household ${IDS.customer} is bound to ${NAMESPACE}`);
    check((await ambiguityProbe(db)) === null, "no same-named or namespace-bound identity outside the fixture");

    const drafts = await fixtureDrafts(db);
    check(drafts.length === 1, `exactly one historical draft on the fixture agreement (found ${drafts.length})`);
    const draft = drafts[0];
    if (draft) {
        const m = meta(draft);
        check(draft.charge_template_id === IDS.template, "the draft records its template id");
        check(m.source === "charge_template" && m.charge_template_key === TEMPLATE_KEY, "the draft records template provenance and key");
        check(m.catalog_item === undefined, "the draft carries no Catalog provenance");
        check(Number(draft.amount_cents) === TEMPLATE_AMOUNT_CENTS, `the draft is at the template's price (${TEMPLATE_AMOUNT_CENTS}), not the Catalog item's`);
        check(String(draft.service_date ?? draft.occurs_on ?? "") === HISTORICAL_SERVICE_DATE, `the draft is dated ${HISTORICAL_SERVICE_DATE}`);

        const catalogOptions = await loadCatalogChargeOptions(db, ORG, { asOf: BUSINESS_DATE, locationIds: [null, IDS.site] });
        const twin = catalogOptions.find((o) => o.id === IDS.sameNameProduct);
        check(twin?.availability === "offerable" && twin.label === FEE_LABEL, "the same-name Catalog item is offerable (the hazard is live)");
        const templates = await rows(db, "financial_charge_templates", (q) => q.eq("org_id", ORG).eq("id", IDS.template));
        const identity = resolveDraftEditIdentity(draftIdentityFromCharge(draft as never), {
            draftTemplates: templates.map((t) => ({ id: String(t.id), label: String(t.label), templateKey: String(t.template_key) })),
            catalogOptions,
        });
        check(identity?.source === "template" && identity.id === IDS.template, "the draft is edited under its template, not the same-name Catalog item");
    }
    const ledger = await ledgerRefusal(db);
    check(ledger === null, ledger ?? "no posted/void charge, payment, journal entry or closed period on the fixture");
    return { exitCode: checks.every((c) => c.ok) ? 0 : 1, checks, lines: [] };
}

/** Why removing the fixture would touch history — or null. Read-only. */
async function ledgerRefusal(db: SupabaseClient): Promise<string | null> {
    const sources: string[] = [IDS.agreement, IDS.customer];
    const nonDraft = (await rows(db, "charges", (q) => q.eq("org_id", ORG).in("billable_source_id", sources))).filter((c) => c.status !== "draft");
    if (nonDraft.length) return `${nonDraft.length} posted/void charge(s) on the fixture's sources are ledger`;
    const foreign = (await rows(db, "charges", (q) => q.eq("org_id", ORG).eq("charge_template_id", IDS.template)))
        .filter((c) => !sources.includes(String(c.billable_source_id)));
    if (foreign.length) return `${foreign.length} charge(s) outside the fixture use the fixture template`;
    for (const table of ["payments", "financial_journal_entries"]) {
        const found = await rows(db, table, (q) => q.eq("org_id", ORG).eq("customer_id", IDS.customer));
        if (found.length) return `${found.length} ${table} row(s) on the fixture household are ledger`;
    }
    const closed = (await rows(db, "financial_billing_periods", (q) => q.eq("org_id", ORG).eq("customer_id", IDS.customer)))
        .filter((p) => p.status !== "open");
    if (closed.length) return `${closed.length} closed billing period(s) on the fixture household are history`;
    return null;
}

/**
 * How many fixture rows exist — drafts, open periods and configuration — as `census count=<n>`.
 * Read-only; zero after a reset is the proof that the reset reached everything it owns. A
 * non-fixture row at a fixture id is an identity conflict, never counted.
 */
export async function censusHistoricalDraft(db: SupabaseClient): Promise<FixtureOutcome & { count: number | null }> {
    let count = 0;
    let household = false;
    for (const p of plannedRows()) {
        const existing = await byId(db, p.table, p.id);
        if (!existing) continue;
        if (!inOrg(existing) || !p.owned(existing)) {
            return { ...identityConflict(`${p.table} ${p.id} already exists and is not the fixture's`), count: null };
        }
        if (p.table === "customers") household = true;
        count += 1;
    }
    count += (await fixtureDrafts(db)).length;
    if (household) {
        count += (await rows(db, "financial_billing_periods", (q) => q.eq("org_id", ORG).eq("customer_id", IDS.customer)))
            .filter((r) => r.status === "open").length;
    }
    return { exitCode: 0, checks: [], lines: [`census count=${count}`], count };
}

export async function resetHistoricalDraft(db: SupabaseClient): Promise<FixtureOutcome & { removed: number }> {
    const done = (exitCode: 0 | 1 | 3, checks: Check[], removed: number) => ({
        exitCode, checks, removed, lines: [`reset namespace=${NAMESPACE} removed=${removed}`],
    });
    const plan = plannedRows();
    const present: Planned[] = [];
    for (const p of plan) {
        const existing = await byId(db, p.table, p.id);
        if (!existing) continue;
        if (!inOrg(existing) || !p.owned(existing)) {
            return done(3, [{ ok: false, check: `identity conflict — ${p.table} ${p.id} already exists and is not the fixture's; reset touches nothing` }], 0);
        }
        present.push(p);
    }
    const ledger = await ledgerRefusal(db);
    if (ledger) return done(1, [{ ok: false, check: `reset refused, nothing removed: ${ledger}` }], 0);

    const drafts = await fixtureDrafts(db);
    const periods = present.some((p) => p.table === "customers")
        ? (await rows(db, "financial_billing_periods", (q) => q.eq("org_id", ORG).eq("customer_id", IDS.customer))).filter((r) => r.status === "open")
        : [];
    const total = drafts.length + periods.length + present.length;
    if (total > RESET_LIMIT) return done(1, [{ ok: false, check: `reset refused, nothing removed: ${total} rows exceed the limit of ${RESET_LIMIT}` }], 0);

    let removed = 0;
    const remove = async (table: string, build: (q: any) => any) => {
        const { data, error } = await build(db.from(table).delete()).select("id");
        if (error) throw new Error(`${table} delete failed: ${String(error.message ?? error).slice(0, 160)}`);
        removed += ((data ?? []) as Row[]).length;
    };
    try {
        if (drafts.length) {
            await remove("charges", (q) => q.eq("org_id", ORG).eq("status", "draft").eq("billable_source_id", IDS.agreement).in("id", drafts.map((d) => d.id)));
        }
        if (periods.length) {
            await remove("financial_billing_periods", (q) => q.eq("org_id", ORG).eq("customer_id", IDS.customer).eq("status", "open").in("id", periods.map((p) => p.id)));
        }
        /* Dependents before what they reference: the reverse of insert order. */
        for (const p of [...present].reverse()) await remove(p.table, (q) => q.eq("org_id", ORG).eq("id", p.id));
    } catch (e) {
        return done(1, [{ ok: false, check: String((e as Error).message) }], removed);
    }
    return done(0, [{ ok: true, check: `removed ${removed} fixture row(s); no ledger touched` }], removed);
}

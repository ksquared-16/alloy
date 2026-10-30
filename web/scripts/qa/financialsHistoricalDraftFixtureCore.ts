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
 * IDENTITY IS NEVER A NAME. Every row has a fixed id and an ownership KEY — column equalities (the
 * household's `external_source`/`external_id`, the child's reserved email, the template's key, …)
 * that are checked in preflight AND re-applied as filters on that row's own delete. Ensure probes
 * EVERY row before writing ANY: a row at a fixture id that does not carry its key, a second
 * household bound to the namespace, or a row outside the fixture holding one of its unique or
 * logical names is an identity conflict — refused for the operator, never adopted, never overwritten.
 *
 * RESET NEVER DELETES LEDGER, AND NEVER RELIES ON A CASCADE. It removes only fixture-owned DRAFT
 * charges, the household's OPEN billing periods and the fixture's own rows — at most RESET_LIMIT,
 * counted before the first delete. It refuses the whole reset, removing nothing, when:
 *   · a posted/void charge, payment, journal entry or closed period touches the fixture, or the
 *     fixture template is used by any other source (ledger — not a fixture's to remove);
 *   · any row the fixture did not create hangs off a fixture row through an ON DELETE CASCADE
 *     foreign key (CASCADE_DEPENDENTS, read from supabase/migrations) — a delete would otherwise
 *     remove it silently and uncounted.
 * Every delete is filtered by id AND the row's ownership key and must return exactly what was
 * planned; the ledger is re-measured before the household's periods and rows go. A reset that stops
 * part-way reports the exact count it removed and says it is partial — never full cleanup.
 *
 * OUTPUT IS DIAGNOSTIC CODES, NOT BACKEND TEXT. Database and process messages can carry row values
 * or credentials, so none is ever placed in a check or line: a failure is a stable code, a table
 * name from this file, a count, and at most a well-formed five-character SQLSTATE.
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
export const GL_CODE = "FINCERT-4790";
export const MAPPING_KEY = "fincert_hist_fee";
export const RC_LABEL = "Financials cert fees";
export const TEMPLATE_AMOUNT_CENTS = 7500;
export const CATALOG_AMOUNT_CENTS = 9900;
/** The draft's service date — before the Catalog switch, which is what makes it historical. */
export const HISTORICAL_SERVICE_DATE = "2026-03-16";
export const BUSINESS_DATE = "2026-03-31";

type Row = Record<string, unknown>;
/** `key`: the column equalities that make a row the fixture's — checked in preflight, filtered on delete. */
type Planned = { table: string; id: string; row: Row; key: Record<string, string> };

const ns = { cert_namespace: NAMESPACE, cert_fixture: FIXTURE_KEY };
const meta = (r: Row) => (r.metadata ?? {}) as Row;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every fixture row, in insert order (reset deletes in reverse), with its ownership key. */
export function plannedRows(): Planned[] {
    return [
        {
            table: "customers", id: IDS.customer,
            row: { name: HOUSEHOLD_NAME, customer_type: "household", metadata: ns },
            key: { external_source: NAMESPACE, external_id: FIXTURE_KEY },
        },
        {
            table: "locations", id: IDS.site,
            row: { location_type: "site", is_active: true },
            key: { customer_id: IDS.customer, label: SITE_LABEL },
        },
        {
            table: "persons", id: IDS.person,
            row: { first_name: "Cert", last_name: "Historical" },
            key: { email: CHILD_EMAIL },
        },
        {
            table: "customer_members", id: IDS.member,
            row: { display_name: "Cert Historical", relationship: "child", is_active: true },
            key: { customer_id: IDS.customer, person_id: IDS.person },
        },
        {
            table: "child_enrollment_agreements", id: IDS.agreement,
            row: { person_id: IDS.person, site_location_id: IDS.site, status: "active", start_date: "2026-01-01" },
            key: { customer_id: IDS.customer, customer_member_id: IDS.member },
        },
        ...([
            ["calendarPolicy", "billing_calendar", { cadence: "monthly", anchor_on: null }],
            ["reviewPolicy", "posting_review", { required: false }],
        ] as const).map(([k, policy_type, value]) => ({
            table: "financial_policies", id: IDS[k],
            row: { scope_type: "customer", location_id: null, is_active: true, effective_start: "2026-01-01", effective_end: null, value, metadata: ns },
            key: { customer_id: IDS.customer, policy_type },
        })),
        {
            table: "gl_accounts", id: IDS.glAccount,
            row: { name: "Financials cert fee revenue", type: "revenue", currency: "USD", is_active: true },
            key: { code: GL_CODE },
        },
        {
            table: "gl_account_mappings", id: IDS.glMapping,
            row: { is_active: true },
            key: { key: MAPPING_KEY, gl_account_id: IDS.glAccount },
        },
        {
            table: "commercial_revenue_categories", id: IDS.revenueCategory,
            row: { mapped_gl_account_id: IDS.glAccount, is_active: true },
            key: { label: RC_LABEL },
        },
        {
            /* The hazard: an OFFERABLE Catalog item with the template's exact name, at another price. */
            table: "commercial_products", id: IDS.sameNameProduct,
            row: {
                location_id: null, program_key: null, commercial_type: "fee", amount_cents: CATALOG_AMOUNT_CENTS,
                cadence_key: null, behavior: {}, is_active: true, metadata: ns,
            },
            key: { name: FEE_LABEL, revenue_category_id: IDS.revenueCategory },
        },
        {
            table: "financial_charge_templates", id: IDS.template,
            row: {
                charge_category: "fee", trigger_type: "manual", amount_strategy: "fixed", amount_cents: TEMPLATE_AMOUNT_CENTS,
                currency_code: "USD", occurs_on_strategy: "now", billable_on_strategy: "immediate", review_required: false,
                is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: ns,
            },
            key: { template_key: TEMPLATE_KEY, label: FEE_LABEL },
        },
    ];
}

/** The row as inserted: org, id, ownership key and values. */
function insertRow(p: Planned): Row {
    return { id: p.id, org_id: ORG, ...p.row, ...p.key };
}

function owned(p: Planned, r: Row): boolean {
    return r.org_id === ORG && Object.entries(p.key).every(([c, v]) => r[c] === v);
}

/**
 * Rows that hang off a fixture row through ON DELETE CASCADE (supabase/migrations, 2026-10-30) and
 * that the fixture never creates. Any present means a delete would remove a row nobody counted.
 * Children the fixture DOES own under its parents (locations/customer_members/financial_policies
 * under the household) are checked as foreign siblings in `foreignSiblings` instead.
 */
export const CASCADE_DEPENDENTS: ReadonlyArray<{ table: string; column: string; parent: keyof typeof IDS | "draft" }> = Object.freeze([
    { table: "charge_line_items", column: "charge_id", parent: "draft" },
    { table: "commercial_policy_charge_exclusions", column: "charge_id", parent: "draft" },
    ...["child_attendance_events", "child_placements", "participation_change_attempts", "schedule_assignments"]
        .map((table) => ({ table, column: "enrollment_agreement_id", parent: "agreement" as const })),
    ...["child_safeguarding_restrictions", "child_safeguarding_screenings", "customer_member_contacts", "opportunity_customer_members", "person_child_relationships"]
        .map((table) => ({ table, column: "customer_member_id", parent: "member" as const })),
    ...["customer_member_contacts", "customer_persons", "customer_subscriptions", "customer_tags", "payment_autopay_arrangements", "person_child_relationships", "processing_participant_child_requests"]
        .map((table) => ({ table, column: "customer_id", parent: "customer" as const })),
    ...["customer_persons", "opportunity_persons", "person_child_relationships", "person_kiosk_codes", "person_locations"]
        .map((table) => ({ table, column: "person_id", parent: "person" as const })),
    { table: "person_relationships", column: "from_person_id", parent: "person" },
    { table: "person_relationships", column: "to_person_id", parent: "person" },
    ...([
        ["childcare_capacity_rules", "site_location_id"], ["childcare_capacity_rules", "room_location_id"],
        ["childcare_operating_windows", "site_location_id"], ["childcare_operating_windows", "room_location_id"],
        ["childcare_rate_plans", "site_location_id"], ["childcare_rate_plans", "room_location_id"],
        ["childcare_ratio_rules", "site_location_id"], ["childcare_ratio_rules", "room_location_id"],
        ["childcare_schedule_rules", "site_location_id"], ["childcare_schedule_rules", "room_location_id"],
        ["commercial_policies", "location_id"], ["commercial_tuition_rates", "location_id"],
        ["communication_identity_location_bindings", "location_id"], ["financial_policies", "location_id"],
        ["location_program_categories", "location_id"], ["location_tags", "location_id"], ["person_locations", "location_id"],
        ["schedule_patterns", "site_location_id"], ["tour_public_booking_links", "location_id"], ["user_site_access", "location_id"],
    ] as const).map(([table, column]) => ({ table, column, parent: "site" as const })),
]);

/* ── stable diagnostics ───────────────────────────────────────────────────────────────────────── */

export const FIXTURE_CODES = Object.freeze({
    READ_FAILED: "read_failed",
    SEED_FAILED: "seed_failed",
    DRAFT_NOT_WRITTEN: "draft_not_written",
    DRAFT_WRITE_FAILED: "draft_write_failed",
    DELETE_FAILED: "delete_failed",
    IDENTITY_CHANGED: "identity_changed_during_reset",
    LEDGER_APPEARED: "ledger_appeared_during_reset",
    ORG_ABSENT: "certification_org_absent",
});

/** A failure carrying only a code, a table from this file and a well-formed SQLSTATE — never a message. */
export class FixtureError extends Error {
    constructor(readonly code: string, readonly table: string | null = null, readonly sqlstate: string | null = null) {
        super(code);
    }
    get diagnostic(): string {
        return [this.code, this.table ? `table=${this.table}` : null, this.sqlstate ? `sqlstate=${this.sqlstate}` : null].filter(Boolean).join(" ");
    }
}

function sqlstateOf(error: unknown): string | null {
    const c = (error as { code?: unknown } | null)?.code;
    return typeof c === "string" && /^[0-9A-Z]{5}$/.test(c) ? c : null;
}

/** A reason token from the product's own vocabulary, or nothing. */
function safeToken(v: unknown): string | null {
    return typeof v === "string" && /^[a-z][a-z0-9_]{0,59}$/.test(v) ? v : null;
}

export type Check = { ok: boolean; check: string };
export type FixtureOutcome = {
    /** 0 ok · 1 failed · 3 identity conflict (operator decision). */
    exitCode: 0 | 1 | 3;
    checks: Check[];
    lines: string[];
};

const fail = (check: string): FixtureOutcome => ({ exitCode: 1, checks: [{ ok: false, check }], lines: [] });

/** The executor reads an identity conflict out of these words; keep them. */
function identityConflict(detail: string): FixtureOutcome {
    return { exitCode: 3, checks: [{ ok: false, check: `identity conflict — ${detail}` }], lines: [`refused: identity ${detail}`] };
}

async function rows(db: SupabaseClient, table: string, build: (q: any) => any, columns = "*"): Promise<Row[]> {
    let res: { data: unknown; error: unknown };
    try {
        res = await build(db.from(table).select(columns));
    } catch (e) {
        if (e instanceof FixtureError) throw e;
        throw new FixtureError(FIXTURE_CODES.READ_FAILED, table);
    }
    if (res.error) throw new FixtureError(FIXTURE_CODES.READ_FAILED, table, sqlstateOf(res.error));
    return (res.data ?? []) as Row[];
}

async function byId(db: SupabaseClient, table: string, id: string): Promise<Row | null> {
    return (await rows(db, table, (q) => q.eq("id", id)))[0] ?? null;
}

/** Rows outside the fixture that hold one of its unique or logical names — never resolved by name. */
async function ambiguityProbe(db: SupabaseClient): Promise<string | null> {
    const probes: Array<[string, string, string, string, string]> = [
        ["customers", "external_source", NAMESPACE, IDS.customer, `other household(s) are bound to ${NAMESPACE}`],
        ["customers", "name", HOUSEHOLD_NAME, IDS.customer, "household(s) outside the fixture carry its name"],
        ["financial_charge_templates", "template_key", TEMPLATE_KEY, IDS.template, "other template(s) carry its template_key"],
        ["commercial_products", "name", FEE_LABEL, IDS.sameNameProduct, "Catalog item(s) outside the fixture carry its name"],
        /* commercial_revenue_categories_org_label_unique (org_id, label) — a clash would fail the insert. */
        ["commercial_revenue_categories", "label", RC_LABEL, IDS.revenueCategory, "revenue categor(ies) outside the fixture carry its label"],
        ["gl_accounts", "code", GL_CODE, IDS.glAccount, "GL account(s) outside the fixture carry its code"],
        ["gl_account_mappings", "key", MAPPING_KEY, IDS.glMapping, "GL mapping(s) outside the fixture carry its key"],
        ["persons", "email", CHILD_EMAIL, IDS.person, "person(s) outside the fixture carry its reserved email"],
    ];
    for (const [table, column, value, id, what] of probes) {
        const scoped = table === "persons" ? (q: any) => q.eq(column, value) : (q: any) => q.eq("org_id", ORG).eq(column, value);
        const others = (await rows(db, table, scoped, "id")).filter((r) => r.id !== id);
        if (others.length) return `ambiguous: ${others.length} ${what}`;
    }
    return null;
}

async function fixtureDrafts(db: SupabaseClient): Promise<Row[]> {
    return rows(db, "charges", (q) => q.eq("org_id", ORG).eq("billable_source_id", IDS.agreement).eq("status", "draft"));
}

export async function ensureHistoricalDraft(db: SupabaseClient): Promise<FixtureOutcome> {
    if (!(await byId(db, "orgs", ORG))) return fail(`${FIXTURE_CODES.ORG_ABSENT} org=${ORG}`);
    const ambiguous = await ambiguityProbe(db);
    if (ambiguous) return identityConflict(ambiguous);

    /* Probe every row before writing any: a conflict found halfway would leave half a fixture. */
    const plan = plannedRows();
    const missing: Planned[] = [];
    for (const p of plan) {
        const existing = await byId(db, p.table, p.id);
        if (!existing) missing.push(p);
        else if (!owned(p, existing)) return identityConflict(`${p.table} ${p.id} already exists and is not the fixture's`);
    }
    let seeded = 0;
    for (const p of missing) {
        let error: unknown;
        try {
            ({ error } = await db.from(p.table).insert(insertRow(p)));
        } catch {
            error = {};
        }
        if (error) {
            const e = new FixtureError(FIXTURE_CODES.SEED_FAILED, p.table, sqlstateOf(error));
            return { ...fail(`${e.diagnostic} seeded_before_failure=${seeded}`), lines: [`seeded ${seeded} of ${plan.length} fixture row(s)`] };
        }
        seeded += 1;
    }

    const lines = [`customer=${IDS.customer}`, `agreement=${IDS.agreement}`, `seeded ${missing.length} of ${plan.length} fixture row(s)`];
    let written: Awaited<ReturnType<typeof writeTemplateDraftCharge>>;
    try {
        written = await writeTemplateDraftCharge(db, ORG, {
            templateId: IDS.template,
            agreementId: IDS.agreement,
            billableSource: { type: "enrollment_agreement", id: IDS.agreement },
            operatorServiceDate: HISTORICAL_SERVICE_DATE,
            today: BUSINESS_DATE,
        });
    } catch (e) {
        /* The product's error codes are its own vocabulary; its messages are not printed. */
        const code = safeToken((e as { code?: unknown })?.code);
        return { ...fail(`${FIXTURE_CODES.DRAFT_WRITE_FAILED}${code ? ` reason=${code}` : ""}`), lines };
    }
    if (written.status !== "created" && written.status !== "unchanged") {
        const reason = "reason" in written ? safeToken(written.reason) : null;
        return { ...fail(`${FIXTURE_CODES.DRAFT_NOT_WRITTEN} status=${written.status}${reason ? ` reason=${reason}` : ""}`), lines };
    }
    lines.push(`draft=${UUID_RE.test(written.chargeId) ? written.chargeId : "(id withheld)"} ${written.status}`);
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
    check(Boolean(household && owned(plannedRows()[0], household)), `household ${IDS.customer} is bound to ${NAMESPACE}`);
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
    const nonDraft = (await rows(db, "charges", (q) => q.eq("org_id", ORG).in("billable_source_id", sources), "id, status"))
        .filter((c) => c.status !== "draft");
    if (nonDraft.length) return `${nonDraft.length} posted/void charge(s) on the fixture's sources are ledger`;
    const foreign = (await rows(db, "charges", (q) => q.eq("org_id", ORG).eq("charge_template_id", IDS.template), "id, billable_source_id"))
        .filter((c) => !sources.includes(String(c.billable_source_id)));
    if (foreign.length) return `${foreign.length} charge(s) outside the fixture use the fixture template`;
    for (const table of ["payments", "financial_journal_entries"]) {
        const found = await rows(db, table, (q) => q.eq("org_id", ORG).eq("customer_id", IDS.customer), "id");
        if (found.length) return `${found.length} ${table} row(s) on the fixture household are ledger`;
    }
    const closed = (await rows(db, "financial_billing_periods", (q) => q.eq("org_id", ORG).eq("customer_id", IDS.customer), "id, status"))
        .filter((p) => p.status !== "open");
    if (closed.length) return `${closed.length} closed billing period(s) on the fixture household are history`;
    return null;
}

/** Rows the fixture did not create that a delete of its rows would cascade into — or null. */
async function cascadeRefusal(db: SupabaseClient, draftIds: string[]): Promise<string | null> {
    for (const d of CASCADE_DEPENDENTS) {
        const parents = d.parent === "draft" ? draftIds : [IDS[d.parent]];
        if (!parents.length) continue;
        const found = await rows(db, d.table, (q) => q.in(d.column, parents), "id");
        if (found.length) return `${found.length} ${d.table} row(s) depend on the fixture by ${d.column} (ON DELETE CASCADE)`;
    }
    /* Foreign siblings: rows under the household the fixture does not own would cascade with it. */
    const mine = new Set<string>(plannedRows().map((p) => p.id));
    for (const table of ["locations", "customer_members", "financial_policies", "child_enrollment_agreements"]) {
        const foreign = (await rows(db, table, (q) => q.eq("customer_id", IDS.customer), "id")).filter((r) => !mine.has(String(r.id)));
        if (foreign.length) return `${foreign.length} ${table} row(s) under the fixture household are not the fixture's`;
    }
    return null;
}

export type ResetOutcome = FixtureOutcome & { removed: number; complete: boolean };

export async function resetHistoricalDraft(db: SupabaseClient): Promise<ResetOutcome> {
    let removed = 0;
    const result = (exitCode: 0 | 1 | 3, check: Check, complete: boolean): ResetOutcome => ({
        exitCode, checks: [check], removed, complete, lines: [`reset namespace=${NAMESPACE} removed=${removed}`],
    });
    const refused = (exitCode: 1 | 3, why: string) => result(exitCode, { ok: false, check: `reset refused, nothing removed: ${why}` }, false);

    /* ── preflight: identity, ledger, cascade, bound — all before the first delete ── */
    const plan = plannedRows();
    const present: Planned[] = [];
    for (const p of plan) {
        const existing = await byId(db, p.table, p.id);
        if (!existing) continue;
        if (!owned(p, existing)) return refused(3, `identity conflict — ${p.table} ${p.id} already exists and is not the fixture's`);
        present.push(p);
    }
    const ledger = await ledgerRefusal(db);
    if (ledger) return refused(1, ledger);
    const drafts = await fixtureDrafts(db);
    const foreignDrafts = drafts.filter((d) => d.charge_template_id !== IDS.template);
    if (foreignDrafts.length) return refused(1, `${foreignDrafts.length} draft(s) on the fixture agreement were not written from the fixture template`);
    const draftIds = drafts.map((d) => String(d.id));
    const cascade = await cascadeRefusal(db, draftIds);
    if (cascade) return refused(1, cascade);
    const household = present.some((p) => p.table === "customers");
    const periods = household
        ? (await rows(db, "financial_billing_periods", (q) => q.eq("org_id", ORG).eq("customer_id", IDS.customer), "id, status")).filter((r) => r.status === "open")
        : [];
    const total = drafts.length + periods.length + present.length;
    if (total > RESET_LIMIT) return refused(1, `${total} rows exceed the limit of ${RESET_LIMIT}`);

    /* ── delete: each filtered by id AND ownership, each returning exactly what was planned ── */
    const partial = (code: string, table: string | null, sqlstate: string | null = null) => {
        const e = new FixtureError(code, table, sqlstate);
        return result(1, { ok: false, check: `reset PARTIAL: ${e.diagnostic} removed=${removed} of ${total} — the fixture is NOT fully removed` }, false);
    };
    const remove = async (table: string, ids: string[], build: (q: any) => any): Promise<ResetOutcome | null> => {
        let res: { data: unknown; error: unknown };
        try {
            res = await build(db.from(table).delete().eq("org_id", ORG).in("id", ids)).select("id");
        } catch {
            return partial(FIXTURE_CODES.DELETE_FAILED, table);
        }
        if (res.error) return partial(FIXTURE_CODES.DELETE_FAILED, table, sqlstateOf(res.error));
        const got = ((res.data ?? []) as Row[]).map((r) => String(r.id));
        removed += got.length;
        if (got.length !== ids.length || got.some((id) => !ids.includes(id))) return partial(FIXTURE_CODES.IDENTITY_CHANGED, table);
        return null;
    };
    try {
        if (draftIds.length) {
            const r = await remove("charges", draftIds, (q) => q.eq("status", "draft").eq("billable_source_id", IDS.agreement).eq("charge_template_id", IDS.template));
            if (r) return r;
        }
        /* History can appear between preflight and here; re-measure before the household goes. */
        if (await ledgerRefusal(db)) return partial(FIXTURE_CODES.LEDGER_APPEARED, null);
        if (periods.length) {
            const r = await remove("financial_billing_periods", periods.map((p) => String(p.id)), (q) => q.eq("customer_id", IDS.customer).eq("status", "open"));
            if (r) return r;
        }
        /* Dependents before what they reference: the reverse of insert order, each by its own key. */
        for (const p of [...present].reverse()) {
            const r = await remove(p.table, [p.id], (q) => Object.entries(p.key).reduce((acc, [c, v]) => acc.eq(c, v), q));
            if (r) return r;
        }
    } catch (e) {
        /* A read inside the delete phase (the ledger re-check) failed: what was removed is exact. */
        return partial(e instanceof FixtureError ? e.code : FIXTURE_CODES.READ_FAILED, e instanceof FixtureError ? e.table : null);
    }
    return result(0, { ok: true, check: `reset complete: removed ${removed} of ${total} fixture row(s); no ledger touched` }, true);
}

/**
 * How many fixture rows exist — drafts, open periods and fixture rows — as `census count=<n>`.
 * Read-only; zero after a reset is the proof that the reset reached everything it owns. A
 * non-fixture row at a fixture id is an identity conflict, never counted.
 */
export async function censusHistoricalDraft(db: SupabaseClient): Promise<FixtureOutcome & { count: number | null }> {
    let count = 0;
    let household = false;
    for (const p of plannedRows()) {
        const existing = await byId(db, p.table, p.id);
        if (!existing) continue;
        if (!owned(p, existing)) return { ...identityConflict(`${p.table} ${p.id} already exists and is not the fixture's`), count: null };
        if (p.table === "customers") household = true;
        count += 1;
    }
    count += (await fixtureDrafts(db)).length;
    if (household) {
        count += (await rows(db, "financial_billing_periods", (q) => q.eq("org_id", ORG).eq("customer_id", IDS.customer), "id, status"))
            .filter((r) => r.status === "open").length;
    }
    return { exitCode: 0, checks: [], lines: [`census count=${count}`], count };
}

/**
 * THE CATALOG LIVE SUITE'S PROOF REPORT — what the pinned isolated suite measured about the rows it owns, and the
 * contract the runner (`financialsIsolatedTests.mjs`) holds it to. Pure: no IO, no clock.
 *
 * The suite (`tests/financials/live/catalogAddCharge.live.test.ts`) writes ONE JSON file to the path the runner
 * hands it (`FIN_ISOLATED_PROOF_FILE`, inside the runner's private temp dir), measured by exact owned identity —
 * the run's fixed ids and its own agreements, in the bound org — never by name, prefix scan or org-wide count:
 *
 *   owned_before   every owned table counted BEFORE the first write (a fresh run owns nothing: all 0)
 *   owned_after    every owned table counted AFTER the suite's own cleanup
 *   retained       the posted charges and their journal entries that remain (immutable; disposition is the
 *                  environment's retirement, never a delete)
 *   billing_periods the customer's commercial periods (`financial_billing_periods` for the run's own customer, in
 *                  the bound org): `before` (a fresh run has none) and every period AFTER cleanup by id, key and
 *                  status. Every charge writer materialises the current and next period of its placement date
 *                  (`materializeCustomerBillingPeriods`); the suite places charges on 2026-11-05 and on the org's
 *                  business date, so 2–4 open periods remain, are never deleted (posted charges are bound to them)
 *                  and are retired with the environment. A report without this census is INCOMPLETE, not a pass.
 *
 * The runner prints only approved identifiers: the run prefix, table names, counts, and the retained rows' UUIDs
 * (synthetic, created by this run in an isolated environment — no customer data, no credential).
 */

export const CATALOG_PROOF_SCHEMA = "financials.catalog_live_proof.v2";
export const CATALOG_PROOF_FILE_NAME = "proof.json";

/** Every table the suite owns rows in, and how many of its rows must remain after its own cleanup. */
export const OWNED_AFTER_EXPECTED = Object.freeze({
    customers: 1,
    locations: 2,
    persons: 2,
    customer_members: 2,
    child_enrollment_agreements: 2,
    financial_policies: 2,
    gl_accounts: 3,
    gl_account_mappings: 1,
    commercial_revenue_categories: 3,
    /* Removed by the suite's afterAll. */
    commercial_products: 0,
    financial_charge_templates: 0,
    charges_draft: 0,
    /* Retained: one single-child catalog post + two from the multi-child command. */
    charges_nondraft: 3,
    financial_journal_entries: 3,
});
export const OWNED_TABLES = Object.freeze(Object.keys(OWNED_AFTER_EXPECTED));
export const RETAINED_POSTED_EXPECTED = OWNED_AFTER_EXPECTED.charges_nondraft;
/** Retained commercial periods of the run's customer: current+next of each of the suite's two placement dates. */
export const RETAINED_BILLING_PERIODS = Object.freeze({ min: 2, max: 4, status: "open" });

export const PROOF_PROBLEMS = Object.freeze({
    ABSENT: "proof_report_absent",
    INVALID: "proof_report_invalid",
    BEFORE_NOT_EMPTY: "proof_owned_before_not_empty",
    AFTER_MISMATCH: "proof_owned_after_mismatch",
    RETAINED_MISMATCH: "proof_retained_mismatch",
    BILLING_CENSUS_INCOMPLETE: "proof_billing_periods_census_incomplete",
    BILLING_BEFORE_NOT_EMPTY: "proof_billing_periods_before_not_empty",
    BILLING_OUT_OF_BOUNDS: "proof_billing_periods_out_of_bounds",
    BILLING_NOT_OPEN: "proof_billing_periods_not_open",
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PREFIX_RE = /^ca7a[0-9a-f]{4}$/;
const isCount = (n) => Number.isInteger(n) && n >= 0 && n <= 1_000_000;
const PERIOD_KEY_RE = /^[A-Za-z0-9:_-]{1,40}$/;
const PERIOD_STATUS_RE = /^[a-z_]{1,20}$/;

/** The census is complete only when `before` is a count and every retained period is a well-formed, unique row. */
function billingCensusShape(b) {
    if (!b || typeof b !== "object" || Array.isArray(b) || !isCount(b.before) || !Array.isArray(b.after) || b.after.length > 20) return false;
    const ok = b.after.every((p) => p && typeof p === "object" && UUID_RE.test(String(p.id || "")) && PERIOD_KEY_RE.test(String(p.period_key || "")) && PERIOD_STATUS_RE.test(String(p.status || "")));
    return ok && new Set(b.after.map((p) => p.id)).size === b.after.length && new Set(b.after.map((p) => p.period_key)).size === b.after.length;
}

function countsShape(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    const keys = Object.keys(obj);
    return keys.length === OWNED_TABLES.length && OWNED_TABLES.every((t) => isCount(obj[t]));
}

/**
 * Judge a parsed proof report. → `{ ok, checks: {ok, check}[], problems: string[] }`. Any shape the contract does
 * not name is INVALID as a whole: nothing from it is printed.
 */
export function judgeCatalogProof(report) {
    const X = PROOF_PROBLEMS;
    if (report == null) return { ok: false, checks: [], problems: [X.ABSENT] };
    const r = report;
    const shapeOk = r && typeof r === "object" && !Array.isArray(r)
        && r.schema === CATALOG_PROOF_SCHEMA
        && PREFIX_RE.test(String(r.run_prefix || ""))
        && countsShape(r.owned_before) && countsShape(r.owned_after)
        && typeof r.accounting_period_created === "boolean"
        && Array.isArray(r.retained) && r.retained.length <= 20
        && r.retained.every((x) => x && typeof x === "object" && UUID_RE.test(String(x.charge_id || "")) && UUID_RE.test(String(x.journal_entry_id || "")));
    if (!shapeOk) return { ok: false, checks: [], problems: [X.INVALID] };
    if (!billingCensusShape(r.billing_periods)) return { ok: false, checks: [], problems: [X.BILLING_CENSUS_INCOMPLETE] };

    const checks = [];
    const problems = [];
    const nonEmptyBefore = OWNED_TABLES.filter((t) => r.owned_before[t] !== 0);
    if (nonEmptyBefore.length) {
        checks.push({ ok: false, check: `proof run_prefix=${r.run_prefix} owned_before_nonzero tables=${nonEmptyBefore.join(",")}` });
        problems.push(X.BEFORE_NOT_EMPTY);
    } else {
        checks.push({ ok: true, check: `proof run_prefix=${r.run_prefix} owned_before=0 tables=${OWNED_TABLES.length}` });
    }
    const wrongAfter = OWNED_TABLES.filter((t) => r.owned_after[t] !== OWNED_AFTER_EXPECTED[t]);
    if (wrongAfter.length) {
        checks.push({ ok: false, check: `proof owned_after mismatch tables=${wrongAfter.join(",")}` });
        problems.push(X.AFTER_MISMATCH);
    } else {
        checks.push({ ok: true, check: `proof owned_after exact tables=${OWNED_TABLES.length} nondraft=${r.owned_after.charges_nondraft} journal=${r.owned_after.financial_journal_entries} drafts=0` });
    }
    const charges = new Set(r.retained.map((x) => x.charge_id));
    const journals = new Set(r.retained.map((x) => x.journal_entry_id));
    if (r.retained.length !== RETAINED_POSTED_EXPECTED || charges.size !== r.retained.length || journals.size !== r.retained.length) {
        checks.push({ ok: false, check: `proof retained count=${r.retained.length} expected=${RETAINED_POSTED_EXPECTED}` });
        problems.push(X.RETAINED_MISMATCH);
    } else {
        for (const x of r.retained) checks.push({ ok: true, check: `retained posted_charge=${x.charge_id} journal_entry=${x.journal_entry_id}` });
    }
    const periods = r.billing_periods;
    const B = RETAINED_BILLING_PERIODS;
    if (periods.before !== 0) {
        checks.push({ ok: false, check: `proof billing_periods before=${periods.before} expected=0` });
        problems.push(X.BILLING_BEFORE_NOT_EMPTY);
    }
    if (periods.after.length < B.min || periods.after.length > B.max) {
        checks.push({ ok: false, check: `proof billing_periods retained=${periods.after.length} expected=${B.min}-${B.max}` });
        problems.push(X.BILLING_OUT_OF_BOUNDS);
    }
    const notOpen = periods.after.filter((p) => p.status !== B.status);
    if (notOpen.length) {
        checks.push({ ok: false, check: `proof billing_periods not_open=${notOpen.length}` });
        problems.push(X.BILLING_NOT_OPEN);
    }
    if (periods.before === 0 && !notOpen.length && periods.after.length >= B.min && periods.after.length <= B.max) {
        for (const p of periods.after) checks.push({ ok: true, check: `retained billing_period=${p.id} key=${p.period_key} status=${p.status}` });
    }
    checks.push({ ok: true, check: `proof accounting_period created=${r.accounting_period_created}` });
    return { ok: problems.length === 0, checks, problems };
}

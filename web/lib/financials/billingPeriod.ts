/**
 * WHICH BILLING PERIOD DOES A PIECE OF FINANCIAL ACTIVITY BELONG TO?
 *
 * ── NO NEW COLUMN, BECAUSE THE PERIOD IS ALREADY DERIVABLE ──
 *
 * `charges` carries four canonical dates and they answer different questions:
 *
 *   occurs_on    the date the chargeable EVENT happens (template `occurs_on_strategy`)
 *   billable_on  the date the charge BECOMES BILLABLE (template `billable_on_strategy`)
 *   due_date     the date payment is due
 *   posted_at    the moment posting happened
 *
 * The period is `billable_on`. That is the column whose own comment defines the lifecycle — "a draft
 * with billable_on in the future is scheduled" — so it is already the platform's answer to "when does
 * this charge belong to the operator's billing work". Adding a `billing_period` column would be a
 * second answer to a question the schema settles, and the two would drift the first time a template
 * changed its `billable_on_strategy`.
 *
 * `posted_at` was the tempting alternative and is wrong: it records when someone pressed post, so a
 * September charge posted late in October would move to October and silently change a closed period's
 * totals. `occurs_on` is wrong for the opposite reason — a field trip that occurs in September but
 * bills next cycle belongs to the cycle that bills it, which is exactly what `billable_on` says.
 *
 * ── THE FALLBACK CHAIN IS ORDERED BY AUTHORITY, NOT BY CONVENIENCE ──
 *
 * `billable_on` is nullable: the column arrived after `createChildcareDraftCharge` was written, so
 * charges created through that path carry none. Rather than drop those rows out of every period — an
 * invisible omission that would make the card's totals disagree with the table — the chain falls back
 * through progressively weaker but still canonical dates, and every fallback is REPORTED so a caller
 * can say which rows are placed by inference rather than by declaration.
 */

/**
 * ── A BILLING PERIOD IS A COMMERCIAL INTERVAL, NOT A DISPLAY STRING ────────────────────────────
 *
 * It was `YYYY-MM` and nothing else, and that was wrong for every organisation not billing monthly.
 * Cadence is configurable — `weekly | biweekly | monthly | annual | daily | hourly | per_session`,
 * seeded per org as `commercial_billing_cadence` — while period IDENTITY was always a calendar
 * month. The consequence was not a cosmetic one: because the tuition occurrence key is
 * `cev:tuition:<assignmentId>:<periodKey>`, a WEEKLY organisation generating a four-week span
 * produced ONE charge, and the second, third and fourth weeks collided with the first on the
 * `consumption_events` unique index. The idempotency guarantee worked perfectly — over the wrong
 * grain — so the failure was silent and looked like correct deduplication.
 *
 * The repair is not `YYYY-WW`. Weeks are not ISO weeks here: a commercial period is tiled from the
 * organisation's own ANCHOR (the accepted term's effective start), so one tenant's week may run
 * Monday–Sunday and another's Thursday–Wednesday, and neither is wrong.
 *
 * ── THE KEY CARRIES THE BOUNDARIES ────────────────────────────────────────────────────────────
 *
 * `YYYY-MM` is KEPT, exactly, for monthly. It is what every existing charge's resolution key, every
 * stored `service_period`, every ledger grouping and every `<input type="month">` already holds, and
 * changing it would restate history. A monthly commercial period IS the calendar month.
 *
 * Every other cadence is `<start>~<end>`, both inclusive `YYYY-MM-DD`. Self-describing, sorts by
 * start date, parses without knowing the cadence that produced it, and needs no lookup table — so
 * there is no second period store and no row to fall out of sync with the interval it names.
 */
export type BillingPeriodKey = string; // "YYYY-MM" (monthly) | "YYYY-MM-DD~YYYY-MM-DD"

/**
 * The cadences that define a commercial INTERVAL.
 *
 * `hourly` and `per_session` are deliberately absent: they price a unit of usage, not a period, so
 * asking them for period boundaries is a category error. A caller billing those bills occurrences,
 * not periods, and `isPeriodBillableCadence` is how it finds out before assuming.
 */
export type BillingCadence = "daily" | "weekly" | "biweekly" | "monthly" | "annual";

const CADENCE_STRIDE_DAYS: Partial<Record<BillingCadence, number>> = {
    daily: 1,
    weekly: 7,
    biweekly: 14,
};

export function isPeriodBillableCadence(cadence: string): cadence is BillingCadence {
    return cadence === "daily" || cadence === "weekly" || cadence === "biweekly"
        || cadence === "monthly" || cadence === "annual";
}

/**
 * ── WHAT A CONFIGURED BILLING FREQUENCY ACTUALLY RECURS AS ─────────────────────────────────────
 *
 * There are two levels and they are joined by a string. LEVEL 1 is CONFIGURATION: an organisation
 * authors billing frequencies in the `billing_cadences` option set, and the authoring surface mints
 * the key from whatever label was typed. LEVEL 2 is DERIVATION: this module turns an accepted term's
 * cadence key plus the agreement anchor into actual period INSTANCES — and it only knows the five
 * cadences above.
 *
 * Nothing validates the join. An organisation can author "Fortnightly", attach it to a tuition
 * plan, have an assignment accept a term on it, and then get silence: no billing period on the
 * assignment, and a generation run that correctly refuses — `isPeriodBillableCadence` is false — but
 * says so only in a run outcome nobody was watching. The money is safe; the configuration surface
 * was the thing that never mentioned it.
 *
 * This states, from the derivation authority itself, what the configured frequency will produce.
 * It invents no cadence and decides no policy: it reports what `billingPeriodFor` already does, so
 * the configuration screen cannot drift from the periods the platform actually derives.
 */
export type BillingRecurrence = {
    /** True when this cadence has an interval the platform can derive periods for. */
    billable: boolean;
    /** How it recurs, in operator words — or why it produces no periods. */
    recurrence: string;
};

export function billingRecurrenceFor(cadenceKey: string): BillingRecurrence {
    const cadence = (cadenceKey ?? "").trim();
    if (!isPeriodBillableCadence(cadence)) {
        return {
            billable: false,
            recurrence: "No recurring periods — nothing is billed on a schedule for this frequency",
        };
    }
    if (cadence === "monthly") return { billable: true, recurrence: "Each calendar month" };
    if (cadence === "annual") return { billable: true, recurrence: "Each year from the agreement anchor" };
    const stride = CADENCE_STRIDE_DAYS[cadence] ?? 7;
    return {
        billable: true,
        recurrence:
            stride === 1 ?
                "Every day from the agreement anchor"
            :   `Every ${stride} days from the agreement anchor`,
    };
}

export type BillingPeriod = {
    key: BillingPeriodKey;
    /** Inclusive first day, `YYYY-MM-DD`. */
    start: string;
    /** Inclusive last day, `YYYY-MM-DD`. */
    end: string;
    /** "August 2026" */
    label: string;
};

/** Which date placed a row in its period — declared, or inferred and which way. */
export type BillingPeriodBasis = "billable_on" | "occurs_on" | "service_date" | "created_at" | "unplaceable";

export type BillingPeriodPlacement = {
    key: BillingPeriodKey | null;
    basis: BillingPeriodBasis;
};

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
] as const;

function ymdOf(value: unknown): string | null {
    const raw = value != null ? String(value).trim() : "";
    if (!raw) return null;
    // Accepts both `YYYY-MM-DD` dates and ISO timestamps; both start with the calendar date.
    const head = raw.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
}

/** The period a single financial row belongs to, and the date that decided it. */
export function placeInBillingPeriod(
    row: {
        billable_on?: unknown;
        occurs_on?: unknown;
        service_date?: unknown;
        created_at?: unknown;
    },
    /*
     * The organisation's commercial grain, when the caller knows it.
     *
     * OPTIONAL AND MONTHLY BY DEFAULT, deliberately. Every existing caller groups by calendar month
     * and must keep doing so — a ledger that silently regrouped would restate history it did not
     * generate. A caller that knows its org bills weekly passes the cadence and anchor, and the
     * ledger then groups on the same boundaries generation used.
     */
    grain?: { cadence: BillingCadence; anchor: string } | null,
): BillingPeriodPlacement {
    const place = (ymd: string): string =>
        grain && grain.cadence !== "monthly"
            ? billingPeriodFor(grain.cadence, grain.anchor, ymd).key
            : ymd.slice(0, 7);
    const declared = ymdOf(row.billable_on);
    if (declared) return { key: place(declared), basis: "billable_on" };
    const occurs = ymdOf(row.occurs_on);
    if (occurs) return { key: place(occurs), basis: "occurs_on" };
    const service = ymdOf(row.service_date);
    if (service) return { key: place(service), basis: "service_date" };
    const created = ymdOf(row.created_at);
    if (created) return { key: place(created), basis: "created_at" };
    // A row with no usable date is REPORTED, never quietly dropped into the current period.
    return { key: null, basis: "unplaceable" };
}

const MONTHS_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Whole days between two `YYYY-MM-DD`, inclusive of both ends. */
function inclusiveDays(startYmd: string, endYmd: string): number {
    const a = Date.parse(`${startYmd}T00:00:00Z`);
    const b = Date.parse(`${endYmd}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.round((b - a) / 86_400_000) + 1;
}

function addDaysYmd(ymd: string, days: number): string {
    return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * THE OPERATOR'S NAME FOR AN INTERVAL, derived from its BOUNDARIES — never from its key.
 *
 * "Sep 21–27, 2026" when it stays in one month, "Sep 21–Oct 4, 2026" when it crosses one, and the
 * year written on both sides only when the period crosses a new year, because "Dec 28–Jan 3, 2027"
 * would silently date the December end to the wrong year.
 */
function intervalLabel(start: string, end: string): string {
    const [sy, sm, sd] = start.split("-").map(Number);
    const [ey, em, ed] = end.split("-").map(Number);
    const sMon = MONTHS_SHORT[sm - 1] ?? String(sm);
    const eMon = MONTHS_SHORT[em - 1] ?? String(em);
    if (sy !== ey) return `${sMon} ${sd}, ${sy}–${eMon} ${ed}, ${ey}`;
    if (sm !== em) return `${sMon} ${sd}–${eMon} ${ed}, ${ey}`;
    return `${sMon} ${sd}–${ed}, ${ey}`;
}

/** Is this key the calendar-month form? */
function isMonthKey(key: string): boolean {
    return /^\d{4}-\d{2}$/.test(key);
}

/**
 * The interval a key names — both forms, without being told which.
 *
 * An UNPARSEABLE key is returned as a zero-width period carrying the key as its own label rather
 * than being guessed at. A period this function does not recognise is a fact about the data, and
 * renaming it would hide that.
 */
export function billingPeriodFromKey(key: BillingPeriodKey): BillingPeriod {
    if (isMonthKey(key)) {
        const [yearRaw, monthRaw] = key.split("-");
        const year = Number(yearRaw);
        const month = Number(monthRaw);
        const start = `${key}-01`;
        // Day 0 of the following month is the last day of this one — no month-length table, and
        // February is correct in leap years without a special case.
        const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
        return { key, start, end, label: `${MONTHS[month - 1] ?? key} ${year}` };
    }
    const m = /^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (m) {
        const [, start, end] = m;
        return { key, start: start!, end: end!, label: intervalLabel(start!, end!) };
    }
    return { key, start: key, end: key, label: key };
}

/** The identity of an interval. Monthly keeps `YYYY-MM`; everything else carries its boundaries. */
export function billingPeriodKeyFor(cadence: BillingCadence, start: string, end: string): BillingPeriodKey {
    return cadence === "monthly" ? start.slice(0, 7) : `${start}~${end}`;
}

/**
 * THE COMMERCIAL PERIOD CONTAINING A DAY, for a cadence anchored where the organisation anchors it.
 *
 * ── WHY THE ANCHOR, AND NOT A CALENDAR ────────────────────────────────────────────────────────
 *
 * A weekly period is not an ISO week. It is "the week this agreement bills on", tiled from the
 * accepted term's effective start, so one tenant's week runs Mon–Sun and another's Thu–Wed and
 * neither is wrong. Deriving it from a calendar would impose a boundary no customer agreed to, and
 * would move every family's period the first time somebody changed the calendar.
 *
 * MONTHLY ignores the anchor deliberately: a monthly commercial period IS the calendar month. That
 * is existing doctrine, it is what every stored `YYYY-MM` already means, and anchoring it would
 * restate history.
 *
 * Tiling is arithmetic on whole days, computed in both directions from the anchor, so a date BEFORE
 * the anchor lands in a negative-index period rather than falling outside every period.
 */
export function billingPeriodFor(
    cadence: BillingCadence,
    anchorYmd: string,
    containingYmd: string,
): BillingPeriod {
    if (cadence === "monthly") return billingPeriodFromKey(containingYmd.slice(0, 7));

    if (cadence === "annual") {
        const [ay, am, ad] = anchorYmd.split("-").map(Number);
        const [cy] = containingYmd.split("-").map(Number);
        // Which anniversary block the day falls in — the anniversary itself opens the next one.
        let index = cy! - ay!;
        const anniversaryThisYear = `${String(cy).padStart(4, "0")}-${String(am).padStart(2, "0")}-${String(ad).padStart(2, "0")}`;
        if (containingYmd < anniversaryThisYear) index -= 1;
        const start = `${String(ay! + index).padStart(4, "0")}-${String(am).padStart(2, "0")}-${String(ad).padStart(2, "0")}`;
        const nextStart = `${String(ay! + index + 1).padStart(4, "0")}-${String(am).padStart(2, "0")}-${String(ad).padStart(2, "0")}`;
        const end = addDaysYmd(nextStart, -1);
        return { key: billingPeriodKeyFor(cadence, start, end), start, end, label: intervalLabel(start, end) };
    }

    const stride = CADENCE_STRIDE_DAYS[cadence] ?? 7;
    const offset = inclusiveDays(anchorYmd, containingYmd) - 1; // days from anchor, signed
    const index = Math.floor(offset / stride);
    const start = addDaysYmd(anchorYmd, index * stride);
    const end = addDaysYmd(start, stride - 1);
    return { key: billingPeriodKeyFor(cadence, start, end), start, end, label: intervalLabel(start, end) };
}

/**
 * Every commercial period that overlaps `[fromYmd, toYmd]`, in order.
 *
 * This is what a generation RUN bills: a weekly organisation asked for September gets the four or
 * five weekly periods that touch it, each one its own obligation with its own identity, rather than
 * one September. Bounded at 750 periods so a malformed span cannot spin.
 */
export function billingPeriodsBetween(
    cadence: BillingCadence,
    anchorYmd: string,
    fromYmd: string,
    toYmd: string,
): BillingPeriod[] {
    const out: BillingPeriod[] = [];
    if (toYmd < fromYmd) return out;
    let cursor = billingPeriodFor(cadence, anchorYmd, fromYmd);
    for (let guard = 0; guard < 750; guard += 1) {
        if (cursor.start > toYmd) break;
        out.push(cursor);
        const next = billingPeriodFor(cadence, anchorYmd, addDaysYmd(cursor.end, 1));
        if (next.start <= cursor.start) break; // never advance backwards
        cursor = next;
    }
    return out;
}

/**
 * THE OPERATOR'S NAME FOR A BILLING PERIOD — "September 2026", never "2026-09".
 *
 * `YYYY-MM` is the period's IDENTITY: it is what the reader groups by, what a filter carries, what
 * an `<input type="month">` holds, and it must not change. It is not the period's NAME. A dated
 * identifier printed where a human label belongs is the same doctrine violation as a raw ISO date
 * on a ledger row — `docs/system/typography-and-presentation-doctrine.md` forbids both — and it had
 * leaked into four places: the ledger's period filter, the Adjustments line on the detail card, the
 * Charges list's row context and the bulk-generation result.
 *
 * One authority, so a fifth surface cannot invent a fifth spelling. An unparseable key is returned
 * UNCHANGED rather than guessed at: a period this function does not recognise is a fact about the
 * data, and quietly renaming it would hide that.
 *
 * NOT for accounting periods. Those carry a configured name of their own and follow it once a
 * surface exists to show them — see `lib/financials/accountingPeriod.ts`.
 */
export function billingPeriodLabel(key: string | null | undefined): string {
    const raw = typeof key === "string" ? key.trim() : "";
    if (!raw) return raw;
    // Both forms, and an unrecognised key comes back unchanged through `billingPeriodFromKey`.
    return billingPeriodFromKey(raw).label;
}

/**
 * THE PERIOD AN ASSIGNMENT IS IN, AND THE ONE AFTER IT — a READ, for a surface to state.
 *
 * ── WHY THIS LIVES HERE ──────────────────────────────────────────────────────────────────────
 *
 * A billing period is DERIVED: accepted term + cadence + the agreement anchor. The Assignment
 * Tuition card owns the accepted cadence and could not say which period the assignment was in,
 * which left three operator questions unanswered on the one surface that should know them. The
 * answer is a read presentation, and the calculation belongs beside the other period functions —
 * a component that worked out its own boundaries would be a second period model.
 *
 * ── WHAT IT REFUSES ──────────────────────────────────────────────────────────────────────────
 *
 * No accepted term, no cadence with an interval, or a term that has already ended → `null`. A
 * surface must not fabricate a period for an assignment that has no commercial cadence, and a
 * usage-priced cadence has no interval to state.
 *
 * This is NOT the accounting period. That is attributed at write time against the accounting
 * calendar and is a different question with a different owner.
 */
export function acceptedTermBillingPeriods(
    term: { cadenceKey?: string | null; effectiveStart?: string | null; effectiveEnd?: string | null } | null | undefined,
    todayYmd: string,
): { current: BillingPeriod; next: BillingPeriod } | null {
    const cadence = (term?.cadenceKey ?? "").trim();
    const anchor = (term?.effectiveStart ?? "").trim();
    if (!term || !anchor || !isPeriodBillableCadence(cadence)) return null;

    /*
     * BEFORE IT BEGINS, THE FIRST PERIOD IS THE ANSWER. A term accepted for next month should say
     * which period it starts in rather than describing a period it does not cover.
     */
    const from = todayYmd < anchor ? anchor : todayYmd;
    const end = (term.effectiveEnd ?? "").trim();
    if (end && end < from) return null;

    const current = billingPeriodFor(cadence, anchor, from);
    const next = billingPeriodFor(cadence, anchor, addDaysYmd(current.end, 1));
    return { current, next };
}

/** The period a given day falls in. */
export function billingPeriodForDate(ymd: string): BillingPeriod {
    return billingPeriodFromKey(ymd.slice(0, 7));
}

/**
 * How many days the period contains, inclusive of both ends.
 *
 * Here rather than at each call site for the reason `reductionPeriod` already
 * gives about month bounds: "the resolver, the applier and the certification
 * must agree about what September is, and three copies of 'last day of the
 * month' is how they stop agreeing." A period's LENGTH is the same kind of fact,
 * and it is the denominator of every prorated amount — so a second opinion about
 * it is a second opinion about money.
 */
export function billingPeriodDays(period: BillingPeriod): number {
    const a = Date.parse(`${period.start}T00:00:00Z`);
    const b = Date.parse(`${period.end}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.round((b - a) / 86_400_000) + 1;
}

/** Newest first — the order every period-grouped surface reads in. */
export function sortBillingPeriodKeysDescending(keys: Iterable<BillingPeriodKey>): BillingPeriodKey[] {
    return [...new Set(keys)].sort((a, b) => b.localeCompare(a));
}

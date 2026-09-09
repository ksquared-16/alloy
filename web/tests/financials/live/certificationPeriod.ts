/**
 * A BILLING PERIOD THIS RUN OWNS.
 *
 * The live Financials suites generate tuition into a hardcoded period key and then act on what came
 * out — post it, pay it, reverse it. That works exactly once. On the next run against the same
 * certification tenant the generator correctly produces nothing, because the obligation for that
 * period already exists and is now posted; posted childcare charges are immutable and MUST NOT be
 * deleted to make a test convenient, so the period cannot be handed back.
 *
 * The suites then fail with signatures that read like product regressions and are not: "expected 2
 * drafts, got 1", "applying 70000 would over-pay — only 30000 outstanding", "Thread 7 produced a
 * draft to post: expected undefined to be truthy". Certification confirmed this is not Thread 8C:
 * the identical failures reproduce with the shared modules reverted to `origin/staging`.
 *
 * So each run takes a period nobody has billed yet. The far-future window is deliberate — it can
 * never overlap a real accounting period or a fixture one — and the value is stable for the whole
 * run, so a suite's own tests still agree with each other about which period they are working in.
 */
/*
 * Near enough to be a period the product will actually bill, far enough never to collide with a real
 * accounting period or with the fixed periods the older suites still pin (2026–2033). A window
 * decades out was tried first and generation correctly declined it: billing a period twenty-seven
 * years ahead is not something the product should agree to, and a certification that needs it to
 * would be certifying the wrong thing.
 */
const EPOCH_YEAR = 2044;
const WINDOW_MONTHS = 12 * 400;

/*
 * Drawn ONCE, at module load, and never from the clock.
 *
 * Reading the clock per call looked equivalent and was not: a run that crossed a minute boundary
 * changed period halfway through, so a payment recorded under one key was looked up under another
 * and the suite failed differently on every attempt. Pinning it to the minute then failed the other
 * way — two runs inside the same minute shared a period and collided exactly as before.
 *
 * Stable within a run is the whole requirement; distinct from the last run is the other half.
 *
 * The window is deliberately enormous. A ten-year one was tried and ran out: this tenant accumulates
 * immutable money and never gives a period back, so every campaign permanently consumes slots, and
 * collisions came back as failures that looked like regressions. Certification confirmed the product
 * will bill a period at the far end of this range, so there is no reason to be frugal with it.
 */
const RUN_BASE = Date.now() % WINDOW_MONTHS;

/** A distinct `YYYY-MM` per run, fixed for the life of the run. */
export function runPeriodKey(offsetMonths = 0): string {
    const idx = (RUN_BASE + offsetMonths) % WINDOW_MONTHS;
    const year = EPOCH_YEAR + Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
}

/** A run-scoped idempotency key, so a fixed one cannot hand back the previous run's money. */
export function runKey(name: string): string {
    return `${runPeriodKey()}:${name}`;
}

/**
 * A subject this run owns, as 8 hex characters.
 *
 * Some suites cannot move to an unbilled period: their assertions read workspace surfaces that
 * window on today, so an obligation dated centuries out is correctly invisible to them. Those suites
 * isolate on the SUBJECT instead — a fresh agreement each run, billed in the ordinary current
 * period — which is the same idea applied to the other axis.
 */
export function runHex(): string {
    return RUN_SALT;
}

const RUN_SALT = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");

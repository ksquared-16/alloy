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
const EPOCH_YEAR = 2034;
const WINDOW_MONTHS = 12 * 6;

/** A distinct `YYYY-MM` per run, stable within it. */
export function runPeriodKey(offsetMonths = 0): string {
    const minutes = Math.floor(Date.now() / 60_000);
    const idx = (minutes + offsetMonths) % WINDOW_MONTHS;
    const year = EPOCH_YEAR + Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
}

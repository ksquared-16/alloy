/**
 * ASSIGNMENT TUITION ESTABLISHES THE CANONICAL TERM.
 *
 * ── WHAT WAS TRUE BEFORE ──────────────────────────────────────────────────────────────────────
 *
 * Selecting tuition during Assignment posted to `/api/admin/enrollment/assignment-quote`, which
 * records an ESTIMATE on the process instance. It writes no `enrollment_pricing_terms` row and
 * never did — its own header says so. So an operator could price an assignment, see a figure, and
 * have agreed nothing: recurring generation bills from the accepted term, and there wasn't one.
 *
 * The snapshot is kept. It serves workflow projection and is not financial truth.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const CARD = "components/admin/focusPanel/cards/SchedulingCard.tsx";
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("the write goes through the registered pricing authority", () => {
    const card = src(CARD);

    it("accepts through enrollment.pricing.accept", () => {
        expect(card).toContain('"enrollment.pricing.accept"');
        expect(card).toContain("/api/admin/actions/execute");
    });

    it("overrides through enrollment.pricing.override", () => {
        expect(card).toContain('"enrollment.pricing.override"');
    });

    it("creates no second writer and no assignment-owned price", () => {
        const code = strip(card);
        expect(code, "no direct term write").not.toMatch(/enrollment_pricing_terms/);
        expect(code, "the browser authors no money").not.toMatch(/amount_cents:\s*[A-Za-z0-9_.]/);
    });

    it("sends the resolution the operator was shown, not a fresh one", () => {
        /* The service refuses a commit whose resolution has moved; that only works if the key travels. */
        expect(card).toContain("resolution_key: view.resolutionKey");
        expect(card).toContain("entity_id: view.opportunityCustomerMemberId");
    });

    it("an unknown selection is refused, never resolved to the recommendation", () => {
        const fn = card.slice(card.indexOf("async function acceptAssignmentTuition"));
        const body = fn.slice(0, fn.indexOf("async function persistAssignmentQuote"));
        expect(body).toContain("view.applicable.find((o) => o.sourceId === selected)");
        expect(body).toContain("no longer applies to this assignment");
        expect(body, "no silent fallback").not.toMatch(/\?\?\s*view\.recommended/);
    });

    it("an override carries its reason, and only when it is one", () => {
        expect(card).toContain("override_reason: overrideReason.trim()");
        expect(card).toContain("isOverridingSelection");
        /* "Override" is choosing another authored option — never a typed price. */
        expect(strip(card), "no free-form price entry").not.toMatch(/name="amount"|placeholder="\$/);
    });
});

describe("the snapshot is kept, and is not the price", () => {
    const card = src(CARD);

    it("still records the workflow estimate", () => {
        expect(card).toContain("/api/admin/enrollment/assignment-quote");
    });

    it("the canonical act runs as well, not instead", () => {
        /*
         * SLICED TO save()'s OWN BODY. This first read from `async function save()` to the end of
         * the file, which contains `async function settleTuition()` — so the lock matched the
         * DEFINITION and stayed green when both call sites were deleted. A planted defect caught
         * the lock rather than the code. The window now ends where save() does.
         */
        const from = card.indexOf("async function save()");
        const body = card.slice(from, card.indexOf("if (roomPicking) {", from));
        expect(body).toMatch(/await persistAssignmentQuote\(\)/);
        expect(body, "the canonical act is CALLED, not merely defined").toMatch(/await settleTuition\(\)/);
        /* Both paths: the secondary-assignment branch and the primary one. */
        expect((body.match(/await settleTuition\(\)/g) ?? []).length, "every save path settles tuition").toBe(2);
    });

    it("the snapshot route still writes no term", () => {
        const route = src("app/api/admin/enrollment/assignment-quote/route.ts");
        expect(route).toContain('from("process_instances")');
        expect(route).not.toContain("acceptEnrollmentPricingTerm");
    });
});

describe("partial completion is reported, not rolled back", () => {
    const card = src(CARD);

    it("a tuition refusal leaves the assignment alone", () => {
        const fn = card.slice(card.indexOf("async function settleTuition"));
        const body = fn.slice(0, fn.indexOf("async function refreshPricingView"));
        expect(body).toContain("needs_attention");
        expect(body, "nothing is undone").not.toMatch(/delete|rollback|revert/i);
    });

    it("says so where the operator is", () => {
        expect(card).toContain("Assignment saved · tuition needs attention");
        expect(card).toContain('data-assignment-tuition-outcome');
    });

    it("re-reads persisted truth rather than trusting the dropdown", () => {
        expect(card).toContain("await refreshPricingView()");
        const readback = card.slice(card.indexOf("data-assignment-accepted-term"));
        expect(readback.slice(0, 900), "the figure comes from the term").toContain("pricingView.accepted.amountCents");
    });
});

describe("the assignment states its commercial period, derived", () => {
    const card = src(CARD);

    it("derives through the one authority, with no local arithmetic", () => {
        expect(card).toContain("acceptedTermBillingPeriods(");
        const code = strip(card);
        expect(code, "no hand-rolled period maths").not.toMatch(/setDate\(|86_?400_?000|\* 7 \* 24/);
    });

    it("no accepted term means no period", () => {
        /* Sliced to the memo's own body rather than a character window — the indentation here
           is deep enough that a fixed window cuts the branch this asserts. */
        const at = card.indexOf("const acceptedPeriods = useMemo");
        const memo = card.slice(at, card.indexOf("[pricingView],", at));
        expect(memo).toContain("pricingView?.accepted");
        expect(memo, "the absent branch answers null").toContain(": null");
    });

    it("names the frequency and both periods", () => {
        expect(card).toContain("data-assignment-billing-frequency");
        expect(card).toContain("data-assignment-billing-period");
        expect(card).toContain("data-assignment-next-billing-period");
    });
});

describe("a moved assignment does not silently reprice", () => {
    it("shows review instead of replacing the term", () => {
        const card = src(CARD);
        expect(card).toContain("acceptedIsStale");
        expect(card).toContain("Tuition needs review");
        expect(card).toContain('data-assignment-tuition-review="true"');
    });
});

describe("pricing is not responsibility", () => {
    it("the tuition path touches no arrangement", () => {
        const card = strip(src(CARD));
        const fn = card.slice(card.indexOf("async function acceptAssignmentTuition"), card.indexOf("async function persistAssignmentQuote"));
        expect(fn).not.toMatch(/configure_responsibility|arrangement|responsible_party/i);
    });
});

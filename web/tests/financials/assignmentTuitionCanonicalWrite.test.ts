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
        // The browser never sets a bare amount. A custom tuition travels ONLY as the override's
        // `custom_amount_cents`, which the authority permissions, reasons and records.
        expect(code, "no bare amount").not.toMatch(/[^_]amount_cents:\s*[A-Za-z0-9_.]/);
        expect(code).toContain("custom_amount_cents: customRateCents");
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
        expect(body, "or an additional site rate — still a real authored one").toContain(
            "view.additional.find((o) => o.sourceId === selected)",
        );
        expect(body).toContain("no longer applies to this assignment");
        expect(body, "no silent fallback").not.toMatch(/\?\?\s*view\.recommended/);
    });

    it("an override carries its reason, and only when it is one", () => {
        expect(card).toContain("override_reason: overrideReason.trim()");
        expect(card).toContain("isOverridingSelection");
        /*
         * A custom amount exists, and it is an override: it marks the selection as one, so it
         * cannot be saved without a reason, and it is sent beside an authored rate, never alone.
         */
        expect(card).toContain("isTuitionOverride(displayView, offeringId.trim(), customRateOn)");
        // A primary Save still cannot carry an override without its reason; a secondary commits no tuition.
        expect(card).toContain("(createAsSecondary || !isOverridingSelection || Boolean(overrideReason.trim()))");
    });

    it("a secondary save never touches the child's tuition: no draft, no quote, no accept, no tuition region", () => {
        expect(card).toContain('if (!opportunityId || child.kind !== "child" || createAsSecondary) return;');
        expect(card).toContain("createAsSecondary ? Promise.resolve() : settleTuitionAfterSave()");
        expect(card).toContain("opportunityId && !createAsSecondary ? (");
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
        /* Both paths: the secondary-assignment branch and the primary one. */
        expect((body.match(/await finishAfterWrite\(\)/g) ?? []).length, "every save path settles tuition").toBe(2);
        // The follow-ups — quote snapshot, tuition (re-read THEN commit), card re-read — run together,
        // and the editor closes only after ALL of them answered (no optimistic success).
        const fin = card.slice(card.indexOf("async function finishAfterWrite"));
        const finBody = fin.slice(0, fin.indexOf("async function save()"));
        expect(finBody).toContain("await Promise.all([");
        expect(finBody).toMatch(/persistAssignmentQuote\(\)/);
        expect(finBody, "the canonical act is CALLED, not merely defined").toContain("settleTuitionAfterSave()");
        expect(finBody.indexOf("await onSaved("), "close only after all answered").toBeGreaterThan(finBody.indexOf("await Promise.all(["));
        // The preview's resolution is tried first; the SERVER re-resolves the saved assignment and
        // refuses `stale_resolution` if it moved — only then is the view re-read and the commit retried.
        const fn = card.slice(card.indexOf("async function settleTuitionAfterSave"));
        const after = fn.slice(0, fn.indexOf("async function save()"));
        expect(after).toContain("const preview = draftView ?? pricingView;");
        expect(after).toContain("await settleTuition(preview, { rereadAfter: false });");
        expect(after).toContain('refused?.code === "stale_resolution"');
        expect(after).toContain("const fresh = await refreshPricingView();");
        expect(after).toContain("await settleTuition(fresh, { rereadAfter: false });");
        // A successful accept on Save marks the shared view stale (no request) rather than leaving it.
        expect(card).toContain("else if (opportunityId) invalidateFinancialConfig(opportunityId);");
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

describe("every applicable rate is listed, the recommendation first and preselected", () => {
    const card = src(CARD);

    it("hides no option behind a disclosure", () => {
        expect(card).not.toContain('data-assignment-tuition-expand="true"');
        const select = card.slice(card.indexOf("<select\n                                id={`assignment-tuition-embed-"));
        expect(select.slice(0, 200)).not.toContain("hidden=");
    });

    it("names the recommendation inside the list, first, and only when the resolver named one", () => {
        // Behaviour is pinned in assignmentTuitionChoices.test.ts; here, that the card uses it.
        expect(card).toContain("tuitionChoicesFor(displayView, showAdditionalRates)");
    });

    it("a tie is an ordinary choice — listed, nothing preselected, no warning", () => {
        // Equally eligible rates are valid choices, not an error state: no red tie banner.
        expect(card).not.toContain('data-assignment-tuition-ambiguous="true"');
        expect(card).not.toContain("configured options apply equally");
    });

    it("accepting the recommendation needs no expansion", () => {
        /* The default CHOICE is the resolver's answer; the action still decides. */
        // The rule itself is pinned in assignmentTuitionChoices.test.ts (reconcileTuitionSelection):
        // a still-offered choice stays; an automatic one follows the recommendation; an operator's
        // invalidated choice is cleared and named. Here: the card applies that rule.
        expect(card).toContain("reconcileTuitionSelection({");
        expect(card).toContain("operatorChose: operatorChoseRef.current,");
    });
});

describe("tuition can be settled without saving a schedule", () => {
    const card = src(CARD);

    it("offers its own commit", () => {
        /*
         * MEASURED: the only commit here saves the SCHEDULE and stays disabled until a new one is
         * complete — days, a start, a room. An assignment already saved, whose term had gone
         * stale, showed "Tuition needs review · choose the recommendation, another option, or
         * override" and offered no way to choose anything.
         */
        expect(card).toContain("data-assignment-tuition-commit");
        expect(card).toContain("void settleTuition()");
    });

    it("appears only when there is something to settle", () => {
        const at = card.indexOf("const canSettleTuitionAlone");
        const body = card.slice(at, card.indexOf("/* An override is a selection", at));
        expect(body).toContain("acceptedIsStale === true");
        expect(body, "or a selection that is not the accepted term").toContain("pricingView?.accepted?.source?.id");
    });

    it("an override cannot be committed without its reason", () => {
        const at = card.indexOf("data-assignment-tuition-commit");
        const btn = card.slice(Math.max(0, at - 500), at);
        expect(btn).toContain("isOverridingSelection && !overrideReason.trim()");
    });

    it("settling tuition touches no schedule field", () => {
        const at = card.indexOf("async function settleTuition");
        const body = card.slice(at, card.indexOf("async function refreshPricingView", at));
        for (const f of ["setDays(", "setStart(", "setRoomId(", "setArrive(", "setDepart("]) {
            expect(body, `settleTuition must not ${f}`).not.toContain(f);
        }
    });
});

describe("resolving a review supersedes rather than overwrites", () => {
    const card = src(CARD);

    it("states the intent to supersede only when a term stands", () => {
        /*
         * A live term on the same effective date makes the service refuse with
         * `term_already_accepted` unless the caller says it means to replace it. That refusal is
         * right: re-accepting the identical decision is idempotent, but a DIFFERENT decision
         * silently overwriting a standing agreement would not be.
         */
        expect(card).toContain("supersede: Boolean(view.accepted)");
    });

    it("the service closes the old term rather than editing it", () => {
        const svc = src("lib/enrollment/pricing/enrollmentPricingTermsService.ts");
        expect(svc).toContain("supersedes_term_id: live?.id ?? null");
        expect(svc).toMatch(/superseded_at: new Date\(\)\.toISOString\(\)/);
    });

    it("a refusal reaches the operator as words", () => {
        /* `error` is a structured object here; rendering it straight printed "[object Object]". */
        const fn = card.slice(card.indexOf("async function acceptAssignmentTuition"));
        const body = fn.slice(0, fn.indexOf("async function settleTuition"));
        expect(body).toContain("const say = (v: unknown)");
        expect(body, "objects are unwrapped, not stringified").toContain("o.message");
        expect(body).toContain("json.blockers?.map");
    });
});

describe("the commit re-resolves the way the view did", () => {
    it("sends no cadence filter, because the view had none", () => {
        /*
         * THE REAL CAUSE, after a wrong diagnosis. `assignmentResolutionKey` hashes
         * `cad:${facts.cadenceKey}` along with the config version and the other facts. The view a
         * choice comes from resolves with NO cadence constraint — `facts.cadenceKey` is null — so
         * sending the chosen option's cadence made the service re-resolve against DIFFERENT facts,
         * produce a different key, and answer `stale_resolution` for every accept and override:
         * "This assignment has changed since the tuition was resolved", about an assignment that
         * had not changed at all.
         *
         * I first blamed the opportunity-wide catalog export and changed it. The measured config
         * version did not move, which disproved it, and that change was reverted rather than left
         * in as an unjustified edit to a certified path.
         */
        const card = src(CARD);
        const fn = card.slice(card.indexOf("async function acceptAssignmentTuition"));
        const payload = fn.slice(fn.indexOf("payload: {"), fn.indexOf("}),", fn.indexOf("payload: {")));
        expect(payload, "the resolution the operator saw").toContain("resolution_key: view.resolutionKey");
        expect(payload, "and no fact the view did not resolve under").not.toMatch(/cadence_key:/);
    });

    it("the key hashes the cadence, which is why sending one was fatal", () => {
        const res = readFileSync(join(ROOT, "lib/commercial/execution/evaluate/resolveOptions.ts"), "utf8");
        const key = res.slice(res.indexOf("export function assignmentResolutionKey"), res.indexOf("/** Days a week"));
        expect(key).toContain("cad:${facts.cadenceKey");
        expect(key).toContain("v:${configVersion}");
    });
});

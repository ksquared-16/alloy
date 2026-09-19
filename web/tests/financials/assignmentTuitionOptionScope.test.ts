/**
 * THE PRICE OFFERED MUST BELONG TO THE ASSIGNMENT BEING PRICED.
 *
 * ── THE DEFECT, MEASURED ──────────────────────────────────────────────────────────────────────
 *
 * Editing Certa's assignment on the mounted product offered two tuition options:
 *
 *     Best match — Certa Certhouse: $185.00/weekly
 *     Certb Certhouse: $1,450.00/monthly
 *
 * while the canonical view for Certa's assignment carried `applicable: ["$185.00/weekly"]` — one
 * option. The list was built from `FinancialConfigApiResponse.enrollments`, which is one row per
 * assignment across the whole OPPORTUNITY, sorted so the row whose `childLabel` contained the
 * child's display name floated to the top. Every sibling's price stayed selectable underneath.
 *
 * ── WHY IT IS WORSE THAN CONFUSING ────────────────────────────────────────────────────────────
 *
 * `POST /api/admin/enrollment/assignment-quote` resolves the selection as
 *
 *     view.applicable.find(o => o.sourceId === selectedSourceId) ?? view.recommended
 *
 * so a source id that is not applicable to THIS assignment falls through to the recommendation.
 * Choosing the sibling's $1,450.00/monthly for Certa would have silently recorded Certa's
 * $185.00/weekly instead — an explicit operator choice discarded without a message, on the control
 * that sets a family's price.
 *
 * ── WHAT IS LOCKED ────────────────────────────────────────────────────────────────────────────
 *
 * Not the labels. That the options come from the per-assignment canonical view matched by member
 * id, that no sibling row can reach the list, and that the name-substring ranking is gone.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const CARD = "components/admin/focusPanel/cards/SchedulingCard.tsx";

/** The effect that builds the tuition options, comments stripped. */
function optionEffect(): string {
    const code = src(CARD).replace(/\/\*[\s\S]*?\*\//g, "");
    const at = code.indexOf("loadFinancialConfig(opportunityId)");
    expect(at, "the tuition options are still loaded here").toBeGreaterThan(-1);
    return code.slice(at, code.indexOf("}, [opportunityId, child.id]);", at));
}

describe("the Assignment tuition control offers this assignment's options", () => {
    it("reads the per-assignment canonical view, matched by member id", () => {
        const effect = optionEffect();
        expect(effect, "the canonical per-assignment view").toContain("payload?.assignments");
        expect(effect, "matched exactly, not by name").toContain("v.customerMemberId === child.id");
    });

    it("no longer ranks the household's rows by a display-name substring", () => {
        const effect = optionEffect();
        expect(effect, "the sibling-bearing shape is gone").not.toContain("payload?.enrollments");
        expect(effect, "and so is its rate field").not.toContain("resolvedRate");
        expect(effect, "no name matching decides whose price this is").not.toMatch(
            /childLabel|child\.name|toLowerCase\(\)/,
        );
    });

    it("offers only applicable options, recommendation first", () => {
        const effect = optionEffect();
        expect(effect, "every option applies to this assignment").toContain("view.applicable");
        expect(effect, "the resolver names the recommendation").toContain("view.recommended?.sourceId");
        expect(effect).toContain("Recommended —");
    });

    it("does not assert the recommendation from list position", () => {
        /*
         * The option list prefixed "Best match — " onto index 0, which is true only while a
         * recommendation exists; an ambiguous or no-match assignment would have labelled an
         * arbitrary candidate as the best one. The resolver's own answer decides now.
         */
        const code = src(CARD);
        expect(code).not.toContain("idx === 0 ? `Best match");
    });

    it("does not render a dangling separator when the option has no variant name", () => {
        /* Measured: the sole applicable option had an empty variantLabel — "Recommended — : $185.00/weekly". */
        const effect = optionEffect();
        expect(effect).toContain("variant ?");
        expect(effect, "the money always stands alone").toContain("o.amountLabel");
    });

    it("states which child is being priced", () => {
        expect(src(CARD)).toContain("Tuition — {child.name}");
    });
});

describe("the snapshot route is still not a pricing authority", () => {
    it("writes a process snapshot and never an accepted term", () => {
        const route = src("app/api/admin/enrollment/assignment-quote/route.ts");
        expect(route, "the snapshot lands on the process instance").toContain('from("process_instances")');
        expect(route, "and never on the commercial term").not.toContain("enrollment_pricing_terms\"");
        expect(route).not.toContain("acceptEnrollmentPricingTerm");
        expect(route).not.toContain("overrideEnrollmentPricingTerm");
    });

    it("keeps one writer for accepted commercial terms", () => {
        const actions = src("lib/adminV2/actions/definitions/enrollmentPricingActions.ts");
        expect(actions).toContain("acceptEnrollmentPricingTerm");
        expect(actions).toContain("overrideEnrollmentPricingTerm");
    });
});

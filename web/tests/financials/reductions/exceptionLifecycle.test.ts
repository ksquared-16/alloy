/**
 * THE EXCEPTION LIFECYCLE — the three defects A–K found on the deployed build, locked as effects.
 *
 * ── THE SEMANTIC DECISION THESE LOCKS ENCODE ─────────────────────────────────────────────────
 *
 * Measured from the committed schema and the service's own doctrine, not chosen here:
 *
 *   effective_start / effective_end   the COMMERCIAL APPLICABILITY boundary. The only thing that
 *                                     decides whether an exception governed a given date.
 *   superseded_at                     "REPLACED by a later authoritative row for this key". It is
 *                                     the live-slot marker the unique index is predicated on, and
 *                                     a replaced row never applies because its authority passed on.
 *   ended_at / ended_by               operator lifecycle provenance.
 *
 * So END sets `effective_end` and the provenance columns and does NOT set `superseded_at`.
 * Using supersession for End would falsify history: `exceptionAppliesOn` short-circuits on a
 * superseded row, so an ended exception would read as never having governed the window it did
 * govern — and the canonical doctrine requires that truth to survive.
 *
 * The live-slot collision was therefore NOT the index's fault and the index is unchanged. The
 * service inserted before superseding, so the insert raced the very row it was replacing.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { exceptionAppliesOn, exceptionIsLiveOn } from "@/lib/financials/reductions/commercialPolicyExceptionService";

const src = (p: string) =>
    readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const service = src("lib/financials/reductions/commercialPolicyExceptionService.ts");
const route = src("app/api/admin/financials/reduction-forecast/route.ts");
const card = src("components/admin/focusPanel/cards/SchedulingCard.tsx");
const migration = readFileSync("../supabase/migrations/20260924120000_commercial_policy_exceptions.sql", "utf8");

const ex = (over: Record<string, unknown> = {}) =>
    ({
        id: "e1", policyId: "p1", opportunityCustomerMemberId: "ocm1", customerMemberId: "m1",
        effectiveStart: "2026-09-01", effectiveEnd: null, reason: "because",
        createdBy: null, createdAt: "2026-09-01T00:00:00Z", supersedesExceptionId: null, supersededAt: null,
        ...over,
    }) as never;

describe("§5 · the forecast period and the current lifecycle are different questions", () => {
    /*
     * THE DEFECT, AS THE RULE IT BROKE. An exception ended today whose window began on the 1st
     * governed a period starting on the 1st, and is not endable now. One flag answered both, and
     * the card offered to end something already ended.
     */
    it("an ended exception still governed the period its window covered", () => {
        const ended = ex({ effectiveStart: "2026-09-01", effectiveEnd: "2026-09-20" });
        expect(exceptionAppliesOn(ended, "2026-09-01"), "it governed September").toBe(true);
        expect(exceptionIsLiveOn(ended, "2026-09-21"), "and it is not live the day after it ended").toBe(false);
    });

    it("the two predicates disagree exactly where they should", () => {
        const e = ex({ effectiveStart: "2026-09-01", effectiveEnd: "2026-09-20" });
        expect(exceptionAppliesOn(e, "2026-09-10")).toBe(true);
        expect(exceptionIsLiveOn(e, "2026-09-10"), "still in force mid-window").toBe(true);
        expect(exceptionIsLiveOn(e, "2026-09-25"), "its window has closed").toBe(false);
    });

    it("a superseded row is neither applicable nor live, whatever its dates say", () => {
        const s = ex({ supersededAt: "2026-09-05T00:00:00Z" });
        expect(exceptionAppliesOn(s, "2026-09-10")).toBe(false);
        expect(exceptionIsLiveOn(s, "2026-09-10")).toBe(false);
    });

    it("an exception that has not started yet is not applicable, and is still endable", () => {
        const future = ex({ effectiveStart: "2026-10-01" });
        expect(exceptionAppliesOn(future, "2026-09-10")).toBe(false);
        expect(exceptionIsLiveOn(future, "2026-09-10"), "the operator can still call it off").toBe(true);
    });
});

describe("§11 · the effective-dating matrix", () => {
    const windowed = ex({ effectiveStart: "2026-09-05", effectiveEnd: "2026-09-25" });
    it.each([
        ["before the start", "2026-09-01", false],
        ["on the start", "2026-09-05", true],
        ["inside", "2026-09-15", true],
        ["on the end", "2026-09-25", true],
        ["after the end", "2026-09-26", false],
    ])("%s → applies=%s", (_label, date, applies) => {
        expect(exceptionAppliesOn(windowed, date as string)).toBe(applies);
    });

    /* A HISTORICAL period inside an ended window still reports that the exception governed it. */
    it("a historical period inside an ended window still reads as governed", () => {
        expect(exceptionAppliesOn(windowed, "2026-09-10")).toBe(true);
        expect(exceptionIsLiveOn(windowed, "2026-11-01"), "while today it is long over").toBe(false);
    });
});

describe("§3 · an ended exception releases the live slot", () => {
    /*
     * The index is unchanged — the ORDER was the defect. Superseding after inserting made the
     * insert race the row it was replacing, so re-authoring the same policy, relationship and
     * start date could never succeed.
     */
    it("supersedes before it inserts", () => {
        const fn = service.slice(service.indexOf("export async function createPolicyException"));
        const supersede = fn.indexOf('update({ superseded_at: new Date().toISOString() })');
        const insert = fn.indexOf(".insert({");
        expect(supersede, "the supersession is still there").toBeGreaterThan(-1);
        expect(insert, "and so is the insert").toBeGreaterThan(-1);
        expect(supersede, "supersede FIRST — the insert collides with a row still holding the slot").toBeLessThan(insert);
    });

    it("puts the superseded row back when the insert fails", () => {
        const fn = service.slice(service.indexOf("if (insertError) {"));
        expect(fn.slice(0, 400), "a superseded row with no replacement is a slot silently emptied")
            .toContain("update({ superseded_at: null })");
    });

    /* END is effective_end plus provenance. It must NOT supersede — that would erase history. */
    it("ending sets the window and the provenance, never supersession", () => {
        const fn = service.slice(service.indexOf("export async function endPolicyException"));
        const body = fn.slice(0, fn.indexOf("\n}"));
        expect(body).toContain("effective_end");
        expect(body).toContain("ended_at");
        expect(body).toContain("ended_by");
        expect(body, "superseded_at means REPLACED; using it for End would falsify history")
            .not.toMatch(/superseded_at:\s*new Date/);
    });

    it("keeps the index unchanged — the repair was the service, not the schema", () => {
        expect(migration).toContain("where superseded_at is null");
        expect(migration).toMatch(/ux_commercial_policy_exceptions_live[\s\S]{0,200}\(org_id, policy_id, opportunity_customer_member_id, effective_start\)/);
    });
});

describe("§4 · the operator never sees a raw database error", () => {
    it("maps the live-slot violation to a named refusal, by CODE not by prose", () => {
        expect(service).toContain('"exception_already_exists"');
        const fn = service.slice(service.indexOf("function liveSlotTaken"));
        expect(fn.slice(0, 400), "23505 is unique_violation — the identity, not the wording").toContain('"23505"');
        expect(fn.slice(0, 400)).toContain("LIVE_INDEX");
    });

    it("tells the operator what to do about it", () => {
        const i = service.indexOf('code: "exception_already_exists"');
        expect(i, "the refusal is returned somewhere").toBeGreaterThan(-1);
        const message = service.slice(i, i + 400);
        expect(message).toMatch(/end it or choose a different start date/i);
        expect(message, "never the database's words").not.toContain("duplicate key");
    });

    it("never returns the raw message for a violation it recognises", () => {
        const fn = service.slice(service.indexOf("if (insertError) {"), service.indexOf("if (insertError) {") + 1400);
        expect(fn.indexOf("liveSlotTaken"), "recognised BEFORE the db_error fallthrough")
            .toBeLessThan(fn.indexOf('code: "db_error"'));
    });
});

describe("§6 · the surface asks the lifecycle question", () => {
    it("offers End from isLiveNow, never from appliesNow", () => {
        const list = card.slice(card.indexOf("exceptions.filter((e) => !e.superseded)"));
        const block = list.slice(0, list.indexOf("data-policy-exception-draft"));
        expect(block).toContain("e.isLiveNow ? (");
        expect(block, "the End control is not decided by the forecast period")
            .not.toMatch(/\{e\.appliesNow \?\s*\(\s*<button[^>]*data-end-policy-exception/);
        expect(block).toContain("data-end-policy-exception");
    });

    it("says Ended where it no longer offers to end", () => {
        const list = card.slice(card.indexOf("exceptions.filter((e) => !e.superseded)"));
        expect(list.slice(0, list.indexOf("data-policy-exception-draft"))).toContain('data-exception-ended="true"');
    });

    /* Both answers come from the server. A surface that computed either would be a third opinion. */
    it("computes neither answer itself", () => {
        expect(card).toContain("isLiveNow: boolean");
        expect(card, "no date arithmetic on exceptions in the card").not.toMatch(/effectiveEnd\s*[<>]=?\s*new Date/);
    });

    it("the server answers both questions, and they come from different predicates", () => {
        /*
         * The body moved out of the route into `readAssignmentDiscountPosition` so a FAMILY-grain
         * reader could ask the same question of each of a household's relationships without a
         * second implementation existing. The RULE is unchanged and is what is asserted — two
         * questions, two predicates, judged against two different dates — plus the fact that the
         * route still delegates, so the rule cannot be bypassed by answering in the route again.
         */
        const reader = src("lib/financials/reductions/readAssignmentDiscountPosition.ts");
        expect(reader).toContain("appliesNow: exceptionAppliesOn(e, periodStartForExceptions)");
        expect(reader).toContain("isLiveNow: exceptionIsLiveOn(e, todayYmd)");
        expect(route, "the route delegates rather than answering again").toContain(
            "readAssignmentDiscountPosition",
        );
        expect(route, "and does not recompute either answer").not.toContain("exceptionAppliesOn(");
    });
});

describe("§18 · the panel does not deny the capability it offers", () => {
    /**
     * Found by the deployed smoke: the accounting calendar rendered eleven working Close controls
     * with a note beneath them saying "opening and closing a period is not yet an action in
     * Alloy". True when it was written, false once 11B shipped
     * `billing.close_accounting_period`, and worse than silence — an operator reads it and does
     * not press the button that works.
     *
     * The lock is the RULE, not the sentence: a surface that offers a control must not carry copy
     * denying that control exists. What is still missing — reopening — is what the note records.
     */
    const panel = src("components/adminV2/settings/financials/accounting/AccountingPostingPanels.tsx");

    it("offers Close and does not say closing is unavailable", () => {
        expect(panel, "the control 11B built is still offered").toContain("accounting-period-close-");
        const note = panel.slice(panel.indexOf('data-testid="accounting-period-lifecycle-note"'));
        const text = note.slice(0, 500);
        expect(text, "the note must not deny the button beside it").not.toMatch(/closing a period is not yet an action/i);
        expect(text, "and must record the limit that IS real").toMatch(/reopening one is not an action/i);
    });

    /* The enforcement sentences were never about controls, and must survive the correction. */
    it("keeps the two enforcement facts", () => {
        const note = panel.slice(panel.indexOf('data-testid="accounting-period-lifecycle-note"'), panel.indexOf('data-testid="accounting-period-lifecycle-note"') + 500);
        expect(note).toMatch(/posting into a closed\s+period is already refused/i);
        expect(note).toMatch(/cannot have its dates changed/i);
    });
});

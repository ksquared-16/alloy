/**
 * N CHILDREN IS N OBLIGATIONS — locked at the effect.
 *
 * ── THE ARITHMETIC THIS DEFENDS ──────────────────────────────────────────────────────────────
 *
 * A $40 field trip for two children is TWO $40 obligations totalling $80. It is not one $80
 * household charge (which no child owns, and which no per-child discount can reach), and it is not
 * $20 each (which invents a price nobody quoted). Both wrong answers are arithmetically tidy, which
 * is exactly why a reviewer can read past them — so the amount's journey to each write is locked
 * rather than the total.
 *
 * ── WHY PARTIAL FAILURE IS A SEPARATE LOCK ───────────────────────────────────────────────────
 *
 * The honest outcome of "two of three children got a charge" is success carrying the failure. The
 * tempting alternatives both lie: reporting `ok: false` denies charges that exist and invites an
 * operator to re-add them, and reporting a clean `ok: true` hides a child who was never billed.
 * There is no batch table and no rollback here, so the report IS the record.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const writeTemplateDraftCharge = vi.fn();
const postChildcareCharge = vi.fn();

vi.mock("@/lib/financials/chargeLifecycle/chargeLifecycleService", () => ({
    writeTemplateDraftCharge: (...a: unknown[]) => writeTemplateDraftCharge(...a),
    previewTemplateCharge: vi.fn(),
}));
vi.mock("@/lib/financials/childcareChargeService", () => ({
    postChildcareCharge: (...a: unknown[]) => postChildcareCharge(...a),
    createChildcareCorrection: vi.fn(),
}));

const { __testables } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
const { executeMultiChildAdd, childIdsFrom } = __testables;

const subject = (childId: string) => ({
    childId,
    subject: { ok: true as const, kind: "enrollment_agreement" as const, agreementId: `agr-${childId}`, customerMemberId: childId },
});

const run = (children: string[], payload: Record<string, unknown> = {}) =>
    executeMultiChildAdd({
        supabase: {} as never,
        ctx: { orgId: "org-1", userId: "u-1" },
        invocation: { entityType: "child", entityId: children[0] },
        payload: { template_id: "tpl-fieldtrip", amount_cents: 4000, ...payload },
        subjects: children.map(subject),
        correlationId: "corr-1",
    });

const written = (chargeId: string) => ({
    status: "created", chargeId, resolutionKey: `tpl:tpl-fieldtrip:2026-09-18:${chargeId}`, reviewRequired: false,
});

beforeEach(() => {
    writeTemplateDraftCharge.mockReset();
    postChildcareCharge.mockReset();
    postChildcareCharge.mockResolvedValue({ alreadyPosted: false, charge: { status: "posted" } });
});

describe("THE GATE — the amount is per child and is never divided", () => {
    it("passes the FULL entered amount to every child's write", async () => {
        writeTemplateDraftCharge
            .mockResolvedValueOnce(written("c-ana"))
            .mockResolvedValueOnce(written("c-ben"));
        await run(["m-ana", "m-ben"]);

        expect(writeTemplateDraftCharge).toHaveBeenCalledTimes(2);
        for (const call of writeTemplateDraftCharge.mock.calls) {
            // $40.00 — not $20.00, which is what dividing across the selection would produce.
            expect((call[2] as { unitAmountCents: number }).unitAmountCents).toBe(4000);
        }
    });

    /* Each child's obligation binds to that child's OWN billable source, or it is not their debt. */
    it("writes against each child's own agreement, not the first child's", async () => {
        writeTemplateDraftCharge
            .mockResolvedValueOnce(written("c-ana"))
            .mockResolvedValueOnce(written("c-ben"));
        await run(["m-ana", "m-ben"]);

        const sources = writeTemplateDraftCharge.mock.calls.map(
            (c) => (c[2] as { billableSource: { id: string } }).billableSource.id);
        expect(sources).toEqual(["agr-m-ana", "agr-m-ben"]);
    });

    it("reports N independent charges, one per selected child", async () => {
        writeTemplateDraftCharge
            .mockResolvedValueOnce(written("c-ana"))
            .mockResolvedValueOnce(written("c-ben"));
        const res = await run(["m-ana", "m-ben"]);

        expect(res.ok).toBe(true);
        const d = (res as { result: { detail: Record<string, unknown> } }).result.detail;
        expect(d.children_selected).toBe(2);
        expect(d.charges_created).toBe(2);
        expect(d.charges_failed).toBe(0);
        // Which obligations exist, per child — not an aggregate an operator has to trust.
        expect((d.per_child as Array<{ customer_member_id: string; charge_id: string }>)
            .map((r) => [r.customer_member_id, r.charge_id]))
            .toEqual([["m-ana", "c-ana"], ["m-ben", "c-ben"]]);
    });
});

describe("THE GATE — partial failure is reported, never smoothed over", () => {
    it("keeps the charges that were written and names the child that failed", async () => {
        writeTemplateDraftCharge
            .mockResolvedValueOnce(written("c-ana"))
            .mockRejectedValueOnce(new Error("no billable source for this child"))
            .mockResolvedValueOnce(written("c-cy"));
        const res = await run(["m-ana", "m-ben", "m-cy"]);

        expect(res.ok, "two real charges exist; denying them would be false").toBe(true);
        const d = (res as { result: { detail: Record<string, unknown> } }).result.detail;
        expect(d.charges_created).toBe(2);
        expect(d.charges_failed).toBe(1);
        const failed = (d.per_child as Array<{ customer_member_id: string; charge_id: string | null; error?: string }>)
            .find((r) => !r.charge_id);
        expect(failed?.customer_member_id).toBe("m-ben");
        expect(failed?.error, "the operator is told why").toMatch(/billable source/);
    });

    /* Nothing was created, so "ok" would be a lie — this is the one case that fails. */
    it("fails when no child could be charged", async () => {
        writeTemplateDraftCharge.mockRejectedValue(new Error("template is not writable"));
        const res = await run(["m-ana", "m-ben"]);
        expect(res.ok).toBe(false);
        expect((res as { status: number }).status).toBe(409);
    });

    /*
     * A FAILED POST DOES NOT UNMAKE THE CHARGE. The obligation is written and sits as a draft the
     * operator can post from the row; erasing it would lose real money owed.
     */
    it("keeps a charge whose post failed, and says the post failed", async () => {
        writeTemplateDraftCharge.mockResolvedValueOnce(written("c-ana"));
        postChildcareCharge.mockRejectedValueOnce(new Error("posting period is closed"));
        const res = await run(["m-ana"]);

        const d = (res as { result: { detail: Record<string, unknown> } }).result.detail;
        const row = (d.per_child as Array<{ charge_id: string | null; posted: boolean; error?: string }>)[0]!;
        expect(row.charge_id, "the charge survives its failed post").toBe("c-ana");
        expect(row.posted).toBe(false);
        expect(row.error).toMatch(/posting period/);
    });
});

describe("THE GATE — the selection reaching the writer", () => {
    it("de-duplicates a child named twice, so nobody is billed double", () => {
        expect(childIdsFrom({ customer_member_ids: ["m-ana", "m-ben", "m-ana"] }, undefined, "child"))
            .toEqual(["m-ana", "m-ben"]);
    });

    it("still accepts the single-subject invocation, which is the common case", () => {
        expect(childIdsFrom({}, "m-solo", "child")).toEqual(["m-solo"]);
    });
});

describe("THE GATE — the operator surface states the per-child economics", () => {
    const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

    /*
     * The two numbers an operator checks before committing money are the per-child amount and the
     * COUNT. A surface that showed only a total would be consistent with all three arithmetics.
     */
    it("says the amount is per child and how many children receive one", () => {
        const cmd = src("components/operationalCards/AddChargeCommand.tsx");
        /*
         * THE LIVE SUMMARY. `data-addcharge-childsum` belonged to the legacy "Also bill" checkbox
         * row, which was unreachable — `unifiedTarget` is checked first and the host always
         * supplies it — and was removed with the native checkboxes it carried. The unified target
         * says the same two numbers under its own marker.
         */
        const sum = cmd.slice(cmd.indexOf("data-addcharge-targetsum"));
        const block = sum.slice(0, sum.indexOf("</p>"));
        expect(block, "per-child, not a total").toContain("per child");
        expect(block, "the count is said out loud").toContain("selectedChildIds.length} children");
        expect(block).toContain("each receives their own charge");
    });

    /*
     * MOUNTED-PROVEN SELECTOR. The mode control is a `role="tab"` tablist — `getByRole("button")`
     * cannot see it, which once made a present control read as a missing one. The hooks a probe
     * steers by are part of the contract, so they are locked.
     */
    it("keeps the per-child hooks a mounted probe steers by", () => {
        const cmd = src("components/operationalCards/AddChargeCommand.tsx");
        /*
         * The hooks a probe steers by are part of the contract, and they moved with the control.
         * The unified target is one AlloyMultiSelect rather than a row of checkboxes, so a probe
         * steers it by that testId and reads the result from the summary marker.
         */
        expect(cmd, "the target control is addressable").toContain('testId="addcharge-target"');
        expect(cmd, "and the summary it produces is too").toContain("data-addcharge-targetsum");
        expect(cmd, "no native checkbox survives for a financial decision")
            .not.toMatch(/type="checkbox"/);
        const host = src("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(host).toContain('data-financials-entry-mode-tab={mode}');
        expect(host, "one command surface declares which mode it is in").toContain("data-financials-entry-mode={entryMode}");
    });
});

describe("THE GATE — a stated household grain is not overruled by routing", () => {
    /*
     * `childIdFrom` falls back to the invocation entity, which is correct for a caller acting FROM
     * a child's record: it says nothing about grain. But the Focus Panel sends the panel's child as
     * ROUTING context on every call, so a deliberate "Applies to · Household" was being overruled
     * and the charge came back attributed to that child.
     *
     * Omission cannot mean household, because omission is exactly what a caller with no opinion
     * does. So the grain is STATED, and stating it wins over the routing entity.
     */
    it("names no child when the caller states household grain", () => {
        expect(childIdsFrom({ subject_grain: "household" }, "m-certb", "child")).toEqual([]);
    });

    /* The routing fallback still works for everyone who has not stated a grain. */
    it("still infers the child from the entity when no grain was stated", () => {
        expect(childIdsFrom({}, "m-certb", "child")).toEqual(["m-certb"]);
    });

    /* Naming children explicitly is unaffected when no grain is stated. */
    it("still honours an explicit multi-child selection", () => {
        expect(childIdsFrom({ customer_member_ids: ["m-ana", "m-ben"] }, "m-certb", "child"))
            .toEqual(["m-ana", "m-ben"]);
    });

    /*
     * PRECEDENCE, STATED RATHER THAN IMPLIED. A payload carrying BOTH a household grain and named
     * children is self-contradictory, and household wins because it is checked first. The Focus
     * Panel cannot produce that combination — the sibling checkboxes are withheld at household
     * anchor precisely so an empty selection can never mean household — but the rule is written
     * down here so the next caller inherits an answer instead of discovering one.
     */
    it("lets a stated household grain win over named children, and says so", () => {
        expect(childIdsFrom({ subject_grain: "household", customer_member_ids: ["m-ana"] }, "m-certb", "child"))
            .toEqual([]);
    });
});

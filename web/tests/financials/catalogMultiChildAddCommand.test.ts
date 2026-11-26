/**
 * `charge.add` for a multi-child (bulk) selection with a CATALOG item — the command loop over the canonical writers.
 *
 * `executeMultiChildAdd` is what the operator's multi-child Add and the bulk Add reach. It must pass the catalog
 * item — never a template, never a client price — to the one charge writer for each child's own agreement, post
 * only where no review boundary applies, report every child, and converge on retry. The writers are fakes here
 * (synthetic adapters, no database); the same path runs live in tests/financials/live/catalogAddCharge.live.test.ts
 * under the isolated executor only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const writeTemplateDraftCharge = vi.fn();
const postChildcareCharge = vi.fn();

vi.mock("@/lib/financials/chargeLifecycle/chargeLifecycleService", () => ({
    writeTemplateDraftCharge: (...a: unknown[]) => writeTemplateDraftCharge(...a),
    previewTemplateCharge: vi.fn(),
}));
vi.mock("@/lib/financials/businessDate", () => ({ fetchOrgBusinessDate: async () => "2026-11-05" }));
vi.mock("@/lib/financials/childcareChargeService", () => ({
    postChildcareCharge: (...a: unknown[]) => postChildcareCharge(...a),
    createChildcareCorrection: vi.fn(),
}));

const { __testables } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
const { executeMultiChildAdd } = __testables;

const CATALOG_FEE = "prod-registration-fee";
const kids = ["wren", "lio"];
const subjects = kids.map((childId) => ({
    childId,
    subject: { ok: true as const, kind: "enrollment_agreement" as const, agreementId: `agr-${childId}`, customerMemberId: childId },
}));
const run = (payload: Record<string, unknown> = {}) =>
    executeMultiChildAdd({
        supabase: {} as never,
        ctx: { orgId: "org-1", userId: "u-1" },
        invocation: { entityType: "child", entityId: kids[0] },
        payload: { catalog_product_id: CATALOG_FEE, today: "2026-11-05", ...payload },
        subjects: subjects as never,
        correlationId: "corr-cat",
    });
const created = (agreementId: string, reviewRequired = false) => ({
    status: "created", chargeId: `charge-${agreementId}`, resolutionKey: `cat:${CATALOG_FEE}:2026-11-05:${agreementId}`, reviewRequired,
});
type Detail = { multi_child: boolean; charges_created: number; charges_failed: number; per_child: Array<Record<string, unknown>> };
const detailOf = (r: Awaited<ReturnType<typeof run>>) => (r.ok ? (r.result!.detail as Detail) : null);

beforeEach(() => {
    writeTemplateDraftCharge.mockReset();
    postChildcareCharge.mockReset();
    postChildcareCharge.mockImplementation(async () => ({ alreadyPosted: false, charge: { status: "posted" } }));
});

describe("the catalog item reaches the one writer, per child, unchanged", () => {
    it("each child's write names the catalog item, that child's own agreement, no template and no client price", async () => {
        writeTemplateDraftCharge.mockImplementation(async (_s, _o, a: { billableSource: { id: string } }) => created(a.billableSource.id));
        await run();
        expect(writeTemplateDraftCharge).toHaveBeenCalledTimes(2);
        for (const [i, call] of writeTemplateDraftCharge.mock.calls.entries()) {
            const [, orgId, args] = call as [unknown, string, Record<string, unknown>];
            expect(orgId).toBe("org-1");
            expect(args).toMatchObject({
                catalogProductId: CATALOG_FEE,
                templateId: "",
                unitAmountCents: null,
                agreementId: `agr-${kids[i]}`,
                billableSource: { type: "enrollment_agreement", id: `agr-${kids[i]}` },
                today: "2026-11-05",
            });
        }
    });

    it("posts each charge through the canonical post where no review boundary applies, and reports every child", async () => {
        writeTemplateDraftCharge.mockImplementation(async (_s, _o, a: { billableSource: { id: string } }) => created(a.billableSource.id));
        const r = await run();
        expect(r.ok).toBe(true);
        expect(postChildcareCharge).toHaveBeenCalledTimes(2);
        expect(postChildcareCharge.mock.calls.map((c) => (c[1] as { chargeId: string }).chargeId)).toEqual(["charge-agr-wren", "charge-agr-lio"]);
        expect(detailOf(r)).toMatchObject({ multi_child: true, charges_created: 2, charges_failed: 0 });
        expect(detailOf(r)!.per_child.map((c) => [c.customer_member_id, c.charge_id, c.posted])).toEqual([["wren", "charge-agr-wren", true], ["lio", "charge-agr-lio", true]]);
    });

    it("a review boundary leaves both as drafts — written, never posted", async () => {
        writeTemplateDraftCharge.mockImplementation(async (_s, _o, a: { billableSource: { id: string } }) => created(a.billableSource.id, true));
        const r = await run();
        expect(postChildcareCharge).not.toHaveBeenCalled();
        expect(detailOf(r)!.per_child.every((c) => c.posted === false && c.review_required === true)).toBe(true);
    });
});

describe("unsupported items and missing accounting are refused per child, visibly", () => {
    it("one child refused (another site) is named with the writer's reason; the other child's charge exists", async () => {
        writeTemplateDraftCharge.mockImplementation(async (_s, _o, a: { billableSource: { id: string } }) =>
            a.billableSource.id === "agr-lio"
                ? { status: "not_writable", reason: "This Catalog item is offered at a different location." }
                : created(a.billableSource.id));
        const r = await run();
        expect(r.ok).toBe(true);
        expect(detailOf(r)).toMatchObject({ charges_created: 1, charges_failed: 1 });
        expect(detailOf(r)!.per_child[1]).toMatchObject({ customer_member_id: "lio", charge_id: null, write_status: "not_writable", posted: false, error: "This Catalog item is offered at a different location." });
        expect(postChildcareCharge).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["an unmapped revenue category", "This Catalog item's revenue category is not mapped to a GL account."],
        ["a recurring catalog item", "A recurring Catalog item is billed by its own cadence, not by Add Charge."],
    ])("every child refused (%s) is an operation that did nothing: 409 with the reason, nothing posted", async (_l, reason) => {
        writeTemplateDraftCharge.mockImplementation(async () => ({ status: "not_writable", reason }));
        const r = await run();
        expect(r).toMatchObject({ ok: false, status: 409, error: reason });
        expect(postChildcareCharge).not.toHaveBeenCalled();
    });
});

describe("retry converges on the charges that exist", () => {
    it("an identical re-run reports the same charges as unchanged and posts nothing again", async () => {
        writeTemplateDraftCharge.mockImplementation(async (_s, _o, a: { billableSource: { id: string } }) => ({ ...created(a.billableSource.id), status: "unchanged" }));
        const r = await run();
        expect(r.ok).toBe(true);
        expect(postChildcareCharge).not.toHaveBeenCalled();
        expect(detailOf(r)!.per_child.map((c) => [c.charge_id, c.write_status])).toEqual([["charge-agr-wren", "unchanged"], ["charge-agr-lio", "unchanged"]]);
    });
});

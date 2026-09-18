/**
 * MULTIPLE CHILDREN IS AN OPERATION, NOT A GRAIN.
 *
 * Selecting Wrigley and Lennon for a $40 field trip creates TWO independent $40 child-attributed
 * obligations. Never one $80 household charge, never one row carrying two subject ids, never one
 * $40 charge shared between them. The stored world is exactly what it was — only the operator's
 * gesture got wider.
 *
 * ── THE BATCH IDEMPOTENCY AUTHORITY ──────────────────────────────────────────────────────────
 *
 * There is deliberately no batch key and no batch table. `writeTemplateDraftCharge` computes
 * `tpl:<template>:<occurs_on>:<scope>` per charge and `charges_resolution_key_unique` enforces it
 * scoped to the billable source. Two children are two billable sources, therefore two keys — so a
 * re-run converges on the same two charges. A batch-level key would be a SECOND idempotency
 * authority answering a question the per-charge one already answers, and the two would disagree the
 * first time an operator retried a partial batch with one child removed.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const writeTemplateDraftCharge = vi.fn();
const postChildcareCharge = vi.fn();
const permittedMock = vi.fn(async () => true);

vi.mock("@/lib/financials/chargeLifecycle/chargeLifecycleService", () => ({
    writeTemplateDraftCharge: (...a: unknown[]) => writeTemplateDraftCharge(...a),
    previewTemplateCharge: vi.fn(),
}));
vi.mock("@/lib/financials/childcareChargeService", () => ({
    postChildcareCharge: (...a: unknown[]) => postChildcareCharge(...a),
}));

/*
 * The action module resolves subjects and permissions against Supabase. These are stubbed at the
 * seam, NOT reimplemented: what is under test is the OPERATION — how many obligations one gesture
 * produces and whose they are — not the subject resolver, which has its own coverage.
 */
const ok = (agreementId: string) => ({ ok: true as const, kind: "enrollment_agreement" as const, agreementId });

describe("one gesture, N independent obligations", () => {
    beforeEach(() => {
        writeTemplateDraftCharge.mockReset();
        postChildcareCharge.mockReset();
        permittedMock.mockClear();
    });

    /*
     * THE HEADLINE INVARIANT. Two children, two writes, each carrying the FULL amount — the amount
     * is per child and is never divided across the selection. Splitting an entered amount would
     * invent a price nobody quoted.
     */
    it("writes one charge per child, each at the full per-child amount", async () => {
        const calls: Array<{ source: unknown; amount: number | null }> = [];
        writeTemplateDraftCharge.mockImplementation(async (_s, _o, args: Record<string, unknown>) => {
            calls.push({ source: args.billableSource, amount: args.unitAmountCents as number | null });
            return {
                status: "created",
                chargeId: `charge-${calls.length}`,
                resolutionKey: `tpl:field_trip:2026-09-20:${(args.billableSource as { id: string }).id}`,
                reviewRequired: true,
            };
        });

        const { __testables } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
        const res = await __testables.executeMultiChildAdd({
            supabase: {} as never,
            ctx: { orgId: "org", userId: "user" },
            invocation: { entityType: "child", entityId: "wrigley" },
            payload: { template_id: "tpl-field-trip", amount_cents: 4000, today: "2026-09-20" },
            subjects: [
                { childId: "wrigley", subject: ok("agr-w") as never },
                { childId: "lennon", subject: ok("agr-l") as never },
            ],
            correlationId: "corr-1",
        });

        expect(res.ok).toBe(true);
        expect(calls).toHaveLength(2);
        // EACH child is billed the full $40 — not $20 apiece.
        expect(calls.map((c) => c.amount)).toEqual([4000, 4000]);
        // Two DIFFERENT billable sources: two independent obligations, not one shared row.
        expect(calls.map((c) => (c.source as { id: string }).id)).toEqual(["agr-w", "agr-l"]);
    });

    it("reports each child's own charge, so the operator sees what exists", async () => {
        writeTemplateDraftCharge
            .mockResolvedValueOnce({ status: "created", chargeId: "c-w", resolutionKey: "k-w", reviewRequired: true })
            .mockResolvedValueOnce({ status: "created", chargeId: "c-l", resolutionKey: "k-l", reviewRequired: true });

        const { __testables } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
        const res = await __testables.executeMultiChildAdd({
            supabase: {} as never,
            ctx: { orgId: "org", userId: "u" },
            invocation: { entityType: "child", entityId: "wrigley" },
            payload: { template_id: "t", amount_cents: 4000 },
            subjects: [
                { childId: "wrigley", subject: ok("agr-w") as never },
                { childId: "lennon", subject: ok("agr-l") as never },
            ],
            correlationId: "c",
        });

        const detail = (res as unknown as { result: { detail: Record<string, unknown> } }).result.detail;
        expect(detail.multi_child).toBe(true);
        expect(detail.children_selected).toBe(2);
        expect(detail.charges_created).toBe(2);
        const perChild = detail.per_child as Array<{ customer_member_id: string; charge_id: string }>;
        expect(perChild.map((r) => r.customer_member_id)).toEqual(["wrigley", "lennon"]);
        expect(perChild.map((r) => r.charge_id)).toEqual(["c-w", "c-l"]);
        // Each child's obligation is separately identified — never a shared id.
        expect(new Set(perChild.map((r) => r.charge_id)).size).toBe(2);
    });

    /*
     * RETRY CONVERGES. The writer answers `recalculated` for a charge whose resolution key already
     * exists, so a repeated operation reports the SAME charge ids rather than creating more.
     */
    it("does not duplicate obligations when the same operation is retried", async () => {
        writeTemplateDraftCharge
            .mockResolvedValueOnce({ status: "recalculated", chargeId: "c-w", resolutionKey: "k-w", reviewRequired: true })
            .mockResolvedValueOnce({ status: "recalculated", chargeId: "c-l", resolutionKey: "k-l", reviewRequired: true });

        const { __testables } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
        const res = await __testables.executeMultiChildAdd({
            supabase: {} as never,
            ctx: { orgId: "org", userId: "u" },
            invocation: { entityType: "child", entityId: "w" },
            payload: { template_id: "t", amount_cents: 4000 },
            subjects: [
                { childId: "wrigley", subject: ok("agr-w") as never },
                { childId: "lennon", subject: ok("agr-l") as never },
            ],
            correlationId: "c",
        });
        const detail = (res as unknown as { result: { detail: Record<string, unknown> } }).result.detail;
        const perChild = detail.per_child as Array<{ charge_id: string; write_status: string }>;
        expect(perChild.map((r) => r.charge_id)).toEqual(["c-w", "c-l"]);
        expect(perChild.every((r) => r.write_status === "recalculated")).toBe(true);
    });

    /*
     * AN HONEST PARTIAL. One child failing must not deny the charge that exists for the other —
     * reporting the operation as failed would tell the operator that real money does not exist.
     */
    it("keeps the charges that succeeded and names the child that failed", async () => {
        writeTemplateDraftCharge
            .mockResolvedValueOnce({ status: "created", chargeId: "c-w", resolutionKey: "k-w", reviewRequired: true })
            .mockResolvedValueOnce({ status: "not_writable", reason: "Lennon has no enrolment agreement." });

        const { __testables } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
        const res = await __testables.executeMultiChildAdd({
            supabase: {} as never,
            ctx: { orgId: "org", userId: "u" },
            invocation: { entityType: "child", entityId: "w" },
            payload: { template_id: "t", amount_cents: 4000 },
            subjects: [
                { childId: "wrigley", subject: ok("agr-w") as never },
                { childId: "lennon", subject: ok("agr-l") as never },
            ],
            correlationId: "c",
        });

        expect(res.ok, "the charge that exists is not denied").toBe(true);
        const detail = (res as unknown as { result: { detail: Record<string, unknown> } }).result.detail;
        expect(detail.charges_created).toBe(1);
        expect(detail.charges_failed).toBe(1);
        const perChild = detail.per_child as Array<{ customer_member_id: string; error?: string }>;
        expect(perChild[1]!.customer_member_id).toBe("lennon");
        expect(perChild[1]!.error).toContain("enrolment agreement");
    });

    /* EVERY child failing did nothing, and calling that success would be false. */
    it("fails the operation only when no child could be charged", async () => {
        writeTemplateDraftCharge.mockResolvedValue({ status: "not_writable", reason: "No template." });
        const { __testables } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
        const res = await __testables.executeMultiChildAdd({
            supabase: {} as never,
            ctx: { orgId: "org", userId: "u" },
            invocation: { entityType: "child", entityId: "w" },
            payload: { template_id: "t" },
            subjects: [
                { childId: "wrigley", subject: ok("agr-w") as never },
                { childId: "lennon", subject: ok("agr-l") as never },
            ],
            correlationId: "c",
        });
        expect(res.ok).toBe(false);
    });

    /*
     * A FAILED POST DOES NOT UNMAKE A CHARGE. It is written, it is a draft, and the operator can
     * post it from the row. Losing a real financial record because a second step failed would be
     * the worse error.
     */
    it("keeps a charge whose post failed, and says the post failed", async () => {
        writeTemplateDraftCharge.mockResolvedValue({
            status: "created", chargeId: "c-w", resolutionKey: "k-w", reviewRequired: false,
        });
        postChildcareCharge.mockRejectedValue(new Error("accounting period closed"));

        const { __testables } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
        const res = await __testables.executeMultiChildAdd({
            supabase: {} as never,
            ctx: { orgId: "org", userId: "u" },
            invocation: { entityType: "child", entityId: "w" },
            payload: { template_id: "t", amount_cents: 4000 },
            subjects: [{ childId: "wrigley", subject: ok("agr-w") as never }],
            correlationId: "c",
        });
        expect(res.ok).toBe(true);
        const perChild = (res as unknown as { result: { detail: { per_child: Array<{ charge_id: string; posted: boolean; error?: string }> } } })
            .result.detail.per_child;
        expect(perChild[0]!.charge_id, "the charge still exists").toBe("c-w");
        expect(perChild[0]!.posted).toBe(false);
        expect(perChild[0]!.error).toContain("accounting period");
    });
});

describe("the selection itself", () => {
    it("de-duplicates a child named twice, so a double click cannot bill twice", async () => {
        const { __testables } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
        expect(
            __testables.childIdsFrom({ customer_member_ids: ["w", "l", "w"] }, undefined, undefined),
        ).toEqual(["w", "l"]);
    });

    /* The singular form still works: every existing caller sends it and must not break. */
    it("still accepts the singular customer_member_id", async () => {
        const { __testables } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
        expect(__testables.childIdsFrom({ customer_member_id: "w" }, undefined, undefined)).toEqual(["w"]);
    });

    /*
     * BLANK IS NOT HOUSEHOLD BY ACCIDENT. An empty selection yields no children, and the household
     * path is reached by the subject resolver deliberately — not by an empty array meaning
     * something it never said.
     */
    it("returns no children for an empty selection rather than inventing one", async () => {
        const { __testables } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
        expect(__testables.childIdsFrom({ customer_member_ids: [] }, undefined, undefined)).toEqual([]);
        expect(__testables.childIdsFrom({}, undefined, undefined)).toEqual([]);
    });

    it("adopts the invoked entity only at child grain", async () => {
        const { __testables } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
        expect(__testables.childIdsFrom({}, "kid-1", "opportunity_customer_member")).toEqual(["kid-1"]);
        // An opportunity is not a child; adopting it would ask a child question about a household.
        expect(__testables.childIdsFrom({}, "opp-1", "opportunity")).toEqual([]);
    });
});

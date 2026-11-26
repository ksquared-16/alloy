/**
 * The three things these commands refuse before they do anything.
 *
 * A caller may say which period to discount, and which account to credit. It may not say what a
 * policy is worth or who qualifies for it — those come from the authored policy and from records
 * the server reads itself. And it may not reduce a family's bill by hand without the permission to
 * do that, which is deliberately NOT the permission to bill them.
 */
import { describe, expect, it } from "vitest";

import {
    BILLING_ADJUST_ACCOUNT_ACTION_KEY,
    BILLING_ADJUST_PERMISSION,
    BILLING_APPLY_DISCOUNTS_ACTION_KEY,
    BILLING_REVERSE_ADJUSTMENT_ACTION_KEY,
    financialReductionActions,
} from "@/lib/adminV2/actions/definitions/financialReductionActions";
import { REGISTERED_ACTION_CAPABILITY_KEYS } from "@/lib/platform/commands/capabilityRegistry";

const byKey = (k: string) => financialReductionActions.find((a) => a.actionKey === k)!;
const applyDiscounts = byKey(BILLING_APPLY_DISCOUNTS_ACTION_KEY);
const adjust = byKey(BILLING_ADJUST_ACCOUNT_ACTION_KEY);
const reverse = byKey(BILLING_REVERSE_ADJUSTMENT_ACTION_KEY);

/** The narrowest client that answers what `resolveActorPermissionGrants` asks. */
function grantingClient(role: string | null, permissions: string[]) {
    const table = (name: string) => ({
        select: () => {
            const rows =
                name === "user_roles"
                    ? role
                        ? [{ org_id: "org-1", role }]
                        : []
                    : permissions.map((permission_key) => ({ permission_key }));
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.eq = self;
            chain.in = self;
            chain.then = (r: (v: unknown) => unknown) => r({ data: rows, error: null });
            return chain;
        },
    });
    return { from: (name: string) => table(name) } as never;
}

const ctx = { orgId: "org-1", userId: "user-1" } as never;
const invocation = { entityType: "customer", entityId: "" } as never;
const VALID_ADJUSTMENT = {
    enrollment_agreement_id: "agreement-1",
    amount_cents: -5_000,
    reason: "Goodwill for the closure week",
    effective_date: "2026-09-15",
};

describe("the reduction commands", () => {
    it("are registered and classified as capabilities", () => {
        for (const key of [
            BILLING_APPLY_DISCOUNTS_ACTION_KEY,
            BILLING_ADJUST_ACCOUNT_ACTION_KEY,
            BILLING_REVERSE_ADJUSTMENT_ACTION_KEY,
        ]) {
            expect(byKey(key), key).toBeTruthy();
            expect(REGISTERED_ACTION_CAPABILITY_KEYS as readonly string[]).toContain(key);
        }
    });

    // ── THE CALLER MAY NOT PRICE A POLICY, OR CLAIM ELIGIBILITY ──────────────────────────────

    it("requires a named period, deterministically", () => {
        expect(applyDiscounts.validatePayload!({}).ok).toBe(false);
        expect(applyDiscounts.validatePayload!({ period_key: "September" }).ok).toBe(false);
        expect(applyDiscounts.validatePayload!({ period_key: "2026-09" }).ok).toBe(true);
    });

    it.each(["amount_cents", "percent", "percentage", "sibling_rank", "sibling_count", "employee_household", "eligible"])(
        "refuses a payload carrying %s rather than ignoring it",
        (field) => {
            const result = applyDiscounts.validatePayload!({ period_key: "2026-09", [field]: 1 });
            expect(result.ok).toBe(false);
            if (result.ok !== false) return;
            expect(result.blockers[0]?.code).toBe("policy_not_accepted_from_caller");
        },
    );

    // ── A MANUAL REDUCTION MUST SAY WHY, AND AGAINST WHAT ────────────────────────────────────

    it("refuses a manual reduction with no reason", () => {
        const result = adjust.validatePayload!({ ...VALID_ADJUSTMENT, reason: "" });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.blockers.some((b) => b.code === "reason_required")).toBe(true);
    });

    it.each([
        [{ enrollment_agreement_id: "" }, "missing_subject"],
        [{ amount_cents: 0 }, "invalid_amount"],
        [{ charge_category: "tuition" }, "invalid_category"],
        [{ effective_date: "September" }, "invalid_effective_date"],
    ])("refuses %j", (over, code) => {
        const result = adjust.validatePayload!({ ...VALID_ADJUSTMENT, ...over });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.blockers.some((b) => b.code === code)).toBe(true);
    });

    it("accepts a complete, reasoned adjustment", () => {
        expect(adjust.validatePayload!(VALID_ADJUSTMENT).ok).toBe(true);
    });

    it("requires a reason to reverse one", () => {
        expect(reverse.validatePayload!({ application_id: "a-1" }).ok).toBe(false);
        expect(reverse.validatePayload!({ application_id: "a-1", reason: "Applied in error" }).ok).toBe(true);
    });

    // ── BILLING IS NOT FORGIVING ─────────────────────────────────────────────────────────────

    it("does not let fin.write alone adjust an account by hand", async () => {
        const supabase = grantingClient("ops", ["fin.read", "fin.write"]);
        const eligibility = await adjust.resolveEligibility!({ supabase, ctx, payload: VALID_ADJUSTMENT, invocation } as never);
        expect(eligibility.eligible).toBe(false);
        expect(eligibility.blockers[0]?.code).toBe("adjust_permission_required");

        // The eligibility answer is advisory; the WRITE is what has to fail.
        const executed = await adjust.execute({ supabase, ctx, payload: VALID_ADJUSTMENT, invocation } as never);
        expect(executed.ok).toBe(false);
        expect(executed.ok === false && executed.status).toBe(403);
    });

    it("admits an actor holding fin.adjust", async () => {
        const eligibility = await adjust.resolveEligibility!({
            supabase: grantingClient("admin", [BILLING_ADJUST_PERMISSION]),
            ctx,
            payload: VALID_ADJUSTMENT,
            invocation,
        } as never);
        expect(eligibility.eligible).toBe(true);
    });

    it("refuses to apply discounts without fin.write", async () => {
        const executed = await applyDiscounts.execute({
            supabase: grantingClient("ops", ["fin.read"]),
            ctx,
            payload: { period_key: "2026-09" },
            invocation,
        } as never);
        expect(executed.ok).toBe(false);
        expect(executed.ok === false && executed.status).toBe(403);
    });

    /*
     * A FAILED GRANT READ IS NOT AN EMPTY ONE. `resolveActorPermissionGrants` answers null when it
     * could not read, and null must deny — an unidentified caller is not an unprivileged one.
     */
    it("denies when the actor cannot be identified at all", async () => {
        const eligibility = await adjust.resolveEligibility!({
            supabase: grantingClient(null, []),
            ctx: { orgId: "org-1", userId: null } as never,
            payload: VALID_ADJUSTMENT,
            invocation,
        } as never);
        expect(eligibility.eligible).toBe(false);
    });
});

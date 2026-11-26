/**
 * `billing.generate_tuition` — the two things the command refuses before it does anything.
 *
 * A caller may say WHICH period to bill. It may not say what the period costs: the amount, the
 * currency and the cadence come from the accepted term, and a payload carrying one is refused rather
 * than ignored, because silently dropping it would let a caller believe it had set a price and leave
 * the difference to be discovered in a ledger.
 *
 * And it may not generate money without the permission to write money. The gate reads the actor's
 * REAL grants — never a payload — so a surface that renders the control to somebody without them is
 * a cosmetic mistake, not an authorization one.
 */
import { describe, expect, it } from "vitest";

import {
    BILLING_GENERATE_TUITION_ACTION_KEY,
    BILLING_GENERATE_TUITION_PERMISSION,
    tuitionGenerationActions,
} from "@/lib/adminV2/actions/definitions/tuitionGenerationActions";
import { REGISTERED_ACTION_CAPABILITY_KEYS } from "@/lib/platform/commands/capabilityRegistry";

const action = tuitionGenerationActions.find((a) => a.actionKey === BILLING_GENERATE_TUITION_ACTION_KEY)!;

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
const invocation = { entityType: "opportunity_customer_member", entityId: "" } as never;

describe("billing.generate_tuition", () => {
    it("is registered and classified as a capability", () => {
        expect(action).toBeTruthy();
        expect(REGISTERED_ACTION_CAPABILITY_KEYS as readonly string[]).toContain(
            BILLING_GENERATE_TUITION_ACTION_KEY,
        );
        // The subject is the PERIOD, not a record — an entity id only narrows the run.
        expect(action.requiredContext.requiresEntityId).toBe(false);
    });

    it("requires a period, named and deterministic", () => {
        const missing = action.validatePayload!({});
        expect(missing.ok).toBe(false);
        expect(missing.ok === false && missing.blockers[0]?.code).toBe("missing_period");
        expect(action.validatePayload!({ period_key: "November" }).ok).toBe(false);
        expect(action.validatePayload!({ period_key: "2026-11" }).ok).toBe(true);
    });

    // ── THE CALLER MAY NOT PRICE ANYTHING ────────────────────────────────────────────────────

    it.each(["amount_cents", "amount", "currency", "currency_code", "cadence_key", "rate_cents"])(
        "refuses a payload carrying %s rather than ignoring it",
        (field) => {
            const result = action.validatePayload!({ period_key: "2026-11", [field]: 1 });
            expect(result.ok).toBe(false);
            if (result.ok !== false) return;
            expect(result.blockers[0]?.code).toBe("pricing_not_accepted_from_caller");
            expect(result.blockers[0]?.message).toContain("accepted pricing term");
        },
    );

    // ── AND MAY NOT GENERATE MONEY WITHOUT THE PERMISSION TO WRITE IT ────────────────────────

    it("refuses an actor without the financial write permission", async () => {
        const eligibility = await action.resolveEligibility!({
            supabase: grantingClient("ops", ["fin.read"]),
            ctx,
            payload: { period_key: "2026-11" },
            invocation,
        } as never);
        expect(eligibility.eligible).toBe(false);
        expect(eligibility.blockers[0]?.code).toBe("generation_permission_required");

        const executed = await action.execute({
            supabase: grantingClient("ops", ["fin.read"]),
            ctx,
            payload: { period_key: "2026-11" },
            invocation,
        } as never);
        // The eligibility answer is advisory; the WRITE is what has to fail.
        expect(executed.ok).toBe(false);
        expect(executed.ok === false && executed.status).toBe(403);
    });

    it("admits an actor who holds it", async () => {
        const eligibility = await action.resolveEligibility!({
            supabase: grantingClient("admin", [BILLING_GENERATE_TUITION_PERMISSION]),
            ctx,
            payload: { period_key: "2026-11" },
            invocation,
        } as never);
        expect(eligibility.eligible).toBe(true);
        expect(eligibility.blockers).toEqual([]);
    });

    /*
     * A FAILED GRANT READ IS NOT AN EMPTY ONE. `resolveActorPermissionGrants` answers null when it
     * could not read, and null must deny — an unidentified caller is not an unprivileged one.
     */
    it("denies when the actor cannot be identified at all", async () => {
        const eligibility = await action.resolveEligibility!({
            supabase: grantingClient(null, []),
            ctx: { orgId: "org-1", userId: null } as never,
            payload: { period_key: "2026-11" },
            invocation,
        } as never);
        expect(eligibility.eligible).toBe(false);
    });
});

/**
 * What the subsidy commands refuse before they do anything.
 *
 * Two refusals matter most. A caller may not state what a family currently owes — that is derived
 * from the posted charge, its payments and the claims actually submitted, and a client that could
 * assert it could decide what a family is asked to pay. And administering subsidy needs
 * `fin.subsidy`: it is a fourth financial authority, not a shade of billing, forgiving or
 * reassigning.
 */
import { describe, expect, it } from "vitest";

import { financialSubsidyActions, SUBSIDY_ACTION_KEYS, SUBSIDY_PERMISSION } from "@/lib/adminV2/actions/definitions/financialSubsidyActions";
import { REGISTERED_ACTION_CAPABILITY_KEYS } from "@/lib/platform/commands/capabilityRegistry";
import { VARIANCE_RESOLUTIONS } from "@/lib/financials/subsidy/remittanceService";

const byKey = (k: string) => financialSubsidyActions.find((a) => a.actionKey === k)!;

function grantingClient(role: string | null, permissions: string[]) {
    const table = (name: string) => ({
        select: () => {
            const rows =
                name === "user_roles"
                    ? role ? [{ org_id: "org-1", role }] : []
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
const invocation = { entityType: "child", entityId: "" } as never;

describe("the subsidy commands", () => {
    it("are all registered and classified as capabilities", () => {
        for (const key of Object.values(SUBSIDY_ACTION_KEYS)) {
            expect(byKey(key), key).toBeTruthy();
            expect(REGISTERED_ACTION_CAPABILITY_KEYS as readonly string[], key).toContain(key);
        }
    });

    // ── THE CALLER MAY NOT STATE WHAT A FAMILY OWES ──────────────────────────────────────────

    it.each([
        "outstanding_cents",
        "collectible_cents",
        "currently_collectible_cents",
        "suppression_cents",
        "expected_subsidy_cents",
    ])("refuses a payload carrying %s rather than ignoring it", (field) => {
        const result = byKey(SUBSIDY_ACTION_KEYS.buildClaim).validatePayload!({
            authorization_id: "a-1",
            period_key: "2032-03",
            [field]: 1,
        });
        expect(result.ok).toBe(false);
        if (result.ok !== false) return;
        expect(result.blockers.some((b) => b.code === "server_owned_amount")).toBe(true);
    });

    // ── ORDINARY VALIDATION ──────────────────────────────────────────────────────────────────

    it("requires a named service period to build a claim", () => {
        expect(byKey(SUBSIDY_ACTION_KEYS.buildClaim).validatePayload!({ authorization_id: "a-1" }).ok).toBe(false);
        expect(byKey(SUBSIDY_ACTION_KEYS.buildClaim).validatePayload!({ authorization_id: "a-1", period_key: "March" }).ok).toBe(false);
        expect(byKey(SUBSIDY_ACTION_KEYS.buildClaim).validatePayload!({ authorization_id: "a-1", period_key: "2032-03" }).ok).toBe(true);
    });

    it("requires a coverage start on an authorization", () => {
        const base = { program_id: "p-1", customer_id: "c-1", customer_member_id: "m-1" };
        expect(byKey(SUBSIDY_ACTION_KEYS.recordAuthorization).validatePayload!(base).ok).toBe(false);
        expect(byKey(SUBSIDY_ACTION_KEYS.recordAuthorization).validatePayload!({ ...base, coverage_start: "2032-01-01" }).ok).toBe(true);
    });

    it("requires a remittance to say which claim lines it answers", () => {
        const base = { agency_id: "ag-1", idempotency_key: "k", total_amount_cents: 100 };
        expect(byKey(SUBSIDY_ACTION_KEYS.recordRemittance).validatePayload!(base).ok).toBe(false);
        expect(
            byKey(SUBSIDY_ACTION_KEYS.recordRemittance).validatePayload!({ ...base, lines: [{ claim_line_id: "l-1", amount_cents: 100 }] }).ok,
        ).toBe(true);
    });

    /* NO DEFAULT RESOLUTION — the command will not accept an unnamed one, which is the whole point. */
    it("refuses a variance resolution it does not recognise, and names the ones it does", () => {
        const bad = byKey(SUBSIDY_ACTION_KEYS.resolveVariance).validatePayload!({ variance_id: "v-1", resolution: "just_bill_the_family" });
        expect(bad.ok).toBe(false);
        if (bad.ok !== false) return;
        expect(bad.blockers.some((b) => b.code === "invalid_resolution")).toBe(true);
        for (const resolution of VARIANCE_RESOLUTIONS) {
            expect(byKey(SUBSIDY_ACTION_KEYS.resolveVariance).validatePayload!({ variance_id: "v-1", resolution }).ok, resolution).toBe(true);
        }
    });

    // ── AND THE PERMISSION IS ITS OWN ────────────────────────────────────────────────────────

    it("does not let billing, forgiving or reassigning stand in for administering subsidy", async () => {
        const supabase = grantingClient("ops", ["fin.read", "fin.write", "fin.adjust", "fin.responsibility"]);
        const payload = { program_id: "p-1", customer_id: "c-1", customer_member_id: "m-1", coverage_start: "2032-01-01" };
        const eligibility = await byKey(SUBSIDY_ACTION_KEYS.recordAuthorization).resolveEligibility!({ supabase, ctx, payload, invocation } as never);
        expect(eligibility.eligible).toBe(false);
        expect(eligibility.blockers[0]?.code).toBe("subsidy_permission_required");

        // The eligibility answer is advisory; the WRITE is what has to fail.
        const executed = await byKey(SUBSIDY_ACTION_KEYS.recordAuthorization).execute({ supabase, ctx, payload, invocation } as never);
        expect(executed.ok).toBe(false);
        expect(executed.ok === false && executed.status).toBe(403);
    });

    it("admits an actor holding fin.subsidy", async () => {
        const eligibility = await byKey(SUBSIDY_ACTION_KEYS.submitClaim).resolveEligibility!({
            supabase: grantingClient("admin", [SUBSIDY_PERMISSION]),
            ctx,
            payload: { claim_id: "c-1" },
            invocation,
        } as never);
        expect(eligibility.eligible).toBe(true);
    });

    it("denies when the actor cannot be identified at all", async () => {
        const eligibility = await byKey(SUBSIDY_ACTION_KEYS.submitClaim).resolveEligibility!({
            supabase: grantingClient(null, []),
            ctx: { orgId: "org-1", userId: null } as never,
            payload: { claim_id: "c-1" },
            invocation,
        } as never);
        expect(eligibility.eligible).toBe(false);
    });

    // ── PREVIEWS SAY WHAT THE COMMAND WILL AND WILL NOT DO ──────────────────────────────────

    it("previews submission as suppression, and says plainly that it is not payment", async () => {
        const preview = await byKey(SUBSIDY_ACTION_KEYS.submitClaim).buildPreview!({ payload: { claim_id: "c-1" } } as never);
        expect(preview.summary).toMatch(/not payment/i);
    });

    it("previews a write-off as forgiving money and accepting responsibility as forgiving none", async () => {
        const writeOff = await byKey(SUBSIDY_ACTION_KEYS.resolveVariance).buildPreview!({
            payload: { variance_id: "v-1", resolution: "write_off" },
        } as never);
        expect(writeOff.changes.join(" ")).toMatch(/Thread 10/);
        const accept = await byKey(SUBSIDY_ACTION_KEYS.resolveVariance).buildPreview!({
            payload: { variance_id: "v-1", resolution: "accept_family_responsibility" },
        } as never);
        expect(accept.changes.join(" ")).toMatch(/no money/i);
    });
});

/**
 * AN ENVELOPE THAT SUCCEEDED IS NOT AN OPERATION THAT HAPPENED.
 *
 * ── THE DEFECT, AS MEASURED ──────────────────────────────────────────────────────────────────
 *
 * Resolving a $25.00 obligation against an arrangement whose fixed shares total $500.00 returned:
 *
 *     HTTP 200 · {"ok":true,"data":{"execution_result":{
 *       "kind":"refused","reason":"fixed_exceeds_net","detail":"fixed 50000 over net 2500"}}}
 *
 * `ok` says the route RAN the action. It says nothing about what the action DECIDED. The one
 * executor read only the envelope, so the caller treated a refusal as success: the command surface
 * dismissed, the ledger reloaded unchanged, and the operator was told nothing at all.
 *
 * That is precisely the failure the reverse command's own notes call out — "pressing Confirm and
 * watching nothing happen is indistinguishable from a failure" — arriving through a different door.
 *
 * ── WHY THE FIX IS HERE AND NOT IN THE CALLER ────────────────────────────────────────────────
 *
 * Every financial command from every host goes through this one function. Teaching the
 * responsibility surface to unwrap its own outcome would leave the next command with a domain
 * answer to make the same mistake, and would be a second idea of what a refusal looks like.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { executeFinancialCommand } from "@/lib/financials/commands/financialTransactionCommands";

const respond = (body: unknown, status = 200) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status, json: async () => body }) as never));
};
afterEach(() => vi.unstubAllGlobals());

const run = () =>
    executeFinancialCommand({
        action: "resolveResponsibility",
        entity: { entityType: "child", entityId: "m-ana" },
        payload: { charge_id: "c-1" },
        mode: "execute",
    });

describe("THE GATE — a domain refusal is a refusal", () => {
    /* The exact body the mounted candidate returned. */
    it("reports the engine's refusal instead of reporting success", async () => {
        respond({
            ok: true,
            data: {
                execution_result: {
                    kind: "refused",
                    reason: "fixed_exceeds_net",
                    detail: "fixed 50000 over net 2500",
                },
            },
        });
        const out = await run();
        expect(out.ok, "an envelope that succeeded is not an operation that happened").toBe(false);
        expect(out.ok === false && out.error, "and the operator is told what the engine said")
            .toBe("fixed 50000 over net 2500");
    });

    /*
     * `reallocation_required` also wrote nothing: the arrangement in force would divide this posted
     * charge differently, and that is a decision for an operator, not a silent no-op.
     */
    it("treats reallocation_required as a refusal, not a success", async () => {
        respond({
            ok: true,
            data: {
                execution_result: {
                    kind: "reallocation_required",
                    detail: "This charge is posted and the arrangement in force would divide it differently.",
                },
            },
        });
        const out = await run();
        expect(out.ok).toBe(false);
        expect(out.ok === false && out.error).toMatch(/posted and the arrangement in force/);
    });

    /* Falls back to the code when the engine gave no sentence. */
    it("uses the reason when there is no detail", async () => {
        respond({ ok: true, data: { execution_result: { kind: "refused", reason: "no_account" } } });
        const out = await run();
        expect(out.ok === false && out.error).toBe("no_account");
    });
});

describe("THE GATE — the successes stay successes", () => {
    /* `resolved` is the operation actually happening. */
    it("keeps a resolved outcome successful", async () => {
        respond({ ok: true, data: { execution_result: { kind: "resolved", allocations: 1, netCents: 2500 } } });
        expect((await run()).ok).toBe(true);
    });

    /*
     * `unchanged` is a SUCCESS: the charge is already divided exactly this way, which is what a
     * second identical run has always meant on this path. Reporting it as a refusal would make
     * retries look like failures.
     */
    it("keeps an unchanged outcome successful", async () => {
        respond({ ok: true, data: { execution_result: { kind: "unchanged", arrangementId: "arr-1" } } });
        expect((await run()).ok).toBe(true);
    });

    /* A preview still comes back intact — this is the same path previews travel. */
    it("still returns the action's preview", async () => {
        respond({
            ok: true,
            data: { execution_result: { preview: { summary: "$25.00 to divide.", changes: ["Gross $25.00"] } } },
        });
        const out = await run();
        expect(out.ok && out.preview?.summary).toBe("$25.00 to divide.");
        expect(out.ok && out.preview?.changes).toEqual(["Gross $25.00"]);
    });

    /* Commands whose result carries no `kind` at all are untouched by this rule. */
    it("leaves a command with no domain outcome alone", async () => {
        respond({ ok: true, data: { execution_result: { actionKey: "charge.post", affectedId: "c-1" } } });
        expect((await run()).ok).toBe(true);
    });

    /* An envelope failure is still a failure, and still says why. */
    it("still surfaces an envelope-level refusal", async () => {
        respond({ ok: false, error: "action_key, entity_type, and entity_id are required" });
        const out = await run();
        expect(out.ok).toBe(false);
        expect(out.ok === false && out.error).toMatch(/entity_id are required/);
    });
});

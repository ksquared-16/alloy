/**
 * THE WAKE ENDPOINT'S AUTHORIZATION, DRIVEN RATHER THAN GREPPED.
 *
 * The sibling suite locks the SHAPE of `isAuthorizedClock` in source. That catches a
 * rewrite, but it cannot catch a gate that is present and does not fire, or a verb
 * that reaches the runtime before the gate runs. This drives the exported handlers.
 *
 * The substantive assertion in every refusal case is not the 401 — it is that the
 * runtime was NEVER ENTERED. An endpoint that ran the wake and then returned 401
 * would satisfy a status-code test while driving every scheduled consequence in the
 * platform for an anonymous caller.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runWake = vi.fn(async () => ({
    workerId: "w", claimed: 0, completed: 0, retryScheduled: 0,
    terminallyFailed: 0, unregisteredHandler: 0, occurrences: [],
}));

vi.mock("@/lib/scheduledWork/scheduledWorkRuntime", () => ({
    runScheduledWorkWake: (...args: unknown[]) => runWake(...(args as [])),
}));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({}) }));

import { GET, POST } from "@/app/api/scheduled-work/wake/route";

const BEARER = "cron-secret-value";
const TOKEN = "internal-cron-token-value";

function req(headers: Record<string, string> = {}) {
    return new Request("https://staging.example/api/scheduled-work/wake", {
        headers,
    }) as unknown as Parameters<typeof GET>[0];
}

const ORIGINAL = { ...process.env };

beforeEach(() => {
    runWake.mockClear();
    process.env.CRON_SECRET = BEARER;
    process.env.INTERNAL_CRON_TOKEN = TOKEN;
});
afterEach(() => {
    process.env = { ...ORIGINAL };
});

describe("scheduled work wake — authorization", () => {
    for (const [verb, handler] of [["GET", GET], ["POST", POST]] as const) {
        describe(verb, () => {
            it("refuses an anonymous caller without entering the runtime", async () => {
                const res = await handler(req());
                expect(res.status).toBe(401);
                expect(runWake).not.toHaveBeenCalled();
            });

            it("refuses a wrong bearer and a wrong token", async () => {
                const cases: Record<string, string>[] = [
                    { authorization: "Bearer not-the-secret" },
                    { authorization: BEARER }, // right value, missing the Bearer scheme
                    { "x-cron-token": "not-the-token" },
                ];
                for (const h of cases) {
                    const res = await handler(req(h));
                    expect(res.status, JSON.stringify(h)).toBe(401);
                }
                expect(runWake).not.toHaveBeenCalled();
            });

            it("accepts the Vercel Cron bearer", async () => {
                const res = await handler(req({ authorization: `Bearer ${BEARER}` }));
                expect(res.status).toBe(200);
                expect(runWake).toHaveBeenCalledTimes(1);
            });

            it("accepts the estate's machine token", async () => {
                const res = await handler(req({ "x-cron-token": TOKEN }));
                expect(res.status).toBe(200);
                expect(runWake).toHaveBeenCalledTimes(1);
            });

            it("an UNSET secret refuses even a caller presenting an empty credential", async () => {
                // The deployment failure this guards: an environment that never set
                // CRON_SECRET, where `"" === ""` would otherwise authorize the world.
                delete process.env.CRON_SECRET;
                delete process.env.INTERNAL_CRON_TOKEN;
                const cases: Record<string, string>[] = [{}, { authorization: "Bearer " }, { "x-cron-token": "" }];
                for (const h of cases) {
                    const res = await handler(req(h));
                    expect(res.status, JSON.stringify(h)).toBe(401);
                }
                expect(runWake).not.toHaveBeenCalled();
            });

            it("an EMPTY-STRING secret is not a credential", async () => {
                process.env.CRON_SECRET = "   ";
                process.env.INTERNAL_CRON_TOKEN = "";
                const res = await handler(req({ authorization: "Bearer    " }));
                expect(res.status).toBe(401);
                expect(runWake).not.toHaveBeenCalled();
            });
        });
    }

    it("WHY an unset CRON_SECRET is safe on the bearer branch — header normalization", () => {
        // Measured, not assumed. Removing BOTH the `bearerExpected &&` guard and the
        // `.trim()` still refuses every caller, because a fetch Headers value is
        // normalized: `get()` can never return a string ending in a space, so it can
        // never equal the `Bearer ` that an empty secret would interpolate to.
        //
        // So the guard in the route is defensive, not load-bearing, and this asserts
        // the mechanism that IS. A future rewrite reading the raw header from
        // somewhere unnormalized would make that guard the only protection left.
        expect(req({ authorization: "Bearer " }).headers.get("authorization")).toBe("Bearer");
        expect(req({ authorization: "  Bearer x  " }).headers.get("authorization")).toBe("Bearer x");
    });

    it("the token branch's two emptiness guards are JOINTLY load-bearing", () => {
        // Dropping either `tokenExpected &&` or `token &&` alone changes nothing;
        // dropping both makes `"" === ""` authorize an anonymous caller in an
        // environment that never set INTERNAL_CRON_TOKEN. Measured on this suite:
        // each alone stays green, both together fails 4 tests. Recorded so neither
        // reads as dead code to a later reader who removes "the redundant one".
        const src = require("node:fs").readFileSync(
            require("node:path").join(__dirname, "../../app/api/scheduled-work/wake/route.ts"), "utf8") as string;
        expect(src).toContain("Boolean(tokenExpected && token && token === tokenExpected)");
    });

    it("both verbs reach the SAME runtime — the verb is a convention, not a behaviour", async () => {
        await GET(req({ authorization: `Bearer ${BEARER}` }));
        await POST(req({ authorization: `Bearer ${BEARER}` }));
        expect(runWake).toHaveBeenCalledTimes(2);
    });

    it("a runtime failure is a 500, not a silent ok", async () => {
        runWake.mockRejectedValueOnce(new Error("claim exploded") as never);
        const res = await GET(req({ authorization: `Bearer ${BEARER}` }));
        expect(res.status).toBe(500);
        expect(await res.json()).toMatchObject({ ok: false, error: "WAKE_FAILED" });
    });
});

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

/**
 * PHASE 1 OF MODEL A — THE DATA PATH IS LOCKED.
 *
 * `docs/platform/foundation/platform-decisions.md` § *2026-09 — Route capabilities
 * authorize; RLS isolates tenants; mutation is server-side* ratified Model A, and
 * `rls-authority-model-director-gate.md` § *Staged plan* names this as the phase that
 * must land before anything else:
 *
 *   > Phase 1 — lock the intended data path (no migration). A repo lock asserting:
 *   > no client component calls `supabase.from()`/`.rpc()`; the browser client is
 *   > auth-only. This freezes the assumption the whole model rests on.
 *
 * WHY IT IS THE FOUNDATION AND NOT A TIDINESS RULE. Model A says RLS may say *no* on
 * writes without deciding *who*, and that route capabilities are the real authority.
 * That is only coherent while the browser never writes. The moment one client
 * component writes a table directly, RLS becomes the sole authority for that write —
 * and RLS was deliberately not built to carry business authorization. So this lock
 * does not protect a convention; it protects the premise that makes the ratified
 * model safe.
 *
 * WHAT THE PREVIOUS LOCK DID NOT COVER. `tests/adminV2/actions/noClientDirectMutation.test.ts`
 * asserts the same doctrine for THREE named files. A three-file allowlist cannot
 * notice a fourth, and the subject here is discovered from disk for the reason
 * `routeCapabilityDeclaration.test.ts` records: an enumerated subject has defeated
 * RL-1, RL-4 and RL-11 in this repository already.
 */

const WEB = resolve(__dirname, "..", "..");
const SEARCH_ROOTS = ["app", "components", "lib", "hooks"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", "playwright", "tests", "__tests__"]);

function walk(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        let st;
        try {
            st = statSync(full);
        } catch {
            continue;
        }
        if (st.isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

const FILES = SEARCH_ROOTS.flatMap((r) => walk(join(WEB, r))).sort();
const rel = (f: string) => relative(WEB, f).split("\\").join("/");

/**
 * Comments explain intent; they do not execute. Three separate guards in this
 * repository have been fooled by their own explanatory prose — a `/cleaning/` probe
 * matching the sentence that said cleaning was removed, a `/status_key/` probe
 * matching a comment recording that `status_key` is no longer sent. Strip first.
 */
function codeOnly(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Files that construct or import a browser-side Supabase client. */
const BROWSER_CLIENT = /createBrowserClient|createClientComponentClient|@\/lib\/supabaseClient|from\s+["']\.\.?\/.*supabaseClient["']/;

const browserClientFiles = FILES.filter((f) => BROWSER_CLIENT.test(codeOnly(readFileSync(f, "utf8"))));

/**
 * `lib/pricing/supabasePricing.ts` is the ONE browser-client module that calls
 * something other than `supabase.auth.*`: the read-only `get_quote_pricing` RPC,
 * for the cleaning vertical retired in 2026-07. It has ZERO callers.
 *
 * It is pinned here rather than allowlisted away. An allowlist entry would permit
 * exactly the thing this lock exists to prevent; pinning it as DEAD means wiring it
 * back up fails this test and forces the decision to be made deliberately. Its
 * removal is ledgered for the cleaning-retirement owner, not taken here.
 */
const DEAD_BROWSER_RPC = "lib/pricing/supabasePricing.ts";

describe("Model A Phase 1 — the client data path", () => {
    it("is not vacuous: the sweep finds the browser-client files it is guarding", () => {
        expect(FILES.length, "no source files discovered at all").toBeGreaterThan(1000);
        expect(
            browserClientFiles.map(rel),
            "the sweep found no browser Supabase client anywhere, which cannot be true — login and middleware both build one",
        ).not.toEqual([]);
    });

    it("no source file writes a table through a browser Supabase client", () => {
        const offenders: string[] = [];
        for (const f of browserClientFiles) {
            const code = codeOnly(readFileSync(f, "utf8"));
            if (/\.from\(\s*["'`][a-z_]+["'`]\s*\)\s*(\.\s*\w+\(\s*\))?\s*\.\s*(insert|update|delete|upsert)\s*\(/.test(code)) {
                offenders.push(rel(f));
            }
        }
        expect(
            offenders,
            "these files hold a browser Supabase client AND mutate a table directly. Model A requires mutation to run "
                + "server-side after capability and scope resolution; a direct client write makes RLS the only authority "
                + "for that write, and RLS was deliberately not built to carry business authorization.",
        ).toEqual([]);
    });

    it("every browser-client call is supabase.auth.*, with one pinned dead exception", () => {
        const nonAuth: { file: string; calls: string[] }[] = [];
        for (const f of browserClientFiles) {
            const code = codeOnly(readFileSync(f, "utf8"));
            const calls = [...code.matchAll(/\bsupabase[A-Za-z]*\s*\.\s*(from|rpc|storage|functions)\s*\(/g)].map((m) => m[1]);
            if (calls.length > 0) nonAuth.push({ file: rel(f), calls: [...new Set(calls)].sort() });
        }
        expect(
            nonAuth.map((n) => n.file).sort(),
            "a browser Supabase client reached the data plane. Only `supabase.auth.*` is sanctioned in the browser; "
                + "reads and writes belong to server routes that have already resolved capability, tenancy and scope.",
        ).toEqual([DEAD_BROWSER_RPC]);
    });

    it("the one pinned exception is still dead, so the exception cannot quietly grow", () => {
        // A pinned exception that acquires a caller has stopped being an exception.
        const importers = FILES.filter((f) => f !== join(WEB, DEAD_BROWSER_RPC)).filter((f) =>
            /getQuotePricingFromSupabase|convertSupabaseResultToQuoteResult/.test(codeOnly(readFileSync(f, "utf8"))),
        );
        expect(
            importers.map(rel),
            `${DEAD_BROWSER_RPC} is permitted to call get_quote_pricing ONLY because nothing calls it. `
                + "Something now does. Either route this through a server path, or remove the module.",
        ).toEqual([]);
    });

    it("no new API route introduces an RLS-bound write client", () => {
        // The server RLS-bound client (`lib/supabaseServer.ts`) exists for session
        // resolution. A route that used it to WRITE would put product mutation on
        // the authenticated principal, which is the data path Model A forecloses.
        const offenders: string[] = [];
        for (const f of FILES.filter((f) => /\/app\/api\//.test(f) && /route\.tsx?$/.test(f))) {
            const code = codeOnly(readFileSync(f, "utf8"));
            if (!/@\/lib\/supabaseServer/.test(code)) continue;
            if (/\.from\(\s*["'`][a-z_]+["'`]\s*\)[\s\S]{0,200}?\.\s*(insert|update|delete|upsert)\s*\(/.test(code)) {
                offenders.push(rel(f));
            }
        }
        expect(
            offenders,
            "these API routes write through the RLS-bound server client. Server mutation runs under `service_role` "
                + "after the route has authorized the operation; writing as the user's own DB identity moves authority "
                + "back into RLS.",
        ).toEqual([]);
    });
});

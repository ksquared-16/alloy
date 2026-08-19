/**
 * `RL-32` — the public-form family's leg: an expired or deactivated form link reaches no side effect.
 *
 * `03-implementation-qa-sequence.md` §19 (`W-40`) and §25's `RL-32`. `RL-30` proved every sessionless
 * side-effecting route authenticates its sender; `RL-32` is the two things that does NOT prove —
 * that the check PRECEDES the side effect, and that the credential is bound to its subject. Session
 * 12 locked those for the `action_links` and webhook families. This is the public-form family, which
 * had no lock of its own.
 *
 * **The family's credential is not single-use, so its obligation is different.** A form link is meant
 * to be opened repeatedly; replay is its normal mode. What must never happen is a link that is
 * EXPIRED or DEACTIVATED reaching a write. Today that holds by construction — every side-effecting
 * route funnels through `resolvePublicFormLinkByToken`, which refuses `is_active = false` and any
 * `expires_at` in the past BEFORE returning a context, and which looks the row up by `token_hash`
 * rather than by the plaintext the caller sent.
 *
 * **Holding by construction is exactly what needs a lock.** Nothing stops a new route under
 * `app/api/public/forms/` from querying `form_links` directly and skipping both refusals — which is
 * the same shape as the `W-14` finding that a gate reached through a helper is invisible to a
 * file-grained reading. The subject is DISCOVERED from disk, so a route added tomorrow is covered
 * tomorrow.
 *
 * Recorded while establishing the above, because it is the other half of `S-3` and is easy to lose:
 * `form_links` stores `token_hash` and hashes the caller's token to look it up, while `action_links`
 * still stores its bearer token in the clear. **The remediation pattern `S-3` needs already exists in
 * this repository** — it is not a design that has to be invented, only a dual-read migration that
 * has to be applied (OD-1).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";

const webRoot = join(__dirname, "..", "..");
const PUBLIC_FORMS = join(webRoot, "app", "api", "public", "forms");

/** The one resolver that refuses inactive and expired links, and hashes before it looks up. */
const RESOLVER = "resolvePublicFormLinkByToken";
const SIDE_EFFECT_METHODS = ["POST", "PATCH", "PUT", "DELETE"] as const;

function code(abs: string): string {
    // Comments stripped: a route explaining the resolver in prose must not satisfy the check.
    return readFileSync(abs, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
}

function routeFilesUnder(abs: string): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir)) {
            const p = join(dir, entry);
            if (statSync(p).isDirectory()) walk(p);
            else if (entry === "route.ts") out.push(p);
        }
    };
    walk(abs);
    return out.sort();
}

function exportedSideEffectMethods(src: string): string[] {
    return SIDE_EFFECT_METHODS.filter((m) =>
        new RegExp(String.raw`export\s+(?:async\s+)?function\s+${m}\b`).test(src),
    );
}

/** Resolve a `@/`-aliased or relative import to a file under `web/`. */
function resolveImport(fromAbs: string, spec: string): string | null {
    const base = spec.startsWith("@/")
        ? join(webRoot, spec.slice(2))
        : spec.startsWith(".")
          ? resolve(dirname(fromAbs), spec)
          : null;
    if (!base) return null;
    for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
        if (existsSync(cand) && statSync(cand).isFile()) return cand;
    }
    return null;
}

/**
 * Does this route reach the resolver? Bounded import walk — the route itself, then the modules it
 * imports, then theirs. Bounded rather than unlimited because an unbounded walk credits a route for
 * anything transitively reachable, which is the ~30x over-reporting the census was retired for.
 */
function reachesResolver(routeAbs: string, maxDepth = 3): boolean {
    const seen = new Set<string>();
    const frontier: { abs: string; depth: number }[] = [{ abs: routeAbs, depth: 0 }];
    while (frontier.length) {
        const { abs, depth } = frontier.shift()!;
        if (seen.has(abs) || depth > maxDepth) continue;
        seen.add(abs);
        const src = code(abs);
        if (src.includes(RESOLVER)) return true;
        for (const [, spec] of src.matchAll(/from\s+["']([^"']+)["']/g)) {
            const next = resolveImport(abs, spec);
            if (next) frontier.push({ abs: next, depth: depth + 1 });
        }
    }
    return false;
}

const sideEffectRoutes = routeFilesUnder(PUBLIC_FORMS)
    .map((abs) => ({ abs, rel: relative(webRoot, abs).split("\\").join("/"), methods: exportedSideEffectMethods(code(abs)) }))
    .filter((r) => r.methods.length > 0);

describe("RL-32 · public forms — an expired or deactivated link reaches no side effect", () => {
    it("finds the side-effecting routes it is supposed to be checking", () => {
        // Non-vacuity on the WALK, not on the assertion: an empty subject would make every
        // assertion below pass by agreeing with nothing.
        expect(sideEffectRoutes.length).toBeGreaterThanOrEqual(3);
        expect(sideEffectRoutes.map((r) => r.rel)).toContain(
            "app/api/public/forms/[token]/submissions/route.ts",
        );
    });

    it.each(sideEffectRoutes.map((r) => [r.rel, r.abs] as const))(
        "%s resolves its credential through the refusing resolver",
        (rel, abs) => {
            expect(
                reachesResolver(abs),
                `${rel}: reach ${RESOLVER} — it is what refuses an inactive or expired link, and it `
                    + "refuses BEFORE any write. A route that reads the link itself skips both refusals.",
            ).toBe(true);
        },
    );

    it("no public-form route queries the link table directly", () => {
        const offenders = routeFilesUnder(PUBLIC_FORMS)
            .filter((abs) => /from\(\s*["'`]form_links["'`]\s*\)/.test(code(abs)))
            .map((abs) => relative(webRoot, abs).split("\\").join("/"));
        expect(
            offenders,
            "a direct read bypasses the is_active and expires_at refusals, and the token_hash lookup",
        ).toEqual([]);
    });

    it("the resolver still refuses both states, and refuses before returning a context", () => {
        // The lock above is only worth anything while this remains true. Asserted against source
        // rather than assumed, so weakening the resolver fails here rather than silently widening
        // every route that trusts it.
        const src = code(join(webRoot, "lib/public/forms/resolvePublicFormLink.ts"));

        // Matched as a RETURNED REFUSAL, not as the string. The first version of this assertion used
        // `indexOf("EXPIRED")`, which matches the error-code TYPE UNION on line 20 — so deleting the
        // actual refusal left the lock green. Caught by reverting the protection rather than by
        // reading the test, which is the only way that class of vacuity surfaces.
        const refusal = (codeName: string) =>
            new RegExp(String.raw`return\s*\{\s*ok:\s*false,\s*error:\s*\{\s*code:\s*["']${codeName}["']`);

        const inactiveAt = src.search(refusal("INACTIVE"));
        const expiredAt = src.search(refusal("EXPIRED"));
        expect(inactiveAt, "resolver no longer REFUSES an inactive link").toBeGreaterThan(-1);
        expect(expiredAt, "resolver no longer REFUSES an expired link").toBeGreaterThan(-1);

        // The refusal must also be reached from an actual expiry comparison, not merely present.
        expect(src).toMatch(/expires_at/);

        // Both refusals precede the form-definition read the context is built from.
        const buildsContext = src.indexOf('from("form_definitions")');
        expect(buildsContext).toBeGreaterThan(-1);
        expect(inactiveAt).toBeLessThan(buildsContext);
        expect(expiredAt).toBeLessThan(buildsContext);
    });

    it("the credential is matched by hash, not by the plaintext the caller sent", () => {
        const src = code(join(webRoot, "lib/public/forms/resolvePublicFormLink.ts"));
        expect(src).toMatch(/token_hash/);
        expect(src, "the lookup must not match on a plaintext token column").not.toMatch(
            /\.eq\(\s*["'`]token["'`]/,
        );
    });

    it("bites: a route that skips the resolver is convicted", () => {
        // Proved against a fabricated module rather than asserted, and against BOTH directions so a
        // walk that returns true for everything cannot pass.
        const bypass = join(webRoot, "lib", "forms", "schema.ts");
        expect(existsSync(bypass)).toBe(true);
        expect(reachesResolver(bypass), "an unrelated module must not read as resolving").toBe(false);
    });
});

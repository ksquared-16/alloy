/**
 * W-20 / `T-19` — tier A, discovered subject: **no product path deletes a membership without
 * establishing what that deletion actually revokes.**
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §48.
 *
 * Why a discovered lock and not three assertions about one file. `W-5` established the question this
 * initiative asks of every lock — *does it DISCOVER or ENUMERATE?* — and the register records four
 * locks that shipped green with a live escape because the answer was "enumerate". Today there is
 * exactly one route that deletes a `user_roles` row. A lock written against that file passes forever
 * and says nothing about the second one. The subject here is therefore *every module that can delete
 * a membership*, found by walking the import closure of every route — the same discipline
 * `selfAuthorityRouteDiscovery` uses, and for the same reason: `users/[userId]/role/route.ts`
 * mutates membership while containing the string `user_roles` nowhere.
 *
 * The three claims:
 *
 * 1. A module that deletes a membership consults the residual-authority guard **before** the delete.
 * 2. It gets its legacy answer from the module that GRANTS it (`readLegacyAdminOpsAuthority`) rather
 *    than reading `user_profiles` / `app_users` itself. A guard with its own copy of the fallback's
 *    precedence is a second opinion about admission, which is `W-42`'s defect in a new place.
 * 3. A surface offering a removal does not claim the member loses access — the claim `T-19`
 *    falsifies — and carries the acknowledgement path, so the refusal is not a dead end.
 *
 * **Comments are stripped before any of this is scanned.** The route's own documentation names
 * `app_users.role` and `user_profiles` while describing the defect, and the guard module quotes the
 * plan. An unstripped scan convicts the very code that fixes the bug — §10.2's lesson, and the
 * fourth time this initiative has paid for it.
 */
import { readdirSync, readFileSync, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

const webRoot = join(__dirname, "..", "..");

/* ------------------------------------------------------------------ source reading */

/**
 * Remove comments while leaving string and template literals intact.
 *
 * A naive `//` strip truncates any line containing `http://` and would silently shorten the text a
 * later check searches — a false negative, which for a security lock is the unsafe direction.
 */
export function stripComments(src: string): string {
    let out = "";
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        const next = src[i + 1];
        if (c === "/" && next === "/") {
            while (i < src.length && src[i] !== "\n") i += 1;
            continue;
        }
        if (c === "/" && next === "*") {
            i += 2;
            while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
            i += 2;
            continue;
        }
        if (c === '"' || c === "'" || c === "`") {
            const quote = c;
            out += c;
            i += 1;
            while (i < src.length) {
                if (src[i] === "\\") {
                    out += src[i] + (src[i + 1] ?? "");
                    i += 2;
                    continue;
                }
                out += src[i];
                if (src[i] === quote) {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }
        out += c;
        i += 1;
    }
    return out;
}

function sourceFilesUnder(absDir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        if (!existsSync(abs)) return;
        for (const entry of readdirSync(abs, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
            const child = join(abs, entry.name);
            if (entry.isDirectory()) walk(child);
            else if (/\.tsx?$/.test(entry.name)) out.push(child);
        }
    };
    walk(absDir);
    return out;
}

const readCache = new Map<string, string>();
function code(abs: string): string {
    let src = readCache.get(abs);
    if (src === undefined) {
        src = stripComments(readFileSync(abs, "utf8"));
        readCache.set(abs, src);
    }
    return src;
}

function resolveImport(spec: string, fromAbs: string, root: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = join(root, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(fromAbs), spec);
    else return null;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
}

const IMPORT_SPEC = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;

function localImports(abs: string, root: string): string[] {
    const out: string[] = [];
    for (const m of code(abs).matchAll(IMPORT_SPEC)) {
        const resolved = resolveImport(m[1], abs, root);
        if (resolved) out.push(resolved);
    }
    return out;
}

/* --------------------------------------------------------- membership deletion sites */

/** `from("user_roles") … .delete()` — the statement that revokes a membership. */
const MEMBERSHIP_DELETE = /from\(\s*["'`]user_roles["'`]\s*\)\s*(?:\.\s*\w+\([^)]*\)\s*)*?\.\s*delete\b/;

function deletesMembership(abs: string): boolean {
    return MEMBERSHIP_DELETE.test(code(abs));
}

/** Every module reachable from a route that deletes a membership. */
function membershipDeletingModules(root: string): string[] {
    const routes = sourceFilesUnder(join(root, "app", "api")).filter((abs) => /[/\\]route\.tsx?$/.test(abs));
    const found = new Set<string>();
    const seen = new Set<string>();
    const walk = (abs: string) => {
        if (seen.has(abs)) return;
        seen.add(abs);
        if (deletesMembership(abs)) found.add(abs);
        for (const dep of localImports(abs, root)) walk(dep);
    };
    for (const route of routes) walk(route);
    return [...found].sort();
}

/* ------------------------------------------------------------------------- the checks */

type Violation = { file: string; why: string };

function guardViolations(root: string): Violation[] {
    const out: Violation[] = [];
    for (const abs of membershipDeletingModules(root)) {
        const src = code(abs);
        const rel = relative(root, abs).split("\\").join("/");

        const guardAt = src.search(/\bremovalResidualAuthority\s*\(/);
        const refusalAt = src.search(/\bremovalRefusal\s*\(/);
        const deleteAt = src.search(MEMBERSHIP_DELETE);

        if (guardAt < 0 || refusalAt < 0) {
            out.push({
                file: rel,
                why:
                    "deletes a user_roles row without asking removalResidualAuthority/removalRefusal "
                    + "(@/lib/access/membershipRemovalResidual) — the removal may revoke nothing and "
                    + "report success, which is T-19",
            });
            continue;
        }
        if (guardAt > deleteAt || refusalAt > deleteAt) {
            out.push({
                file: rel,
                why: "consults the residual guard AFTER the delete — a refusal issued after the write is not a guard",
            });
        }
        if (/from\(\s*["'`](?:user_profiles|app_users)["'`]\s*\)/.test(src)) {
            out.push({
                file: rel,
                why:
                    "reads the legacy identity tables itself instead of calling readLegacyAdminOpsAuthority "
                    + "from the module that grants them — a second opinion about admission (W-42's shape)",
            });
        }
        if (!src.includes("readLegacyAdminOpsAuthority")) {
            out.push({
                file: rel,
                why: "does not obtain its legacy answer from @/lib/admin/resolveAdminAccessCore",
            });
        }
    }
    return out;
}

/* ------------------------------------------------------------------- removal surfaces */

/** Client modules that POST to the membership-removal route. Discovered, not listed. */
function removalSurfaces(root: string): string[] {
    return sourceFilesUnder(join(root, "app"))
        .filter((abs) => !abs.includes(join("app", "api")))
        .filter((abs) => /\/remove["'`]/.test(code(abs)) && /\/api\/admin\/users\//.test(code(abs)))
        .sort();
}

/** The claim `T-19` falsifies, in the copy an operator reads before confirming. */
const ACCESS_LOSS_CLAIM = /(?:will\s+)?lose\s+access|loses\s+access|access\s+will\s+be\s+revoked/i;

describe("W-20/T-19 — every membership deletion establishes what it revokes", () => {
    it("finds the removal route (discovery has not silently stopped)", () => {
        const found = membershipDeletingModules(webRoot).map((abs) => relative(webRoot, abs).split("\\").join("/"));
        expect(found).toContain("app/api/admin/users/[userId]/remove/route.ts");
    });

    it("no membership-deleting module writes before the residual guard answers", () => {
        expect(
            guardViolations(webRoot),
            "a deletion that cannot say what it revoked reports a revocation that may not have happened",
        ).toEqual([]);
    });

    it("no removal surface claims the member loses access, and each carries the acknowledgement path", () => {
        const surfaces = removalSurfaces(webRoot);
        // Anchor: if discovery finds nothing, the two assertions below pass by agreeing with nothing.
        expect(surfaces.length).toBeGreaterThanOrEqual(2);

        const lying = surfaces
            .filter((abs) => ACCESS_LOSS_CLAIM.test(code(abs)))
            .map((abs) => relative(webRoot, abs).split("\\").join("/"));
        expect(
            lying,
            "removal deletes a membership; whether the person loses ACCESS depends on the legacy "
                + "identity fallback, and the route is what knows",
        ).toEqual([]);

        const deadEnd = surfaces
            .filter((abs) => !code(abs).includes("acknowledge_residual_authority"))
            .map((abs) => relative(webRoot, abs).split("\\").join("/"));
        expect(
            deadEnd,
            "a surface that cannot send the acknowledgement turns a truthful refusal into an operator "
                + "with no way to remove the member at all",
        ).toEqual([]);
    });

    it("the granting module keeps the three-state read, and collapses it in exactly one place", () => {
        const src = code(join(webRoot, "lib", "admin", "resolveAdminAccessCore.ts"));
        expect(src).toMatch(/export\s+async\s+function\s+readLegacyAdminOpsAuthority/);
        expect(src).toMatch(/status:\s*"unknown"/);
        // The resolver's collapse of unknown→deny must exist once. More than one site is how the two
        // meanings of `null` got back into circulation in the first place.
        const collapses = src.match(/read\.status === "present"/g) ?? [];
        expect(collapses).toHaveLength(1);
    });
});

/* --------------------------------------------------------------------- non-vacuity */

/**
 * Each fixture is built to fail exactly one check. Fixtures live in a temp directory and never under
 * `app/api` of the real tree, so a run killed mid-test cannot leave a stray route behind — session
 * 4's rule, and the reason its fixture block was safe to write.
 */
function fixtureTree(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "w20-scan-"));
    for (const [rel, body] of Object.entries(files)) {
        const abs = join(root, rel);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, body, "utf8");
    }
    return root;
}

const COMPLIANT_ROUTE = `
import { readLegacyAdminOpsAuthority } from "@/lib/admin/resolveAdminAccessCore";
import { removalResidualAuthority, removalRefusal } from "@/lib/access/membershipRemovalResidual";
export async function POST() {
    const legacyRead = await readLegacyAdminOpsAuthority(supabase, userId);
    const residual = removalResidualAuthority({ fallbackWouldBeConsulted: true, legacyRead });
    if (removalRefusal({ residual, acknowledged: false })) return refuse();
    await supabase.from("user_roles").delete().eq("user_id", userId);
}
`;

describe("W-20/T-19 — the scan bites (non-vacuity, by fixture)", () => {
    const roots: string[] = [];
    const build = (files: Record<string, string>) => {
        const root = fixtureTree(files);
        roots.push(root);
        readCache.clear();
        return root;
    };
    const cleanup = () => {
        for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
        readCache.clear();
    };

    it("passes a compliant route, so the checks discriminate rather than reject everything", () => {
        const root = build({ "app/api/x/route.ts": COMPLIANT_ROUTE });
        try {
            expect(guardViolations(root)).toEqual([]);
        } finally {
            cleanup();
        }
    });

    it("convicts a deletion with no guard at all", () => {
        const root = build({
            "app/api/x/route.ts": `
export async function POST() {
    await supabase.from("user_roles").delete().eq("user_id", userId);
}
`,
        });
        try {
            const v = guardViolations(root);
            expect(v).toHaveLength(1);
            expect(v[0].why).toContain("without asking removalResidualAuthority");
        } finally {
            cleanup();
        }
    });

    it("convicts a guard that answers after the write", () => {
        const root = build({
            "app/api/x/route.ts": `
import { readLegacyAdminOpsAuthority } from "@/lib/admin/resolveAdminAccessCore";
import { removalResidualAuthority, removalRefusal } from "@/lib/access/membershipRemovalResidual";
export async function POST() {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const residual = removalResidualAuthority({ fallbackWouldBeConsulted: true, legacyRead: null });
    if (removalRefusal({ residual, acknowledged: false })) return refuse();
}
`,
        });
        try {
            const v = guardViolations(root);
            expect(v.map((x) => x.why).join(" ")).toContain("AFTER the delete");
        } finally {
            cleanup();
        }
    });

    it("convicts a deleter that re-reads the legacy tables itself", () => {
        const root = build({
            "app/api/x/route.ts": `
import { readLegacyAdminOpsAuthority } from "@/lib/admin/resolveAdminAccessCore";
import { removalResidualAuthority, removalRefusal } from "@/lib/access/membershipRemovalResidual";
export async function POST() {
    const { data } = await supabase.from("app_users").select("role").eq("id", userId).maybeSingle();
    const residual = removalResidualAuthority({ fallbackWouldBeConsulted: true, legacyRead: null });
    if (removalRefusal({ residual, acknowledged: false })) return refuse();
    await supabase.from("user_roles").delete().eq("user_id", userId);
}
`,
        });
        try {
            const v = guardViolations(root);
            expect(v.map((x) => x.why).join(" ")).toContain("second opinion about admission");
        } finally {
            cleanup();
        }
    });

    it("follows a helper-mediated deletion, which a route-file census misses", () => {
        // The alias is interpolated rather than written inline. `verify:module-imports` is a
        // deployment guard that regex-scans tracked source for alias imports with no notion of
        // string literals, so an inline spelling here reads as this test file importing a module
        // that does not exist in `web/` — it exists only inside the synthetic root built below.
        // The emitted fixture is byte-identical either way; only the source spelling changes.
        // (Do not name the pattern literally in this comment: the scanner would match that too.)
        const helperAlias = "@/lib/revoke";
        const root = build({
            "app/api/x/route.ts": `import { revoke } from ${JSON.stringify(helperAlias)};
export async function POST() { await revoke(); }
`,
            "lib/revoke.ts": `export async function revoke() {
    await supabase.from("user_roles").delete().eq("user_id", userId);
}
`,
        });
        try {
            const v = guardViolations(root);
            expect(v).toHaveLength(1);
            expect(v[0].file).toBe("lib/revoke.ts");
        } finally {
            cleanup();
        }
    });

    it("does not mistake a commented-out delete, or prose about app_users, for the real thing", () => {
        // Both halves of §10.2's lesson in one fixture: the comment must not create a subject, and
        // prose naming the legacy tables must not convict a compliant module.
        const root = build({
            "app/api/x/route.ts": `
/** Historically this read app_users.role and did supabase.from("user_roles").delete(). */
export async function POST() { return ok(); }
`,
            "app/api/y/route.ts": COMPLIANT_ROUTE.replace(
                "export async function POST",
                "/* Fixes the app_users.role fallback: from(\"app_users\") was read here. */\nexport async function POST",
            ),
        });
        try {
            const modules = membershipDeletingModules(root).map((abs) => relative(root, abs));
            expect(modules).toEqual(["app/api/y/route.ts"]);
            expect(guardViolations(root)).toEqual([]);
        } finally {
            cleanup();
        }
    });
});

/**
 * W-20 / `RL-12` — tier A, discovered subject: **membership is the only source of authority, so a
 * membership deletion cannot fail to revoke.**
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §48 and §5.
 *
 * **What this file used to assert, and why it changed.** `T-19` closed the live half of `W-20`
 * first (§1.6): the resolver fell through to `user_profiles.role` and `app_users.role` for a
 * principal with no membership row, so deleting the last membership could leave — or even confer —
 * `admin`. Removal reported `{ ok: true }` for an operation that revoked nothing. The remedy was a
 * guard: read the legacy tables before deleting, refuse, report the residual. This lock asserted
 * that guard was present, ordered before the write, and sourced its answer from the module that
 * granted the authority rather than re-reading the tables itself.
 *
 * `W-20`'s removal half has now landed. `Q15-A1`, run against the deployed tenant through the
 * governed trusted-host path, returned **zero** principals who would lose all authority — and
 * `A2`/`A3` returned zero legacy values of any kind, so the columns held no role for anyone. The
 * fallback is deleted from both resolvers, the guard is deleted with it, and the defect it caught
 * is now structurally impossible rather than caught.
 *
 * So the subject moved one level down, from *"is the guard present"* to *"is there anything left to
 * guard against"*. The claims:
 *
 * 1. No module that can delete a membership reads a legacy identity store.
 * 2. No authority-path module reads one either — stated over **every** module, because `M2-5` is
 *    that `resolveAdminPortalOrgCore` re-implemented the fallback and served `requireAdminOrOps`
 *    across 147 route files. Deleting it from the enforcing resolver alone would have left the copy
 *    granting, and this is the check that would have said so.
 * 3. A surface offering a removal does not claim more than the command performs — `RL-54`.
 *
 * **The discovery discipline is unchanged, and is the reason the file survives its own rewrite.**
 * `W-5` established the question this initiative asks of every lock — *does it DISCOVER or
 * ENUMERATE?* — and the register records four locks that shipped green with a live escape because
 * the answer was "enumerate". The subject here is every module that can delete a membership, found
 * by walking the import closure of every route: `users/[userId]/role/route.ts` mutates membership
 * while containing the string `user_roles` nowhere.
 *
 * **Comments are stripped before any of this is scanned.** This file, the route and the resolvers
 * all name `app_users.role` and `user_profiles` while describing the defect they removed. An
 * unstripped scan convicts the very code that fixes the bug — §10.2's lesson, and the fourth time
 * this initiative has paid for it.
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

/** Any read of a legacy identity store, in code rather than in prose. */
const LEGACY_STORE_READ = /from\(\s*["'`](?:user_profiles|app_users)["'`]\s*\)/;

/**
 * Modules that can delete a membership AND still read a legacy identity store.
 *
 * After `W-20` these two facts must never co-occur: a deleter that reads those tables is either
 * re-deriving the fallback it was supposed to lose, or holding a second opinion about what admits a
 * principal. Both are the fifth layer returning under another name.
 */
function legacyReadingDeleters(root: string): Violation[] {
    const out: Violation[] = [];
    for (const abs of membershipDeletingModules(root)) {
        const src = code(abs);
        if (!LEGACY_STORE_READ.test(src)) continue;
        out.push({
            file: relative(root, abs).split("\\").join("/"),
            why:
                "deletes a user_roles row and reads a legacy identity store — W-20 removed that path, "
                + "so a read here is a second source of authority the removal cannot revoke",
        });
    }
    return out;
}

/** Authority-path modules, which must resolve from membership and nothing else. */
const AUTHORITY_PATH_MODULES = [
    "lib/admin/resolveAdminAccessCore.ts",
    "lib/admin/resolveAdminPortalOrgCore.ts",
] as const;

/* ------------------------------------------------------------------- removal surfaces */

/**
 * Client modules that POST to the membership-removal route. Discovered, not listed.
 *
 * **`components/` is scanned as well as `app/`, and the omission was load-bearing.** This walked
 * `app/` only, which was adequate while the removal surfaces were legacy pages under
 * `app/legacy-admin/` — and blind to the CANONICAL one, which lives in
 * `components/adminV2/settings/access/`. So `W-20` hardened the two surfaces the scan could see and
 * left the surviving one both claiming "they will lose access" and unable to send the
 * acknowledgement. `W-59` deleted the legacy pair, the subject fell to zero, and the anchor below
 * is what refused to let that pass as green.
 *
 * The lesson is `W-5`'s, one layer out: that lock failed because its subject was an enumerated LIST.
 * This one's subject was a discovered walk over an enumerated ROOT SET, which rots the same way.
 */
function removalSurfaces(root: string): string[] {
    return [...sourceFilesUnder(join(root, "app")), ...sourceFilesUnder(join(root, "components"))]
        .filter((abs) => !abs.includes(join("app", "api")))
        .filter((abs) => /\/remove["'`]/.test(code(abs)) && /\/api\/admin\/users\//.test(code(abs)))
        .sort();
}

/** The claim `T-19` falsifies, in the copy an operator reads before confirming. */
const ACCESS_LOSS_CLAIM = /(?:will\s+)?lose\s+access|loses\s+access|access\s+will\s+be\s+revoked/i;

describe("W-20 / RL-12 — membership is the only source, so removal cannot be inverted", () => {
    it("finds the removal route (discovery has not silently stopped)", () => {
        const found = membershipDeletingModules(webRoot).map((abs) => relative(webRoot, abs).split("\\").join("/"));
        expect(found).toContain("app/api/admin/users/[userId]/remove/route.ts");
    });

    it("no membership-deleting module reads a legacy identity store", () => {
        expect(
            legacyReadingDeleters(webRoot),
            "a deleter that reads those tables is re-deriving the fallback W-20 removed",
        ).toEqual([]);
    });

    it("no authority-path module reads a legacy identity store — the M2-5 clause", () => {
        const offenders = AUTHORITY_PATH_MODULES.filter((rel) =>
            LEGACY_STORE_READ.test(code(join(webRoot, rel))),
        );
        expect(
            offenders,
            "one principal source. The copy in resolveAdminPortalOrgCore served requireAdminOrOps "
                + "across 147 route files, so this is stated over both modules and not over one",
        ).toEqual([]);
    });

    it("the authority path still reads the store it SHOULD — non-vacuity on the modules", () => {
        // Without this, the assertion above would be satisfied by a resolver that reads nothing, or
        // by a path list that has drifted to files which no longer exist.
        for (const rel of AUTHORITY_PATH_MODULES) {
            const src = code(join(webRoot, rel));
            expect(src, rel).toMatch(/from\(\s*["'`]user_roles["'`]\s*\)/);
            expect(src, rel).toContain("chooseOrgAndRoleKeysFromMembershipRows");
        }
    });

    it("no usable membership resolves to no authority — the deletion's whole premise", () => {
        // The behavioural claim, asserted where it is decided. Both resolvers must RETURN on an
        // unpicked membership rather than continue to a second lookup. A resolver that fell through
        // to anything else would pass every scan above and still invert a removal.
        for (const rel of AUTHORITY_PATH_MODULES) {
            const src = code(join(webRoot, rel));
            expect(src, `${rel} must deny when no membership is picked`).toMatch(
                /if\s*\(\s*!\s*picked\s*\)\s*return null;/,
            );
        }
    });

    it("the retired guard is gone, and gone from the tree rather than merely unused", () => {
        // A refusal path that can never fire reads to the next author as evidence that a second
        // authority source still exists — T-6's rule about controls that change nothing, applied to
        // guards. Both the module and its route wiring left with the fallback.
        expect(existsSync(join(webRoot, "lib", "access", "membershipRemovalResidual.ts"))).toBe(false);
        const route = code(join(webRoot, "app", "api", "admin", "users", "[userId]", "remove", "route.ts"));
        expect(route).not.toContain("removalResidualAuthority");
        expect(route).not.toContain("readLegacyAdminOpsAuthority");
        expect(route).not.toContain("acknowledge_residual_authority");
    });

    it("no removal surface claims more than the command performs — RL-54", () => {
        const surfaces = removalSurfaces(webRoot);
        // Anchor by NAME, not by count. A floor of ">= 2" was satisfiable by the two legacy surfaces
        // alone while the canonical one went unexamined, and it broke — correctly, but for the wrong
        // reason — the moment W-59 retired them.
        const rel = surfaces.map((abs) => relative(webRoot, abs).split("\\").join("/"));
        expect(rel, "the canonical removal surface must be in the scan's subject").toContain(
            "components/adminV2/settings/access/AccessUsersConfigurationPage.tsx",
        );

        // The copy rule OUTLIVES the defect that produced it. Removal deletes a membership in ONE
        // org; a principal holding another org's membership keeps their operator access, so a
        // blanket "they will lose access" is still a claim the command does not perform. What
        // changed with W-20 is why it is false, not whether it is.
        const lying = surfaces
            .filter((abs) => ACCESS_LOSS_CLAIM.test(code(abs)))
            .map((abs) => relative(webRoot, abs).split("\\").join("/"));
        expect(
            lying,
            "removal deletes a membership in this organization; it does not revoke a membership held "
                + "in another one",
        ).toEqual([]);
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

/** A post-W-20 deleter: membership only, no second source consulted. */
const COMPLIANT_ROUTE = `
export async function POST() {
    await supabase.from("user_roles").delete().eq("user_id", userId).eq("org_id", orgId);
}
`;

describe("W-20 / RL-12 — the scan bites (non-vacuity, by fixture)", () => {
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

    it("passes a compliant deleter, so the check discriminates rather than rejecting everything", () => {
        const root = build({ "app/api/x/route.ts": COMPLIANT_ROUTE });
        try {
            expect(legacyReadingDeleters(root)).toEqual([]);
            // …and it really was in the subject, rather than passing by not being found.
            expect(membershipDeletingModules(root)).toHaveLength(1);
        } finally {
            cleanup();
        }
    });

    it("convicts a deleter that reads user_profiles", () => {
        const root = build({
            "app/api/x/route.ts": `
export async function POST() {
    const { data } = await supabase.from("user_profiles").select("role").eq("id", userId);
    await supabase.from("user_roles").delete().eq("user_id", userId);
}
`,
        });
        try {
            const v = legacyReadingDeleters(root);
            expect(v).toHaveLength(1);
            expect(v[0].why).toContain("second source of authority");
        } finally {
            cleanup();
        }
    });

    it("convicts a deleter that reads app_users — either join column", () => {
        for (const column of ["id", "auth_user_id"]) {
            const root = build({
                "app/api/x/route.ts": `
export async function POST() {
    const { data } = await supabase.from("app_users").select("role, org_id").eq("${column}", userId);
    await supabase.from("user_roles").delete().eq("user_id", userId);
}
`,
            });
            try {
                expect(legacyReadingDeleters(root), column).toHaveLength(1);
            } finally {
                cleanup();
            }
        }
    });

    it("follows a helper-mediated deletion, which a route-file census misses", () => {
        // `users/[userId]/role/route.ts` mutates membership while containing the string `user_roles`
        // nowhere. A lock whose subject is "route files that mention the table" is blind to it.
        const root = build({
            "app/api/x/route.ts": `
import { wipeMembership } from "@/lib/membership";
export async function POST() { await wipeMembership(userId); }
`,
            "lib/membership.ts": `
export async function wipeMembership(userId: string) {
    await supabase.from("user_profiles").select("role").eq("id", userId);
    await supabase.from("user_roles").delete().eq("user_id", userId);
}
`,
        });
        try {
            const v = legacyReadingDeleters(root);
            expect(v).toHaveLength(1);
            expect(v[0].file).toBe("lib/membership.ts");
        } finally {
            cleanup();
        }
    });

    it("does not mistake a commented-out delete, or prose about app_users, for the real thing", () => {
        // Both directions of the comment problem in one fixture. The prose names the legacy tables
        // exactly as this repository's real modules do while explaining what they removed; the
        // commented delete would make a non-deleter look like a deleter.
        const root = build({
            "app/api/x/route.ts": `
/**
 * W-20 removed the fallback that read user_profiles.role and app_users.role.
 * The old shape was: await supabase.from("user_roles").delete().eq("user_id", userId);
 */
export async function GET() { return Response.json({ ok: true }); }
`,
        });
        try {
            expect(membershipDeletingModules(root)).toEqual([]);
            expect(legacyReadingDeleters(root)).toEqual([]);
        } finally {
            cleanup();
        }
    });
});

/**
 * W-17 — ROLE IDENTITY IS NOT AUTHORIZATION.
 *
 * Alloy owns capabilities, scope and the resolver. The ORGANIZATION owns what its roles mean. A
 * seeded role is a bootstrap convenience — a starting package someone may reconfigure or ignore —
 * and it must never be a licence. The moment an Access-owned decision reads a role KEY to decide
 * whether something is allowed, the configurable model is over: two tenants calling a role the same
 * name would start sharing authority they never agreed to.
 *
 * ── WHY THIS IS NOT A GREP ──
 *
 * The strings themselves are legitimate almost everywhere they appear. `admin` is a real seeded key
 * in migrations, a real display label, a real fixture value, and a real compatibility OUTPUT. W-13
 * established the discipline this reuses: classify the occurrence, and convict only the one class
 * that matters — a role key consulted to ALLOW or DENY. Everything else is named and excluded on
 * purpose, so the lock can be trusted rather than silenced.
 *
 * The static half cannot prove the absence of an idea, only of a shape. So the behavioural half
 * proves the positive claim directly: identical capabilities produce identical decisions regardless
 * of which role carried them, and a seeded key with nothing granted gets nothing.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { canManageUsersAndRoles } from "@/lib/admin/canManageUsersAndRoles";

const webRoot = join(__dirname, "..", "..");

/** The surfaces and modules Access owns. Other domains are the Role-Title Authority Cleanup debt. */
const ACCESS_OWNED = [
    join(webRoot, "app", "api", "admin", "rbac"),
    join(webRoot, "app", "api", "admin", "access"),
    join(webRoot, "app", "api", "admin", "users"),
    join(webRoot, "app", "api", "admin", "settings", "users-roles"),
    join(webRoot, "lib", "access"),
    join(webRoot, "components", "adminV2", "settings", "access"),
    /*
     * The Forms authorization surface, added when Forms migrated off role-title authority. Its 25
     * gates were the single largest concentration in the product; this is what stops them coming
     * back one route at a time.
     */
    join(webRoot, "app", "api", "admin", "forms"),
    join(webRoot, "lib", "access", "formsAuthority.ts"),
    /*
     * The POS + Processing authorization surface, added when Processing migrated off role-title
     * authority. Twelve of its thirteen gates were ordinary route checks; the thirteenth was
     * `actorAuthorized = ctx.role === "admin" || ctx.role === "ops"` inside a SHARED context that
     * governs seven identity routes at once — invisible to any scan that only reads route files,
     * which is exactly why `lib/pos/processingIdentity` is listed here by name.
     */
    join(webRoot, "app", "api", "admin", "pos"),
    join(webRoot, "app", "api", "admin", "processing"),
    join(webRoot, "lib", "pos", "processingIdentity"),
    join(webRoot, "lib", "access", "processingAuthority.ts"),
];

/**
 * Named exclusions, each for a stated reason rather than to quieten the scan.
 *
 * `adminPortalRolePick` is compatibility OUTPUT: it projects a role union down to the legacy
 * `ctx.role` string for callers that predate capabilities. It decides nothing about Access, and
 * W-17 must not extend it — that is recorded as debt, not fixed here.
 */
const EXCLUDED_FILES = [/adminPortalRolePick\.ts$/, /\.test\.tsx?$/, /__fixtures__/];

function filesUnder(dir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        let entries: string[];
        try {
            entries = readdirSync(abs);
        } catch {
            return;
        }
        for (const name of entries) {
            const child = join(abs, name);
            if (statSync(child).isDirectory()) walk(child);
            else if (/\.tsx?$/.test(child) && !EXCLUDED_FILES.some((re) => re.test(child))) out.push(child);
        }
    };
    walk(dir);
    return out;
}

/** Comments are documentation of a decision, not the decision. */
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * A role key consulted to ALLOW or DENY.
 *
 * Deliberately shaped around the CONDITION, not the string: `role === "admin"` inside an `if`, a
 * membership test over a role-key literal array, and `roleKeys.includes("…")`. A role key used to
 * LABEL, to SEED, or to project compatibility output matches none of these.
 */
const AUTHORITY_SHAPES: { name: string; re: RegExp }[] = [
    {
        /*
         * THE CALLER'S role, compared to anything.
         *
         * `ctx.role` / `auth.role` / `access.role` / `context.role` is the admitted principal's
         * compatibility projection. Any comparison against it is a decision about WHO SOMEONE IS,
         * whatever key it names — including a key that is not in the seeded vocabulary.
         *
         * Excludes the primitive type names, because `typeof body.role === "string"` is a parse of
         * untrusted input, not a decision about who someone is. Convicting it would make the lock
         * noisy in exactly the routes that do the right thing.
         */
        name: "the caller's role as a condition",
        re: /\b(?:ctx|auth|access|context)\.role\s*(?:!==?|={2,3})\s*["'](?!string["']|number["']|boolean["']|object["']|undefined["']|function["']|symbol["']|bigint["'])[a-z_]+["']/,
    },
    {
        /*
         * ANY `role` identifier compared to a SEEDED ROLE KEY.
         *
         * This is the classification half, and POS + Processing is why it exists. That tree is full
         * of lines like `s.role === "lead"`, `child.role !== "child"`, `entry.role === "parent"` —
         * fourteen of them — and not one is authorization. They describe what a SUBJECT is inside a
         * household: who the lead is, which record is the child. The word is the same and the noun
         * is not.
         *
         * A lock that convicted them would have to be switched off for the whole subtree, which is
         * how the shared `operatorRouteContext` gate stayed invisible in the first place. So the
         * discriminator is the KEY, not the identifier: `admin`, `ops`, `owner`, `school_director`
         * and `regional_lead` are the platform's seeded role vocabulary, and comparing anything to
         * one of them is a role-title decision no matter what it is called.
         */
        name: "seeded role key as a condition",
        re: /\brole\s*(?:!==?|={2,3})\s*["'](?:admin|ops|owner|school_director|regional_lead)["']/,
    },
    { name: "role-key literal array membership", re: /\[\s*["'](?:admin|ops|owner|school_director|regional_lead)["'][^\]]*\]\s*\.\s*includes\s*\(/ },
    { name: "roleKeys.includes(<key>)", re: /roleKeys\s*\.\s*(?:includes|some)\s*\(\s*["'][a-z_]+["']/ },
];

describe("W-17 — a seeded role key is not authority inside Access", () => {
    const scanned = ACCESS_OWNED.flatMap(filesUnder);

    it("actually scanned the Forms authorization surface", () => {
        // A lock that silently stopped traversing Forms would pass forever while the gates returned.
        const forms = scanned.filter((f) => f.includes(`${sep}forms${sep}`) || f.endsWith("formsAuthority.ts"));
        expect(forms.length, "the Forms authorization surface was not scanned").toBeGreaterThan(15);
    });

    it("actually scanned the POS + Processing authorization surface", () => {
        // Same non-vacuity claim, made separately: these are different trees, and one of them going
        // quiet must not be covered by the other still being noisy.
        const routes = scanned.filter(
            (f) => f.includes(`${sep}pos${sep}`) || f.includes(`${sep}processing${sep}`),
        );
        expect(routes.length, "the POS + Processing authorization surface was not scanned").toBeGreaterThan(25);

        // And specifically the shared context, which is the one site a route-level scan cannot see.
        const shared = scanned.filter((f) => f.endsWith("operatorRouteContext.ts"));
        expect(shared.length, "operatorRouteContext was not scanned").toBe(1);
    });

    it("scans the Access-owned surface rather than nothing", () => {
        // NON-VACUITY. A lock that stopped finding files would pass forever.
        expect(scanned.length, "the Access-owned scan lost its files").toBeGreaterThan(20);
    });

    it("makes no Access-owned decision from a role key", () => {
        const offenders: string[] = [];
        for (const file of scanned) {
            const src = stripComments(readFileSync(file, "utf8"));
            for (const line of src.split("\n")) {
                for (const shape of AUTHORITY_SHAPES) {
                    if (shape.re.test(line)) {
                        offenders.push(`${file.slice(webRoot.length + 1)} :: ${shape.name} :: ${line.trim().slice(0, 90)}`);
                    }
                }
            }
        }
        expect(offenders, "authorization here must derive from capabilities and scope, not from a role title").toEqual([]);
    });

    it("bites: the shapes it forbids are actually recognised", () => {
        // If this lock is ever loosened into uselessness, this fails first.
        const convicted = [
            'if (ctx.role === "school_director") return allow();',
            'if (!["admin", "ops"].includes(ctx.role)) return deny();',
            'if (access.roleKeys.includes("regional_lead")) return allow();',
            /*
             * The shape this lock originally MISSED. Every one of the 180 census sites was written
             * `!==`, and the first version of this regex only matched `===` — so it would have
             * passed over the entire defect it was written to catch.
             */
            'if (ctx.role !== "admin") return jsonError("Forbidden", 403);',
            'if (ctx.role !== "admin" && ctx.role !== "ops") return jsonError("Forbidden", 403);',
            /*
             * The thirteenth site, in the exact words it was written in. It lived in a shared
             * context rather than a route, governed seven identity routes from one line, and no
             * route-level scan could see it.
             */
            'const actorAuthorized = ctx.role === "admin" || ctx.role === "ops";',
            /*
             * The caller's role compared to a key OUTSIDE the seeded vocabulary. Still authority:
             * `ctx.role` is who the principal is, so inventing a new title does not make it legal.
             */
            'if (ctx.role === "processor") return allow();',
            /*
             * And a seeded key reached through some other identifier. The shape the classification
             * half exists for: the discriminator is the KEY, so renaming the variable is no escape.
             */
            'if (membership.role === "regional_lead") return allow();',
        ];
        for (const line of convicted) {
            expect(AUTHORITY_SHAPES.some((s) => s.re.test(line)), `not caught: ${line}`).toBe(true);
        }
        // And the legitimate uses are NOT convicted.
        const innocent = [
            /*
             * The POS + Processing subject vocabulary. Fourteen real lines in
             * `lib/pos/processingIdentity` look like these, and every one describes what a RECORD is
             * in a household rather than who the caller is. If the lock ever convicts them again it
             * will be switched off for that subtree, and the shared operator gate goes back to being
             * invisible — which is the failure this whole slice exists to have found.
             */
            'const lead = subjects.find((s) => s.role === "lead");',
            'if (child.role !== "child") continue;',
            'if (role === "parent" || role === "household") {',
            'const parents = subjects.filter((entry) => entry.role === "parent");',
            'const label = roleLabelFor("admin");',
            "INSERT INTO role_definitions (role_key) VALUES ('admin');",
            'expect(member.role_keys).toContain("admin");',
            'return compatibilityPortalRole(bundle.roleKeys);',
            // Parsing untrusted input is not deciding authority.
            'const role = typeof body.role === "string" ? body.role.trim() : "";',
        ];
        for (const line of innocent) {
            expect(AUTHORITY_SHAPES.some((s) => s.re.test(line)), `false positive: ${line}`).toBe(false);
        }
    });

    it("gives a custom role the SAME answer as a seeded role holding the same capability", () => {
        // The whole configurable claim, in one assertion: the decision follows the grant, and the
        // key that carried it is not consulted.
        const seeded = { roleKeys: ["admin"], permissionKeys: ["settings.users_roles"] };
        const custom = { roleKeys: ["cert_w17_whatever_they_called_it"], permissionKeys: ["settings.users_roles"] };
        expect(canManageUsersAndRoles(seeded)).toBe(true);
        expect(canManageUsersAndRoles(custom)).toBe(canManageUsersAndRoles(seeded));
    });

    it("gives a seeded role NO special treatment when it grants nothing relevant", () => {
        // `admin` with the capability stripped is just a name. If this ever returns true, a role
        // title has become a licence again.
        expect(canManageUsersAndRoles({ roleKeys: ["admin"], permissionKeys: [] })).toBe(false);
        expect(canManageUsersAndRoles({ roleKeys: ["school_director", "regional_lead"], permissionKeys: [] })).toBe(false);
    });
});

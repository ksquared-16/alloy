/**
 * RL-31 — ADMINISTERING A CREDENTIAL IS USER ADMINISTRATION, AND THE TARGET IS A MEMBER.
 *
 * `send-password-reset` was the LAST Access-owned handler still deciding on the portal `admin` role,
 * and the last recorded conversion exception. W-38 had been holding it open on the question of who
 * may trigger a reset email. The answer is the key that already owns the rest of that person's
 * lifecycle — inviting them, removing them, changing which roles they hold — so it takes
 * `admin.users.write` and no new vocabulary was minted to ask the question again.
 *
 * ── THE ESCAPE THIS SLICE CLOSED ──
 *
 * The route took an arbitrary `email` from the body and handed it to `resetPasswordForEmail` on the
 * service-role client. Nothing tied that address to the caller's organization, so an administrator
 * of one tenant could start a credential reset for a member of another — or for any account in the
 * project. The non-enumerating response hid the OUTCOME, which is why it was easy to miss: the
 * caller learned nothing, and the mail went anyway. Membership is now the boundary, and the address
 * is resolved from the authenticated identity rather than accepted from the request.
 *
 * ── WHY A SEPARATE FILE ──
 *
 * §14 asks to extend the canonical Access Administration lock where practical. The surface half
 * lives in `surfaceCapabilityDeclaration.test.ts` and was extended there — W49-F1 is asserted CLOSED
 * in place rather than duplicated here. There is no single canonical lock over Access Administration
 * ROUTE authority, so this file is that, in the shape of RL-29 and RL-30 rather than a new model.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const ROUTE_REL = "app/api/admin/send-password-reset/route.ts";
const ROUTE = path.join(WEB, ROUTE_REL);
const read = (p: string) => fs.readFileSync(p, "utf8");
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

const INVENTORY = JSON.parse(
    read(path.join(WEB, "scripts", "routeCapabilities.declared.json")),
) as {
    routes: Record<string, Record<string, { status: string; capability?: string; helper?: string }>>;
    w15_classification: {
        access_owned: { total: number; declared: number; none: number; exceptions: number };
        conversion_exceptions: { route: string; method: string }[];
        resolved_exceptions: { route: string; method: string; capability?: string }[];
    };
};

describe("RL-31 — the credential lifecycle belongs to user administration", () => {
    const code = codeOnly(read(ROUTE));

    it("requires admin.users.write through the canonical Access Administration seam", () => {
        expect(code).toMatch(/requireAccessAdministration\s*\(\s*ADMIN_USERS_WRITE\s*\)/);
        expect(code).toMatch(/if \(!auth\.ok\) return auth\.response;/);
    });

    it("no role title decides it any more", () => {
        expect(code).not.toMatch(/ctx\.role\s*[!=]==|roleKeys|requireAdmin\s*\(|requireAdminOrOps\s*\(/);
    });

    it("the retired umbrella cannot return", () => {
        // `settings.users_roles` is a key no role holds. A gate asking for it refuses everyone while
        // still reading like a working gate — the most expensive kind of dead code.
        expect(code).not.toContain("settings.users_roles");
        expect(code).not.toContain("requireUsersRolesManageAuth");
    });

    it("no neighbouring Access authority substitutes", () => {
        for (const foreign of [
            "ADMIN_ROLES_WRITE", "admin.roles.write",
            "ADMIN_ACCESS_SCOPE_WRITE", "admin.access_scope.write",
            "ATTENDANCE_DEVICES_MANAGE", "attendance.devices.manage",
            "communications.send", "COMMUNICATIONS_SEND",
        ]) {
            expect(code, `${foreign} does not own a person's credential`).not.toContain(foreign);
        }
    });

    it("authority settles before the member is looked up and before any mail", () => {
        const raw = read(ROUTE);
        const gate = raw.indexOf("requireAccessAdministration(");
        const lookup = raw.indexOf('.from("user_roles")');
        const mail = raw.indexOf("resetPasswordForEmail(");
        expect(gate).toBeGreaterThan(-1);
        expect(lookup).toBeGreaterThan(gate);
        expect(mail).toBeGreaterThan(gate);
    });
});

describe("RL-31 — the target is a member of the caller's organization", () => {
    const code = codeOnly(read(ROUTE));

    it("membership is checked against user_roles, pinned to the caller's org", () => {
        expect(code).toMatch(/\.from\(\s*["']user_roles["']\s*\)/);
        expect(code).toMatch(/\.eq\(\s*["']org_id["']\s*,\s*orgId\s*\)/);
        expect(code).toMatch(/\.eq\(\s*["']user_id["']\s*,\s*userId\s*\)/);
    });

    it("the address is resolved from the identity, never accepted from the body", () => {
        /*
         * The whole defect in one line: `body.email` reaching the provider. If this returns, a
         * caller can name a stranger again.
         */
        expect(code).not.toMatch(/body\.email/);
        expect(code).toMatch(/getUserById\s*\(\s*userId\s*\)/);
        expect(code).toMatch(/resetPasswordForEmail\s*\(\s*email\b/);
    });

    it("the mail is sent only after membership resolves", () => {
        const raw = read(ROUTE);
        expect(raw.indexOf("resetPasswordForEmail(")).toBeGreaterThan(raw.indexOf("if (!membership)"));
    });

    it("non-enumeration is kept, but only past the boundary", () => {
        // The provider's answer is still swallowed; membership failure is NOT — a foreign or absent
        // member is an honest 404, because hiding it would hide the boundary itself.
        expect(code).toMatch(/catch\s*\(/);
        expect(code).toContain("404");
    });
});

describe("RL-31 — the declaration and the classification tell the same story", () => {
    it("the route is declared admin.users.write, naming the helper it uses", () => {
        const entry = INVENTORY.routes[ROUTE_REL]?.POST;
        expect(entry?.status).toBe("declared");
        expect(entry?.capability).toBe("admin.users.write");
        expect(entry?.helper).toBe("requireAccessAdministration");
    });

    it("it is no longer a conversion exception, and is recorded as resolved", () => {
        const c = INVENTORY.w15_classification;
        expect(
            c.conversion_exceptions.map((e) => `${e.route}#${e.method}`),
            "a resolved exception left recorded is a hole",
        ).not.toContain(`${ROUTE_REL}#POST`);
        const resolved = c.resolved_exceptions.find((e) => e.route === ROUTE_REL && e.method === "POST");
        expect(resolved, "resolving an exception must be recorded, not merely done").toBeTruthy();
        expect(resolved?.capability).toBe("admin.users.write");
    });

    it("the exception count agrees with the list it summarises", () => {
        /*
         * NOT a second tally. `routeCapabilityDeclaration.test.ts` owns the Access-owned counts and
         * the definition of which routes are Access-owned; re-deriving that here would be a second
         * definition of the same thing, which is how two locks start disagreeing. What this asserts
         * is the narrower internal consistency that belongs to THIS slice: the recorded exception
         * count and the recorded exception list are the same fact.
         */
        const c = INVENTORY.w15_classification;
        expect(c.access_owned.exceptions).toBe(c.conversion_exceptions.length);
        expect(c.access_owned.exceptions, "this slice resolved the last one").toBe(0);
        expect(c.access_owned.declared + c.access_owned.none + c.access_owned.exceptions).toBe(
            c.access_owned.total,
        );
    });
});

describe("RL-31 — the Access Administration surface stays completely classified", () => {
    it("non-vacuity: the detector sees the route this lock is written about", () => {
        expect(fs.existsSync(ROUTE)).toBe(true);
        expect(INVENTORY.routes[ROUTE_REL]?.POST).toBeTruthy();
    });

    it("fails when a new user-administration mutation appears without an owner", () => {
        const API = path.join(WEB, "app", "api", "admin");
        const unowned: string[] = [];
        const walk = (dir: string) => {
            if (!fs.existsSync(dir)) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, e.name);
                if (e.isDirectory()) walk(abs);
                else if (e.name === "route.ts") {
                    const src = read(abs);
                    const rel = `app/api/admin/${path.relative(API, abs).split(path.sep).join("/")}`;
                    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) {
                        if (!new RegExp(`export async function ${m}\\b`).test(src)) continue;
                        const entry = INVENTORY.routes[rel]?.[m];
                        if (entry?.status !== "declared" && entry?.status !== "none") {
                            unowned.push(`${m} ${rel} (${entry?.status ?? "absent"})`);
                        }
                    }
                }
            }
        };
        for (const d of ["users", "rbac", "settings/users-roles", "send-password-reset"]) {
            walk(path.join(API, d));
        }
        expect(
            unowned,
            `an Access Administration mutation with no truthful owner: ${unowned.join(", ")}`,
        ).toEqual([]);
    });
});

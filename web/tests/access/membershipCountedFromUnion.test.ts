/**
 * W-55 (`IA-12`, `IA-R13`) — membership is counted from the membership, not from the picker. `RL-51`.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §45.
 *
 * **The reconciliation this file records.** §45 sizes `W-55` against a Roles chapter that bucketed
 * members by `primary_role` for both the rail count and the selected role's user list, and
 * `primary_role` is `displayRoleForAdminPicker` — `admin`, else `ops`, else the first key
 * lexicographically. A member holding `{admin, regional_lead}` was therefore **absent from
 * `regional_lead`'s count and from its user list**, while the same component held both keys and
 * discarded them at its type boundary.
 *
 * That remedy already landed — inside `W-51`/`IA-7`, which restored the union to the surface and
 * moved both the count and the list onto {@link heldRoleKeys}/{@link memberHoldsRole}. What never
 * landed was `RL-51`, the lock that keeps it true. So `W-55`'s exit was met by another workstream's
 * code and left unguarded, which is the state where a later simplification quietly re-collapses it.
 * This file is that lock, and it is written now because `W-57` depends on it.
 *
 * **Why `W-57` could not proceed without it.** §1.7: *"a simplification MUST NOT promote a value it
 * has not corrected"*, and its named application is exactly this pair — **`W-55` precedes `W-57`'s
 * item 3**, folding *"Users with this role"* into the role header. *"Promoting a number into a
 * role's header is exactly the move that converts a wrong number in a tab nobody opens into a wrong
 * number every operator reads."* `W-57` takes item 3. It may, because the number is now right, and
 * this file is what makes "now right" a property rather than an observation.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { heldRoleKeys, memberHoldsRole, normalizeHeldRoleKeys } from "@/lib/access/memberRoleAssignment";

const webRoot = join(__dirname, "..", "..");

function executableSource(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
}

function sourceFilesUnder(dir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        if (!existsSync(abs)) return;
        for (const entry of readdirSync(abs)) {
            const p = join(abs, entry);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.tsx?$/.test(entry)) out.push(p);
        }
    };
    walk(join(webRoot, dir));
    return out.map((p) => relative(webRoot, p).split("\\").join("/"));
}

/**
 * A membership question answered from the COLLAPSED value.
 *
 * Deliberately narrow, and narrow in a specific direction: it convicts `primary_role` where it is
 * being used to *decide which role a member belongs to* — compared against a role, keyed into a
 * bucket, or filtered on — and acquits carrying it in a type or a payload. Carrying it is required:
 * `heldRoleKeys` accepts it as a fallback for a caller whose payload predates the union, and a scan
 * that convicted the field's existence would push someone to delete the fallback and lose the
 * memberships that only have it.
 */
export function collapsedMembershipDecisions(src: string): string[] {
    const hits: string[] = [];
    for (const re of [
        // `m.primary_role === roleKey` / `!==`
        /\b\w*\.?primary_role\s*(?:===|!==|==|!=)\s*[^;,)\n]+/g,
        // `map.get(m.primary_role)` / `set(m.primary_role, …)` — bucketing by the survivor
        /\.(?:get|set|has|add)\s*\(\s*\w+\.primary_role\b/g,
        // `.filter(… primary_role …)` on one line — the user-list form
        /\.filter\s*\(\s*\([^)]*\)\s*=>[^\n]*\bprimary_role\b/g,
        // `groupBy`/bucket idioms keyed on it
        /\[\s*\w+\.primary_role\s*\]\s*(?:=|\+\+|\?\?=)/g,
    ]) {
        for (const m of src.matchAll(re)) hits.push(m[0].replace(/\s+/g, " ").trim());
    }
    return hits;
}

const PRODUCT_TREES = ["components", "app", "lib"];

describe("W-55 / RL-51 — every membership question is answered from role_keys", () => {
    it("no surface decides membership from the collapsed value", () => {
        const offenders: string[] = [];
        for (const rel of PRODUCT_TREES.flatMap(sourceFilesUnder)) {
            // `memberRoleAssignment.ts` is the one module allowed to read the field: it is where the
            // fallback lives, and the fallback is what makes a pre-union payload survivable.
            if (rel.endsWith("lib/access/memberRoleAssignment.ts")) continue;
            for (const hit of collapsedMembershipDecisions(executableSource(rel))) {
                offenders.push(`${rel}: ${hit}`);
            }
        }
        expect(
            offenders,
            "count and filter membership with heldRoleKeys/memberHoldsRole — the collapsed value "
                + "reports zero for any role that is never anyone's primary",
        ).toEqual([]);
    });

    it("the Roles chapter answers both questions — the count and the list — from the union", () => {
        // Non-vacuity in the direction that matters: the property is not held by there being no
        // membership questions. Both exist, and both resolve through the union helpers.
        const src = executableSource("components/adminV2/settings/access/AccessRolesConfigurationPage.tsx");
        expect(src).toContain("heldRoleKeys");
        expect(src).toContain("memberHoldsRole");
        expect(src).toMatch(/memberCountByRole/);
        expect(src).toMatch(/usersWithRole/);
    });

    it("the count and the list use the SAME predicate, so they cannot disagree", () => {
        // The defect §45 describes is two answers to one question. `memberHoldsRole` is defined as
        // membership in `heldRoleKeys`, so the rail's count and the page's list are the same
        // computation by construction — asserted here rather than left to a reader.
        const member = { role_keys: ["admin", "regional_lead"], primary_role: "admin" };
        for (const roleKey of ["admin", "regional_lead"]) {
            expect(memberHoldsRole(member, roleKey)).toBe(heldRoleKeys(member).includes(roleKey));
        }
    });

    it("the plan's own example: a member counts toward every role they hold", () => {
        const member = { role_keys: ["admin", "regional_lead"], primary_role: "admin" };
        expect(memberHoldsRole(member, "regional_lead")).toBe(true);
        expect(memberHoldsRole(member, "admin")).toBe(true);
        // And the collapsed value would have answered the first one wrong.
        expect(member.primary_role === "regional_lead").toBe(false);
    });

    it("a membership carrying only the collapsed value still counts — the fallback is load-bearing", () => {
        expect(heldRoleKeys({ role_keys: [], primary_role: "ops" })).toEqual(["ops"]);
        expect(heldRoleKeys({ role_keys: null, primary_role: "ops" })).toEqual(["ops"]);
    });

    it("a membership with nothing projects nothing rather than a plausible default", () => {
        expect(heldRoleKeys({ role_keys: [], primary_role: "" })).toEqual([]);
        expect(normalizeHeldRoleKeys([" ", ""])).toEqual([]);
    });

    /* ------------------------------------------------------------- non-vacuity */

    it("bites: the shapes §45 found are convicted", () => {
        for (const fixture of [
            'if (m.primary_role === r.role_key) count += 1;',
            'map.set(m.primary_role, (map.get(m.primary_role) ?? 0) + 1);',
            'const users = members.filter((m) => m.primary_role === selected.role_key);',
            'byRole[m.primary_role] = (byRole[m.primary_role] ?? 0) + 1;',
        ]) {
            expect(collapsedMembershipDecisions(fixture).length, fixture).toBeGreaterThan(0);
        }
    });

    it("acquits: carrying the field is not deciding with it", () => {
        for (const fixture of [
            "primary_role: string;",
            "const { primary_role, role_keys } = member;",
            "return { role_keys: keys, primary_role: displayRoleForAdminPicker(keys) };",
            "heldRoleKeys({ role_keys: m.role_keys, primary_role: m.primary_role })",
        ]) {
            expect(collapsedMembershipDecisions(fixture), fixture).toEqual([]);
        }
    });

    it("the scan reads code, not prose", () => {
        const stripped = '/** was: if (m.primary_role === key) count++; */\nconst x = 1;'
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            .replace(/^\s*\/\/.*$/gm, " ");
        expect(collapsedMembershipDecisions(stripped)).toEqual([]);
        expect(collapsedMembershipDecisions("if (m.primary_role === key) count++;").length).toBeGreaterThan(0);
    });
});

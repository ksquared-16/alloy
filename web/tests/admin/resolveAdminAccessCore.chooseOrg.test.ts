/**
 * W-22 / `I-7` — no authority decision depends on UUID ordering.
 *
 * §9's QA note is explicit that this file is a rewrite and not a deletion: *"the existing suite
 * encodes the behaviour being removed and must be rewritten deliberately, not deleted."* So the two
 * assertions that certified the tiebreak are kept, inverted, with their original UUIDs — `orgA`
 * sorts before `orgB`, which is the whole reason the old behaviour was invisible. If the sort ever
 * returns, these fail with the same inputs that used to prove it worked.
 *
 * **The change is a refusal, not a different choice.** The helper resolves an unambiguous membership
 * set and returns `null` otherwise; `null` denies at every call site. §9's full remedy — authority
 * resolving for an explicit `(principal, org)` pair determined by the request — remains open, and
 * §1.6 is why that does not hold this up: *"where a defect can be closed by showing more and
 * refusing more, that fix is scheduled ahead of the architectural fix that would make it
 * impossible."*
 *
 * **Why it was safe to land.** `Q18`, deployed tenant, 2026-08-19, trusted-host action
 * `tha_f2f89635241cea`: **0 of 6** principals hold memberships in more than one organization, every
 * principal is in exactly one, and **0** have a portal role discarded by the choice. The sort
 * decided nothing on real data, so this moves nobody — and it fails closed for the principal who
 * becomes multi-org tomorrow.
 */
import { describe, expect, it } from "vitest";
import { chooseOrgAndRoleKeysFromMembershipRows } from "@/lib/admin/resolveAdminAccessCore";

/** The original fixtures' UUIDs. `orgA` sorts first — that ordering is the point. */
const orgA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const orgB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("W-22 — an unambiguous membership resolves", () => {
    it("one org, every role held there", () => {
        expect(
            chooseOrgAndRoleKeysFromMembershipRows([
                { org_id: orgB, role: "ops" },
                { org_id: orgB, role: "school_director" },
            ]),
        ).toEqual({ orgId: orgB, roleKeys: ["ops", "school_director"] });
    });

    it("a single custom role resolves — portal roles are not required to be present", () => {
        expect(chooseOrgAndRoleKeysFromMembershipRows([{ org_id: orgB, role: "regional_lead" }])).toEqual({
            orgId: orgB,
            roleKeys: ["regional_lead"],
        });
    });

    it("W-42 — the role is normalized before it is classified", () => {
        // A row holding `"admin "` used to match no portal role, so the principal resolved
        // `portalEligible: false` with an empty capability set. Carried forward because the
        // normalization sits inside the function this workstream rewrote.
        expect(chooseOrgAndRoleKeysFromMembershipRows([{ org_id: orgA, role: "  Admin " }])).toEqual({
            orgId: orgA,
            roleKeys: ["admin"],
        });
    });

    it("rows whose role normalizes to nothing are not memberships", () => {
        expect(chooseOrgAndRoleKeysFromMembershipRows([{ org_id: orgA, role: "   " }])).toBeNull();
        expect(chooseOrgAndRoleKeysFromMembershipRows([])).toBeNull();
    });
});

describe("W-22 — an ambiguous membership REFUSES, where it used to sort", () => {
    it("INVERTED: admin in orgA and ops in orgB no longer resolves to orgA", () => {
        // The first of the two assertions this file used to make. It read:
        //
        //   "picks lexicographically smallest org among admin/ops memberships and returns all role
        //    keys in that org"  →  { orgId: orgA, roleKeys: ["admin"] }
        //
        // Same rows, same UUIDs. The principal's `ops` and `school_director` rows in `orgB` were
        // being discarded because `aaaa…` sorts before `bbbb…`, and nothing in the product ever said
        // so. There is no request org here, so there is nothing to resolve.
        expect(
            chooseOrgAndRoleKeysFromMembershipRows([
                { org_id: orgB, role: "ops" },
                { org_id: orgB, role: "school_director" },
                { org_id: orgA, role: "admin" },
            ]),
        ).toBeNull();
    });

    it("INVERTED: custom roles across two orgs no longer resolve to the smaller UUID", () => {
        // The second assertion, which covered the branch that needed no portal row to discard one:
        //
        //   "when only custom roles exist, picks smallest org among all rows"
        //     →  { orgId: orgA, roleKeys: ["regional_lead"] }
        expect(
            chooseOrgAndRoleKeysFromMembershipRows([
                { org_id: orgB, role: "school_director" },
                { org_id: orgA, role: "regional_lead" },
            ]),
        ).toBeNull();
    });

    it("the refusal does not depend on which UUID sorts first", () => {
        // A tiebreak that had merely been reversed would pass the two assertions above by picking
        // `orgB`. Asserting both orderings is what distinguishes "refuses" from "chooses
        // differently" — and reversing the sort is the plausible wrong fix.
        const forward = chooseOrgAndRoleKeysFromMembershipRows([
            { org_id: orgA, role: "admin" },
            { org_id: orgB, role: "admin" },
        ]);
        const reverse = chooseOrgAndRoleKeysFromMembershipRows([
            { org_id: orgB, role: "admin" },
            { org_id: orgA, role: "admin" },
        ]);
        expect(forward).toBeNull();
        expect(reverse).toBeNull();
    });

    it("portal precedence is gone too — it discarded without needing a sort", () => {
        // `pool = adminOpsRows.length > 0 ? adminOpsRows : normalized` was a second silent
        // discard: an `admin` row in one org removed a custom role in another from consideration
        // entirely. Removing only the `.sort()` would have left this, and the exit criterion —
        // "no authority decision depends on UUID ordering" — would have read as met.
        expect(
            chooseOrgAndRoleKeysFromMembershipRows([
                { org_id: orgA, role: "admin" },
                { org_id: orgB, role: "regional_lead" },
            ]),
        ).toBeNull();
    });
});

/** An `org_id` reaching a `.sort()` — the shape §9's tier A check forbids on an authority path. */
const ORG_SORT = /org_id[\s\S]{0,40}\.sort\(/;

describe("W-22 — the tier A property, stated over the source", () => {
    it("no sort over org_id survives on the authority path", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        for (const rel of ["lib/admin/resolveAdminAccessCore.ts", "lib/admin/resolveAdminPortalOrgCore.ts"]) {
            const src = readFileSync(join(process.cwd(), rel), "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, " ")
                .replace(/^\s*\/\/.*$/gm, " ");
            expect(src, `${rel} sorts org ids`).not.toMatch(ORG_SORT);
        }
    });

    it("that scan can convict — it matches the shape that was there", () => {
        // Non-vacuity, against the exact expression removed rather than an invented one.
        const removed = "const chosenOrg = [...new Set(pool.map((r) => r.org_id))].sort()[0];";
        expect(removed).toMatch(ORG_SORT);
        // …and it acquits the sort that legitimately remains: role keys are ordered for display,
        // which is not an authority decision about which org the principal is in.
        expect("const roleKeys = [...new Set(normalized.map((r) => r.role))].sort();").not.toMatch(ORG_SORT);
    });
});

describe("W-22 — I-25's clause, and why it currently has no subject", () => {
    /**
     * §9 folds `I-25` into this workstream: *"any cross-request authority cache is keyed on
     * `(principal, org)` and invalidated by any write to membership, role, grant, or scope."*
     *
     * There is no such cache. Every memoization on the authority path is `cache()` from React,
     * which is REQUEST-scoped — it exists for the duration of one render pass and is gone. So the
     * clause is satisfied vacuously, and a vacuous satisfaction is exactly the kind that stops
     * being true without anyone noticing: a module-level `Map` added for performance would make an
     * authority answer outlive the write that should have invalidated it, and nothing would fail.
     *
     * This asserts the premise instead of the clause — the shape `W-62` used for the layer model.
     */
    const AUTHORITY_MODULES = [
        "lib/admin/resolveAdminAccessCore.ts",
        "lib/admin/resolveAdminPortalOrgCore.ts",
        "lib/admin/getAdminAccessContext.ts",
        "lib/admin/canManageUsersAndRoles.ts",
    ];

    async function executableSource(rel: string) {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        return readFileSync(join(process.cwd(), rel), "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            .replace(/^\s*\/\/.*$/gm, " ");
    }

    /**
     * A module-level container that is WRITTEN at runtime. The distinction matters and the first
     * version of this scan got it wrong: it convicted `const PORTAL_ROLES = new Set(["admin",
     * "ops"])` in both resolvers — a frozen vocabulary, not a cache. A lock that cannot tell a
     * constant from a store would push someone to rewrite the constant to satisfy it, which is the
     * string-coincidence failure this program keeps paying for.
     */
    function runtimeWrittenStores(src: string): string[] {
        const declared = [...src.matchAll(
            /^(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*new\s+(?:Map|Set|WeakMap|LRUCache)\b/gm,
        )].map((m) => m[1]!);
        return declared.filter((name) =>
            new RegExp(String.raw`\b${name}\s*\.\s*(?:set|add|delete|clear)\s*\(`).test(src),
        );
    }

    it("no authority module holds state that outlives the request", async () => {
        const offenders: string[] = [];
        for (const rel of AUTHORITY_MODULES) {
            for (const name of runtimeWrittenStores(await executableSource(rel))) {
                offenders.push(`${rel}: ${name}`);
            }
        }
        expect(
            offenders,
            "a cross-request authority cache must be keyed on (principal, org) and invalidated by "
                + "every authority write — I-25. Today there is none, which is why none is keyed.",
        ).toEqual([]);
    });

    it("the memoization that IS there is request-scoped, and the scan does not convict it", async () => {
        // Non-vacuity in both directions.
        const src = await executableSource("lib/admin/getAdminAccessContext.ts");
        expect(src).toContain('from "react"');
        expect(src).toMatch(/cache\(/);

        // Bites on a real cache…
        expect(
            runtimeWrittenStores('const byUser = new Map<string, Access>();\nfunction f(){ byUser.set(k, v); }'),
        ).toEqual(["byUser"]);
        // …acquits the constant it wrongly convicted first time…
        expect(runtimeWrittenStores('const PORTAL_ROLES = new Set(["admin", "ops"]);')).toEqual([]);
        // …and acquits request-scoped memoization, which is the mechanism relied on.
        expect(runtimeWrittenStores("const loadOnce = cache(async () => resolve());")).toEqual([]);
    });

    it("the constants it acquits are really there — the scan is looking at the right files", async () => {
        // Without this, "no runtime-written stores" would be satisfied by files containing no
        // module-level container at all, and the acquittal above would be arguing with nothing.
        const src = await executableSource("lib/admin/resolveAdminAccessCore.ts");
        expect(src).toMatch(/^const\s+PORTAL_ROLES\s*=\s*new\s+Set/m);
    });
});

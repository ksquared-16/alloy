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

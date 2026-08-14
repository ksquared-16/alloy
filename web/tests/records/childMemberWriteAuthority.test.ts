/**
 * ONE canonical Child/member creation authority.
 *
 * Records Phase 2 added `child.add`, and the ownership audit that followed found
 * it would have been the SIXTH independent `customer_members` child insert. The
 * count was never the problem — the fragmentation was: each site had its own row
 * shape and its own answer to "is this child already a member here", and one of
 * them answered by catching the unique violation afterwards.
 *
 * The operator-facing paths now share `createHouseholdChildMember`. This file is
 * the thing that keeps it that way: it reads the source and fails when a new
 * insert site appears, because a convention nothing enforces is a convention
 * that lasts until the next slice.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    createHouseholdChildMember,
    findActiveChildMemberForPerson,
} from "@/lib/records/childMemberAuthority";
import { createEmploymentMock, ORG_ID } from "../employment/mockEmploymentSupabase";

const WEB_ROOT = path.join(__dirname, "..", "..");

/**
 * Files allowed to insert into `customer_members`.
 *
 * `childMemberAuthority` is the authority. The other two are separate bounded
 * contexts, each with its own commit authority, and rerouting them is a
 * deliberate follow-up rather than an oversight:
 *
 *   • public form intake apply — no operator is present and the row carries
 *     `needs_review` semantics the operator paths do not have
 *   • Processing Identity `ports.createChild` — the frozen Processing commit
 *     authority, which owns its own transactional envelope
 *
 * Adding to this list is a decision about who owns Child creation. Make it
 * deliberately.
 */
const ALLOWED_INSERT_SITES = [
    "lib/records/childMemberAuthority.ts",
    "lib/forms/intake/applyIntakeChildToOpportunity.ts",
    "lib/pos/processingIdentity/commands/ports.ts",
    // `customer_members` also holds NON-child household members. This route's remaining
    // insert is that branch; its `relationship === "child"` branch delegates to the
    // authority, which the next test asserts directly.
    "app/api/admin/customer-members/route.ts",
];

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
}

/**
 * Source files that call `.insert(` / `.upsert(` on the `customer_members` table.
 *
 * The call is written across several lines, so whitespace is collapsed first and
 * the write is looked for in the window that follows the table selector — a
 * chained builder puts it there, and a later `from(` ends the window so a select
 * on this table followed by an insert on a DIFFERENT one is not a false hit.
 */
function customerMemberInsertSites(): string[] {
    const WINDOW = 240;
    const roots = ["lib", "app", "components"].map((d) => path.join(WEB_ROOT, d));
    const hits: string[] = [];
    for (const root of roots) {
        if (!fs.existsSync(root)) continue;
        for (const file of walk(root)) {
            const src = fs.readFileSync(file, "utf8").replace(/\s+/g, " ");
            const re = /from\(\s*["'`]customer_members["'`]\s*\)/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(src)) !== null) {
                let window = src.slice(m.index + m[0].length, m.index + m[0].length + WINDOW);
                const nextFrom = window.indexOf("from(");
                if (nextFrom >= 0) window = window.slice(0, nextFrom);
                if (/\.\s*(insert|upsert)\s*\(/.test(window)) {
                    hits.push(path.relative(WEB_ROOT, file));
                    break;
                }
            }
        }
    }
    return [...new Set(hits)].sort();
}

describe("there is one child-member write authority", () => {
    it("no source file outside the allow-list inserts into customer_members", () => {
        const sites = customerMemberInsertSites();
        // Compared as a SET, not a count: a new site appearing while another is deleted
        // would keep a count identical and hide the regression.
        expect(sites).toEqual([...ALLOWED_INSERT_SITES].sort());
    });

    it("the operator-facing paths route through the authority", () => {
        const operatorPaths = [
            "lib/records/addChildService.ts",
            "lib/admin/relationship/executeRelationshipAction.ts",
            "lib/admin/actions/createLeadChildOcmPersistence.ts",
            "app/api/admin/customer-members/route.ts",
        ];
        for (const rel of operatorPaths) {
            const src = fs.readFileSync(path.join(WEB_ROOT, rel), "utf8");
            expect(src, `${rel} must call the child-member authority`).toContain(
                "createHouseholdChildMember"
            );
        }
    });
});

describe("the authority's own rules", () => {
    const HOUSEHOLD = "household-1";
    const PERSON = "person-1";

    function mock(members: Record<string, unknown>[] = []) {
        return createEmploymentMock({ customer_members: members, persons: [], customers: [] });
    }

    it("creates the row with relationship child and the caller's provenance", async () => {
        const m = mock();
        const { member, created } = await createHouseholdChildMember(m.supabase, {
            orgId: ORG_ID,
            customerId: HOUSEHOLD,
            personId: null,
            firstName: "Ada",
            lastName: "Lovelace",
            dob: "2021-01-01",
            displayName: "Ada Lovelace",
            source: "child_add",
        });

        expect(created).toBe(true);
        expect(member.id).toBeTruthy();
        const row = m.writes.find((w) => w.table === "customer_members" && w.op === "insert")!.row;
        expect(row).toMatchObject({
            org_id: ORG_ID,
            customer_id: HOUSEHOLD,
            relationship: "child",
            is_active: true,
            person_id: null,
            metadata: { source: "child_add" },
        });
    });

    it("reuses an existing active membership instead of writing a second one", async () => {
        const m = mock([
            {
                id: "member-existing",
                org_id: ORG_ID,
                customer_id: HOUSEHOLD,
                person_id: PERSON,
                display_name: "Ada Lovelace",
                relationship: "child",
                is_active: true,
            },
        ]);

        const { member, created } = await createHouseholdChildMember(m.supabase, {
            orgId: ORG_ID,
            customerId: HOUSEHOLD,
            personId: PERSON,
            firstName: "Ada",
            lastName: "Lovelace",
            dob: null,
            displayName: "Ada Lovelace",
            source: "relationship_action",
        });

        expect(created).toBe(false);
        expect(member.id).toBe("member-existing");
        expect(m.writes).toHaveLength(0);
    });

    it("does not treat a person in ANOTHER household as already a member", async () => {
        const m = mock([
            {
                id: "member-elsewhere",
                org_id: ORG_ID,
                customer_id: "household-2",
                person_id: PERSON,
                display_name: "Ada Lovelace",
                relationship: "child",
                is_active: true,
            },
        ]);

        const found = await findActiveChildMemberForPerson(m.supabase, ORG_ID, HOUSEHOLD, PERSON);
        expect(found).toBeNull();
    });

    it("refuses to write without a household", async () => {
        const m = mock();
        await expect(
            createHouseholdChildMember(m.supabase, {
                orgId: ORG_ID,
                customerId: "",
                personId: null,
                firstName: "Ada",
                lastName: "Lovelace",
                dob: null,
                displayName: "Ada Lovelace",
                source: "child_add",
            })
        ).rejects.toThrow(/customerId is required/);
        expect(m.writes).toHaveLength(0);
    });
});

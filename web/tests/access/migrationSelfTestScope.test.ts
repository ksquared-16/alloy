import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(__dirname, "..", "..", "..", "supabase", "migrations");

/**
 * A MIGRATION'S SELF-TEST MAY ONLY ASSERT WHAT THAT MIGRATION IS RESPONSIBLE FOR.
 *
 * `20260914183000_configuration_sensitivity_authority` asserts that EVERY active ops role holds all
 * three of option_sets.manage, layouts.manage and fields.manage, and raises
 *
 *     "% ops role(s) lost a manage key they already exercised through Config Layout Assist"
 *
 * That migration grants ops nothing. It cannot cause the loss it reports, and on the deployed
 * primary the claim was false in every particular: census gar_d16c35b73af56a found both failing ops
 * roles holding NONE of the three, every one NEVER_GRANTED with zero audit events, while admin in
 * the same orgs held all three. Nothing was lost because nothing was ever granted.
 *
 * The assertion was really testing DEFAULT-PACKAGE COMPLETENESS FOR EXISTING ORGS, which belongs to
 * `20260910183000_access_v2_default_role_package_completeness` and not to an authority migration's
 * embedded guard. The two are different questions with different owners, and conflating them turns a
 * seeding gap in tenants created in January and April into a refusal to apply an unrelated
 * migration — which is exactly what blocked this thread.
 *
 * Embedded guards are one-shot: they run once, against whatever data exists that day. Only a repo
 * lock holds an invariant as the tree grows, so the rule lives here.
 *
 * THE RULE: a migration may not assert that a role holds a capability unless that same migration
 * grants it. Assert what you did; let the completeness migration assert what everyone should have.
 */
const KNOWN_OVERREACHING: { file: string; why: string }[] = [
    {
        file: "20260914183000_configuration_sensitivity_authority.sql",
        why: "CONFIGAUTH_SELFTEST_SCOPE_DEFECT — asserts ops package completeness it does not grant; already applied and ledger-recorded on the deployed primary, so the file is not edited. See docs/platform/planning/access-identity-v2/configuration-selftest-scope-defect.md",
    },
];

/** A self-test that counts grants for a role and compares the count to an expected total. */
const COMPLETENESS_ASSERTION = /role_key\s*=\s*'([a-z_]+)'[\s\S]{0,400}?count\(DISTINCT\s+g\.permission_key\)[\s\S]{0,400}?<>\s*\d+/i;

/** Does the migration actually grant that role anything? */
function grantsRole(sql: string, role: string): boolean {
    const inserts = sql.match(/INSERT\s+INTO\s+public\.role_permission_grants[\s\S]{0,1200}?;/gi) ?? [];
    return inserts.some((block) => new RegExp(`'${role}'`).test(block));
}

describe("a migration self-test asserts only what its own migration does", () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

    it("scans the migration tree (the lock is not vacuous)", () => {
        expect(files.length, "no migrations found — the scan is measuring nothing").toBeGreaterThan(50);
        const known = files.find((f) => f === KNOWN_OVERREACHING[0].file);
        expect(known, "the recorded exception must still be a file this scan reaches").toBeTruthy();
    });

    it("no migration asserts package completeness for a role it does not grant", () => {
        const offenders: string[] = [];
        for (const file of files) {
            const sql = readFileSync(join(MIGRATIONS, file), "utf8");
            const m = COMPLETENESS_ASSERTION.exec(sql);
            if (!m) continue;
            const role = m[1];
            if (grantsRole(sql, role)) continue;
            offenders.push(`${file} :: asserts a grant total for '${role}' it never grants`);
        }
        const remaining = offenders.filter(
            (o) => !KNOWN_OVERREACHING.some((k) => o.startsWith(k.file)),
        );
        expect(
            remaining,
            "assert what this migration did; default-package completeness belongs to the completeness migration",
        ).toEqual([]);
    });

    it("the recorded exception is still real, and the list only shrinks", () => {
        for (const known of KNOWN_OVERREACHING) {
            const sql = readFileSync(join(MIGRATIONS, known.file), "utf8");
            expect(
                COMPLETENESS_ASSERTION.test(sql),
                `${known.file} no longer over-asserts — delete its entry (${known.why})`,
            ).toBe(true);
            expect(
                grantsRole(sql, "ops"),
                `${known.file} now grants ops, so the exception is stale`,
            ).toBe(false);
        }
        expect(KNOWN_OVERREACHING.length, "the exception list may only shrink").toBeLessThanOrEqual(1);
    });
});

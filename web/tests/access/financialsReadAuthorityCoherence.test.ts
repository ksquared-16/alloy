/**
 * A ROLE THAT MAY MOVE MONEY MUST BE ABLE TO LOOK AT IT.
 *
 * The managed QA identity — `admin` in its org, all scopes, authenticated — was refused Financials
 * with `403 required_permission = fin.read`, while the same role held `fin.adjust`,
 * `fin.responsibility` and `fin.subsidy`. Billing a family and forgiving what is owed were permitted;
 * reading the resulting balance was not.
 *
 * These lock the intended matrix at its repository-owned source — the seed function's own grant
 * regions — rather than at whatever a database happens to contain. A deployed row is evidence about
 * one tenant; the seed is the contract.
 *
 * Deliberately NOT a runtime implication. Nothing here teaches the resolver that `fin.adjust` implies
 * `fin.read`; Access has no such mechanism and inventing one would move authority out of the grant
 * tables and into a rule nobody can audit per-tenant. The coherence is asserted over the seeded key
 * sets and repaired by an explicit grant.
 */
import { describe, expect, it } from "vitest";

import {
    PAYMENT_REFUND_PERMISSION,
    PAYMENT_WRITE_PERMISSION,
} from "@/lib/adminV2/actions/definitions/financialPaymentActions";
import {
    keyLiterals,
    liveFunctionDefinition,
    migrationFiles,
    readMigration,
    sentinelRegion,
    stripSqlComments,
} from "./grantSeedDiscovery";

const FIN_READ = "fin.read";
/** Moving money, in the vocabulary the Financials routes actually enforce. */
const FIN_MUTATIONS = ["fin.write", "fin.adjust", "fin.responsibility", "fin.subsidy"];

const live = liveFunctionDefinition("seed_default_rbac")!;
const region = (begin: string, end: string) => {
    const r = sentinelRegion(live.body, begin, end);
    expect(r, `seed must still carry the ${begin} sentinel`).not.toBeNull();
    return new Set(keyLiterals(r!));
};

describe("financials read authority", () => {
    const admin = region("W12:ADMIN-GRANTS:BEGIN", "W12:ADMIN-GRANTS:END");
    const ops = region("W12:OPS-GRANTS:BEGIN", "W12:OPS-GRANTS:END");
    const directors = region("ACCESSV2:DIRECTOR-GRANTS:BEGIN", "ACCESSV2:DIRECTOR-GRANTS:END");

    /*
     * THE INVARIANT THIS EXISTS FOR. Stated over roles rather than over `admin` alone, so it also
     * catches the next role that is given a financial mutation without the read that governs it.
     */
    it.each([
        ["admin", admin],
        ["ops", ops],
        ["director package", directors],
    ])("%s: any seeded financial mutation comes with fin.read", (_label, keys) => {
        const mutations = FIN_MUTATIONS.filter((k) => keys.has(k));
        if (!mutations.length) return; // a role with no money authority needs no read
        expect(
            [...keys],
            `seeds ${mutations.join(", ")} — mutation authority without the read that governs it`,
        ).toContain(FIN_READ);
    });

    /* Organization Administrator administers the tenant; Financials is an ordinary capability. */
    it("admin is seeded with fin.read", () => {
        expect([...admin]).toContain(FIN_READ);
    });

    /* The directors' read repair must survive; it is the reason a school director can see the money. */
    it("the director package keeps fin.read and gains no mutation authority", () => {
        expect([...directors]).toContain(FIN_READ);
        for (const k of FIN_MUTATIONS) {
            expect([...directors], `director package must not carry ${k}`).not.toContain(k);
        }
    });

    /*
     * A NEW org's seed is not a repair for the orgs that already exist. This binds the claim that
     * existing tenants were repaired to the migration that actually does it, so deleting that file
     * fails here rather than silently reopening the 403.
     */
    it("carries a migration granting admin fin.read in existing orgs", () => {
        /*
         * Scoped to the grants INSERT STATEMENT, not the file. Four later seed migrations mention
         * admin and `fin.read` incidentally — they grant portal/forms/processing keys to admin and
         * carry `fin.read` only in a catalog literal belonging to a different statement — so a
         * file-wide match is satisfied by all of them and deleting the real repair changes nothing.
         * Verified by deleting it: the file-wide form stayed green, this form goes red.
         *
         * Matched on the CLAIM (this statement grants admin fin.read) rather than on a spelling: the
         * key may be projected as a literal or joined through `permission_definitions` for RL-7, and
         * pinning either form makes the lock fail the next time the statement is written correctly.
         */
        const repairs = migrationFiles().filter((f) => {
            const sql = stripSqlComments(readMigration(f));
            return sql
                .split(/insert\s+into\s+public\.role_permission_grants/i)
                .slice(1)
                .some((rest) => {
                    const stmt = rest.slice(0, rest.indexOf(";") + 1 || rest.length);
                    /*
                     * `p_org_id` is the seed function's parameter: that INSERT grants a NEW org at
                     * creation and is not a repair for the tenants that already exist. Without this
                     * the seed satisfies the claim and deleting the repair stays green — measured.
                     */
                    if (/p_org_id/.test(stmt)) return false;
                    return /'admin'/.test(stmt) && /'fin\.read'/.test(stmt);
                });
        });
        expect(repairs, "no migration grants fin.read to admin in existing orgs").not.toHaveLength(0);
    });
});

/**
 * A ROLE THAT MAY UNAPPLY MONEY MUST BE ABLE TO PUT IT BACK.
 *
 * Moving a payment from one charge to another is a reversal followed by an application, and the two
 * halves are enforced under DIFFERENT permissions. A role holding only the first can take money off
 * the charge it was answering and has no permitted way to place it anywhere: the obligation returns,
 * the money goes unapplied, and it stays there. Granting neither half is coherent and granting both
 * is coherent; granting exactly the destructive half is the one combination that loses money's
 * placement — and a hosted tenant was measured in it (`admin` held fin.adjust and not fin.write).
 *
 * Taken from the action definitions rather than written out here, so that renaming either half's
 * permission moves this lock with it instead of quietly unbinding it.
 */
describe("payment reallocation authority", () => {
    const admin = region("W12:ADMIN-GRANTS:BEGIN", "W12:ADMIN-GRANTS:END");
    const ops = region("W12:OPS-GRANTS:BEGIN", "W12:OPS-GRANTS:END");
    const directors = region("ACCESSV2:DIRECTOR-GRANTS:BEGIN", "ACCESSV2:DIRECTOR-GRANTS:END");

    it.each([
        ["admin", admin],
        ["ops", ops],
        ["director package", directors],
    ])("%s: seeding the reversal half seeds the application half", (_label, keys) => {
        if (!keys.has(PAYMENT_REFUND_PERMISSION)) return; // no reversal authority, nothing to strand
        expect(
            [...keys],
            `seeds ${PAYMENT_REFUND_PERMISSION} without ${PAYMENT_WRITE_PERMISSION} — such a role can `
                + "unapply money and never reapply it",
        ).toContain(PAYMENT_WRITE_PERMISSION);
    });

    /*
     * As with the read repair: a new org's seed is not a repair for orgs that already exist. Scoped
     * to the grants INSERT STATEMENT and excluding the seed function's own parameterised insert,
     * because several later migrations mention admin and fin.write in unrelated catalog literals.
     */
    it("carries a migration granting admin fin.write in existing orgs", () => {
        const repairs = migrationFiles().filter((f) => {
            const sql = stripSqlComments(readMigration(f));
            return sql
                .split(/insert\s+into\s+public\.role_permission_grants/i)
                .slice(1)
                .some((rest) => {
                    const stmt = rest.slice(0, rest.indexOf(";") + 1 || rest.length);
                    if (/p_org_id/.test(stmt)) return false;
                    return /'admin'/.test(stmt) && /'fin\.write'/.test(stmt);
                });
        });
        expect(repairs, "no migration grants fin.write to admin in existing orgs").not.toHaveLength(0);
    });
});

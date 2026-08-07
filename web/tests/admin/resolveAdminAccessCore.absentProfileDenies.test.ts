import { describe, expect, it } from "vitest";
import {
    ABSENT_PROFILE_ENFORCEMENT,
    dualReadScopeAnswer,
    resolveScopeAnswerFromProfile,
} from "@/lib/admin/resolveAdminAccessCore";

/**
 * W-7 — absent scope denies (I-19, lockout class L1).
 *
 * The switch itself is blocked on M1 being applied (W-0 Q4 = 2 pairs with no profile row).
 * These cover the two Tier C cases the plan names, and prove the `deny` answer is correct
 * *before* it is enforced, so the flip is a constant change rather than a re-derivation.
 */
describe("W-7 absent-profile scope resolution", () => {
    it("enforcement stays legacy-all until M1 is applied", () => {
        // Guard, not decoration: flipping this constant while M1 is unapplied denies the 2
        // known profile-less pairs every row. Plan §5 Q4 — "W-7 cannot precede it."
        expect(ABSENT_PROFILE_ENFORCEMENT).toBe("legacy-all");
    });

    describe("under deny (W-7's target answer)", () => {
        it("a membership with no profile row is denied, not widened to all", () => {
            const answer = resolveScopeAnswerFromProfile(null, "deny");
            expect(answer).toEqual({
                departmentScope: "restricted",
                siteScope: "restricted",
                denyAll: true,
            });
        });

        it("the same principal with a profile row present is unaffected", () => {
            const answer = resolveScopeAnswerFromProfile(
                { department_scope: "all", site_scope: "all" },
                "deny"
            );
            expect(answer).toEqual({
                departmentScope: "all",
                siteScope: "all",
                denyAll: false,
            });
        });

        it("a stored restriction is still read from the profile, not from the mode", () => {
            const answer = resolveScopeAnswerFromProfile(
                { department_scope: "restricted", site_scope: "all" },
                "deny"
            );
            expect(answer).toEqual({
                departmentScope: "restricted",
                siteScope: "all",
                denyAll: false,
            });
        });

        it("denial is distinguishable from a stored double restriction", () => {
            // Both read restricted/restricted. Only the absent-profile denial sets denyAll,
            // which is what forces empty allow-lists instead of reading the access tables.
            const denied = resolveScopeAnswerFromProfile(null, "deny");
            const stored = resolveScopeAnswerFromProfile(
                { department_scope: "restricted", site_scope: "restricted" },
                "deny"
            );
            expect(denied.denyAll).toBe(true);
            expect(stored.denyAll).toBe(false);
        });
    });

    describe("under legacy-all (what is enforced today)", () => {
        it("a membership with no profile row resolves both dimensions all", () => {
            expect(resolveScopeAnswerFromProfile(null, "legacy-all")).toEqual({
                departmentScope: "all",
                siteScope: "all",
                denyAll: false,
            });
        });
    });

    describe("dual read", () => {
        it("reports divergence exactly when the profile row is absent", () => {
            const absent = dualReadScopeAnswer(null);
            expect(absent.diverges).toBe(true);
            expect(absent.enforced.departmentScope).toBe("all");
            expect(absent.shadow.departmentScope).toBe("restricted");
            expect(absent.shadow.denyAll).toBe(true);
        });

        it("reports no divergence when a profile row exists, whatever it stores", () => {
            for (const row of [
                { department_scope: "all", site_scope: "all" },
                { department_scope: "restricted", site_scope: "all" },
                { department_scope: "all", site_scope: "restricted" },
                { department_scope: "restricted", site_scope: "restricted" },
            ]) {
                const read = dualReadScopeAnswer(row);
                expect(read.diverges).toBe(false);
                expect(read.enforced).toEqual(read.shadow);
            }
        });

        it("enforces the configured mode, never the shadow", () => {
            const read = dualReadScopeAnswer(null);
            expect(read.enforced).toEqual(
                resolveScopeAnswerFromProfile(null, ABSENT_PROFILE_ENFORCEMENT)
            );
        });

        it("treats an unrecognised scope value as all rather than denying", () => {
            // Denial is reserved for an ABSENT row. A malformed value must not become a lockout.
            const read = dualReadScopeAnswer({ department_scope: "nonsense", site_scope: "" });
            expect(read.diverges).toBe(false);
            expect(read.enforced).toEqual({
                departmentScope: "all",
                siteScope: "all",
                denyAll: false,
            });
        });
    });
});

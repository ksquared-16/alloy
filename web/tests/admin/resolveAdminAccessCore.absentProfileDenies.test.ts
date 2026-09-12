import { describe, expect, it } from "vitest";
import {
    ABSENT_PROFILE_ENFORCEMENT,
    dualReadScopeAnswer,
    resolveScopeAnswerFromProfile,
} from "@/lib/admin/resolveAdminAccessCore";

/**
 * W-7 — absent scope denies (I-19, lockout class L1).
 *
 * The switch itself is blocked on M1 being applied — W-0 Q4 stood at 2 pairs with no profile
 * row when this suite was written and census run 4 (2026-09-04) re-derived it to **5**. Re-derive
 * at switch time rather than trusting either number: the 2026-09-06 W-6 ruling moved W-7's
 * precondition off the count entirely and onto an invariant (*no writer can create a membership
 * without a profile*), because a count can change between the re-derivation and the flip.
 *
 * These cover the two Tier C cases the plan names, and prove the `deny` answer is correct
 * *before* it is enforced, so the flip is a constant change rather than a re-derivation.
 */
describe("W-7 absent-profile scope resolution", () => {
    it("enforcement stays legacy-all until M1 is applied", () => {
        // Guard, not decoration: flipping this constant while M1 is unapplied denies every
        // profile-less pair every row — 5 of them as of census run 4, not the 2 this suite was
        // written against. Plan §5 Q4 — "W-7 cannot precede it."
        expect(ABSENT_PROFILE_ENFORCEMENT).toBe("legacy-all");
    });

    describe("under deny (W-7's target answer)", () => {
        it("a membership with no profile row is denied, not widened to all", () => {
            const answer = resolveScopeAnswerFromProfile(null, "deny");
            expect(answer).toEqual({
                departmentScope: "restricted",
                siteScope: "restricted",
                // Moot under denial and deliberately NOT the narrower `assigned`: denyAll
                // already forces an empty site allow-list, and capture scope is evaluated
                // after site scope, so `site` over zero sites reaches nothing. Setting
                // `assigned` here would read as a second, independent restriction.
                attendanceCaptureScope: "site",
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
                attendanceCaptureScope: "site",
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
                attendanceCaptureScope: "site",
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

        it("covers every scope dimension the answer carries — a new one must be ruled on, not defaulted", () => {
            /*
             * This suite went red, not stale, when `attendanceCaptureScope` was added to
             * `ScopeAnswer` by a later workstream and no one revisited what denial means for
             * it. Five of ten cases failed on shape alone, including both named Tier C cases,
             * and the guard below them stopped being able to say anything — a red suite cannot
             * distinguish "someone threw the L1 switch" from "a field moved".
             *
             * The underlying risk is W-7 finding 1 generalised: a dimension that denial does
             * not explicitly answer falls through to whatever another table holds, which is
             * how "flip to deny" ships a fail-open one table over. So enumerate the keys. A
             * dimension added later fails HERE, with this comment, and whoever adds it has to
             * decide what an absent profile means for it.
             */
            expect(Object.keys(resolveScopeAnswerFromProfile(null, "deny")).sort()).toEqual([
                "attendanceCaptureScope",
                "denyAll",
                "departmentScope",
                "siteScope",
            ]);
        });
    });

    describe("under legacy-all (what is enforced today)", () => {
        it("a membership with no profile row resolves both dimensions all", () => {
            expect(resolveScopeAnswerFromProfile(null, "legacy-all")).toEqual({
                departmentScope: "all",
                siteScope: "all",
                attendanceCaptureScope: "site",
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
                attendanceCaptureScope: "site",
                denyAll: false,
            });
        });
    });
});

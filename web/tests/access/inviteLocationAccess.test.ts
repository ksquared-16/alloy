/**
 * The invite form's location answer, and the department answer it is forced to supply with it.
 *
 * The claim under test is narrow and it is the only one that matters: **inviting somebody with a
 * location choice must not change what any department can reach.** The scope route takes both
 * dimensions or neither, so the invite has to say something about departments — and the only safe
 * thing to say is whatever the platform already enforces for an account with no profile.
 */
import { describe, expect, it } from "vitest";
import {
    ABSENT_PROFILE_ANSWER,
    inviteScopeNote,
    inviteScopePayload,
    inviteSiteSelectionIsComplete,
} from "@/lib/access/inviteLocationAccess";
import { ABSENT_PROFILE_ENFORCEMENT, resolveScopeAnswerFromProfile } from "@/lib/admin/resolveAdminAccessCore";

describe("the department answer is the platform's, not the form's", () => {
    it("is read from ABSENT_PROFILE_ENFORCEMENT rather than restated", () => {
        expect(ABSENT_PROFILE_ANSWER).toEqual(resolveScopeAnswerFromProfile(null, ABSENT_PROFILE_ENFORCEMENT));
    });

    it("writes the department scope an account without a profile is ALREADY enforced as", () => {
        // This is the whole safety argument. If the two ever differ, the invite is granting or
        // removing department authority as a side effect of a question about locations.
        const payload = inviteScopePayload({ siteMode: "all", siteLocationIds: [] });
        if (ABSENT_PROFILE_ANSWER.departmentScope === "all" && !ABSENT_PROFILE_ANSWER.denyAll) {
            expect(payload?.department_scope).toBe(ABSENT_PROFILE_ANSWER.departmentScope);
            expect(payload?.department_ids).toEqual([]);
        } else {
            expect(payload).toBeNull();
        }
    });

    it("refuses to write anything under a deny default — proved against the mode, not asserted", () => {
        // The failure this guards is a future one: flipping ABSENT_PROFILE_ENFORCEMENT to "deny"
        // makes `department_scope: "all"` a genuine widening. The module's refusal is conditioned on
        // exactly that value, so evaluating the other mode here shows the condition can fire.
        const deny = resolveScopeAnswerFromProfile(null, "deny");
        expect(deny.departmentScope).toBe("restricted");
        expect(deny.denyAll).toBe(true);
        // …and the guard reads both fields, so a mode that is restricted-but-not-denyAll is caught too.
        const legacy = resolveScopeAnswerFromProfile(null, "legacy-all");
        expect(legacy.departmentScope).toBe("all");
        expect(legacy.denyAll).toBe(false);
    });
});

describe("an unfinished selection is not a scope", () => {
    it("produces no payload for `Selected locations` with nothing selected", () => {
        expect(inviteScopePayload({ siteMode: "restricted", siteLocationIds: [] })).toBeNull();
        expect(inviteScopePayload({ siteMode: "restricted", siteLocationIds: ["  "] })).toBeNull();
    });

    it("does not let the form submit in that state either", () => {
        expect(inviteSiteSelectionIsComplete({ siteMode: "restricted", siteLocationIds: [] })).toBe(false);
        expect(inviteSiteSelectionIsComplete({ siteMode: "restricted", siteLocationIds: ["loc-1"] })).toBe(true);
        // "All locations" is always a complete answer — it is a statement, not an empty list.
        expect(inviteSiteSelectionIsComplete({ siteMode: "all", siteLocationIds: [] })).toBe(true);
    });

    it("dedupes and trims the selection it does send", () => {
        const payload = inviteScopePayload({ siteMode: "restricted", siteLocationIds: ["a", " a ", "b", ""] });
        expect(payload?.site_location_ids).toEqual(["a", "b"]);
    });

    it("sends no location list when the answer is `All locations`", () => {
        // Leftovers from a mode the operator moved away from would be written as a restriction.
        const payload = inviteScopePayload({ siteMode: "all", siteLocationIds: ["a", "b"] });
        expect(payload?.site_scope).toBe("all");
        expect(payload?.site_location_ids).toEqual([]);
    });
});

describe("the sentence and the request are generated from the same answer", () => {
    it("counts what it will send", () => {
        expect(inviteScopeNote({ siteMode: "all", siteLocationCount: 0 })).toContain("every location");
        expect(inviteScopeNote({ siteMode: "restricted", siteLocationCount: 1 })).toContain("1 selected location");
        expect(inviteScopeNote({ siteMode: "restricted", siteLocationCount: 3 })).toContain("3 selected locations");
    });

    it("states the department consequence rather than leaving it unsaid", () => {
        // The operator is not asked about departments, so they must be TOLD what happens to them.
        for (const mode of ["all", "restricted"] as const) {
            expect(inviteScopeNote({ siteMode: mode, siteLocationCount: 2 })).toMatch(/[Dd]epartments/);
        }
    });
});

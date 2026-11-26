/**
 * The invite form's location answer — sent WITH the invitation and written in the same transaction.
 *
 * The claims under test: the answer does not depend on the absent-profile mode (every membership has
 * a profile, written by the membership owner), it never carries a department answer the operator was
 * not asked, and an unfinished restriction is not a scope.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inviteScopeNote, inviteScopePayload, inviteSiteSelectionIsComplete } from "@/lib/access/inviteLocationAccess";

describe("the location answer is the operator's, whatever the absent-profile mode", () => {
    it("produces a payload under deny — the choice is never silently dropped", () => {
        expect(inviteScopePayload({ siteMode: "all", siteLocationIds: [] })).toEqual({ site_scope: "all", site_location_ids: [] });
        expect(inviteScopePayload({ siteMode: "restricted", siteLocationIds: ["loc-1"] })).toEqual({ site_scope: "restricted", site_location_ids: ["loc-1"] });
    });

    it("carries no department answer — departments are what the membership owner writes (all)", () => {
        const payload = inviteScopePayload({ siteMode: "restricted", siteLocationIds: ["loc-1"] }) as Record<string, unknown>;
        expect(Object.keys(payload).sort()).toEqual(["site_location_ids", "site_scope"]);
    });

    it("does not read the absent-profile constant at all", () => {
        const src = readFileSync(join(process.cwd(), "lib/access/inviteLocationAccess.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        expect(src).not.toMatch(/ABSENT_PROFILE_ENFORCEMENT|resolveScopeAnswerFromProfile/);
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

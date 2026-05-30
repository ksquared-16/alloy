import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
    globalSearchPersonSecondaryContext,
    globalSearchPersonTypeLabel,
    personRowIsChildRelationship,
} from "@/lib/admin/globalSearch/globalRecordSearchPersonPresentation";
import {
    adminV2PathHasDrawerHost,
    readGlobalRecordSearchOpenIntent,
    storeGlobalRecordSearchOpenIntent,
    clearGlobalRecordSearchOpenIntent,
    GLOBAL_RECORD_SEARCH_OPEN_INTENT_KEY,
} from "@/lib/adminV2/globalRecordSearchOpen";

describe("globalSearchPersonTypeLabel", () => {
    it("labels child members as Child", () => {
        expect(
            globalSearchPersonTypeLabel({
                person_id: "p1",
                customer_members: [{ relationship: "child" }],
            })
        ).toBe("Child");
    });

    it("labels guardians from customer_persons", () => {
        expect(
            globalSearchPersonTypeLabel({
                person_id: "p2",
                customer_persons: [{ role_type: "guardian" }],
            })
        ).toBe("Guardian");
    });

    it("falls back to Person when no role signals", () => {
        expect(globalSearchPersonTypeLabel({ person_id: "p3" })).toBe("Person");
    });
});

describe("globalSearchPersonSecondaryContext", () => {
    it("prefers site for children", () => {
        expect(
            globalSearchPersonSecondaryContext({
                isChild: true,
                siteLabel: "North Campus",
                householdName: "Chen Household",
            })
        ).toBe("North Campus");
    });

    it("prefers household for guardians", () => {
        expect(
            globalSearchPersonSecondaryContext({
                isChild: false,
                siteLabel: "North Campus",
                householdName: "Chen Household",
            })
        ).toBe("Chen Household");
    });
});

describe("personRowIsChildRelationship", () => {
    it("recognizes child relationship keys", () => {
        expect(personRowIsChildRelationship("child")).toBe(true);
        expect(personRowIsChildRelationship("enrolled_child")).toBe(true);
        expect(personRowIsChildRelationship("guardian")).toBe(false);
    });
});

describe("globalRecordSearchOpen bridge", () => {
    beforeEach(() => {
        const store = new Map<string, string>();
        vi.stubGlobal("sessionStorage", {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => {
                store.set(k, v);
            },
            removeItem: (k: string) => {
                store.delete(k);
            },
        });
        vi.stubGlobal("window", { sessionStorage: globalThis.sessionStorage, location: { pathname: "/" } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("adminV2PathHasDrawerHost matches workspace and settings", () => {
        expect(adminV2PathHasDrawerHost("/adminV2/workspace/dept/x")).toBe(true);
        expect(adminV2PathHasDrawerHost("/adminV2/settings/locations")).toBe(true);
        expect(adminV2PathHasDrawerHost("/adminV2/workflows")).toBe(false);
    });

    it("stores and reads sessionStorage open intent", () => {
        sessionStorage.removeItem(GLOBAL_RECORD_SEARCH_OPEN_INTENT_KEY);
        storeGlobalRecordSearchOpenIntent({ entity_type: "persons", entity_id: "abc" });
        const intent = readGlobalRecordSearchOpenIntent();
        expect(intent?.entity_type).toBe("persons");
        expect(intent?.entity_id).toBe("abc");
        clearGlobalRecordSearchOpenIntent();
        expect(readGlobalRecordSearchOpenIntent()).toBeNull();
    });
});

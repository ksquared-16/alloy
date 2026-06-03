import { afterEach, describe, expect, it } from "vitest";
import {
    __clearDrawerEntitySnapshotCacheForTests,
    peekDrawerEntitySnapshot,
    putDrawerEntitySnapshot,
} from "@/lib/admin/drawerEntitySnapshotCache";
import { mergeOpportunityFullHydrateStaged } from "@/lib/admin/drawer/opportunityFullHydrateMerge";

afterEach(() => __clearDrawerEntitySnapshotCacheForTests());

describe("Card 3B-2 — full snapshot persistence (no downgrade)", () => {
    it("a persisted full snapshot is NOT downgraded by a later drawer_primary write", () => {
        putDrawerEntitySnapshot("opportunities", "o1", { id: "o1", _record_surface: "full", _customer_name: "Acme" });
        // A subsequent primary-surface write (e.g. a re-derived bootstrap primary) must not downgrade it.
        putDrawerEntitySnapshot("opportunities", "o1", { id: "o1", _record_surface: "drawer_primary", _customer_name: "Acme" });
        const snap = peekDrawerEntitySnapshot("opportunities", "o1");
        expect(String((snap as Record<string, unknown>)?._record_surface)).toBe("full");
    });

    it("drawer_primary is upgraded to full (monotonic improvement allowed)", () => {
        putDrawerEntitySnapshot("opportunities", "o1", { id: "o1", _record_surface: "drawer_primary" });
        putDrawerEntitySnapshot("opportunities", "o1", { id: "o1", _record_surface: "full", _inquiry_children: [] });
        const snap = peekDrawerEntitySnapshot("opportunities", "o1") as Record<string, unknown>;
        expect(snap._record_surface).toBe("full");
        expect(snap._inquiry_children).toEqual([]);
    });

    it("{ replace: true } forces a write (authoritative refresh)", () => {
        putDrawerEntitySnapshot("opportunities", "o1", { id: "o1", _record_surface: "full" });
        putDrawerEntitySnapshot("opportunities", "o1", { id: "o1", _record_surface: "drawer_primary" }, { replace: true });
        const snap = peekDrawerEntitySnapshot("opportunities", "o1") as Record<string, unknown>;
        expect(snap._record_surface).toBe("drawer_primary");
    });

    it("unranked surfaces (person seeds / generic records) are never blocked", () => {
        putDrawerEntitySnapshot("persons", "p1", { id: "p1", _record_surface: "person_drawer_seed", name: "Seed" });
        // Real person record (no ranked surface) must overwrite the seed.
        putDrawerEntitySnapshot("persons", "p1", { id: "p1", name: "Loaded" });
        const snap = peekDrawerEntitySnapshot("persons", "p1") as Record<string, unknown>;
        expect(snap.name).toBe("Loaded");
    });

    it("the full hydrate staged merge yields a `full` surface (the value that gets persisted)", () => {
        const prev = { id: "o1", _record_surface: "drawer_primary", _customer_name: "Acme" };
        const full = { ...prev, _record_surface: "full", _inquiry_children: [{ id: "c1" }] };
        const { merged } = mergeOpportunityFullHydrateStaged(prev, full, { aboveFoldLocked: true });
        expect(merged._record_surface).toBe("full"); // persisted via the 2289 snapshot effect → no full→primary
    });
});

import { describe, expect, it } from "vitest";
import {
    OPPORTUNITY_ABOVE_FOLD_RECORD_KEYS,
    applyOpportunityFullHydrateDeferredPatch,
    mergeOpportunityFullHydrateBackground,
} from "@/lib/admin/drawer/opportunityFullHydrateMerge";

describe("Card 3B — opportunity above-fold-safe background merge", () => {
    it("never moves an already-painted above-fold value (identity / status / inquiry children)", () => {
        const painted = {
            id: "o1",
            _record_surface: "drawer_visible",
            _customer_name: "Painted Family",
            status_key: "active",
            _inquiry_children: [{ person_id: "c1", display_name: "Child A" }],
        };
        const background = {
            _customer_name: "Different Family", // would visibly move above-fold → must be dropped
            status_key: "stale", // must be dropped
            _inquiry_children: [{ person_id: "c1", display_name: "Child A (relabelled)" }], // dropped
        };
        const merged = mergeOpportunityFullHydrateBackground(painted, background);
        expect(merged._customer_name).toBe("Painted Family");
        expect(merged.status_key).toBe("active");
        expect(merged._inquiry_children).toEqual([{ person_id: "c1", display_name: "Child A" }]);
    });

    it("fills an ABSENT above-fold key (gap completion, not movement)", () => {
        const painted = { id: "o1", _record_surface: "drawer_visible", _customer_name: "Fam" };
        const background = { _primary_person_name: "Jane Doe", _identity: { household: { label: "H" } } };
        const merged = mergeOpportunityFullHydrateBackground(painted, background);
        expect(merged._primary_person_name).toBe("Jane Doe");
        expect(merged._identity).toEqual({ household: { label: "H" } });
    });

    it("merges below-fold / non-classified fields normally", () => {
        const painted = { id: "o1", _customer_name: "Fam" };
        const background = {
            _operational_attention: { count: 3 },
            _activity_signal: { last: "x" },
            metadata: { tour_date: "2026-07-01" },
        };
        const merged = mergeOpportunityFullHydrateBackground(painted, background);
        expect(merged._operational_attention).toEqual({ count: 3 });
        expect(merged._activity_signal).toEqual({ last: "x" });
        expect(merged.metadata).toEqual({ tour_date: "2026-07-01" });
    });

    it("deferred patch protects above-fold and clears the pending flag", () => {
        const painted = {
            id: "o1",
            _customer_name: "Painted Family",
            _full_hydrate_deferred_pending: true,
        };
        const deferred = {
            _customer_name: "Moved Family", // above-fold → dropped
            _operational_attention: { count: 1 }, // below-fold → applied
        };
        const merged = applyOpportunityFullHydrateDeferredPatch(painted, deferred);
        expect(merged._customer_name).toBe("Painted Family");
        expect(merged._operational_attention).toEqual({ count: 1 });
        expect(merged._full_hydrate_deferred_pending).toBeUndefined();
    });

    it("classifies the expected first-paint-critical above-fold keys (and excludes metadata)", () => {
        expect(OPPORTUNITY_ABOVE_FOLD_RECORD_KEYS.has("_identity")).toBe(true);
        expect(OPPORTUNITY_ABOVE_FOLD_RECORD_KEYS.has("_inquiry_children")).toBe(true);
        expect(OPPORTUNITY_ABOVE_FOLD_RECORD_KEYS.has("status_key")).toBe(true);
        expect(OPPORTUNITY_ABOVE_FOLD_RECORD_KEYS.has("metadata")).toBe(false);
    });
});

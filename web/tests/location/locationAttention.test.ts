/**
 * Location attention — what is wrong, not how many things are wrong.
 *
 * "1 needs attention" was true and useless: it told an operator that something
 * stood between them and operating the site, and nothing else. The structured
 * issues existed the whole time and no surface rendered them.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { locationSelectorAttentionSignal } from "@/lib/locations/locationSelectorSignal";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("the collection row says what is wrong when it can", () => {
    it("says nothing at all when nothing is wrong", () => {
        expect(locationSelectorAttentionSignal({ criticalCount: 0 })).toBeNull();
        expect(locationSelectorAttentionSignal({ criticalCount: 0, topAttention: { label: "x" } })).toBeNull();
    });

    it("names the single issue instead of counting it", () => {
        expect(
            locationSelectorAttentionSignal({
                criticalCount: 1,
                topAttention: { label: "3 rooms need capacity" },
            }),
        ).toBe("3 rooms need capacity");
        expect(
            locationSelectorAttentionSignal({ criticalCount: 1, topAttention: { label: "Time zone is not set" } }),
        ).toBe("Time zone is not set");
    });

    it("falls back to the count only when the model resolved no item", () => {
        expect(locationSelectorAttentionSignal({ criticalCount: 1 })).toBe("1 needs attention");
        expect(locationSelectorAttentionSignal({ criticalCount: 1, topAttention: null })).toBe("1 needs attention");
    });

    it("aggregates when several categories contribute, because naming one would imply it is the only one", () => {
        expect(
            locationSelectorAttentionSignal({
                criticalCount: 3,
                topAttention: { label: "Time zone is not set" },
            }),
        ).toBe("3 need attention");
    });
});

describe("the issues are reachable", () => {
    it("Overview lists every outstanding item with its consequence", () => {
        const src = read("components/adminV2/settings/locations/LocationOverviewSurface.tsx");
        expect(src).toContain("locations-overview-attention");
        expect(src).toContain("item.label");
        expect(src).toContain("item.consequence");
        expect(src).toContain("item.nextLabel");
    });

    it("each item navigates to where it can be fixed", () => {
        const src = read("components/adminV2/settings/locations/LocationOverviewSurface.tsx");
        expect(src).toContain("goTo(item.tab)");
        // The destination handler already existed and was passed in; it was
        // simply never rendered against anything.
        expect(src).toContain("onResolveAttention");
    });

    it("shows nothing when there is nothing outstanding — no empty health filler", () => {
        const src = read("components/adminV2/settings/locations/LocationOverviewSurface.tsx");
        expect(src).toContain("outstanding.length > 0 ?");
    });
});

describe("the Space editor speaks of spaces", () => {
    it("has no operator-facing Room heading or Save room button", () => {
        for (const file of [
            "components/adminV2/settings/locations/LocationRoomDetailPanel.tsx",
            "components/adminV2/settings/locations/LocationRoomCreatePanel.tsx",
        ]) {
            const src = read(file);
            expect(src).not.toContain('title="Room"');
            expect(src).not.toContain("Save room");
        }
    });

    it("still allows a space actually NAMED Room 1 — this is copy, not identifiers", () => {
        // `room` stays throughout the code and the test ids; only the words an
        // operator reads changed.
        const src = read("components/adminV2/settings/locations/LocationRoomDetailPanel.tsx");
        expect(src).toContain("locations-room-editor-identity");
        expect(src).toContain("roomType");
    });
});

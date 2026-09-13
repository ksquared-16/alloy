import { describe, expect, it } from "vitest";

import { buildFocusPanelAttentionChips } from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";
import {
    countOpenWork,
    countUnreadForEntity,
} from "@/lib/adminV2/runtime/focusPanel/useRecordAttentionCounts";

describe("record work count", () => {
    it("counts only open work", () => {
        expect(
            countOpenWork([
                { status: "open" },
                { status: "open" },
                { status: "completed" },
                { status: "canceled" },
            ]),
        ).toBe(2);
    });

    it("is zero, not a crash, when the record has no work", () => {
        expect(countOpenWork([])).toBe(0);
        expect(countOpenWork(null)).toBe(0);
        expect(countOpenWork(undefined)).toBe(0);
    });
});

describe("record unread count", () => {
    const conversations = [
        { primary_entity_id: "opp-1", unread_count: 2 },
        { primary_entity_id: "opp-1", unread_count: 1 },
        { primary_entity_id: "opp-2", unread_count: 5 },
        { primary_entity_id: "opp-1", unread_count: 0 },
    ];

    it("sums only this record's conversations", () => {
        expect(countUnreadForEntity(conversations, "opp-1")).toBe(3);
        expect(countUnreadForEntity(conversations, "opp-2")).toBe(5);
        expect(countUnreadForEntity(conversations, "opp-3")).toBe(0);
    });

    it("tolerates the legacy unread field and missing values", () => {
        expect(countUnreadForEntity([{ primary_entity_id: "o", unread: 4 }], "o")).toBe(4);
        expect(countUnreadForEntity([{ primary_entity_id: "o" }], "o")).toBe(0);
        expect(countUnreadForEntity(null, "o")).toBe(0);
    });
});

describe("attention chips stay distinguishable", () => {
    /**
     * The product requirement is that an operator can tell unread mail from outstanding work. A
     * single combined number is explicitly insufficient — the two are resolved in different places.
     */
    it("renders work and unread as two labelled chips", () => {
        const chips = buildFocusPanelAttentionChips({ work: 2, unread: 1 });
        expect(chips).toHaveLength(2);
        expect(chips[0].label).toBe("Work: 2");
        expect(chips[1].label).toBe("Unread: 1");
        expect(chips.every((c) => c.kind === "attention")).toBe(true);
        expect(chips[0].tone).not.toBe(chips[1].tone);
    });

    it("moves the two counts independently", () => {
        // Answering the message must not change the work chip, and vice versa.
        expect(buildFocusPanelAttentionChips({ work: 2, unread: 0 }).map((c) => c.label)).toEqual([
            "Work: 2",
        ]);
        expect(buildFocusPanelAttentionChips({ work: 0, unread: 1 }).map((c) => c.label)).toEqual([
            "Unread: 1",
        ]);
    });

    it("shows no chip at all when nothing is waiting", () => {
        expect(buildFocusPanelAttentionChips({ work: 0, unread: 0 })).toEqual([]);
        expect(buildFocusPanelAttentionChips({})).toEqual([]);
    });

    it("carries the count so consumers never parse the label", () => {
        expect(buildFocusPanelAttentionChips({ work: 7 })[0].count).toBe(7);
    });
});

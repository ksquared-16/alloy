import { describe, expect, it } from "vitest";

import {
    childCountLabel,
    DEFAULT_CHILD_COMPRESSED_ROW_LAYOUT,
    DEFAULT_FAMILY_COMPRESSED_ROW_LAYOUT,
    firstChildLabel,
    formatChildrenInline,
    resolveCompressedQueueRowDisplay,
} from "@/lib/adminV2/runtime/compressedQueueRowFields";
import type { CrmCompactRowSemanticSlots, QueueItemVm } from "@/lib/ui-v2/workspace-types";

function crm(overrides: Partial<CrmCompactRowSemanticSlots>): CrmCompactRowSemanticSlots {
    return {
        primaryIdentity: "",
        childName: null,
        childrenLines: null,
        stageLabel: null,
        statusLabel: null,
        nextStep: null,
        attentionReason: null,
        ageContext: null,
        roomContext: null,
        programContext: null,
        ...overrides,
    } as CrmCompactRowSemanticSlots;
}

function item(overrides: Partial<Pick<QueueItemVm, "title" | "subtitle" | "rowGrain">>) {
    return { title: "Fallback", subtitle: undefined, rowGrain: undefined, ...overrides } as Pick<
        QueueItemVm,
        "title" | "subtitle" | "rowGrain"
    >;
}

describe("CompressedQueueRowLayout — default compatibility configs", () => {
    it("documents family grain defaults (identity · contact · children · location/cue)", () => {
        expect(DEFAULT_FAMILY_COMPRESSED_ROW_LAYOUT.line2Fields).toContain("primaryContact");
        expect(DEFAULT_FAMILY_COMPRESSED_ROW_LAYOUT.line3Fields).toContain("children");
        expect(DEFAULT_FAMILY_COMPRESSED_ROW_LAYOUT.line4Fields).toContain("location");
        expect(DEFAULT_FAMILY_COMPRESSED_ROW_LAYOUT.maxLines).toBe(4);
        expect(DEFAULT_FAMILY_COMPRESSED_ROW_LAYOUT.badgeMode).toBe("children");
    });

    it("documents child grain defaults (identity · age/household · program · location/cue)", () => {
        expect(DEFAULT_CHILD_COMPRESSED_ROW_LAYOUT.line2Fields).toEqual(["age", "household"]);
        expect(DEFAULT_CHILD_COMPRESSED_ROW_LAYOUT.line3Fields).toEqual(["program", "room"]);
        expect(DEFAULT_CHILD_COMPRESSED_ROW_LAYOUT.badgeMode).toBe("none");
    });
});

describe("resolveCompressedQueueRowDisplay — identity + status", () => {
    it("prefers CRM primary identity over the preview title (family grain)", () => {
        const d = resolveCompressedQueueRowDisplay(item({ title: "x" }), crm({ primaryIdentity: "Jacobs Family" }));
        expect(d.identity).toBe("Jacobs Family");
    });

    it("never returns an empty identity", () => {
        expect(resolveCompressedQueueRowDisplay(item({ title: "  " }), null).identity).toBe("Untitled record");
    });
});

describe("formatChildrenInline — line 3 children + ages", () => {
    it("returns null when there are no children", () => {
        expect(formatChildrenInline(null)).toBeNull();
        expect(formatChildrenInline([])).toBeNull();
    });

    it("joins child names with ages on one line", () => {
        expect(
            formatChildrenInline([
                { primary: "Emyrson Wright (4y)" },
                { primary: "Mckenzie Wright (2y)" },
            ]),
        ).toBe("Emyrson Wright (4y) · Mckenzie Wright (2y)");
    });

    it("collapses extras into +N more", () => {
        expect(
            formatChildrenInline(
                [
                    { primary: "Jonny (2y)" },
                    { primary: "Emyrson (4y)" },
                    { primary: "Mckenzie (2y)" },
                    { primary: "Theo (6y)" },
                ],
                2,
            ),
        ).toBe("Jonny (2y) · Emyrson (4y) +2 more");
    });
});

describe("childCountLabel — right column (no ambiguous avatar badge)", () => {
    it("returns null for 0 or 1 child", () => {
        expect(childCountLabel(null)).toBeNull();
        expect(childCountLabel([{ primary: "Alex (5y)" }])).toBeNull();
    });

    it("labels multi-child families clearly", () => {
        expect(
            childCountLabel([{ primary: "A" }, { primary: "B" }, { primary: "C" }]),
        ).toBe("3 children");
    });
});

describe("resolveCompressedQueueRowDisplay — family grain four-line layout", () => {
    it("line 2 = primary contact; line 3 = children·ages; line 4 = location · work cue", () => {
        const d = resolveCompressedQueueRowDisplay(
            item({ title: "Wright Family", rowGrain: "case" }),
            crm({
                primaryIdentity: "Wright Family",
                contactDisplayName: "Sarah Wright",
                locationContext: "North Campus",
                childrenLines: [
                    { primary: "Jonny (2y)" },
                    { primary: "Emyrson Wright (4y)" },
                    { primary: "Mckenzie Wright (2y)" },
                ],
                statusLabel: "New Lead",
                operationalNextHint: "1 overdue task",
            }),
        );
        expect(d.line2).toBe("Sarah Wright");
        expect(d.line3).toBe("Jonny (2y) · Emyrson Wright (4y) +1 more");
        expect(d.line4).toBe("North Campus · 1 overdue task");
        expect(d.statusLabel).toBe("New Lead");
        expect(d.rightCountLabel).toBe("3 children");
        expect(d.attention).toBe(true);
    });

    it("falls back to subtitle on line 2 when no primary contact", () => {
        const d = resolveCompressedQueueRowDisplay(
            item({ title: "Lyons Family", subtitle: "No recent activity", rowGrain: "case" }),
            crm({ primaryIdentity: "Lyons Family" }),
        );
        expect(d.line2).toBe("No recent activity");
    });

    it("line 4 carries attention cue when no location", () => {
        const d = resolveCompressedQueueRowDisplay(
            item({ rowGrain: "case" }),
            crm({
                primaryIdentity: "Lyons Family",
                childrenLines: [{ primary: "Alex (5y)" }, { primary: "Mara (3y)" }],
                attentionReason: "Missing medical form",
            }),
        );
        expect(d.line4).toBe("Missing medical form");
        expect(d.rightCountLabel).toBe("2 children");
    });
});

describe("resolveCompressedQueueRowDisplay — child grain four-line layout", () => {
    it("line 1 = name; line 2 = age · household; line 3 = program/room; line 4 = location · cue", () => {
        const d = resolveCompressedQueueRowDisplay(
            item({ title: "Jonny Jacobs", rowGrain: "child" }),
            crm({
                childName: "Jonny Jacobs",
                primaryIdentity: "123 main street Family",
                ageContext: "2y",
                programContext: "Infant",
                roomContext: "Infant Room",
                locationContext: "North Campus",
                statusLabel: "Enrolled",
                attentionReason: "Tour tomorrow",
            }),
        );
        expect(d.identity).toBe("Jonny Jacobs");
        expect(d.line2).toBe("2y · 123 main street Family");
        expect(d.line3).toBe("Infant · Infant Room");
        expect(d.line4).toBe("North Campus · Tour tomorrow");
        expect(d.rightCountLabel).toBeNull();
    });
});

describe("firstChildLabel", () => {
    it("returns the first structured child primary", () => {
        expect(firstChildLabel([{ primary: "Emyrson (4y)" }, { primary: "Mckenzie (2y)" }])).toBe("Emyrson (4y)");
    });
});

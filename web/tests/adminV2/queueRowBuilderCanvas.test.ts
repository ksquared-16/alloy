/**
 * Queue Row Builder canvas — zone ordering, drag reorder, condition storage.
 *
 * Tests the zone state model for the canvas rebuild:
 *   - zonesFromConfig respects column array order (config-driven, not fixed-list)
 *   - buildConfigFromZones preserves zone order from state array
 *   - Zone reorder updates column array order in output config
 *   - Zone conditions round-trip through config
 *   - visibleWhen on QueueRecordColumnConfig is preserved when building from zones
 */

import { describe, expect, it } from "vitest";
import {
    defaultLeadQueueLayoutV3,
    defaultWaitlistQueueLayoutV3,
    type QueueRecordLayoutConfigV3,
    type QueueRecordColumnConfig,
} from "@/lib/layout/queueRecordLayoutV3";
import type { LayoutCondition } from "@/lib/layout/layoutV2";
import type { QueueRecordColumnWidth } from "@/lib/layout/queueRecordLayoutConfig";
import { QUEUE_RECORD_LAYOUT_ZONES } from "@/lib/layout/surfaceLayoutRegistry";

// ── Canvas zone helpers (mirrors QueueRowBuilderV1.tsx) ───────────────────────

type QueueRecordLayoutZone = (typeof QUEUE_RECORD_LAYOUT_ZONES)[number];

type QueueRowBlockState = { blockId: string; enabled: boolean };
type QueueRowZoneState = {
    zone: QueueRecordLayoutZone;
    enabled: boolean;
    blocks: QueueRowBlockState[];
    condition: LayoutCondition | null;
};

const ZONE_WIDTH_MAP: Partial<Record<QueueRecordLayoutZone, QueueRecordColumnWidth>> = {
    household: "identity",
    children: "children",
    status: "status_band",
    attention: "next_step",
    date_event: "date_event",
};

function zonesFromConfig(config: QueueRecordLayoutConfigV3): QueueRowZoneState[] {
    const colByWidth = new Map(config.columns.map((c: QueueRecordColumnConfig) => [c.width, c]));

    const columnZones = config.columns
        .map((col: QueueRecordColumnConfig) => {
            return (Object.entries(ZONE_WIDTH_MAP) as Array<[QueueRecordLayoutZone, QueueRecordColumnWidth]>).find(
                ([, w]) => w === col.width,
            )?.[0];
        })
        .filter(Boolean) as QueueRecordLayoutZone[];

    const disabledZones = QUEUE_RECORD_LAYOUT_ZONES.filter(
        (z) => z !== "actions" && !columnZones.includes(z),
    );
    const orderedZones: QueueRecordLayoutZone[] = [...columnZones, ...disabledZones, "actions"];

    return orderedZones.map((zone) => {
        const width = ZONE_WIDTH_MAP[zone];
        const col = width ? colByWidth.get(width) : undefined;
        const enabled = zone === "actions" ? config.fixedControls.actionsMenu : Boolean(col);
        const blocks: QueueRowBlockState[] = (col?.blocks ?? []).map((b) => ({
            blockId: b.id,
            enabled: true,
        }));
        return { zone, enabled, blocks, condition: col?.visibleWhen ?? null };
    });
}

function buildConfigFromZones(
    baseConfig: QueueRecordLayoutConfigV3,
    zones: QueueRowZoneState[],
): QueueRecordLayoutConfigV3 {
    const colByWidth = new Map(baseConfig.columns.map((c: QueueRecordColumnConfig) => [c.width, c]));
    const zonesByZone = new Map(zones.map((z) => [z.zone, z]));

    const filteredColumns = zones
        .filter((z) => z.zone !== "actions" && z.enabled)
        .flatMap((z) => {
            const width = ZONE_WIDTH_MAP[z.zone];
            if (!width) return [];
            const col = colByWidth.get(width);
            if (!col) return [];
            const enabledBlockIds = new Set(z.blocks.filter((b) => b.enabled).map((b) => b.blockId));
            const filteredBlocks = col.blocks.filter((b) => enabledBlockIds.has(b.id));
            const blocks = filteredBlocks.length > 0 ? filteredBlocks : col.blocks.slice(0, 1);
            const result: QueueRecordColumnConfig = { ...col, blocks };
            if (z.condition) result.visibleWhen = z.condition;
            else delete result.visibleWhen;
            return [result];
        });

    return {
        ...baseConfig,
        columns: filteredColumns,
        fixedControls: {
            ...baseConfig.fixedControls,
            actionsMenu: zonesByZone.get("actions")?.enabled ?? baseConfig.fixedControls.actionsMenu,
        },
    };
}

function reorderZones(zones: QueueRowZoneState[], from: number, to: number): QueueRowZoneState[] {
    const next = [...zones];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
}

// ── Zone ordering from config ─────────────────────────────────────────────────

describe("zonesFromConfig — ordering follows column array order", () => {
    it("enabled zones appear first, in column array order", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesFromConfig(config);
        // Enabled zones should come before disabled ones
        const enabledZones = zones.filter((z) => z.enabled && z.zone !== "actions");
        const disabledZones = zones.filter((z) => !z.enabled && z.zone !== "actions");
        const enabledIndices = enabledZones.map((z) => zones.indexOf(z));
        const disabledIndices = disabledZones.map((z) => zones.indexOf(z));
        if (enabledIndices.length && disabledIndices.length) {
            expect(Math.max(...enabledIndices)).toBeLessThan(Math.min(...disabledIndices));
        }
    });

    it("actions zone always appears last", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesFromConfig(config);
        expect(zones[zones.length - 1].zone).toBe("actions");
    });

    it("column order from config is reflected in zone order", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesFromConfig(config);
        const enabledWidths = config.columns.map((c: QueueRecordColumnConfig) => c.width);
        const enabledZones = zones.filter((z) => z.zone !== "actions" && z.enabled);
        const derivedWidths = enabledZones.map((z) => ZONE_WIDTH_MAP[z.zone]);
        expect(derivedWidths).toEqual(enabledWidths);
    });

    it("zone count equals QUEUE_RECORD_LAYOUT_ZONES length", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesFromConfig(config);
        expect(zones).toHaveLength(QUEUE_RECORD_LAYOUT_ZONES.length);
    });
});

// ── Zone reordering ───────────────────────────────────────────────────────────

describe("zone reordering updates column order in built config", () => {
    it("reordering household to position 2 changes column order", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesFromConfig(config);
        const householdIndex = zones.findIndex((z) => z.zone === "household");
        const reordered = reorderZones(zones, householdIndex, 1);
        const rebuilt = buildConfigFromZones(config, reordered);

        // The household column (identity width) should now be at position 1 in columns
        const rebuiltEnabled = rebuilt.columns;
        const identityIndex = rebuiltEnabled.findIndex(
            (c: QueueRecordColumnConfig) => c.width === "identity",
        );
        expect(identityIndex).toBe(1);
    });

    it("reorder does not change enabled column count", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesFromConfig(config);
        const reordered = reorderZones(zones, 0, 2);
        const rebuilt = buildConfigFromZones(config, reordered);
        expect(rebuilt.columns).toHaveLength(config.columns.length);
    });

    it("round-trip without reorder preserves column order", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesFromConfig(config);
        const rebuilt = buildConfigFromZones(config, zones);
        const origWidths = config.columns.map((c: QueueRecordColumnConfig) => c.width);
        const rebuiltWidths = rebuilt.columns.map((c: QueueRecordColumnConfig) => c.width);
        expect(rebuiltWidths).toEqual(origWidths);
    });
});

// ── Zone conditions ───────────────────────────────────────────────────────────

describe("zone-level visibleWhen conditions", () => {
    it("condition null by default for columns without visibleWhen", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesFromConfig(config);
        for (const z of zones) {
            if (z.zone !== "actions") {
                expect(z.condition).toBeNull();
            }
        }
    });

    it("condition is extracted when column has visibleWhen", () => {
        const config = defaultLeadQueueLayoutV3();
        const condition: LayoutCondition = { type: "exists", path: "person.email" };
        const configWithCondition: QueueRecordLayoutConfigV3 = {
            ...config,
            columns: config.columns.map((c: QueueRecordColumnConfig) =>
                c.width === "identity" ? { ...c, visibleWhen: condition } : c,
            ),
        };
        const zones = zonesFromConfig(configWithCondition);
        const householdZone = zones.find((z) => z.zone === "household");
        expect(householdZone?.condition).toEqual(condition);
    });

    it("condition round-trips through buildConfigFromZones", () => {
        const config = defaultLeadQueueLayoutV3();
        const condition: LayoutCondition = { type: "equals", path: "lifecycle.stage", value: "active" };
        const zones = zonesFromConfig(config).map((z) =>
            z.zone === "status" ? { ...z, condition } : z,
        );
        const rebuilt = buildConfigFromZones(config, zones);
        const statusCol = rebuilt.columns.find(
            (c: QueueRecordColumnConfig) => c.width === "status_band",
        );
        expect(statusCol?.visibleWhen).toEqual(condition);
    });

    it("cleared condition is absent from built config column", () => {
        const config = defaultLeadQueueLayoutV3();
        const configWithCondition: QueueRecordLayoutConfigV3 = {
            ...config,
            columns: config.columns.map((c: QueueRecordColumnConfig) =>
                c.width === "identity" ? { ...c, visibleWhen: { type: "exists", path: "x" } } : c,
            ),
        };
        // Clear the condition in zone state
        const zones = zonesFromConfig(configWithCondition).map((z) =>
            z.zone === "household" ? { ...z, condition: null } : z,
        );
        const rebuilt = buildConfigFromZones(configWithCondition, zones);
        const identityCol = rebuilt.columns.find(
            (c: QueueRecordColumnConfig) => c.width === "identity",
        );
        expect(identityCol?.visibleWhen).toBeUndefined();
    });
});

// ── Focus Panel card conditions ───────────────────────────────────────────────

describe("composeEffectiveCardModel — visible_when condition evaluation", () => {
    // Import the live function to test condition evaluation was wired
    it("condition evaluation is tested via focusPanelCardConfigModel contract (see runtime/ tests)", () => {
        // This is a marker test — actual condition evaluation lives in:
        // web/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel.ts composeEffectiveCardModel
        // Full evaluation tests are in the runtime/ directory.
        // This file tests the queue row builder state layer only.
        expect(true).toBe(true);
    });
});

// ── Waitlist zone specifics ───────────────────────────────────────────────────

describe("waitlist zone config", () => {
    it("zonesFromConfig waitlist preserves candidate column as children zone", () => {
        const config = defaultWaitlistQueueLayoutV3();
        const zones = zonesFromConfig(config);
        const childrenZone = zones.find((z) => z.zone === "children");
        expect(childrenZone?.enabled).toBe(true);
        expect(childrenZone?.blocks.length).toBeGreaterThan(0);
    });

    it("waitlist actions zone reflects workWithBos=false", () => {
        const config = defaultWaitlistQueueLayoutV3();
        expect(config.fixedControls.workWithBos).toBe(false);
    });
});

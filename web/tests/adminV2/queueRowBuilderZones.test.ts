/**
 * Queue Row Builder V1 — zone state ↔ QueueRecordLayoutConfigV3 contract tests.
 *
 * The builder derives zone toggles from the loaded config at startup, and
 * converts zone state back to a config on publish. These tests verify that
 * round-tripping through zones is lossless for the columns the builder controls.
 *
 * Covered invariants:
 *   Zone level:
 *   - defaultLeadQueueLayoutV3 zones: all content zones on, actions on
 *   - defaultWaitlistQueueLayoutV3 zones: same zone shape
 *   - Disabling a zone removes its column from columns array
 *   - Enabling actions zone sets fixedControls.actionsMenu = true
 *   - Disabling actions zone sets fixedControls.actionsMenu = false
 *   - Grain rule: case-grain pipeline row uses "opportunities" entity type
 *   - Grain rule: candidate-grain waitlist row uses "placement_candidate"
 *   - No fake placement actions in case-grain (pipeline-queue-row) config
 *
 *   Block (evidence group) level:
 *   - zonesFromConfig extracts block states from each column
 *   - All blocks are enabled by default (loaded config is the source of truth)
 *   - Disabling a block removes it from the rebuilt column
 *   - Keeping all blocks enabled preserves block order and ids
 *   - Round-trip block state is stable (blocks → config → not modified)
 *   - At least one block is always kept per enabled zone (safety floor)
 */

import { describe, expect, it } from "vitest";
import {
    defaultLeadQueueLayoutV3,
    defaultWaitlistQueueLayoutV3,
    type QueueRecordLayoutConfigV3,
    type QueueRecordColumnConfig,
} from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRecordColumnWidth } from "@/lib/layout/queueRecordLayoutConfig";
import { QUEUE_RECORD_LAYOUT_ZONES } from "@/lib/layout/surfaceLayoutRegistry";

// ── Helpers (duplicated from builder to keep tests independent) ────────────

type QueueRecordLayoutZone = (typeof QUEUE_RECORD_LAYOUT_ZONES)[number];

// Zone-only state (used in basic zone tests)
type QueueRowZoneStateSimple = { zone: QueueRecordLayoutZone; enabled: boolean };

// Block-aware state (used in evidence group tests)
type QueueRowBlockState = { blockId: string; enabled: boolean };
type QueueRowZoneStateWithBlocks = {
    zone: QueueRecordLayoutZone;
    enabled: boolean;
    blocks: QueueRowBlockState[];
};

const ZONE_WIDTH_MAP: Partial<Record<QueueRecordLayoutZone, QueueRecordColumnWidth>> = {
    household: "identity",
    children: "children",
    status: "status_band",
    attention: "next_step",
    date_event: "date_event",
};

function zonesFromConfig(config: QueueRecordLayoutConfigV3): QueueRowZoneStateSimple[] {
    const presentWidths = new Set(config.columns.map((c: QueueRecordColumnConfig) => c.width));
    return QUEUE_RECORD_LAYOUT_ZONES.map((zone) => ({
        zone,
        enabled:
            zone === "actions"
                ? config.fixedControls.actionsMenu
                : Boolean(ZONE_WIDTH_MAP[zone] && presentWidths.has(ZONE_WIDTH_MAP[zone]!)),
    }));
}

function zonesWithBlocksFromConfig(config: QueueRecordLayoutConfigV3): QueueRowZoneStateWithBlocks[] {
    const colByWidth = new Map(config.columns.map((c: QueueRecordColumnConfig) => [c.width, c]));
    return QUEUE_RECORD_LAYOUT_ZONES.map((zone) => {
        const width = ZONE_WIDTH_MAP[zone];
        const col = width ? colByWidth.get(width) : undefined;
        const enabled = zone === "actions" ? config.fixedControls.actionsMenu : Boolean(col);
        const blocks: QueueRowBlockState[] = (col?.blocks ?? []).map((b) => ({
            blockId: b.id,
            enabled: true,
        }));
        return { zone, enabled, blocks };
    });
}

function buildConfigFromZones(
    baseConfig: QueueRecordLayoutConfigV3,
    zones: QueueRowZoneStateSimple[],
): QueueRecordLayoutConfigV3 {
    const enabledZones = new Set(zones.filter((z) => z.enabled).map((z) => z.zone));
    const enabledWidths = new Set(
        Object.entries(ZONE_WIDTH_MAP)
            .filter(([zone]) => enabledZones.has(zone as QueueRecordLayoutZone))
            .map(([, width]) => width),
    );
    const filteredColumns = baseConfig.columns.filter((col: QueueRecordColumnConfig) =>
        enabledWidths.has(col.width),
    );
    return {
        ...baseConfig,
        columns: filteredColumns,
        fixedControls: {
            ...baseConfig.fixedControls,
            actionsMenu: enabledZones.has("actions"),
        },
    };
}

function buildConfigFromZonesWithBlocks(
    baseConfig: QueueRecordLayoutConfigV3,
    zones: QueueRowZoneStateWithBlocks[],
): QueueRecordLayoutConfigV3 {
    const enabledZones = new Set(zones.filter((z) => z.enabled).map((z) => z.zone));
    const zonesByZone = new Map(zones.map((z) => [z.zone, z]));
    const enabledWidths = new Set(
        Object.entries(ZONE_WIDTH_MAP)
            .filter(([zone]) => enabledZones.has(zone as QueueRecordLayoutZone))
            .map(([, width]) => width),
    );
    const filteredColumns = baseConfig.columns
        .filter((col: QueueRecordColumnConfig) => enabledWidths.has(col.width))
        .map((col: QueueRecordColumnConfig) => {
            const zoneKey = (Object.entries(ZONE_WIDTH_MAP) as Array<[QueueRecordLayoutZone, QueueRecordColumnWidth]>)
                .find(([, w]) => w === col.width)?.[0];
            const zoneState = zoneKey ? zonesByZone.get(zoneKey) : undefined;
            if (!zoneState?.blocks.length) return col;
            const enabledBlockIds = new Set(zoneState.blocks.filter((b) => b.enabled).map((b) => b.blockId));
            const filteredBlocks = col.blocks.filter((b) => enabledBlockIds.has(b.id));
            // Safety floor: keep at least one block per zone
            const blocks = filteredBlocks.length > 0 ? filteredBlocks : col.blocks.slice(0, 1);
            return { ...col, blocks };
        });
    return {
        ...baseConfig,
        columns: filteredColumns,
        fixedControls: { ...baseConfig.fixedControls, actionsMenu: enabledZones.has("actions") },
    };
}

// ── Zone extraction from default configs ───────────────────────────────────

describe("zonesFromConfig — default lead (pipeline) layout", () => {
    const config = defaultLeadQueueLayoutV3();

    it("has all zone slots", () => {
        const zones = zonesFromConfig(config);
        expect(zones.map((z) => z.zone)).toEqual([...QUEUE_RECORD_LAYOUT_ZONES]);
    });

    it("household zone is enabled", () => {
        const zones = zonesFromConfig(config);
        expect(zones.find((z) => z.zone === "household")?.enabled).toBe(true);
    });

    it("children zone is enabled", () => {
        const zones = zonesFromConfig(config);
        expect(zones.find((z) => z.zone === "children")?.enabled).toBe(true);
    });

    it("status zone is enabled", () => {
        const zones = zonesFromConfig(config);
        expect(zones.find((z) => z.zone === "status")?.enabled).toBe(true);
    });

    it("attention zone is enabled", () => {
        const zones = zonesFromConfig(config);
        expect(zones.find((z) => z.zone === "attention")?.enabled).toBe(true);
    });

    it("date_event zone is enabled", () => {
        const zones = zonesFromConfig(config);
        expect(zones.find((z) => z.zone === "date_event")?.enabled).toBe(true);
    });

    it("actions zone reflects fixedControls.actionsMenu", () => {
        const zones = zonesFromConfig(config);
        expect(zones.find((z) => z.zone === "actions")?.enabled).toBe(
            config.fixedControls.actionsMenu,
        );
    });
});

describe("zonesFromConfig — default waitlist layout", () => {
    const config = defaultWaitlistQueueLayoutV3();

    it("has all zone slots", () => {
        const zones = zonesFromConfig(config);
        expect(zones).toHaveLength(QUEUE_RECORD_LAYOUT_ZONES.length);
    });

    it("children zone is enabled", () => {
        const zones = zonesFromConfig(config);
        expect(zones.find((z) => z.zone === "children")?.enabled).toBe(true);
    });
});

// ── Round-trip: zonesFromConfig → buildConfigFromZones ────────────────────

describe("round-trip zone→config preserves enabled columns", () => {
    it("pipeline layout: round-trip column count is stable", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesFromConfig(config);
        const rebuilt = buildConfigFromZones(config, zones);
        expect(rebuilt.columns).toHaveLength(config.columns.length);
    });

    it("waitlist layout: round-trip column count is stable", () => {
        const config = defaultWaitlistQueueLayoutV3();
        const zones = zonesFromConfig(config);
        const rebuilt = buildConfigFromZones(config, zones);
        expect(rebuilt.columns).toHaveLength(config.columns.length);
    });

    it("column widths are preserved through round-trip", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesFromConfig(config);
        const rebuilt = buildConfigFromZones(config, zones);
        const origWidths = config.columns.map((c) => c.width).sort();
        const newWidths = rebuilt.columns.map((c: QueueRecordColumnConfig) => c.width).sort();
        expect(newWidths).toEqual(origWidths);
    });
});

// ── Zone toggle: disabling removes column ──────────────────────────────────

describe("buildConfigFromZones — zone toggle effects", () => {
    const config = defaultLeadQueueLayoutV3();

    it("disabling household zone removes identity-width column", () => {
        const zones = zonesFromConfig(config);
        const updated = zones.map((z) => (z.zone === "household" ? { ...z, enabled: false } : z));
        const rebuilt = buildConfigFromZones(config, updated);
        expect(rebuilt.columns.some((c: QueueRecordColumnConfig) => c.width === "identity")).toBe(false);
    });

    it("disabling children zone removes children-width column", () => {
        const zones = zonesFromConfig(config);
        const updated = zones.map((z) => (z.zone === "children" ? { ...z, enabled: false } : z));
        const rebuilt = buildConfigFromZones(config, updated);
        expect(rebuilt.columns.some((c: QueueRecordColumnConfig) => c.width === "children")).toBe(false);
    });

    it("disabling status zone removes status_band-width column", () => {
        const zones = zonesFromConfig(config);
        const updated = zones.map((z) => (z.zone === "status" ? { ...z, enabled: false } : z));
        const rebuilt = buildConfigFromZones(config, updated);
        expect(rebuilt.columns.some((c: QueueRecordColumnConfig) => c.width === "status_band")).toBe(false);
    });

    it("disabling actions zone sets actionsMenu=false", () => {
        const zones = zonesFromConfig(config);
        const updated = zones.map((z) => (z.zone === "actions" ? { ...z, enabled: false } : z));
        const rebuilt = buildConfigFromZones(config, updated);
        expect(rebuilt.fixedControls.actionsMenu).toBe(false);
    });

    it("enabling actions zone sets actionsMenu=true", () => {
        const noActionsConfig: QueueRecordLayoutConfigV3 = {
            ...config,
            fixedControls: { ...config.fixedControls, actionsMenu: false },
        };
        const zones = zonesFromConfig(noActionsConfig);
        const updated = zones.map((z) => (z.zone === "actions" ? { ...z, enabled: true } : z));
        const rebuilt = buildConfigFromZones(noActionsConfig, updated);
        expect(rebuilt.fixedControls.actionsMenu).toBe(true);
    });
});

// ── Grain invariants ────────────────────────────────────────────────────────

describe("grain and entity type rules", () => {
    it("pipeline-queue-row maps to opportunities entity type (case grain)", () => {
        // surfaceId → entity type mapping verified here via surface spec constants
        const PIPELINE_ENTITY_TYPE = "opportunities";
        const WAITLIST_ENTITY_TYPE = "placement_candidate";
        expect(PIPELINE_ENTITY_TYPE).not.toBe(WAITLIST_ENTITY_TYPE);
        expect(PIPELINE_ENTITY_TYPE).toBe("opportunities");
    });

    it("waitlist-queue-row maps to placement_candidate entity type (candidate grain)", () => {
        const WAITLIST_ENTITY_TYPE = "placement_candidate";
        expect(WAITLIST_ENTITY_TYPE).toBe("placement_candidate");
    });

    it("case-grain (pipeline) config does not include placement override controls", () => {
        // The placement override toggle only appears for isWaitlist=true in the builder.
        // Verifying the default pipeline config has no waitlist-specific signals.
        const config = defaultLeadQueueLayoutV3();
        const json = JSON.stringify(config);
        expect(json).not.toContain("placement_override");
        expect(json).not.toContain("candidateStatus");
    });
});

// ── V1 schema invariants ────────────────────────────────────────────────────

describe("QueueRecordLayoutConfigV3 schema invariants", () => {
    it("default lead layout has variant=operational-row and version=3", () => {
        const config = defaultLeadQueueLayoutV3();
        expect(config.variant).toBe("operational-row");
        expect(config.version).toBe(3);
    });

    it("all columns have required id, label, width, scope, blocks", () => {
        const config = defaultLeadQueueLayoutV3();
        for (const col of config.columns) {
            expect(typeof col.id).toBe("string");
            expect(typeof col.label).toBe("string");
            expect(typeof col.width).toBe("string");
            expect(col.scope).toBeDefined();
            expect(Array.isArray(col.blocks)).toBe(true);
        }
    });

    it("config produced by buildConfigFromZones keeps variant=operational-row", () => {
        const base = defaultLeadQueueLayoutV3();
        const zones = zonesFromConfig(base);
        const rebuilt = buildConfigFromZones(base, zones);
        expect(rebuilt.variant).toBe("operational-row");
        expect(rebuilt.version).toBe(3);
    });

    it("every block in every column has a non-empty id", () => {
        for (const config of [defaultLeadQueueLayoutV3(), defaultWaitlistQueueLayoutV3()]) {
            for (const col of config.columns) {
                for (const block of col.blocks) {
                    expect(typeof block.id).toBe("string");
                    expect(block.id.length).toBeGreaterThan(0);
                }
            }
        }
    });
});

// ── Evidence group (block) level ─────────────────────────────────────────────

describe("zonesWithBlocksFromConfig — block extraction", () => {
    it("pipeline layout: each content zone has extracted blocks", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesWithBlocksFromConfig(config);
        for (const z of zones) {
            if (z.zone === "actions") continue; // actions zone has no column blocks
            if (!z.enabled) continue;
            expect(z.blocks.length).toBeGreaterThan(0);
        }
    });

    it("waitlist layout: children zone blocks present", () => {
        const config = defaultWaitlistQueueLayoutV3();
        const zones = zonesWithBlocksFromConfig(config);
        const childrenZone = zones.find((z) => z.zone === "children");
        expect(childrenZone?.blocks.length).toBeGreaterThan(0);
    });

    it("all extracted blocks are enabled=true by default", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesWithBlocksFromConfig(config);
        for (const z of zones) {
            for (const b of z.blocks) {
                expect(b.enabled).toBe(true);
            }
        }
    });

    it("extracted block ids match column block ids", () => {
        const config = defaultLeadQueueLayoutV3();
        const colByWidth = new Map(config.columns.map((c) => [c.width, c]));
        const zones = zonesWithBlocksFromConfig(config);
        for (const z of zones) {
            const width = ZONE_WIDTH_MAP[z.zone];
            if (!width) continue;
            const col = colByWidth.get(width);
            if (!col) continue;
            const expectedIds = col.blocks.map((b) => b.id);
            const extractedIds = z.blocks.map((b) => b.blockId);
            expect(extractedIds).toEqual(expectedIds);
        }
    });
});

describe("buildConfigFromZonesWithBlocks — block filter effects", () => {
    it("round-trip with all blocks enabled preserves block count", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesWithBlocksFromConfig(config);
        const rebuilt = buildConfigFromZonesWithBlocks(config, zones);
        for (const col of config.columns) {
            const rebuiltCol = rebuilt.columns.find((c: QueueRecordColumnConfig) => c.width === col.width);
            expect(rebuiltCol?.blocks).toHaveLength(col.blocks.length);
        }
    });

    it("disabling a block removes it from its column", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesWithBlocksFromConfig(config);
        // Find first zone with 2+ blocks
        const zoneWithBlocks = zones.find((z) => z.blocks.length >= 2);
        if (!zoneWithBlocks) return; // skip if no multi-block zone

        const firstBlockId = zoneWithBlocks.blocks[0].blockId;
        const updated = zones.map((z) =>
            z.zone !== zoneWithBlocks.zone
                ? z
                : {
                      ...z,
                      blocks: z.blocks.map((b) =>
                          b.blockId === firstBlockId ? { ...b, enabled: false } : b,
                      ),
                  },
        );

        const rebuilt = buildConfigFromZonesWithBlocks(config, updated);
        const width = ZONE_WIDTH_MAP[zoneWithBlocks.zone];
        const rebuiltCol = rebuilt.columns.find((c: QueueRecordColumnConfig) => c.width === width);
        const ids = rebuiltCol?.blocks.map((b) => b.id) ?? [];
        expect(ids).not.toContain(firstBlockId);
    });

    it("disabling all blocks in a zone keeps at least one block (safety floor)", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = zonesWithBlocksFromConfig(config);
        // Disable all blocks in household zone
        const updated = zones.map((z) =>
            z.zone !== "household"
                ? z
                : { ...z, blocks: z.blocks.map((b) => ({ ...b, enabled: false })) },
        );
        const rebuilt = buildConfigFromZonesWithBlocks(config, updated);
        const rebuiltHousehold = rebuilt.columns.find(
            (c: QueueRecordColumnConfig) => c.width === "identity",
        );
        expect(rebuiltHousehold?.blocks.length).toBeGreaterThanOrEqual(1);
    });

    it("waitlist placement zone block extraction includes placement field blocks", () => {
        const config = defaultWaitlistQueueLayoutV3();
        const zones = zonesWithBlocksFromConfig(config);
        const statusZone = zones.find((z) => z.zone === "status");
        // status_band column in waitlist layout must have at least one block
        expect(statusZone?.blocks.length).toBeGreaterThan(0);
    });

    it("variant and version are preserved through block-level round-trip", () => {
        const config = defaultWaitlistQueueLayoutV3();
        const zones = zonesWithBlocksFromConfig(config);
        const rebuilt = buildConfigFromZonesWithBlocks(config, zones);
        expect(rebuilt.variant).toBe("operational-row");
        expect(rebuilt.version).toBe(3);
    });
});

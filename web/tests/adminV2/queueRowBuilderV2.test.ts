/**
 * Queue Row Builder V2 — canvas state model contract.
 *
 * Tests for the V2 canvas-first state model:
 *   - stateFromConfig: zone order, inRow flags, evidence group extraction
 *   - buildConfigFromState: config round-trip, zone add/remove, condition storage
 *   - catalog-based initialization for both pipeline and waitlist grain
 *   - Evidence group safety floor (at least one block always survives publish)
 *   - LayoutDoc publish: output config matches expected shape
 */

import { describe, expect, it } from "vitest";
import {
    defaultLeadQueueLayoutV3,
    defaultWaitlistQueueLayoutV3,
    type QueueRecordColumnConfig,
    type QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";
import type { LayoutCondition } from "@/lib/layout/layoutV2";
import type { QueueRecordColumnWidth } from "@/lib/layout/queueRecordLayoutConfig";
import { QUEUE_RECORD_LAYOUT_ZONES } from "@/lib/layout/surfaceLayoutRegistry";

// ── Mirror the V2 state model (keep in sync with QueueRowBuilderV2.tsx) ───────

type ZoneKey = (typeof QUEUE_RECORD_LAYOUT_ZONES)[number];

type EvidenceGroupState = {
    blockId: string;
    label: string;
    description: string;
    enabled: boolean;
};

type RowZoneState = {
    key: ZoneKey;
    inRow: boolean;
    width: QueueRecordColumnWidth;
    visibleWhen: LayoutCondition | null;
    evidenceGroups: EvidenceGroupState[];
};

const ZONE_WIDTH_MAP: Partial<Record<ZoneKey, QueueRecordColumnWidth>> = {
    household: "identity",
    children: "children",
    status: "status_band",
    attention: "next_step",
    date_event: "date_event",
};

function buildCatalog(isWaitlist: boolean): Map<ZoneKey, QueueRecordColumnConfig> {
    const defaultCfg = isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3();
    const catalog = new Map<ZoneKey, QueueRecordColumnConfig>();
    for (const col of defaultCfg.columns) {
        const zone = (Object.entries(ZONE_WIDTH_MAP) as [ZoneKey, QueueRecordColumnWidth][])
            .find(([, w]) => w === col.width)?.[0];
        if (zone) catalog.set(zone, col);
    }
    return catalog;
}

function stateFromConfig(
    config: QueueRecordLayoutConfigV3,
    catalog: Map<ZoneKey, QueueRecordColumnConfig>,
): RowZoneState[] {
    const colByWidth = new Map(config.columns.map((c) => [c.width, c]));

    const inRowZones: ZoneKey[] = config.columns.flatMap((col) => {
        const zone = (Object.entries(ZONE_WIDTH_MAP) as [ZoneKey, QueueRecordColumnWidth][])
            .find(([, w]) => w === col.width)?.[0];
        return zone ? [zone] : [];
    });

    const unusedZones = QUEUE_RECORD_LAYOUT_ZONES.filter(
        (z) => z !== "actions" && !inRowZones.includes(z),
    );

    const orderedKeys: ZoneKey[] = [...inRowZones, ...unusedZones, "actions"];

    return orderedKeys.map((key) => {
        const width = ZONE_WIDTH_MAP[key] ?? "small";
        const col = width ? colByWidth.get(width) : undefined;
        const catalogCol = catalog.get(key);
        const inRow = key === "actions"
            ? config.fixedControls.actionsMenu
            : Boolean(col);

        const blocks = (col?.blocks ?? catalogCol?.blocks ?? []).map((b, i) => ({
            blockId: b.id,
            label: b.type === "field_group" ? (b.label ?? `Group ${i + 1}`) : b.type,
            description: "",
            enabled: Boolean(col),
        }));

        return {
            key,
            inRow,
            width: col?.width ?? catalogCol?.width ?? width,
            visibleWhen: col?.visibleWhen ?? null,
            evidenceGroups: blocks,
        };
    });
}

function buildConfigFromState(
    baseConfig: QueueRecordLayoutConfigV3,
    zones: RowZoneState[],
    catalog: Map<ZoneKey, QueueRecordColumnConfig>,
): QueueRecordLayoutConfigV3 {
    const colByWidth = new Map(baseConfig.columns.map((c) => [c.width, c]));

    const columns: QueueRecordColumnConfig[] = zones
        .filter((z) => z.key !== "actions" && z.inRow)
        .flatMap((z) => {
            const catalogCol = colByWidth.get(z.width) ?? catalog.get(z.key);
            if (!catalogCol) return [];
            const enabledIds = new Set(z.evidenceGroups.filter((g) => g.enabled).map((g) => g.blockId));
            const filteredBlocks = catalogCol.blocks.filter((b) => enabledIds.has(b.id));
            const blocks = filteredBlocks.length > 0 ? filteredBlocks : catalogCol.blocks.slice(0, 1);
            const col: QueueRecordColumnConfig = { ...catalogCol, width: z.width, blocks };
            if (z.visibleWhen) col.visibleWhen = z.visibleWhen;
            else delete col.visibleWhen;
            return [col];
        });

    const actionsZone = zones.find((z) => z.key === "actions");
    return {
        ...baseConfig,
        columns,
        fixedControls: {
            ...baseConfig.fixedControls,
            actionsMenu: actionsZone?.inRow ?? baseConfig.fixedControls.actionsMenu,
        },
    };
}

// ── stateFromConfig ───────────────────────────────────────────────────────────

describe("stateFromConfig — zone ordering and inRow flags", () => {
    it("inRow zones appear before unused zones (not actions)", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(config, catalog);
        const inRow = zones.filter((z) => z.inRow && z.key !== "actions");
        const notInRow = zones.filter((z) => !z.inRow && z.key !== "actions");
        const inRowIndices = inRow.map((z) => zones.indexOf(z));
        const notInRowIndices = notInRow.map((z) => zones.indexOf(z));
        if (inRowIndices.length && notInRowIndices.length) {
            expect(Math.max(...inRowIndices)).toBeLessThan(Math.min(...notInRowIndices));
        }
    });

    it("actions zone is always last", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(config, catalog);
        expect(zones[zones.length - 1].key).toBe("actions");
    });

    it("total zone count equals QUEUE_RECORD_LAYOUT_ZONES length", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(config, catalog);
        expect(zones).toHaveLength(QUEUE_RECORD_LAYOUT_ZONES.length);
    });

    it("column order from config is reflected in inRow zone order", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(config, catalog);
        const configWidths = config.columns.map((c) => c.width);
        const inRowWidths = zones
            .filter((z) => z.inRow && z.key !== "actions")
            .map((z) => z.width);
        expect(inRowWidths).toEqual(configWidths);
    });

    it("actions inRow reflects fixedControls.actionsMenu", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(config, catalog);
        const actionsZone = zones.find((z) => z.key === "actions")!;
        expect(actionsZone.inRow).toBe(config.fixedControls.actionsMenu);
    });

    it("unused zones have evidenceGroups seeded from catalog", () => {
        const config = defaultLeadQueueLayoutV3();
        // Build a config missing the attention zone
        const configMissingAttention: QueueRecordLayoutConfigV3 = {
            ...config,
            columns: config.columns.filter((c) => c.width !== "next_step"),
        };
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(configMissingAttention, catalog);
        const attentionZone = zones.find((z) => z.key === "attention")!;
        expect(attentionZone.inRow).toBe(false);
        // Catalog provides evidence groups even when not in row
        const catalogAttention = catalog.get("attention");
        if (catalogAttention && catalogAttention.blocks.length > 0) {
            expect(attentionZone.evidenceGroups.length).toBeGreaterThan(0);
        }
    });

    it("visibleWhen is extracted from column config", () => {
        const config = defaultLeadQueueLayoutV3();
        const condition: LayoutCondition = { type: "exists", path: "person.email" };
        const configWithCondition: QueueRecordLayoutConfigV3 = {
            ...config,
            columns: config.columns.map((c) =>
                c.width === "identity" ? { ...c, visibleWhen: condition } : c,
            ),
        };
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(configWithCondition, catalog);
        const household = zones.find((z) => z.key === "household")!;
        expect(household.visibleWhen).toEqual(condition);
    });
});

// ── buildConfigFromState — round-trip ─────────────────────────────────────────

describe("buildConfigFromState — config reconstruction", () => {
    it("round-trip preserves column widths and order", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(config, catalog);
        const rebuilt = buildConfigFromState(config, zones, catalog);
        const origWidths = config.columns.map((c) => c.width);
        const rebuiltWidths = rebuilt.columns.map((c) => c.width);
        expect(rebuiltWidths).toEqual(origWidths);
    });

    it("zones excluded from row (inRow=false) are absent from built config columns", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(config, catalog).map((z) =>
            z.key === "status" ? { ...z, inRow: false } : z,
        );
        const rebuilt = buildConfigFromState(config, zones, catalog);
        const hasStatus = rebuilt.columns.some((c) => c.width === "status_band");
        expect(hasStatus).toBe(false);
    });

    it("adding an unused zone (inRow false→true) includes it in built config", () => {
        const config = defaultLeadQueueLayoutV3();
        const configMissingAttention: QueueRecordLayoutConfigV3 = {
            ...config,
            columns: config.columns.filter((c) => c.width !== "next_step"),
        };
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(configMissingAttention, catalog).map((z) =>
            z.key === "attention"
                ? { ...z, inRow: true, evidenceGroups: z.evidenceGroups.map((g) => ({ ...g, enabled: true })) }
                : z,
        );
        const rebuilt = buildConfigFromState(configMissingAttention, zones, catalog);
        const hasAttention = rebuilt.columns.some((c) => c.width === "next_step");
        expect(hasAttention).toBe(true);
    });

    it("zone order in state array drives column order in built config", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(config, catalog);
        // Swap first two inRow zones
        const inRowKeys = zones.filter((z) => z.inRow && z.key !== "actions").map((z) => z.key);
        if (inRowKeys.length >= 2) {
            const swapped = [...zones];
            const i0 = swapped.findIndex((z) => z.key === inRowKeys[0]);
            const i1 = swapped.findIndex((z) => z.key === inRowKeys[1]);
            [swapped[i0], swapped[i1]] = [swapped[i1]!, swapped[i0]!];
            const rebuilt = buildConfigFromState(config, swapped, catalog);
            const rebuiltWidths = rebuilt.columns.map((c) => c.width);
            expect(rebuiltWidths[0]).toBe(ZONE_WIDTH_MAP[inRowKeys[1]!]);
            expect(rebuiltWidths[1]).toBe(ZONE_WIDTH_MAP[inRowKeys[0]!]);
        }
    });

    it("actionsMenu reflects actions zone inRow state", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(config, catalog).map((z) =>
            z.key === "actions" ? { ...z, inRow: false } : z,
        );
        const rebuilt = buildConfigFromState(config, zones, catalog);
        expect(rebuilt.fixedControls.actionsMenu).toBe(false);
    });
});

// ── Evidence group safety floor ───────────────────────────────────────────────

describe("evidence group safety floor", () => {
    it("disabling all groups still produces at least one block in built config", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(config, catalog).map((z) =>
            z.key !== "actions"
                ? { ...z, evidenceGroups: z.evidenceGroups.map((g) => ({ ...g, enabled: false })) }
                : z,
        );
        const rebuilt = buildConfigFromState(config, zones, catalog);
        for (const col of rebuilt.columns) {
            expect(col.blocks.length).toBeGreaterThan(0);
        }
    });
});

// ── Condition round-trip ──────────────────────────────────────────────────────

describe("zone visibleWhen condition round-trip", () => {
    it("condition on household zone persists through build", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const condition: LayoutCondition = { type: "equals", path: "lifecycle.stage", value: "active" };
        const zones = stateFromConfig(config, catalog).map((z) =>
            z.key === "household" ? { ...z, visibleWhen: condition } : z,
        );
        const rebuilt = buildConfigFromState(config, zones, catalog);
        const identityCol = rebuilt.columns.find((c) => c.width === "identity");
        expect(identityCol?.visibleWhen).toEqual(condition);
    });

    it("null condition removes visibleWhen from built column", () => {
        const condition: LayoutCondition = { type: "exists", path: "x" };
        const config = defaultLeadQueueLayoutV3();
        const configWithCondition: QueueRecordLayoutConfigV3 = {
            ...config,
            columns: config.columns.map((c) =>
                c.width === "identity" ? { ...c, visibleWhen: condition } : c,
            ),
        };
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(configWithCondition, catalog).map((z) =>
            z.key === "household" ? { ...z, visibleWhen: null } : z,
        );
        const rebuilt = buildConfigFromState(configWithCondition, zones, catalog);
        const identityCol = rebuilt.columns.find((c) => c.width === "identity");
        expect(identityCol?.visibleWhen).toBeUndefined();
    });
});

// ── Waitlist grain specifics ──────────────────────────────────────────────────

describe("waitlist grain — stateFromConfig", () => {
    it("children zone is inRow for waitlist default config", () => {
        const config = defaultWaitlistQueueLayoutV3();
        const catalog = buildCatalog(true);
        const zones = stateFromConfig(config, catalog);
        const children = zones.find((z) => z.key === "children")!;
        expect(children.inRow).toBe(true);
    });

    it("waitlist zone count equals QUEUE_RECORD_LAYOUT_ZONES length", () => {
        const config = defaultWaitlistQueueLayoutV3();
        const catalog = buildCatalog(true);
        const zones = stateFromConfig(config, catalog);
        expect(zones).toHaveLength(QUEUE_RECORD_LAYOUT_ZONES.length);
    });

    it("waitlist round-trip preserves column order", () => {
        const config = defaultWaitlistQueueLayoutV3();
        const catalog = buildCatalog(true);
        const zones = stateFromConfig(config, catalog);
        const rebuilt = buildConfigFromState(config, zones, catalog);
        const origWidths = config.columns.map((c) => c.width);
        const rebuiltWidths = rebuilt.columns.map((c) => c.width);
        expect(rebuiltWidths).toEqual(origWidths);
    });
});

// ── Publish config shape ──────────────────────────────────────────────────────

describe("publish output shape — QueueRecordLayoutConfigV3 contract", () => {
    it("built config has variant=operational-row and version=3", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(config, catalog);
        const rebuilt = buildConfigFromState(config, zones, catalog);
        expect(rebuilt.variant).toBe("operational-row");
        expect(rebuilt.version).toBe(3);
    });

    it("all built columns have non-empty blocks array", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(config, catalog);
        const rebuilt = buildConfigFromState(config, zones, catalog);
        for (const col of rebuilt.columns) {
            expect(col.blocks).toBeDefined();
            expect(col.blocks.length).toBeGreaterThan(0);
        }
    });

    it("built config fixedControls shape is preserved", () => {
        const config = defaultLeadQueueLayoutV3();
        const catalog = buildCatalog(false);
        const zones = stateFromConfig(config, catalog);
        const rebuilt = buildConfigFromState(config, zones, catalog);
        expect(rebuilt.fixedControls).toBeDefined();
        expect(typeof rebuilt.fixedControls.actionsMenu).toBe("boolean");
    });
});

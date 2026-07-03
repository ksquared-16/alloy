/**
 * Queue Row Builder — stacked persistence + custom-field availability round-trip.
 * Exercises the REAL exported stateFromConfig / buildConfigFromState (not mirrors).
 */
import { describe, expect, it } from "vitest";
import { defaultLeadQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import {
    buildCatalog,
    stateFromConfig,
    buildConfigFromState,
} from "@/components/adminV2/settings/surfaces/QueueRowBuilderV2";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

const catalog = buildCatalog(false);

describe("stacked layout persists through the builder round-trip", () => {
    it("rowIndex assigned to a zone round-trips onto the persisted column", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = stateFromConfig(config, catalog, false);

        // Move the "status" zone to stacked Row 2 (index 1).
        const moved = zones.map((z) => (z.key === "status" ? { ...z, rowIndex: 1 } : z));
        const out = buildConfigFromState(config, moved, catalog);

        // The status column (status_band width) must carry rowIndex 1.
        const statusCol = out.columns.find((c) => c.width === "status_band");
        expect(statusCol).toBeDefined();
        expect(statusCol!.rowIndex).toBe(1);

        // Other columns default to row 0.
        const household = out.columns.find((c) => c.width === "identity");
        expect(household!.rowIndex).toBe(0);
    });

    it("a persisted rowIndex is read back into zone state", () => {
        const config = defaultLeadQueueLayoutV3();
        // Stamp rowIndex 2 onto the children column.
        config.columns = config.columns.map((c) => (c.width === "children" ? { ...c, rowIndex: 2 } : c));
        const zones = stateFromConfig(config, catalog, false);
        expect(zones.find((z) => z.key === "children")!.rowIndex).toBe(2);
    });
});

describe("tenant custom field appears in the compatible builder group", () => {
    const CUSTOM: TenantFieldDefinitionRow[] = [
        { field_key: "preferred_language", label: "Preferred Language", entity_type: "person", field_type: "text", is_system: false, is_active: true },
    ];

    it("household (person-accepting) group exposes the custom field as a toggle when tenant defs are passed", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = stateFromConfig(config, catalog, false, CUSTOM);
        const household = zones.find((z) => z.key === "household")!;
        const allFieldKeys = household.evidenceGroups.flatMap((g) => g.fields.map((f) => f.fieldKey));
        expect(allFieldKeys).toContain("person.preferred_language");
    });

    it("children (child-only) group does NOT expose the person custom field", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = stateFromConfig(config, catalog, false, CUSTOM);
        const children = zones.find((z) => z.key === "children")!;
        const allFieldKeys = children.evidenceGroups.flatMap((g) => g.fields.map((f) => f.fieldKey));
        expect(allFieldKeys).not.toContain("person.preferred_language");
    });

    it("without tenant defs, the custom field is absent (back-compat)", () => {
        const config = defaultLeadQueueLayoutV3();
        const zones = stateFromConfig(config, catalog, false);
        const household = zones.find((z) => z.key === "household")!;
        const allFieldKeys = household.evidenceGroups.flatMap((g) => g.fields.map((f) => f.fieldKey));
        expect(allFieldKeys).not.toContain("person.preferred_language");
    });
});

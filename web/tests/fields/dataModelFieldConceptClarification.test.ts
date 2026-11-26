/** @vitest-environment node */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPUTED_FIELD_CATALOG } from "@/lib/fields/computedFieldCatalog";
import {
    COMPUTED_FIELD_CONCEPT_AUDIT,
    computedConceptAudit,
    countFieldsByConcept,
    fieldConceptChipLabel,
    filterCatalogByConcept,
    resolveConfigurationFieldRowHint,
} from "@/lib/fields/fieldConceptModel";
import { buildSettingsFieldCatalogEntries, hubEntityApiTypes } from "@/lib/fields/fieldCatalogForSettings";
import { resolveSettingsCatalogEntryAvailability } from "@/lib/fields/fieldSurfaceAvailability";

const root = resolve(__dirname, "../..");

describe("field concept audit", () => {
    it("audits every computed catalog entry", () => {
        expect(COMPUTED_FIELD_CONCEPT_AUDIT.length).toBe(COMPUTED_FIELD_CATALOG.length);
        for (const row of COMPUTED_FIELD_CATALOG) {
            const audit = computedConceptAudit(row.refKey);
            expect(audit, `missing audit for ${row.refKey}`).toBeTruthy();
            expect(["calculated_field", "runtime_signal"]).toContain(audit!.concept_kind);
        }
    });

    it("classifies Age as calculated and Current work as runtime signal", () => {
        expect(computedConceptAudit("child.age")?.concept_kind).toBe("calculated_field");
        expect(computedConceptAudit("opportunity.current_work")?.concept_kind).toBe("runtime_signal");
        expect(computedConceptAudit("opportunity.tour_scheduled_date")?.concept_kind).toBe("runtime_signal");
    });

    it("counts runtime signals and calculated fields separately", () => {
        const entries = buildSettingsFieldCatalogEntries({
            hubEntity: "opportunity",
            entityTypes: hubEntityApiTypes("opportunity"),
            customFields: [],
        });
        const counts = countFieldsByConcept(entries);
        expect(counts.calculated_fields).toBeGreaterThanOrEqual(1);
        expect(counts.runtime_signals).toBeGreaterThanOrEqual(3);
        expect(counts.calculated_fields + counts.runtime_signals).toBe(counts.computed);
    });
});

describe("availability noise reduction", () => {
    it("silences live runtime signals on collapsed rows", () => {
        const entries = buildSettingsFieldCatalogEntries({
            hubEntity: "opportunity",
            entityTypes: hubEntityApiTypes("opportunity"),
            customFields: [],
        });
        const currentWork = entries.find((e) => e.refKey === "opportunity.current_work");
        expect(currentWork).toBeTruthy();
        const availability = resolveSettingsCatalogEntryAvailability({
            ownership: "computed",
            computedField: currentWork!.computedField,
            hub_entity: "opportunity",
        });
        const hint = resolveConfigurationFieldRowHint({
            entry: currentWork!,
            availability,
            lifecycle: "active",
        });
        expect(hint).toBeNull();
    });
});

describe("Data Model UI adoption", () => {
    it("ownership filter uses Runtime Signals and Calculated tabs", () => {
        const tabs = readFileSync(resolve(root, "components/admin/fields/FieldOwnershipFilterTabs.tsx"), "utf8");
        expect(tabs).toContain("runtime_signals");
        expect(tabs).toContain("Runtime Signals");
    });

    it("inline choice option editor is wired", () => {
        const fieldRow = readFileSync(resolve(root, "components/admin/fields/DataModelFieldRow.tsx"), "utf8");
        expect(fieldRow).toContain("ConfigurationFieldOptionsEditor");
    });
});

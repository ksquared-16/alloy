import { describe, expect, it } from "vitest";

import { identityPickerCategoriesForNamespaces, identityPickerFieldsForNamespaces } from "@/lib/adminV2/settings/surfaces/identityPickerFieldCatalog";
import {
    buildSettingsFieldCatalogEntries,
    hubEntityApiTypes,
} from "@/lib/fields/fieldCatalogForSettings";
import {
    addFieldToNestedGroup,
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { collectUnsupportedEditableIdentityConfigs } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldEditContract";

describe("identity picker field catalog", () => {
    it("groups fields by configured category labels", () => {
        const categories = identityPickerCategoriesForNamespaces({
            namespaces: ["child", "inquiry_child"],
        });
        expect(categories.length).toBeGreaterThan(0);
        expect(categories.every((c) => c.label.length > 0)).toBe(true);
    });

    it("excludes derived child.name as selectable", () => {
        const fields = identityPickerFieldsForNamespaces({ namespaces: ["child"] });
        expect(fields.some((f) => f.key === "child.name")).toBe(false);
    });

    it("does not expose duplicate selectable Program aliases", () => {
        const fields = identityPickerFieldsForNamespaces({ namespaces: ["inquiry_child"] });
        const programFields = fields.filter((f) => f.label.toLowerCase() === "program");
        expect(programFields.length).toBeLessThanOrEqual(1);
    });

    it("offers Children enrollment-detail request fields in Add-field picker", () => {
        const fields = identityPickerFieldsForNamespaces({
            namespaces: ["child", "inquiry_child"],
        });
        const byKey = new Map(fields.map((f) => [f.key, f.label]));
        expect(byKey.has("inquiry_child.requested_days_per_week")).toBe(true);
        expect(byKey.has("inquiry_child.weekdays")).toBe(true);
        expect(byKey.has("inquiry_child.start_date")).toBe(true);
        expect(byKey.get("inquiry_child.start_date")?.toLowerCase()).toContain("desired start");
        expect(byKey.get("inquiry_child.requested_days_per_week")?.toLowerCase()).toContain("requested days");
        expect(byKey.get("inquiry_child.weekdays")?.toLowerCase()).toContain("weekday");
    });

    it("never surfaces raw ref keys as labels", () => {
        const fields = identityPickerFieldsForNamespaces({ namespaces: ["child", "inquiry_child"] });
        expect(fields.every((f) => !f.label.includes("child."))).toBe(true);
    });

    it("offers Settings → Fields catalog refs for the person hub (not a hardcoded allowlist)", () => {
        const settingsRefs = buildSettingsFieldCatalogEntries({
            hubEntity: "person",
            entityTypes: hubEntityApiTypes("person"),
            customFields: [],
        }).map((entry) => entry.refKey);
        const picker = identityPickerFieldsForNamespaces({ namespaces: ["person"] });
        expect(picker.length).toBeGreaterThan(8);
        expect(picker.some((f) => f.key === "person.first_name")).toBe(true);
        expect(picker.some((f) => f.key === "person.email")).toBe(true);
        expect(picker.some((f) => f.key === "person.full_name")).toBe(true);
        // Every Settings catalog entry that is offered in this namespace must appear in the picker
        // (relationship-scoped entries are contextual and may be omitted).
        for (const ref of settingsRefs) {
            if (ref === "person.relationship_to_child") continue;
            if (ref === "person.communication_preference") continue;
            expect(picker.some((f) => f.key === ref), ref).toBe(true);
        }
    });

    it("adding a /fields display field does not create an unsupported Editable publish error", () => {
        const base = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        const next = addFieldToNestedGroup(base, "primary_contact", "person.full_name");
        expect(next.groups.find((g) => g.key === "primary_contact")?.fieldPolicies?.["person.full_name"]).toBe(
            "read-only",
        );
        expect(collectUnsupportedEditableIdentityConfigs(next)).toEqual([]);
    });
});

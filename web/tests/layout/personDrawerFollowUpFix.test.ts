/**
 * Person drawer configuration QA — follow-up fixes (picker parity, icons, primary contact, edit affordance).
 */

import { describe, expect, it } from "vitest";
import { buildBlockContextFieldPickerGroups } from "@/lib/layout/layoutEditorBlockFieldCatalog";
import { buildPersonDrawerEditorFieldPickerGroups } from "@/lib/layout/personDrawerLayoutEditorFieldCatalog";
import { buildPersonLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildPersonLayoutRuntimeRecordFromVm";
import {
    enrichPersonDrawerPrimaryContactFields,
    resolvePersonDrawerPrimaryContactProjection,
} from "@/lib/layout/runtime/enrichPersonDrawerPrimaryContactFields";
import { layoutRuntimeRepeaterColumnShowsEntityIcon } from "@/lib/layout/runtime/layoutRuntimeLinkHarness";
import { LAYOUT_RUNTIME_FIELD_EDITABLE_AFFORDANCE } from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import { resolveProofBindingValue } from "@/lib/layout/runtime/resolveProofBindingValue";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";

function flatRefKeys(groups: ReturnType<typeof buildPersonDrawerEditorFieldPickerGroups>): Set<string> {
    return new Set(groups.flatMap((group) => group.fields.map((field) => field.refKey)));
}

describe("person drawer follow-up fixes", () => {
    it("block field picker uses the same person drawer catalog as card fields", () => {
        const cardGroups = buildPersonDrawerEditorFieldPickerGroups();
        const blockGroups = buildBlockContextFieldPickerGroups({
            surfaceKey: "person_drawer",
            dataContext: "contact",
            contactRole: "primary",
        });
        const cardRefs = flatRefKeys(cardGroups);
        const blockRefs = flatRefKeys(blockGroups);

        expect(cardRefs.has("person.address_line1")).toBe(true);
        expect(blockRefs.has("person.address_line1")).toBe(true);
        expect(blockRefs.has("person.primary_email")).toBe(true);

        for (const ref of cardRefs) {
            expect(blockRefs.has(ref)).toBe(true);
        }
    });

    it("contact block picker exposes address fields when primary contact context is selected", () => {
        const blockGroups = buildBlockContextFieldPickerGroups({
            surfaceKey: "person_drawer",
            dataContext: "contact",
            contactRole: "primary",
        });
        const refs = flatRefKeys(blockGroups);
        expect(refs.has("person.address_line1")).toBe(true);
        expect(refs.has("person.city")).toBe(true);
    });

    it("suppresses repeating child entity icons on related-list meta columns", () => {
        const nameCol = {
            refKey: "child.name",
            adornment: { position: "left" as const, icon: "child" as const },
        };
        const metaCol = {
            refKey: "child.program",
            adornment: { position: "left" as const, icon: "child" as const },
        };

        expect(
            layoutRuntimeRepeaterColumnShowsEntityIcon(nameCol, { isRowPrimaryEntityLink: true }),
        ).toBe(true);
        expect(
            layoutRuntimeRepeaterColumnShowsEntityIcon(metaCol, { isRowPrimaryEntityLink: false }),
        ).toBe(false);
        expect(
            layoutRuntimeRepeaterColumnShowsEntityIcon(
                { refKey: "child.date_of_birth", adornment: { position: "left", icon: "calendar" } },
                { isRowPrimaryEntityLink: false },
            ),
        ).toBe(true);
    });

    it("renders primary contact badge for household primary person", () => {
        const record = buildPersonLayoutRuntimeRecordFromVm({
            personId: "person-primary",
            vmRecord: {
                id: "person-primary",
                first_name: "Alex",
                last_name: "Primary",
                _customer_persons: [
                    {
                        person_id: "person-primary",
                        is_household_primary_contact: true,
                        role_type: "primary_contact",
                    },
                ],
            },
        });
        expect(record["person.is_primary_contact"]).toBe("Primary contact");
        const resolved = resolveProofBindingValue(
            record,
            {
                id: "f-primary",
                kind: "field",
                refKey: "person.is_primary_contact",
                renderHint: "badge",
            },
            "persons",
        );
        expect(resolved.isPlaceholder).toBe(false);
        expect(resolved.display).toBe("Primary contact");
    });

    it("renders not-primary label instead of blank for non-primary person", () => {
        const projection = resolvePersonDrawerPrimaryContactProjection(
            {
                _customer_persons: [
                    {
                        person_id: "person-secondary",
                        is_household_primary_contact: false,
                        role_type: "parent",
                    },
                ],
            },
            "person-secondary",
        );
        expect(projection.isPrimary).toBe(false);
        expect(projection.display).toBe("Not primary");

        const record = enrichPersonDrawerPrimaryContactFields(
            { id: "person-secondary" },
            {
                _customer_persons: [
                    {
                        person_id: "person-secondary",
                        is_household_primary_contact: false,
                        role_type: "parent",
                    },
                ],
            },
            "person-secondary",
        );
        expect(record["person.is_primary_contact"]).toBe("Not primary");
        const itemValue = resolveItemValue(record, {
            id: "f-primary",
            kind: "field",
            refKey: "person.is_primary_contact",
            renderHint: "text",
        });
        expect(itemValue.isPlaceholder).toBe(false);
        expect(itemValue.display).toBe("Not primary");
    });

    it("does not treat opportunity-primary fallback as primary for other household adults", () => {
        const projection = resolvePersonDrawerPrimaryContactProjection(
            {
                id: "justin-1",
                _primary_contact_on_opportunity: true,
                _customer_persons: [
                    {
                        person_id: "molly-1",
                        role_type: "parent",
                        is_primary: false,
                    },
                ],
            },
            "molly-1",
        );
        expect(projection.isPrimary).toBe(false);
        expect(projection.display).toBe("Not primary");
    });

    it("edit affordance class is persistently visible without requiring hover", () => {
        expect(LAYOUT_RUNTIME_FIELD_EDITABLE_AFFORDANCE).toContain("border-alloy-juniper/30");
        expect(LAYOUT_RUNTIME_FIELD_EDITABLE_AFFORDANCE).toContain("bg-alloy-juniper/[0.05]");
        expect(LAYOUT_RUNTIME_FIELD_EDITABLE_AFFORDANCE).not.toContain("border-transparent");
    });
});

import { describe, expect, it } from "vitest";
import { CHILDCARE_CATALOG_BY_REFKEY } from "@/lib/layout/childcareLayoutFieldCatalog";
import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import { resolveIdentityFieldValue } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompose";
import {
    childrenFocusRowsFromNestedConfig,
} from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
import {
    addFieldToNestedGroup,
    defaultNestedSurfaceConfig,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { isFocusPanelFieldKnown } from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";
import { childFocusMutationValueKeyForRef } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldMutationBinding";

const REQUEST_FIELD_REFS = [
    "inquiry_child.start_date",
    "inquiry_child.requested_days_per_week",
    "inquiry_child.weekdays",
] as const;

function withPlacementFields(refs: readonly string[]): NestedSurfaceConfig {
    let config = defaultNestedSurfaceConfig("children_surface");
    for (const ref of refs) {
        config = addFieldToNestedGroup(config, "placement", ref, { tier: "details" });
    }
    return config;
}

describe("Children optional enrollment field placement", () => {
    it("exposes requested start/days/preferred weekdays in the childcare catalog", () => {
        for (const ref of REQUEST_FIELD_REFS) {
            expect(CHILDCARE_CATALOG_BY_REFKEY.get(ref)).toBeTruthy();
            expect(isFocusPanelFieldKnown(ref)).toBe(true);
        }
        expect(CHILDCARE_CATALOG_BY_REFKEY.get("inquiry_child.start_date")?.pickerLabel).toBe(
            "Requested Start",
        );
        expect(CHILDCARE_CATALOG_BY_REFKEY.get("inquiry_child.requested_days_per_week")?.pickerLabel).toBe(
            "Requested Days per Week",
        );
        expect(CHILDCARE_CATALOG_BY_REFKEY.get("inquiry_child.weekdays")?.pickerLabel).toBe(
            "Preferred Weekdays",
        );
    });

    it("does not place request fields on Children by default", () => {
        const defaults = defaultNestedSurfaceConfig("children_surface");
        const rows = childrenFocusRowsFromNestedConfig(defaults);
        const keys = new Set(rows.map((r) => r.fieldKey));
        expect(keys.has("inquiry_child.requested_days_per_week")).toBe(false);
        expect(keys.has("inquiry_child.weekdays")).toBe(false);
    });

    it("includes request fields when configured on Children placement", () => {
        const config = withPlacementFields(REQUEST_FIELD_REFS);
        const rows = childrenFocusRowsFromNestedConfig(config);
        const keys = new Set(rows.map((r) => r.fieldKey));
        for (const ref of REQUEST_FIELD_REFS) {
            expect(keys.has(ref)).toBe(true);
        }
    });

    it("keeps requested days and preferred weekdays independent per child", () => {
        const truth = {
            _inquiry_children: [
                {
                    id: "ocm-lennon",
                    customer_member_id: "cm-lennon",
                    person_id: "p-lennon",
                    display_name: "Lennon",
                    start_date: "2026-09-08",
                },
                {
                    id: "ocm-wrigley",
                    customer_member_id: "cm-wrigley",
                    person_id: "p-wrigley",
                    display_name: "Wrigley",
                    start_date: "2026-10-01",
                },
            ],
            _enrollment_participation_by_member: {
                "cm-lennon": {
                    start_date: "2026-09-08",
                    requested_days_per_week: 3,
                    weekdays: [1, 3, 5],
                },
                "cm-wrigley": {
                    start_date: "2026-10-01",
                    requested_days_per_week: 5,
                    weekdays: [],
                },
            },
        };

        const evidence = buildChildrenCardEvidence({ truth });
        const lennon = evidence.children.find((c) => c.customerMemberId === "cm-lennon")!;
        const wrigley = evidence.children.find((c) => c.customerMemberId === "cm-wrigley")!;

        expect(lennon.requestedDaysPerWeek).toBe("3 days per week");
        expect(lennon.preferredWeekdays).toMatch(/Mon/);
        expect(wrigley.requestedDaysPerWeek).toBe("5 days per week");
        expect(wrigley.preferredWeekdays).toBeNull();

        expect(
            resolveIdentityFieldValue(
                { kind: "child", value: lennon },
                "inquiry_child.requested_days_per_week",
            ),
        ).toBe("3 days per week");
        expect(
            resolveIdentityFieldValue(
                { kind: "child", value: wrigley },
                "inquiry_child.weekdays",
            ),
        ).toBeNull();
    });

    it("binds request fields to participation mutation keys without inventing assignment storage", () => {
        expect(childFocusMutationValueKeyForRef("inquiry_child.requested_days_per_week")).toBe(
            "requested_days_per_week",
        );
        expect(childFocusMutationValueKeyForRef("inquiry_child.weekdays")).toBe("weekdays");
        expect(childFocusMutationValueKeyForRef("inquiry_child.start_date")).toBe("start_date");
    });
});

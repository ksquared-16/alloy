import { describe, expect, it } from "vitest";

import { buildOpportunityDrawerEditorFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { buildPersonDrawerEditorFieldPickerGroups } from "@/lib/layout/personDrawerLayoutEditorFieldCatalog";
import { buildChildDrawerEditorFieldPickerGroups } from "@/lib/layout/childDrawerLayoutEditorFieldCatalog";
import {
    buildQueueRecordPickerCatalog,
    queueRecordPickerVisibleRefKeys,
} from "@/lib/layout/queueRecordFieldPickerCatalog";
import { validateQueueRecordLayoutConfig } from "@/lib/layout/runtime/validateQueueRecordLayoutConfig";
import { normalizeQueueRecordLayoutConfig } from "@/lib/layout/runtime/normalizeQueueRecordLayoutConfig";
import { defaultLeadQueueLayoutV3, createFieldGroupBlock } from "@/lib/layout/queueRecordLayoutV3";
import { validateLayoutDocForSurface } from "@/lib/layout/validateLayoutDocForSurface";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    buildTenantLayoutCatalogFields,
    isTenantLayoutFieldAllowedOnSurface,
    isTenantLayoutFieldRenderable,
    tenantFieldDefinitionRefKey,
    type TenantFieldDefinitionRow,
} from "@/lib/layout/tenantLayoutFieldPickerCatalog";

const CUSTOM_PERSON_FIELD: TenantFieldDefinitionRow = {
    entity_type: "person",
    field_key: "preferred_contact_method",
    field_type: "select",
    label: "Preferred contact method",
    config: { option_set_key: "contact_methods" },
    is_system: false,
    is_active: true,
    is_visible_in_drawer: true,
};

const CUSTOM_CHILD_FIELD: TenantFieldDefinitionRow = {
    entity_type: "inquiry_child",
    field_key: "preferred_start_month",
    field_type: "select",
    label: "Preferred Start Month",
    config: { option_set_key: "preferred_start_months" },
    is_system: false,
    is_active: true,
    is_visible_in_drawer: true,
};

const CUSTOM_OPPORTUNITY_FIELD: TenantFieldDefinitionRow = {
    entity_type: "opportunity",
    field_key: "referral_source_detail",
    field_type: "text",
    label: "Referral source detail",
    is_system: false,
    is_active: true,
    is_visible_in_drawer: true,
};

const CUSTOM_CUSTOMER_MEMBER_FIELD: TenantFieldDefinitionRow = {
    entity_type: "customer_member",
    field_key: "dietary_notes",
    field_type: "text",
    label: "Dietary notes",
    is_system: false,
    is_active: true,
    is_visible_in_drawer: true,
};

const HIDDEN_BACKEND_FIELD: TenantFieldDefinitionRow = {
    entity_type: "opportunity",
    field_key: "primary_person_id",
    field_type: "text",
    label: "Primary person id",
    is_system: false,
    is_active: true,
    is_visible_in_drawer: true,
};

describe("tenant layout field picker catalog", () => {
    it("maps tenant custom fields to layout refKeys with tenant labels", () => {
        expect(tenantFieldDefinitionRefKey(CUSTOM_PERSON_FIELD)).toBe("person.preferred_contact_method");
        expect(tenantFieldDefinitionRefKey(CUSTOM_CHILD_FIELD)).toBe("inquiry_child.preferred_start_month");
        expect(tenantFieldDefinitionRefKey(CUSTOM_OPPORTUNITY_FIELD)).toBe("opportunity.referral_source_detail");
        expect(tenantFieldDefinitionRefKey(CUSTOM_CUSTOMER_MEMBER_FIELD)).toBe("child.dietary_notes");
    });

    it("rejects backend-only and non-renderable tenant fields", () => {
        expect(isTenantLayoutFieldRenderable(HIDDEN_BACKEND_FIELD)).toBe(false);
        expect(isTenantLayoutFieldAllowedOnSurface(HIDDEN_BACKEND_FIELD, "opportunity_drawer")).toBe(false);
    });

    it("custom person field appears in Person drawer picker", () => {
        const groups = buildPersonDrawerEditorFieldPickerGroups({ tenantFieldDefinitions: [CUSTOM_PERSON_FIELD] });
        const field = groups.flatMap((g) => g.fields).find((f) => f.refKey === "person.preferred_contact_method");
        expect(field?.fieldLabel).toBe("Preferred contact method");
    });

    it("custom child field appears in Child drawer and waitlist queue candidate context", () => {
        const childGroups = buildChildDrawerEditorFieldPickerGroups({ tenantFieldDefinitions: [CUSTOM_CHILD_FIELD] });
        expect(childGroups.flatMap((g) => g.fields.map((f) => f.refKey))).toContain("inquiry_child.preferred_start_month");

        const queueCatalog = buildQueueRecordPickerCatalog({
            isWaitlist: true,
            tenantFieldDefinitions: [CUSTOM_CHILD_FIELD],
        });
        const queueField = queueCatalog.groups
            .flatMap((g) => g.fields)
            .find((f) => f.refKey === "inquiry_child.preferred_start_month");
        expect(queueField?.fieldLabel).toBe("Preferred Start Month");
        expect(queueField?.entityLabel).toBe("Candidate / Child");
    });

    it("custom opportunity field appears in Opportunity drawer and queue Lead/Enrollment context", () => {
        const drawerGroups = buildOpportunityDrawerEditorFieldPickerGroups({
            tenantFieldDefinitions: [CUSTOM_OPPORTUNITY_FIELD],
        });
        expect(drawerGroups.flatMap((g) => g.fields.map((f) => f.refKey))).toContain("opportunity.referral_source_detail");

        const queueField = buildQueueRecordPickerCatalog({
            isWaitlist: false,
            tenantFieldDefinitions: [CUSTOM_OPPORTUNITY_FIELD],
        })
            .groups.flatMap((g) => g.fields)
            .find((f) => f.refKey === "opportunity.referral_source_detail");
        expect(queueField?.entityLabel).toBe("Lead / Enrollment");
        expect(queueField?.fieldLabel).toBe("Referral source detail");
    });

    it("custom customer_member field appears as child.* in queue candidate context", () => {
        const fields = buildTenantLayoutCatalogFields([CUSTOM_CUSTOMER_MEMBER_FIELD], "waitlist_queue_row");
        expect(fields[0]?.refKey).toBe("child.dietary_notes");
        expect(fields[0]?.fieldLabel).toBe("Dietary notes");
    });

    it("tenant custom queue field validates when added to layout", () => {
        const config = normalizeQueueRecordLayoutConfig(defaultLeadQueueLayoutV3());
        const col = config.columns[0]!;
        const next = {
            ...config,
            columns: config.columns.map((c) =>
                c.id === col.id ?
                    {
                        ...c,
                        blocks: c.blocks.map((block, index) =>
                            index === 0 && block.type === "field_group" ?
                                {
                                    ...block,
                                    fields: [
                                        {
                                            id: "tenant-opp",
                                            fieldKey: "opportunity.referral_source_detail",
                                            display: "text" as const,
                                        },
                                    ],
                                }
                            :   block,
                        ),
                    }
                :   c,
            ),
        };
        const result = validateQueueRecordLayoutConfig(next, {
            isWaitlist: false,
            tenantFieldDefinitions: [CUSTOM_OPPORTUNITY_FIELD],
        });
        expect(result.ok).toBe(true);
    });

    it("drawer layout validates tenant custom field refs", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const section = doc.sections[0]!;
        doc.sections = [
            {
                ...section,
                rows: [
                    {
                        columns: [
                            {
                                items: [
                                    {
                                        id: "tenant-opp-field",
                                        kind: "field" as const,
                                        refKey: "opportunity.referral_source_detail",
                                        label: "Referral source detail",
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ];
        const result = validateLayoutDocForSurface(doc, "opportunity_drawer", {
            tenantFieldDefinitions: [CUSTOM_OPPORTUNITY_FIELD],
        });
        expect(result.ok).toBe(true);
    });

    it("queue picker visible refs include tenant custom fields", () => {
        const refs = queueRecordPickerVisibleRefKeys([], false, {
            tenantFieldDefinitions: [CUSTOM_OPPORTUNITY_FIELD, CUSTOM_CHILD_FIELD],
        });
        expect(refs).toContain("opportunity.referral_source_detail");
        expect(refs).toContain("inquiry_child.preferred_start_month");
    });
});

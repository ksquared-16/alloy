/**
 * Layout editor — block-context field picker groups (Phase 5.11).
 */

import type { LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import type { LayoutEditorDataContext } from "@/lib/layout/layoutEditorBlockConfig";
import {
    contactRoleFieldRefs,
    LAYOUT_EDITOR_CONTACT_ROLE_LABELS,
    type LayoutEditorContactRole,
} from "@/lib/layout/layoutEditorContactRoles";
import {
    getDrawerLayoutEditorSurfaceConfig,
    type DrawerLayoutEditorSurfaceKey,
} from "@/lib/layout/drawerLayoutEditorSurfaceConfig";
import { resolveLayoutEditorFieldRefLabel } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";

const CONTEXT_ENTITY_ORDER: Record<LayoutEditorDataContext, string[]> = {
    contact: ["person", "customer", "opportunity"],
    child: ["child", "inquiry_child", "opportunity"],
    household: ["customer", "person", "opportunity"],
    lead: ["opportunity", "person", "customer"],
    location: ["location", "opportunity", "customer"],
};

const CHILD_ROW_SUGGESTED_REFS = [
    "child.name",
    "child.program",
    "child.start_date",
    "child.dob_age",
    "child.status",
    "child.schedule",
];

function reorderGroups(groups: LayoutCatalogGroup[], entityOrder: string[]): LayoutCatalogGroup[] {
    const rank = new Map(entityOrder.map((key, index) => [key, index]));
    return [...groups].sort((a, b) => (rank.get(a.entityKey) ?? 99) - (rank.get(b.entityKey) ?? 99));
}

function contactRoleSuggestedFields(role: LayoutEditorContactRole) {
    const refs = contactRoleFieldRefs(role);
    return [
        { refKey: refs.name, label: "Full name" },
        { refKey: refs.email, label: "Email" },
        { refKey: refs.phone, label: "Phone" },
    ];
}

/** Entity-first picker groups prioritized for a block's data context. */
export function buildBlockContextFieldPickerGroups(input: {
    /** Drawer surface — block pickers use the same catalog as card field pickers. */
    surfaceKey?: DrawerLayoutEditorSurfaceKey;
    dataContext?: LayoutEditorDataContext;
    contactRole?: LayoutEditorContactRole;
    isChildRowTemplate?: boolean;
}): LayoutCatalogGroup[] {
    const surfaceKey = input.surfaceKey ?? "opportunity_drawer";
    const all = getDrawerLayoutEditorSurfaceConfig(surfaceKey).buildFieldPickerGroups();
    const entityOrder = CONTEXT_ENTITY_ORDER[input.dataContext ?? "lead"];
    let groups = reorderGroups(all, entityOrder);

    if (input.dataContext === "contact" && input.contactRole) {
        const roleLabel = LAYOUT_EDITOR_CONTACT_ROLE_LABELS[input.contactRole];
        const suggested = contactRoleSuggestedFields(input.contactRole);
        const suggestedGroup: LayoutCatalogGroup = {
            entityKey: "contact_role",
            entityLabel: `${roleLabel} Contact`,
            groupDescription: `Suggested fields for the ${roleLabel.toLowerCase()} contact role`,
            fields: suggested.map((s) => {
                const fromAll = all.flatMap((g) => g.fields).find((f) => f.refKey === s.refKey);
                return (
                    fromAll ?? {
                        entityKey: "person",
                        entityLabel: "Person",
                        fieldKey: s.refKey.split(".").pop() ?? s.refKey,
                        fieldLabel: s.label,
                        fieldType: s.refKey.includes("phone") ? "phone" : "text",
                        refKey: s.refKey,
                    }
                );
            }),
        };
        groups = [suggestedGroup, ...groups];
    }

    if (input.isChildRowTemplate) {
        const childFields = all.flatMap((g) => g.fields).filter((f) => CHILD_ROW_SUGGESTED_REFS.includes(f.refKey));
        const ordered = CHILD_ROW_SUGGESTED_REFS.map(
            (refKey) =>
                childFields.find((f) => f.refKey === refKey) ?? {
                    entityKey: "child",
                    entityLabel: "Child",
                    fieldKey: refKey.split(".").pop() ?? refKey,
                    fieldLabel: resolveLayoutEditorFieldRefLabel(refKey),
                    fieldType: refKey.includes("date") ? "date" : refKey.includes("status") ? "status" : "text",
                    refKey,
                },
        );
        groups = [
            {
                entityKey: "child_row",
                entityLabel: "Child row fields",
                fields: ordered,
            },
            ...groups,
        ];
    }

    return groups;
}

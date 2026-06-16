/**
 * Layout editor — registry-driven layout block templates for opportunity drawer sections.
 */

import { addItem, makeFieldItem, makeId, makeTemplateItem, type GroupLoc } from "@/lib/layout/builderOps";
import type { LayoutDoc, LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import {
    contactRoleBlockTitle,
    contactRoleFieldRefs,
    contactRoleVisibilityPath,
    LAYOUT_EDITOR_CONTACT_ROLE_METADATA_KEY,
    readLayoutEditorContactRole,
    type LayoutEditorContactRole,
} from "@/lib/layout/layoutEditorContactRoles";
import {
    DEFAULT_LAYOUT_EDITOR_ROW_TEMPLATE_CONFIG,
    LAYOUT_EDITOR_ROW_TEMPLATE_METADATA_KEY,
    writeLayoutEditorRowTemplateConfig,
} from "@/lib/layout/layoutEditorRowTemplateConfig";
import { LAYOUT_GRID_COLUMNS } from "@/lib/layout/layoutV2";
import { isValidCustomSectionKeyPattern } from "@/lib/layout/layoutEditorGeneratedKeys";

export const LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY = "layoutEditorBlockTemplate" as const;

export const LAYOUT_EDITOR_BLOCK_TEMPLATES = [
    "contact_primary",
    "contact_secondary",
    "contact_emergency",
    "contact_billing",
    "contact_custom",
    "household_card",
    "location_card",
    "address_card",
    "child_row_template",
    "child_summary_card",
] as const;

export type LayoutEditorBlockTemplateKey = (typeof LAYOUT_EDITOR_BLOCK_TEMPLATES)[number];

export type LayoutEditorBlockTemplate = {
    key: LayoutEditorBlockTemplateKey;
    label: string;
    description: string;
    kind: "field_group" | "related_list" | "card_cluster";
    allowedSections: readonly string[];
    /** When false, block may appear in editor but is documented preview-only at runtime. */
    runtimeEffective: boolean;
};

const PERSON_LINK: LayoutFieldAdornment = {
    position: "left",
    icon: "person",
    action: { type: "open_drawer", entity: "person", idPath: "opportunity.primary_person_id" },
};
const CHILD_LINK: LayoutFieldAdornment = {
    position: "left",
    icon: "child",
    action: { type: "open_drawer", entity: "child", idPath: "child.id" },
};
const HOME_ICON: LayoutFieldAdornment = { position: "left", icon: "home" };
const LOCATION_ICON: LayoutFieldAdornment = { position: "left", icon: "location" };
const PHONE_ICON: LayoutFieldAdornment = { position: "left", icon: "phone" };
const MAIL_ICON: LayoutFieldAdornment = { position: "left", icon: "mail" };

export const LAYOUT_EDITOR_BLOCK_TEMPLATE_CATALOG: LayoutEditorBlockTemplate[] = [
    {
        key: "contact_primary",
        label: "Primary Contact Card (starter)",
        description: "Starter: primary relationship contact with name, email, and phone rows.",
        kind: "field_group",
        allowedSections: ["household_contact"],
        runtimeEffective: true,
    },
    {
        key: "contact_secondary",
        label: "Secondary Contact Card (starter)",
        description: "Starter: secondary relationship contact — or use Create block → Contact card → Secondary.",
        kind: "field_group",
        allowedSections: ["household_contact"],
        runtimeEffective: true,
    },
    {
        key: "contact_emergency",
        label: "Emergency Contact Card",
        description: "Emergency relationship contact card.",
        kind: "field_group",
        allowedSections: ["household_contact"],
        runtimeEffective: true,
    },
    {
        key: "contact_billing",
        label: "Billing Contact Card",
        description: "Billing relationship contact card.",
        kind: "field_group",
        allowedSections: ["household_contact"],
        runtimeEffective: true,
    },
    {
        key: "contact_custom",
        label: "Custom Contact Card (starter)",
        description: "Starter: flexible contact card with role-aware fields.",
        kind: "field_group",
        allowedSections: ["household_contact"],
        runtimeEffective: true,
    },
    {
        key: "household_card",
        label: "Household Card",
        description: "Household title and lead status cluster.",
        kind: "card_cluster",
        allowedSections: ["household_contact"],
        runtimeEffective: true,
    },
    {
        key: "location_card",
        label: "Location Card",
        description: "School / site location for the household.",
        kind: "card_cluster",
        allowedSections: ["household_contact"],
        runtimeEffective: true,
    },
    {
        key: "address_card",
        label: "Address Card",
        description: "Household address summary fields — preview only until address fields hydrate.",
        kind: "card_cluster",
        allowedSections: ["household_contact"],
        runtimeEffective: false,
    },
    {
        key: "child_row_template",
        label: "Child Row Template (starter)",
        description: "Starter: enrollment child row columns, actions, and display.",
        kind: "related_list",
        allowedSections: ["children_enrollment"],
        runtimeEffective: true,
    },
    {
        key: "child_summary_card",
        label: "Child Summary Card",
        description: "Compact child enrollment summary card — preview only.",
        kind: "field_group",
        allowedSections: ["children_enrollment"],
        runtimeEffective: false,
    },
];

const CONTACT_TEMPLATE_ROLE: Partial<Record<LayoutEditorBlockTemplateKey, LayoutEditorContactRole>> = {
    contact_primary: "primary",
    contact_secondary: "secondary",
    contact_emergency: "emergency",
    contact_billing: "billing",
    contact_custom: "any",
};

function halfColumns(total: number): number {
    return Math.max(1, Math.floor(total / 2));
}

function createContactBlock(role: LayoutEditorContactRole): LayoutItem {
    const refs = contactRoleFieldRefs(role);
    const visibilityPath = contactRoleVisibilityPath(role);
    const visibleWhen = visibilityPath ? { type: "exists" as const, path: visibilityPath } : undefined;

    return {
        id: makeId("grp"),
        kind: "field_group",
        refKey: "contact_block",
        label: contactRoleBlockTitle(role),
        visibleWhen,
        metadata: {
            [LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY]: `contact_${role}`,
            [LAYOUT_EDITOR_CONTACT_ROLE_METADATA_KEY]: role,
        },
        rows: [
            {
                id: makeId("row"),
                columns: [
                    {
                        id: makeId("col"),
                        width: LAYOUT_GRID_COLUMNS,
                        items: [{ ...makeFieldItem(refs.name, "Full name", "text"), adornment: PERSON_LINK }],
                    },
                ],
            },
            {
                id: makeId("row"),
                columns: [
                    {
                        id: makeId("col"),
                        width: halfColumns(LAYOUT_GRID_COLUMNS),
                        items: [{ ...makeFieldItem(refs.email, "Email", "text"), adornment: MAIL_ICON }],
                    },
                    {
                        id: makeId("col"),
                        width: halfColumns(LAYOUT_GRID_COLUMNS),
                        items: [{ ...makeFieldItem(refs.phone, "Phone", "phone"), adornment: PHONE_ICON }],
                    },
                ],
            },
        ],
    };
}

function createChildRowTemplate(): LayoutItem {
    return {
        id: makeId("item"),
        kind: "related_list",
        refKey: "children",
        label: "Children & enrollment",
        source: "children",
        displayMode: "table",
        related: { entityType: "child" },
        metadata: {
            [LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY]: "child_row_template",
            ...writeLayoutEditorRowTemplateConfig(undefined, DEFAULT_LAYOUT_EDITOR_ROW_TEMPLATE_CONFIG),
        },
        columns: [
            {
                label: "Child",
                refKey: "child.name",
                width: "medium",
                adornment: CHILD_LINK,
            },
            { label: "Program", refKey: "child.program", width: "medium" },
            { label: "Schedule", refKey: "child.schedule", width: "medium" },
            { label: "Classroom", refKey: "child.room", width: "medium" },
            { label: "Status", refKey: "child.status", width: "medium", renderHint: "status" },
            { label: "Age", refKey: "child.dob_age", width: "medium" },
        ],
    };
}

function createCardClusterItems(templateKey: LayoutEditorBlockTemplateKey): LayoutItem[] {
    if (templateKey === "household_card") {
        return [
            {
                ...makeTemplateItem("{last_name} Household", "Household"),
                adornment: HOME_ICON,
                metadata: { [LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY]: templateKey },
            },
            makeFieldItem("opportunity.status_key", "Lead status", "status"),
        ];
    }
    if (templateKey === "location_card") {
        return [
            {
                ...makeFieldItem("opportunity.location", "Location", "text"),
                adornment: LOCATION_ICON,
                metadata: { [LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY]: templateKey },
            },
        ];
    }
    if (templateKey === "address_card") {
        return [
            makeFieldItem("customer.address_line1", "Address", "text"),
            makeFieldItem("customer.city", "City", "text"),
        ].map((item) => ({ ...item, metadata: { [LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY]: templateKey } }));
    }
    return [];
}

export function layoutEditorBlockTemplateForKey(key: string): LayoutEditorBlockTemplate | null {
    return LAYOUT_EDITOR_BLOCK_TEMPLATE_CATALOG.find((t) => t.key === key) ?? null;
}

export function listLayoutEditorBlockTemplatesForSection(sectionKey: string): LayoutEditorBlockTemplate[] {
    if (isValidCustomSectionKeyPattern(sectionKey)) {
        return LAYOUT_EDITOR_BLOCK_TEMPLATE_CATALOG;
    }
    return LAYOUT_EDITOR_BLOCK_TEMPLATE_CATALOG.filter((t) => t.allowedSections.includes(sectionKey));
}

export function resolveLayoutEditorBlockTitle(item: LayoutItem, fallback: string): string {
    const templateKey = item.metadata?.[LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY];
    if (typeof templateKey === "string") {
        const template = layoutEditorBlockTemplateForKey(templateKey);
        if (template) return template.label;
    }
    if (item.kind === "field_group" && item.refKey === "contact_block") {
        return contactRoleBlockTitle(readLayoutEditorContactRole(item.metadata));
    }
    if (item.kind === "related_list" && item.refKey === "children") {
        return "Child Row Template";
    }
    return fallback;
}

function sectionInsertTarget(doc: LayoutDoc, sectionKey: string, template: LayoutEditorBlockTemplate): {
    sIdx: number;
    rIdx: number;
    cIdx: number;
} | null {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return null;
    const section = doc.sections[sIdx]!;
    const row = section.rows[0];
    if (!row) return null;

    if (template.kind === "field_group" || template.key.startsWith("contact_")) {
        const contactColumn = row.columns[1] ?? row.columns[0];
        return { sIdx, rIdx: 0, cIdx: row.columns.indexOf(contactColumn!) };
    }
    if (template.kind === "related_list") {
        return { sIdx, rIdx: 0, cIdx: 0 };
    }
    return { sIdx, rIdx: 0, cIdx: 0 };
}

function sectionHasBlockTemplate(doc: LayoutDoc, sectionKey: string, templateKey: LayoutEditorBlockTemplateKey): boolean {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return false;
    for (const row of doc.sections[sIdx]!.rows) {
        for (const col of row.columns) {
            for (const item of col.items) {
                if (item.metadata?.[LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY] === templateKey) return true;
                if (templateKey === "child_row_template" && item.kind === "related_list" && item.refKey === "children") {
                    return true;
                }
            }
        }
    }
    return false;
}

export function buildLayoutBlockItem(templateKey: LayoutEditorBlockTemplateKey): LayoutItem | LayoutItem[] | null {
    const role = CONTACT_TEMPLATE_ROLE[templateKey];
    if (role) return createContactBlock(role);
    if (templateKey === "child_row_template") return createChildRowTemplate();
    if (templateKey === "child_summary_card") {
        return {
            id: makeId("grp"),
            kind: "field_group",
            refKey: "children",
            label: "Child summary",
            metadata: { [LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY]: templateKey },
            items: [makeFieldItem("child.name", "Child", "text"), makeFieldItem("child.status", "Status", "status")],
        };
    }
    const cluster = createCardClusterItems(templateKey);
    return cluster.length > 0 ? cluster : null;
}

function countContactBlocksByRole(doc: LayoutDoc, sectionKey: string, role: LayoutEditorContactRole): number {
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section) return 0;
    let count = 0;
    for (const row of section.rows) {
        for (const col of row.columns) {
            for (const item of col.items) {
                if (item.kind === "field_group" && item.refKey === "contact_block") {
                    if (readLayoutEditorContactRole(item.metadata) === role) count += 1;
                }
            }
        }
    }
    return count;
}

export function isLayoutEditorBlockRuntimeEffective(templateKey: LayoutEditorBlockTemplateKey): boolean {
    return layoutEditorBlockTemplateForKey(templateKey)?.runtimeEffective ?? false;
}

export function validateOpportunityDrawerLayoutBlocks(doc: LayoutDoc): string[] {
    const errors: string[] = [];
    for (const section of doc.sections) {
        if (section.key !== "household_contact") continue;
        const primaryCount = countContactBlocksByRole(doc, section.key, "primary");
        if (primaryCount > 1) {
            errors.push(`Section "${section.key}": only one Primary Contact Card is allowed.`);
        }
    }
    return errors;
}

export function addLayoutBlockToSection(
    doc: LayoutDoc,
    sectionKey: string,
    templateKey: LayoutEditorBlockTemplateKey,
): { ok: true; doc: LayoutDoc; blockItemId: string } | { ok: false; error: string } {
    const template = layoutEditorBlockTemplateForKey(templateKey);
    if (!template) return { ok: false, error: "Unknown block template." };
    if (!isValidCustomSectionKeyPattern(sectionKey) && !template.allowedSections.includes(sectionKey)) {
        return { ok: false, error: `"${template.label}" is not allowed in this section.` };
    }
    if (templateKey === "child_row_template" && sectionHasBlockTemplate(doc, sectionKey, templateKey)) {
        return { ok: false, error: "This section already has a Child Row Template." };
    }
    if (
        (templateKey === "contact_primary" || CONTACT_TEMPLATE_ROLE[templateKey] === "primary")
        && countContactBlocksByRole(doc, sectionKey, "primary") > 0
    ) {
        return { ok: false, error: "This section already has a Primary Contact Card." };
    }

    const target = sectionInsertTarget(doc, sectionKey, template);
    if (!target) return { ok: false, error: "Section structure not found." };

    const built = buildLayoutBlockItem(templateKey);
    if (!built) return { ok: false, error: "Unable to build block." };

    if (Array.isArray(built)) {
        let next = doc;
        for (const item of built) {
            next = addItem(next, target.sIdx, target.rIdx, target.cIdx, item);
        }
        return { ok: true, doc: next, blockItemId: built[0]!.id };
    }

    const next = addItem(doc, target.sIdx, target.rIdx, target.cIdx, built);
    return { ok: true, doc: next, blockItemId: built.id };
}

export function removeLayoutBlock(doc: LayoutDoc, sectionKey: string, blockItemId: string): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    const next = JSON.parse(JSON.stringify(doc)) as LayoutDoc;
    for (const row of next.sections[sIdx]!.rows) {
        for (const col of row.columns) {
            col.items = col.items.filter((it) => it.id !== blockItemId);
        }
    }
    return next;
}

export function moveLayoutBlock(doc: LayoutDoc, sectionKey: string, blockItemId: string, direction: -1 | 1): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    const next = JSON.parse(JSON.stringify(doc)) as LayoutDoc;
    for (const row of next.sections[sIdx]!.rows) {
        for (const col of row.columns) {
            const idx = col.items.findIndex((it) => it.id === blockItemId);
            if (idx < 0) continue;
            const target = idx + direction;
            if (target < 0 || target >= col.items.length) return doc;
            [col.items[idx], col.items[target]] = [col.items[target]!, col.items[idx]!];
            return next;
        }
    }
    return doc;
}

export function patchLayoutBlockContactRole(
    doc: LayoutDoc,
    sectionKey: string,
    blockItemId: string,
    role: LayoutEditorContactRole,
): LayoutDoc {
    const built = createContactBlock(role);
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    const next = JSON.parse(JSON.stringify(doc)) as LayoutDoc;
    for (const row of next.sections[sIdx]!.rows) {
        for (const col of row.columns) {
            const idx = col.items.findIndex((it) => it.id === blockItemId);
            if (idx < 0) continue;
            col.items[idx] = { ...built, id: blockItemId };
            return next;
        }
    }
    return doc;
}

export function patchLayoutBlockRowTemplateConfig(
    doc: LayoutDoc,
    loc: GroupLoc,
    patch: Parameters<typeof writeLayoutEditorRowTemplateConfig>[1],
): LayoutDoc {
    const next = JSON.parse(JSON.stringify(doc)) as LayoutDoc;
    const item = next.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === loc.itemId);
    if (!item) return doc;
    item.metadata = writeLayoutEditorRowTemplateConfig(item.metadata, patch);
    return next;
}

export function findLayoutBlockLocation(doc: LayoutDoc, blockItemId: string): GroupLoc | null {
    for (let sIdx = 0; sIdx < doc.sections.length; sIdx += 1) {
        const section = doc.sections[sIdx]!;
        for (let rIdx = 0; rIdx < section.rows.length; rIdx += 1) {
            const row = section.rows[rIdx]!;
            for (let cIdx = 0; cIdx < row.columns.length; cIdx += 1) {
                const col = row.columns[cIdx]!;
                if (col.items.some((it) => it.id === blockItemId)) {
                    return { sIdx, rIdx, cIdx, itemId: blockItemId };
                }
            }
        }
    }
    return null;
}

export function isLayoutEditorBlockTemplateKey(v: string): v is LayoutEditorBlockTemplateKey {
    return (LAYOUT_EDITOR_BLOCK_TEMPLATES as readonly string[]).includes(v);
}

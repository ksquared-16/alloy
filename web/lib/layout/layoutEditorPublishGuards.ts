/**
 * Publish guards — block layouts with preview-only items from shipping (Phase 5.14B).
 */

import { readLayoutEditorActionButtonConfig } from "@/lib/layout/layoutEditorActionButton";
import { LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY, layoutEditorBlockTemplateForKey, type LayoutEditorBlockTemplateKey } from "@/lib/layout/layoutEditorBlockRegistry";
import {
    LAYOUT_EDITOR_RELATED_LIST_ENTITY_LABELS,
    readLayoutEditorRelatedListConfig,
    relatedListEntityTypeRuntimeSupported,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import type { LayoutDoc, LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";

function walkItems(items: LayoutItem[], visit: (item: LayoutItem, path: string) => void, pathPrefix: string): void {
    items.forEach((item, index) => {
        const path = `${pathPrefix}[${index}]`;
        visit(item, path);
        item.rows?.forEach((row, rIdx) =>
            row.columns.forEach((col, cIdx) =>
                walkItems(col.items, visit, `${path}.rows[${rIdx}].columns[${cIdx}].items`),
            ),
        );
        item.items?.forEach((child, cIdx) => walkItems([child], visit, `${path}.items[${cIdx}]`));
    });
}

function walkSection(section: LayoutSection, visit: (item: LayoutItem, path: string) => void): void {
    section.rows.forEach((row, rIdx) =>
        row.columns.forEach((col, cIdx) =>
            walkItems(col.items, visit, `Section "${section.key}" row ${rIdx + 1} col ${cIdx + 1}`),
        ),
    );
}

/** Items that render in preview but are not live-runtime-supported on the opportunity drawer. */
export function validateOpportunityDrawerLayoutPublishGuards(doc: LayoutDoc): string[] {
    const errors: string[] = [];

    for (const section of doc.sections) {
        if (section.metadata?.layoutEditorSectionType === "related_list") {
            const config = readLayoutEditorRelatedListConfig(section);
            if (!relatedListEntityTypeRuntimeSupported(config.entityType)) {
                errors.push(
                    `Section "${section.key}": related list entity "${LAYOUT_EDITOR_RELATED_LIST_ENTITY_LABELS[config.entityType]}" is preview-only and cannot be published. Choose Children, Contacts, or Household members.`,
                );
            }
        }

        walkSection(section, (item, path) => {
            if (item.refKey === "_action_button" && readLayoutEditorActionButtonConfig(item.metadata)) {
                errors.push(
                    `${path}: action buttons are preview-only and cannot be published until live drawer action wiring ships. Remove the action or replace it with a supported widget/block.`,
                );
                return;
            }

            const templateKey = item.metadata?.[LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY];
            if (typeof templateKey === "string") {
                const template = layoutEditorBlockTemplateForKey(templateKey as LayoutEditorBlockTemplateKey);
                if (template && !template.runtimeEffective) {
                    errors.push(
                        `${path}: starter block "${template.label}" is preview-only and cannot be published. Remove it or use a runtime-supported template.`,
                    );
                }
            }
        });
    }

    return errors;
}

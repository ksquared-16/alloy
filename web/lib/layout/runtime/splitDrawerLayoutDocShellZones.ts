/**
 * Drawer shell zone split — platform-owned boundary between summary strip and scroll body.
 *
 * Layout sections are assigned to shell zones via section keys (platform registry).
 * Widget/card content remains layout-owned; this module only partitions the LayoutDoc.
 *
 * @see docs/system/drawer-operating-model-v1.md
 */

import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import type { EntityDrawerOperatingEntity } from "@/lib/admin/drawer/entityDrawerOperatingModel";
import { isOpportunityDrawerLayoutZone } from "@/lib/layout/surfaceLayoutRegistry";

/** Section keys routed to the platform summary strip container (not hardcoded widgets). */
export const DRAWER_SUMMARY_STRIP_SECTION_KEYS: Readonly<
    Partial<Record<EntityDrawerOperatingEntity, readonly string[]>>
> = {
    opportunity: ["lead_summary"],
    person: ["person_summary"],
    child: ["child_summary"],
};

export type DrawerLayoutShellZoneSplit = {
    summaryDoc: LayoutDoc;
    bodyDoc: LayoutDoc;
    summarySectionKeys: string[];
    bodySectionKeys: string[];
};

function cloneDocWithSections(doc: LayoutDoc, sections: LayoutSection[]): LayoutDoc {
    return { ...doc, sections };
}

function summaryKeysForEntity(entity: EntityDrawerOperatingEntity): readonly string[] {
    return DRAWER_SUMMARY_STRIP_SECTION_KEYS[entity] ?? [];
}

function sectionBelongsToSummaryStrip(section: LayoutSection, summaryKeySet: Set<string>): boolean {
    if (summaryKeySet.has(section.key)) return true;
    const layoutZone = section.metadata?.layoutZone;
    return isOpportunityDrawerLayoutZone(layoutZone) && layoutZone === "summary_strip";
}

/** Partition a drawer LayoutDoc into summary-strip vs scroll-body sections. */
export function splitDrawerLayoutDocShellZones(
    doc: LayoutDoc,
    entity: EntityDrawerOperatingEntity,
): DrawerLayoutShellZoneSplit {
    const summaryKeySet = new Set(summaryKeysForEntity(entity));
    const summarySections: LayoutSection[] = [];
    const bodySections: LayoutSection[] = [];

    for (const section of doc.sections) {
        if (sectionBelongsToSummaryStrip(section, summaryKeySet)) {
            summarySections.push(section);
        } else {
            bodySections.push(section);
        }
    }

    return {
        summaryDoc: cloneDocWithSections(doc, summarySections),
        bodyDoc: cloneDocWithSections(doc, bodySections),
        summarySectionKeys: summarySections.map((s) => s.key),
        bodySectionKeys: bodySections.map((s) => s.key),
    };
}

export function drawerLayoutDocHasSummaryStripSections(
    doc: LayoutDoc | null | undefined,
    entity: EntityDrawerOperatingEntity,
): boolean {
    if (!doc?.sections?.length) return false;
    const summaryKeySet = new Set(summaryKeysForEntity(entity));
    if (summaryKeySet.size === 0) return false;
    return doc.sections.some((s) => summaryKeySet.has(s.key));
}

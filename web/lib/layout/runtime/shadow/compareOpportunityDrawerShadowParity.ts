/**
 * Compare VM vs layout runtime opportunity drawer structure (Phase 3 shadow parity).
 */

import type {
    DrawerStructureNode,
    DrawerStructureSnapshot,
    ShadowParityMismatch,
    ShadowParityReport,
} from "./drawerStructureSnapshot";
import {
    layoutSectionKeysForVmSection,
    normalizeFieldRefKeyForParity,
    vmSectionKeysForLayoutSection,
} from "./opportunitySectionAliases";

function nodesByKind(snapshot: DrawerStructureSnapshot, kind: DrawerStructureNode["kind"]): DrawerStructureNode[] {
    return snapshot.nodes.filter((n) => n.kind === kind);
}

function keys(nodes: DrawerStructureNode[]): string[] {
    return nodes.map((n) => n.key);
}

function uniqueSorted(values: string[]): string[] {
    return [...new Set(values)].sort();
}

function sectionMatched(vmKey: string, layoutKeys: Set<string>): boolean {
    const aliases = layoutSectionKeysForVmSection(vmKey);
    return aliases.some((k) => layoutKeys.has(k));
}

function layoutSectionMatched(layoutKey: string, vmKeys: Set<string>): boolean {
    const aliases = vmSectionKeysForLayoutSection(layoutKey);
    return aliases.some((k) => vmKeys.has(k));
}

function fieldRefMatched(vmRef: string, layoutRefs: Set<string>): boolean {
    const norm = normalizeFieldRefKeyForParity(vmRef);
    for (const lr of layoutRefs) {
        if (lr === vmRef) return true;
        if (normalizeFieldRefKeyForParity(lr) === norm) return true;
        if (`opportunity.${norm}` === lr) return true;
    }
    return false;
}

export type CompareShadowParityInput = {
    vm: DrawerStructureSnapshot;
    layout: DrawerStructureSnapshot;
    layoutKey?: string;
};

/** Compare VM and layout runtime snapshots; produce parity / mismatch / coverage reports. */
export function compareOpportunityDrawerShadowParity(input: CompareShadowParityInput): ShadowParityReport {
    const { vm, layout } = input;
    const mismatches: ShadowParityMismatch[] = [];

    const vmTabs = new Set(vm.tabs);
    const layoutTabs = new Set(layout.tabs);
    const vmSections = new Set(keys(nodesByKind(vm, "section")));
    const layoutSections = new Set(keys(nodesByKind(layout, "section")));
    const vmFields = nodesByKind(vm, "field");
    const layoutFields = nodesByKind(layout, "field");
    const vmFieldRefs = new Set(vmFields.map((f) => f.refKey ?? f.key));
    const layoutFieldRefs = new Set(layoutFields.map((f) => f.refKey ?? f.key));
    const vmWidgets = new Set(keys(nodesByKind(vm, "widget")));
    const layoutWidgets = new Set(keys(nodesByKind(layout, "widget")));
    const vmRel = new Set(keys(nodesByKind(vm, "relationship_section")));
    const layoutRel = new Set(keys(nodesByKind(layout, "relationship_section")));
    const vmRepeaters = new Set(keys(nodesByKind(vm, "repeater")));
    const layoutRepeaters = new Set(keys(nodesByKind(layout, "repeater")));

    const matchedTabs: string[] = [];
    for (const tab of vm.tabs) {
        if (tab === "overview" || layoutTabs.has(tab)) matchedTabs.push(tab);
        else {
            mismatches.push({
                category: "tab_missing_in_layout",
                vmKey: tab,
                detail: `VM tab "${tab}" has no layout runtime equivalent (layout models overview body only).`,
            });
        }
    }
    for (const tab of layout.tabs) {
        if (!vmTabs.has(tab) && tab !== "overview") {
            mismatches.push({
                category: "tab_extra_in_layout",
                layoutKey: tab,
                detail: `Layout tab "${tab}" not present on VM drawer.`,
            });
        }
    }

    const matchedSections: string[] = [];
    for (const sec of vmSections) {
        if (sectionMatched(sec, layoutSections)) matchedSections.push(sec);
        else {
            mismatches.push({
                category: "section_missing_in_layout",
                vmKey: sec,
                detail: `VM section "${sec}" not matched in layout (aliases: ${layoutSectionKeysForVmSection(sec).join(", ")}).`,
            });
        }
    }
    for (const sec of layoutSections) {
        if (!layoutSectionMatched(sec, vmSections)) {
            mismatches.push({
                category: "section_extra_in_layout",
                layoutKey: sec,
                detail: `Layout section "${sec}" not matched on VM shell.`,
            });
        }
    }

    const matchedFields: string[] = [];
    for (const f of vmFields) {
        const ref = f.refKey ?? f.key;
        if (fieldRefMatched(ref, layoutFieldRefs)) matchedFields.push(ref);
        else {
            mismatches.push({
                category: "field_missing_in_layout",
                vmKey: ref,
                vmPath: f.path,
                detail: `VM field "${ref}" not found in layout runtime plan.`,
            });
        }
    }
    for (const f of layoutFields) {
        const ref = f.refKey ?? f.key;
        if (!fieldRefMatched(ref, vmFieldRefs)) {
            mismatches.push({
                category: "field_extra_in_layout",
                layoutKey: ref,
                layoutPath: f.path,
                detail: `Layout field "${ref}" not present on VM shell sections.`,
            });
        }
    }

    const matchedWidgets = uniqueSorted([...vmWidgets].filter((w) => layoutWidgets.has(w)));
    for (const w of vmWidgets) {
        if (!layoutWidgets.has(w)) {
            mismatches.push({
                category: "widget_missing_in_layout",
                vmKey: w,
                detail: `VM widget "${w}" missing from layout runtime.`,
            });
        }
    }
    for (const w of layoutWidgets) {
        if (!vmWidgets.has(w)) {
            mismatches.push({
                category: "widget_extra_in_layout",
                layoutKey: w,
                detail: `Layout widget "${w}" not on VM inquiry summary.`,
            });
        }
    }

    const matchedRel = uniqueSorted([...vmRel].filter((r) => layoutRel.has(r) || layoutRel.has("primary_contact")));
    for (const r of vmRel) {
        if (!layoutRel.has(r) && r !== "family_contacts") {
            mismatches.push({
                category: "relationship_section_missing_in_layout",
                vmKey: r,
                detail: `VM relationship block "${r}" not in layout runtime.`,
            });
        }
    }

    const matchedRepeaters: string[] = [];
    for (const r of vmRepeaters) {
        const ok =
            layoutRepeaters.has(r) ||
            (r === "inquiry_children" && (layoutRepeaters.has("children") || layoutRepeaters.has("enrollment_children")));
        if (ok) matchedRepeaters.push(r);
        else {
            mismatches.push({
                category: "repeater_missing_in_layout",
                vmKey: r,
                detail: `VM repeater "${r}" not matched in layout (expected children / enrollment_children).`,
            });
        }
    }

    const vmOnly = mismatches
        .filter((m) => m.category.endsWith("_missing_in_layout"))
        .map((m) => m.vmKey ?? m.detail);
    const layoutOnly = mismatches
        .filter((m) => m.category.endsWith("_extra_in_layout"))
        .map((m) => m.layoutKey ?? m.detail);

    const totalChecks =
        vm.tabs.length +
        vmSections.size +
        vmFields.length +
        vmWidgets.size +
        vmRel.size +
        vmRepeaters.size;
    const matchedCount =
        matchedTabs.length +
        matchedSections.length +
        matchedFields.length +
        matchedWidgets.length +
        matchedRel.length +
        matchedRepeaters.length;
    const parityScore = totalChecks > 0 ? Math.round((matchedCount / totalChecks) * 100) : 100;

    return {
        recordId: vm.recordId ?? layout.recordId,
        layoutKey: input.layoutKey,
        vmNodeCount: vm.nodes.length,
        layoutNodeCount: layout.nodes.length,
        matched: {
            tabs: matchedTabs,
            sections: uniqueSorted(matchedSections),
            fields: uniqueSorted(matchedFields),
            widgets: matchedWidgets,
            relationship_sections: matchedRel,
            repeaters: uniqueSorted(matchedRepeaters),
        },
        mismatches,
        missingCoverage: {
            vmOnly: uniqueSorted(vmOnly),
            layoutOnly: uniqueSorted(layoutOnly),
        },
        parityScore,
        summary:
            mismatches.length === 0
                ? "Full structural parity between VM drawer and layout runtime."
                : `${mismatches.length} mismatch(es); parity score ${parityScore}%. Layout scope: overview body; VM includes full tab strip.`,
    };
}

/** Run full shadow parity pipeline for one opportunity record context. */
export function runOpportunityDrawerShadowParity(params: {
    vm: DrawerStructureSnapshot;
    layout: DrawerStructureSnapshot;
    layoutKey?: string;
}): ShadowParityReport {
    return compareOpportunityDrawerShadowParity(params);
}

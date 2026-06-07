/**
 * Enrich shadow parity report with coverage metrics and migration readiness (Phase 4).
 */

import type {
    DrawerStructureNodeKind,
    DrawerStructureSnapshot,
    RealRecordShadowValidationReport,
    ShadowConvergenceGap,
    ShadowCoverageBucket,
    ShadowParityCoverageMetrics,
    ShadowParityMismatch,
    ShadowParityReport,
    MigrationReadinessAssessment,
} from "./drawerStructureSnapshot";

function bucket(matched: number, total: number): ShadowCoverageBucket {
    return {
        matched,
        total,
        percent: total > 0 ? Math.round((matched / total) * 100) : 100,
    };
}

function nodesByKind(snapshot: DrawerStructureSnapshot, kind: DrawerStructureNodeKind) {
    return snapshot.nodes.filter((n) => n.kind === kind);
}

function bindingClassMetrics(
    layout: DrawerStructureSnapshot,
    vm: DrawerStructureSnapshot,
): Record<string, ShadowCoverageBucket> {
    const layoutByClass = new Map<string, string[]>();
    for (const n of layout.nodes) {
        if (!n.bindingClass) continue;
        const arr = layoutByClass.get(n.bindingClass) ?? [];
        arr.push(n.refKey ?? n.key);
        layoutByClass.set(n.bindingClass, arr);
    }

    const vmFieldRefs = new Set(nodesByKind(vm, "field").map((n) => n.refKey ?? n.key));
    const vmWidgets = new Set(nodesByKind(vm, "widget").map((n) => n.key));
    const vmRepeaters = new Set(nodesByKind(vm, "repeater").map((n) => n.key));

    const out: Record<string, ShadowCoverageBucket> = {};
    for (const [bindingClass, refs] of layoutByClass) {
        let matched = 0;
        for (const ref of refs) {
            if (bindingClass === "widget" && vmWidgets.has(ref.split(".")[0] ?? ref)) matched += 1;
            else if (bindingClass === "repeater" && (vmRepeaters.has(ref) || vmRepeaters.has("inquiry_children"))) matched += 1;
            else if (vmFieldRefs.has(ref)) matched += 1;
            else if (bindingClass === "relationship_field" || bindingClass === "reference_field") matched += 0;
            else if (bindingClass === "computed_projection") matched += 0;
            else if (vmFieldRefs.has(ref.replace(/^opportunity\./, ""))) matched += 1;
        }
        out[bindingClass] = bucket(matched, refs.length);
    }
    return out;
}

function gapImpact(category: ShadowParityMismatch["category"]): ShadowConvergenceGap["impact"] {
    if (category.includes("section") || category.includes("repeater")) return "high";
    if (category.includes("field") || category.includes("relationship")) return "medium";
    return "low";
}

function buildTopGaps(mismatches: ShadowParityMismatch[], unsupported: string[], unmapped: string[]): ShadowConvergenceGap[] {
    const gaps: ShadowConvergenceGap[] = mismatches.map((m) => ({
        category: m.category,
        key: m.vmKey ?? m.layoutKey ?? m.category,
        detail: m.detail,
        impact: gapImpact(m.category),
    }));

    for (const key of unsupported) {
        gaps.push({
            category: "unsupported_binding",
            key,
            detail: `Layout binding not yet represented on VM drawer: ${key}`,
            impact: "medium",
        });
    }

    for (const key of unmapped) {
        gaps.push({
            category: "unmapped_vm",
            key,
            detail: `VM structure has no layout alias mapping: ${key}`,
            impact: "high",
        });
    }

    const order = { high: 0, medium: 1, low: 2 };
    return gaps.sort((a, b) => order[a.impact] - order[b.impact]).slice(0, 10);
}

function assessReadiness(
    parityScore: number,
    fieldCoveragePercent: number,
    blockers: string[],
): MigrationReadinessAssessment {
    let level: MigrationReadinessAssessment["level"] = "not_ready";
    const notes: string[] = [];

    if (parityScore >= 95 && fieldCoveragePercent >= 85) {
        level = "ready";
        notes.push("Structural parity sufficient for controlled org pilot.");
    } else if (parityScore >= 80 && fieldCoveragePercent >= 65) {
        level = "approaching";
        notes.push("Major sections align; remaining gaps are mostly tabs and field-level drift.");
    } else if (parityScore >= 50) {
        level = "partial";
        notes.push("Core overview sections partially align; significant migration work remains.");
    } else {
        notes.push("Layout runtime does not yet cover most VM drawer structure.");
    }

    notes.push("Shadow-only — no production cutover implied.");

    return { level, parityScore, fieldCoveragePercent, blockers, notes };
}

export type EnrichShadowParityInput = {
    base: ShadowParityReport;
    vm: DrawerStructureSnapshot;
    layout: DrawerStructureSnapshot;
    opportunityId: string;
    layoutSource?: string;
};

/** Enrich base parity report with Phase 4 coverage, gaps, and readiness metrics. */
export function enrichShadowParityReport(input: EnrichShadowParityInput): RealRecordShadowValidationReport {
    const { base, vm, layout, opportunityId } = input;

    const vmTabs = vm.tabs.length;
    const vmSections = nodesByKind(vm, "section").length;
    const vmFields = nodesByKind(vm, "field").length;
    const vmWidgets = nodesByKind(vm, "widget").length;
    const vmRel = nodesByKind(vm, "relationship_section").length;
    const vmRepeaters = nodesByKind(vm, "repeater").length;

    const coverage: ShadowParityCoverageMetrics = {
        overall: base.parityScore,
        tabs: bucket(base.matched.tabs.length, vmTabs),
        sections: bucket(base.matched.sections.length, vmSections),
        fields: bucket(base.matched.fields.length, vmFields),
        widgets: bucket(base.matched.widgets.length, vmWidgets),
        relationship_sections: bucket(base.matched.relationship_sections.length, vmRel),
        repeaters: bucket(base.matched.repeaters.length, vmRepeaters),
        binding_classes: bindingClassMetrics(layout, vm),
    };

    const unsupported = Object.entries(coverage.binding_classes)
        .filter(([cls, b]) => (cls === "computed_projection" || cls === "reference_field") && b.percent < 100)
        .map(([cls]) => cls);

    const unmapped = base.missingCoverage.vmOnly.filter(
        (k) => !base.mismatches.some((m) => m.vmKey === k && m.category === "section_missing_in_layout"),
    );

    const extra = base.missingCoverage.layoutOnly;

    const blockers = [
        ...new Set(
            base.mismatches
                .filter((m) => m.category.includes("section") || m.category.includes("repeater"))
                .map((m) => m.vmKey ?? m.layoutKey ?? m.category),
        ),
    ].slice(0, 5);

    const readiness = assessReadiness(base.parityScore, coverage.fields.percent, blockers);

    return {
        ...base,
        opportunityId,
        layoutSource: input.layoutSource ?? base.layoutSource,
        coverage,
        topGaps: buildTopGaps(base.mismatches, unsupported, unmapped.slice(0, 5)),
        unmapped,
        unsupported,
        extra,
        readiness,
        summary: `${base.summary} Readiness: ${readiness.level} (field coverage ${coverage.fields.percent}%).`,
    };
}

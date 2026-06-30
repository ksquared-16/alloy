"use client";

import { useMemo } from "react";

import "@/app/adminV2/components/alloyOsRuntime.css";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelPublishedLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/**
 * Dev harness (no auth) for the RUNTIME published Focus Panel grid — the exact
 * `FocusPanelCardGrid` + `publishedLayout` path the operator `/workspace/work-unit`
 * route renders. It feeds the canonical authored layout (Household/Children left,
 * Readiness/Current Work right) so the "published → runtime visual fit" can be verified
 * without the gated work-unit route.
 */

/** Canonical authored grid: column-regular → must compose into two continuous lanes. */
const CANONICAL_LAYOUT: FocusPanelPublishedLayout = {
    rows: [
        { cells: [{ width: "twoThirds", cards: ["household"] }, { width: "third", cards: ["readiness_kpi"] }] },
        { cells: [{ width: "twoThirds", cards: ["children"] }, { width: "third", cards: ["current_work"] }] },
    ],
};

export default function FocusPanelPublishedRuntimeDevClient() {
    const { vm, record } = useMemo(() => buildDemoFocusPanelSummaryViewModel(), []);
    const cards = useMemo(
        () =>
            deriveOpportunityFocusPanelPresentation({
                mode: "summary",
                displayVm: vm,
                record,
                title: vm.header.title,
                perspective: null,
                statusLabel: "Tour scheduled",
            }).cards,
        [vm, record],
    );
    const context = useMemo(
        () =>
            buildOperationalContext({
                subjectId: String(vm.entity.id),
                title: vm.header.title,
                subjectVm: vm,
                truth: record,
                perspective: null,
                statusLabel: "Tour scheduled",
                canMutate: false,
            }),
        [vm, record],
    );

    const renderCell = (key: string) => {
        const model = cards.get(key as FocusPanelCardKey);
        if (!model) return null;
        return (
            <FocusPanelCardRenderer
                model={model}
                context={context}
                focusPanelMode="summary"
                compat={{ subjectVm: vm, onSelectTab: () => {} }}
            />
        );
    };

    const Surface = ({ label, width }: { label: string; width: number | string }) => (
        <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#475569", margin: "0 0 8px" }}>{label}</p>
            <div
                className="alloy-os-runtime"
                style={{ width, maxWidth: "100%", background: "#fff", border: "1px solid #e5e9ef", borderRadius: 12, padding: 16, boxSizing: "border-box" }}
                data-dev-surface={typeof width === "number" ? width : "fluid"}
            >
                <FocusPanelCardGrid rows={[]} renderCell={renderCell} publishedLayout={CANONICAL_LAYOUT} />
            </div>
        </div>
    );

    return (
        <div style={{ background: "#f4f6f9", minHeight: "100vh", padding: 40, boxSizing: "border-box" }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Runtime published Focus Panel — visual fit</h1>
            <p style={{ fontSize: 13, color: "#475569", margin: "0 0 24px", maxWidth: 820 }}>
                The real <code>FocusPanelCardGrid</code> published path (what <code>/workspace/work-unit</code> renders),
                fed the canonical authored layout. It must compose into two continuous lanes that fill the surface — no
                floating islands, no dead whitespace — and collapse to a single readable column when narrow.
            </p>
            <Surface label="Work-unit width (≈960px) — composed two-lane surface" width={960} />
            <Surface label="Wide (≈1180px)" width={1180} />
            <Surface label="Narrow (≈460px) — collapses to one column" width={460} />
        </div>
    );
}

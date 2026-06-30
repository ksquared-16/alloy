"use client";

import { useMemo, useState } from "react";

import "@/app/adminV2/components/alloyOsRuntime.css";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import FocusPanelGridCanvasBuilder from "@/components/admin/focusPanel/FocusPanelGridCanvasBuilder";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    type FocusPanelGridLayout,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import { buildPublishedLayoutFromGrid } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";

/** The brief's validation layouts (12-col grid placement; vertical spans present). */
const LAYOUT_A: FocusPanelGridLayout = {
    columns: 12,
    areas: [
        { card: "household", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 2 },
        { card: "readiness_kpi", colStart: 9, colSpan: 4, rowStart: 1, rowSpan: 1 },
        { card: "current_work", colStart: 9, colSpan: 4, rowStart: 2, rowSpan: 1 },
        { card: "children", colStart: 1, colSpan: 8, rowStart: 3, rowSpan: 1 },
    ],
};
const LAYOUT_B: FocusPanelGridLayout = {
    columns: 12,
    areas: [
        { card: "household", colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1 },
        { card: "children", colStart: 1, colSpan: 7, rowStart: 2, rowSpan: 2 },
        { card: "readiness_kpi", colStart: 8, colSpan: 5, rowStart: 2, rowSpan: 1 },
        { card: "current_work", colStart: 8, colSpan: 5, rowStart: 3, rowSpan: 1 },
    ],
};
const LAYOUT_C: FocusPanelGridLayout = {
    columns: 12,
    areas: [
        { card: "current_work", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 1 },
        { card: "household", colStart: 1, colSpan: 8, rowStart: 2, rowSpan: 1 },
        { card: "children", colStart: 1, colSpan: 8, rowStart: 3, rowSpan: 1 },
        { card: "readiness_kpi", colStart: 9, colSpan: 4, rowStart: 1, rowSpan: 3 },
    ],
};

const CATALOG: { key: FocusPanelCardKey; label: string }[] = [
    { key: "household", label: "Household" },
    { key: "children", label: "Children" },
    { key: "readiness_kpi", label: "Readiness" },
    { key: "current_work", label: "Current Work" },
];

export default function GridCanvasBuilderDevClient() {
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

    const renderCard = (key: FocusPanelCardKey) => {
        const model = cards.get(key);
        if (!model) return null;
        return <FocusPanelCardRenderer model={model} context={context} focusPanelMode="summary" compat={{ subjectVm: vm, onSelectTab: () => {} }} />;
    };

    const [selected, setSelected] = useState<FocusPanelCardKey | null>(null);
    const [published, setPublished] = useState<FocusPanelPublishedLayout>(buildPublishedLayoutFromGrid(LAYOUT_C));

    const Runtime = ({ label, grid }: { label: string; grid: FocusPanelGridLayout }) => (
        <div style={{ marginBottom: 26 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#475569", margin: "0 0 8px" }}>{label}</p>
            <div className="alloy-os-runtime" style={{ width: 1040, maxWidth: "100%", background: "#fff", border: "1px solid #e5e9ef", borderRadius: 12, boxSizing: "border-box" }} data-dev-surface={label.slice(0, 1)}>
                <FocusPanelCardGrid rows={[]} renderCell={(k) => renderCard(k as FocusPanelCardKey)} publishedLayout={buildPublishedLayoutFromGrid(grid)} />
            </div>
        </div>
    );

    return (
        <div style={{ background: "#f4f6f9", minHeight: "100vh", padding: 40, boxSizing: "border-box" }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Experience Builder V5 — responsive grid canvas</h1>
            <p style={{ fontSize: 13, color: "#475569", margin: "0 0 22px", maxWidth: 860 }}>
                The builder thinks in REGIONS, not rows. Drag to move (snaps to grid), drag the right/bottom edge to span
                columns/rows. The runtime below renders the SAME published grid — vertical spans and independent regions
                included. Resize the window to see responsive collapse.
            </p>

            <div style={{ maxWidth: 1040 }} data-builder-region>
                <FocusPanelGridCanvasBuilder
                    initialGrid={LAYOUT_C}
                    catalog={CATALOG}
                    renderCard={renderCard}
                    onChange={setPublished}
                    onSelectCard={setSelected}
                    selectedCard={selected}
                />
                <p style={{ fontSize: 12, color: "#2f6f4f", marginTop: 10 }} data-builder-areas={published.grid?.areas.length ?? 0}>
                    ✓ Authored grid → {published.grid?.areas.length ?? 0} regions · selected: {selected ?? "none"}
                </p>
            </div>

            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "34px 0 14px" }}>Runtime renders the published grid (identical model)</h2>
            <Runtime label="A · Household spans 2 rows · Readiness/Work stacked right" grid={LAYOUT_A} />
            <Runtime label="B · Household banner · Children spans 2 rows · Readiness/Work right" grid={LAYOUT_B} />
            <Runtime label="C · Readiness spans 3 rows beside Current Work / Household / Children" grid={LAYOUT_C} />
        </div>
    );
}

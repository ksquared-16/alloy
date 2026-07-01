"use client";

import { useEffect, useMemo } from "react";

import "@/app/adminV2/components/alloyOsRuntime.css";

import { focusPanelDomChain } from "@/lib/adminV2/runtime/focusPanel/debug/focusPanelDomChain";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import OpportunityFocusPanelModeGrid from "@/components/admin/focusPanel/OpportunityFocusPanelModeGrid";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { CompositionCardInput } from "@/lib/adminV2/runtime/focusPanel/composition/composeFocusPanelSurface";
import type { FocusPanelPublishedLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/**
 * Dev harness (no auth) for the RUNTIME Focus Panel at the real work-unit width.
 * Renders BOTH the published-layout path AND the real `OpportunityFocusPanelModeGrid`
 * (summary), which exercises the composition path when no published layout is present —
 * the path the live `/workspace/work-unit` route actually uses for the default doc.
 */

const CANONICAL_LAYOUT: FocusPanelPublishedLayout = {
    rows: [
        { cells: [{ width: "twoThirds", cards: ["household"] }, { width: "third", cards: ["readiness_kpi"] }] },
        { cells: [{ width: "twoThirds", cards: ["children"] }, { width: "third", cards: ["current_work"] }] },
    ],
};

/** Proportion fixtures — runtime must fill the row in each ratio (flex-grow = units). */
const RATIO_3_1: FocusPanelPublishedLayout = {
    rows: [{ cells: [{ width: "threeQuarters", cards: ["household"] }, { width: "quarter", cards: ["readiness_kpi"] }] }],
};
const RATIO_2_1_1: FocusPanelPublishedLayout = {
    rows: [{ cells: [{ width: "half", cards: ["household"] }, { width: "quarter", cards: ["children"] }, { width: "quarter", cards: ["readiness_kpi"] }] }],
};
const STACKED: FocusPanelPublishedLayout = {
    rows: [{ cells: [{ width: "twoThirds", cards: ["household", "children"] }, { width: "third", cards: ["readiness_kpi", "current_work"] }] }],
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

    const composeCards = useMemo<CompositionCardInput[]>(
        () => (["household", "children", "readiness_kpi", "current_work"] as FocusPanelCardKey[]).map((key) => ({ key, typeKey: key })),
        [],
    );

    // Expose the DOM-chain diagnostic for the gated live route (paste-able snippet).
    useEffect(() => {
        (window as unknown as { __focusPanelDomChain?: typeof focusPanelDomChain }).__focusPanelDomChain = focusPanelDomChain;
    }, []);

    const Frame = ({ label, width, children }: { label: string; width: number; children: React.ReactNode }) => (
        <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#475569", margin: "0 0 8px" }}>{label}</p>
            {/* Mimic the work-unit work-surface column: the Focus Panel fills this width. */}
            <div className="alloy-os-runtime" style={{ width, maxWidth: "100%", background: "#fff", border: "1px solid #e5e9ef", borderRadius: 12, boxSizing: "border-box" }} data-dev-surface={width}>
                {children}
            </div>
        </div>
    );

    return (
        <div style={{ background: "#f4f6f9", minHeight: "100vh", padding: 40, boxSizing: "border-box" }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Runtime Focus Panel — work-unit width parity</h1>
            <p style={{ fontSize: 13, color: "#475569", margin: "0 0 24px", maxWidth: 820 }}>
                The real runtime at the live work-unit width (~1040px). Lanes must fill the surface — no center
                whitespace, no tiny islands — in BOTH the published-layout path and the composition default path.
            </p>

            <Frame label="A · Published-layout path (operator authored) @ 1040px" width={1040}>
                <FocusPanelCardGrid rows={[]} renderCell={renderCell} publishedLayout={CANONICAL_LAYOUT} />
            </Frame>

            <Frame label="B · Composition default path (no published layout) @ 1040px" width={1040}>
                <FocusPanelCardGrid rows={[]} renderCell={renderCell} composeCards={composeCards} />
            </Frame>

            <Frame label="D · 3:1 proportion (threeQuarters : quarter) @ 1040px" width={1040}>
                <FocusPanelCardGrid rows={[]} renderCell={renderCell} publishedLayout={RATIO_3_1} />
            </Frame>

            <Frame label="E · 2:1:1 proportion (half : quarter : quarter) @ 1040px" width={1040}>
                <FocusPanelCardGrid rows={[]} renderCell={renderCell} publishedLayout={RATIO_2_1_1} />
            </Frame>

            <Frame label="F · Stacked cards inside lanes (Household+Children | Readiness+Current Work) @ 1040px" width={1040}>
                <FocusPanelCardGrid rows={[]} renderCell={renderCell} publishedLayout={STACKED} />
            </Frame>

            <Frame label="G · Responsive collapse @ 460px (single column)" width={460}>
                <FocusPanelCardGrid rows={[]} renderCell={renderCell} publishedLayout={CANONICAL_LAYOUT} />
            </Frame>

            <Frame label="C · Real OpportunityFocusPanelModeGrid (summary) @ 1040px" width={1040}>
                <OpportunityFocusPanelModeGrid
                    mode="summary"
                    displayVm={vm}
                    drawerId={String(vm.entity.id)}
                    record={record}
                    title={vm.header.title}
                    perspective={null}
                    statusLabel="Tour scheduled"
                    canMutate={false}
                    onSelectTab={() => {}}
                />
            </Frame>
        </div>
    );
}

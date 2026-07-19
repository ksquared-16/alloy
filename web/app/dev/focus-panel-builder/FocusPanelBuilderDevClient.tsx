"use client";

import { useMemo, useState } from "react";

import "@/app/adminV2/components/alloyOsRuntime.css";

import FocusPanelRowLayoutBuilder from "@/components/admin/focusPanel/FocusPanelRowLayoutBuilder";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    addCardToRow,
    addRow,
    emptyLayout,
    stackCardInCell,
    withPublishedLayoutMetadata,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayoutOps";
import {
    readFocusPanelPublishedLayout,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/**
 * Dev harness (no auth) for the row-based Experience Builder. Renders the production
 * builder + the real card components in the preview, so the builder UX and the
 * "published layout drives runtime" loop are screenshot-able without the gated
 * settings route.
 */

const CATALOG: { key: FocusPanelCardKey; label: string }[] = [
    { key: "household", label: "Household" },
    { key: "children", label: "Children" },
    { key: "readiness_kpi", label: "Readiness" },
    { key: "current_work", label: "Current Work" },
];

/** Seed layout: Household left, Readiness + Current Work stacked right; Children full. */
function seedLayout(): FocusPanelPublishedLayout {
    let l = addRow(emptyLayout());
    l = addCardToRow(l, 0, "household", "1/2");
    l = addCardToRow(l, 0, "readiness_kpi", "1/2");
    l = stackCardInCell(l, 0, 1, "current_work");
    l = addRow(l);
    l = addCardToRow(l, 1, "children", "full");
    return l;
}

export default function FocusPanelBuilderDevClient() {
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
        return (
            <FocusPanelCardRenderer
                model={model}
                context={context}
                focusPanelMode="summary"
                compat={{ onSelectTab: () => {} }}
            />
        );
    };

    // Simulate the publish → doc metadata → runtime read loop locally.
    const [publishedDocMeta, setPublishedDocMeta] = useState<Record<string, unknown> | null>(null);
    const publishedReadBack = publishedDocMeta ? readFocusPanelPublishedLayout({ metadata: publishedDocMeta }) : null;

    return (
        <div
            className="alloy-os-runtime"
            style={{ background: "#f4f6f9", minHeight: "100vh", padding: "40px", width: 1200, maxWidth: "100%", flexShrink: 0, boxSizing: "border-box" }}
        >
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Experience Builder — row-based composition</h1>
            <p style={{ fontSize: 13, color: "#475569", margin: "0 0 20px", maxWidth: 880 }}>
                Compose the Focus Panel with rows and columns. Set each card&apos;s width with plain fractions; stack two cards in
                one column for the &quot;Household left, Readiness + Current Work stacked right&quot; pattern. The preview is the real
                runtime grid fed the same published layout.
            </p>
            <FocusPanelRowLayoutBuilder
                initialLayout={seedLayout()}
                catalog={CATALOG}
                renderCard={renderCard}
                onPublish={(layout) => setPublishedDocMeta(withPublishedLayoutMetadata(null, layout))}
            />
            {publishedReadBack ? (
                <p style={{ fontSize: 12, color: "#2f6f4f", marginTop: 16 }} data-builder-published-rows={publishedReadBack.rows.length}>
                    ✓ Published — runtime reads {publishedReadBack.rows.length} row(s) back from doc metadata.
                </p>
            ) : null}
        </div>
    );
}

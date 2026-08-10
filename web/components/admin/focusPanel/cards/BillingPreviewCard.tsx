"use client";

import { useMemo, useState, useEffect } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    buildBillingPreviewCardEvidence,
    type BillingPlacementFact,
} from "@/lib/adminV2/runtime/focusPanel/billingPreview/buildBillingPreviewCardEvidence";
import { readFinancialNestedSurfaceGroupsFromDoc } from "@/lib/adminV2/runtime/focusPanel/billingPreview/financialNestedSurfaceRuntime";
import { usePublishedFocusPanelSummaryDoc } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import { useFinancialConfig } from "@/lib/adminV2/runtime/focusPanel/financialConfig/useFinancialConfig";
import type { FinancialConfigEnrollment } from "@/lib/adminV2/runtime/focusPanel/financialConfig/financialConfigTypes";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
    composerPreview?: { perspective?: "expanded" };
};

/**
 * Financial Configuration card (Truth/Detail archetype — System 5B Expand).
 * Answers "Is billing configured and ready for this enrollment?"
 *
 * Expanded view: centered Focus Card with depth scrim (same pattern as Household
 * and Children). Shows billing readiness checklist, per-child tuition placement
 * rows, and billing responsibility missing-state. NOT an inline overlay.
 *
 * @see docs/platform/operator/card-archetypes.md (Truth/Detail — System 5B)
 * @see docs/sprints/06_2026/focus-panel-card-expansion-doctrine
 */
export default function BillingPreviewCard({
    model,
    context,
    receded = false,
    coordination,
    composerPreview,
}: Props) {
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (composerPreview?.perspective === "expanded") setExpanded(true);
    }, [composerPreview]);

    const opportunityId = context.subject.type === "opportunity" ? context.subject.id : null;
    const { data: financialConfig, loading: configLoading } = useFinancialConfig(opportunityId, expanded);
    const publishedDoc = usePublishedFocusPanelSummaryDoc(true);

    const evidence = useMemo(
        () => buildBillingPreviewCardEvidence(context, financialConfig?.enrollments ?? null),
        [context, financialConfig],
    );

    const nestedSurfaceGroups = useMemo(
        () =>
            expanded
                ? readFinancialNestedSurfaceGroupsFromDoc(
                      publishedDoc,
                      context,
                      financialConfig?.enrollments ?? null,
                  )
                : null,
        [expanded, publishedDoc, context, financialConfig],
    );

    useReportPerspective(coordination, "billing_preview", expanded ? "focused" : "base");
    useDismissSignal(coordination, "billing_preview", () => setExpanded(false));

    const hasChecklist = evidence.readinessItems.length > 0;

    const footerAction = hasChecklist ? (
        expanded ? (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setExpanded(false)}
                data-billing-action="collapse"
            >
                ← Back to panel
            </button>
        ) : (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setExpanded(true)}
                data-billing-action="expand"
            >
                View configuration
            </button>
        )
    ) : null;

    const body = expanded ? (
        <div className="alloy-os-billing-preview__expanded" data-billing-expanded="true">
            {/* Billing configuration checklist */}
            <section className="alloy-os-financial-config__section">
                <h4 className="alloy-os-financial-config__section-heading">Billing configuration</h4>
                <ul className="alloy-os-ucard__check-list">
                    {evidence.readinessItems.map((item) => (
                        <li
                            key={item.label}
                            className={`alloy-os-ucard__check-item alloy-os-ucard__check-item--${item.met ? "met" : "unmet"}`}
                        >
                            <span className="alloy-os-ucard__check-indicator">
                                {item.met ? "✓" : "○"}
                            </span>
                            <span className="alloy-os-ucard__check-label">{item.label}</span>
                            {item.detail && (
                                <span className="alloy-os-ucard__check-detail">{item.detail}</span>
                            )}
                        </li>
                    ))}
                </ul>
                {evidence.balanceLabel && (
                    <p className="alloy-os-ucard__balance-line">{evidence.balanceLabel}</p>
                )}
            </section>

            {/* Published nested-surface groups (metadata.nestedSurfaces["financial_configuration_surface"]) */}
            {nestedSurfaceGroups?.map((group) => (
                <section
                    key={group.key}
                    className="alloy-os-financial-config__section"
                    data-financial-nested-group={group.key}
                >
                    <h4 className="alloy-os-financial-config__section-heading">{group.label}</h4>
                    <ul className="alloy-os-financial-config__nested-fields" data-financial-nested-fields={group.key}>
                        {group.fields.map((field) => (
                            <li key={field.key} className="alloy-os-financial-config__nested-field" data-financial-nested-field={field.key}>
                                <span className="alloy-os-financial-config__nested-field-label">{field.label}</span>
                                <span className="alloy-os-financial-config__nested-field-value">{field.value}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}

            {/* Placement & tuition — placement from truth, rates from financial-config API */}
            {evidence.placementFacts.length > 0 && (
                <section className="alloy-os-financial-config__section">
                    <h4 className="alloy-os-financial-config__section-heading">Placement &amp; tuition</h4>
                    {configLoading ? (
                        <p className="alloy-os-financial-config__loading">Loading rates…</p>
                    ) : (
                        <ul className="alloy-os-financial-config__placement-list">
                            {evidence.placementFacts.map((fact, i) => {
                                const enrollment = findEnrollmentForFact(
                                    fact,
                                    evidence.enrollments,
                                    i,
                                );
                                return (
                                    <li key={fact.childLabel + i} className="alloy-os-financial-config__placement-row">
                                        <span className="alloy-os-financial-config__child-label">{fact.childLabel}</span>
                                        <PlacementDetail fact={fact} />
                                        <TuitionRateDetail enrollment={enrollment} hasApiData={evidence.enrollments !== null} />
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            )}

            {/* Billing responsibility — missing-state until write path */}
            <section className="alloy-os-financial-config__section">
                <h4 className="alloy-os-financial-config__section-heading">Billing responsibility</h4>
                {evidence.responsibilityConfigured ? null : (
                    <p className="alloy-os-financial-config__missing-state">
                        Billing responsibility not configured.
                    </p>
                )}
            </section>
        </div>
    ) : null;

    const density = expanded ? "expanded" : (model.density ?? "compact");

    return (
        <div
            className="alloy-os-billing-preview"
            data-billing-card="true"
            data-billing-card-perspective={expanded ? "expanded" : "compact"}
        >
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={expanded ? null : evidence.supportingLine}
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                statusChip={evidence.statusChip}
                statusTone={evidence.statusTone}
                density={density}
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={footerAction}
            >
                {body}
            </UniversalCard>
        </div>
    );
}

function findEnrollmentForFact(
    fact: BillingPlacementFact,
    enrollments: FinancialConfigEnrollment[] | null,
    index: number,
): FinancialConfigEnrollment | null {
    if (!enrollments) return null;
    const byLabel = enrollments.filter((e) => e.childLabel === fact.childLabel);
    if (byLabel.length === 1) return byLabel[0] ?? null;
    return enrollments[index] ?? null;
}

function PlacementDetail({ fact }: { fact: BillingPlacementFact }) {
    const parts = [fact.programLabel, fact.roomLabel, fact.scheduleLabel].filter(Boolean);
    if (parts.length === 0) return <span className="alloy-os-financial-config__placement-detail">—</span>;
    return (
        <span className="alloy-os-financial-config__placement-detail">
            {parts.join(" · ")}
        </span>
    );
}

function TuitionRateDetail({
    enrollment,
    hasApiData,
}: {
    enrollment: FinancialConfigEnrollment | null;
    hasApiData: boolean;
}) {
    if (!hasApiData) return null;
    if (!enrollment) {
        return (
            <span className="alloy-os-financial-config__tuition-rate alloy-os-financial-config__tuition-rate--missing">
                No match
            </span>
        );
    }
    if (!enrollment.resolvedRate) {
        return (
            <span className="alloy-os-financial-config__tuition-rate alloy-os-financial-config__tuition-rate--missing">
                Rate not configured
            </span>
        );
    }
    return (
        <span className="alloy-os-financial-config__tuition-rate">
            {enrollment.resolvedRate.rateLabel}
            {enrollment.resolvedRate.isLocationOverride && (
                <span className="alloy-os-financial-config__tuition-override"> (site rate)</span>
            )}
        </span>
    );
}

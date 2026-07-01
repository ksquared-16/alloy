"use client";

import { useMemo, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardInlineOverlay from "@/components/admin/focusPanel/cards/CardInlineOverlay";
import {
    buildBillingPreviewCardEvidence,
    type BillingPlacementFact,
} from "@/lib/adminV2/runtime/focusPanel/billingPreview/buildBillingPreviewCardEvidence";
import { useFinancialConfig } from "@/lib/adminV2/runtime/focusPanel/financialConfig/useFinancialConfig";
import type { FinancialConfigEnrollment } from "@/lib/adminV2/runtime/focusPanel/financialConfig/financialConfigTypes";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
};

/**
 * Financial Configuration card (Status archetype).
 * Answers "Is billing configured and ready for this enrollment?"
 *
 * Follows the Operational Configuration Card Pattern:
 *   Placement facts → Configuration → Readiness → Activity/History
 *
 * Summary: configured/not-configured chip + tuition rate + billing contact.
 * Expanded: billing readiness checklist + per-child tuition rate resolution
 *           (lazy-fetched from financial-config API) + missing-state responsibility section.
 *
 * Read-only — no mutation prop. Pure over context.signals.billing + context.truth.
 * Tuition rate resolution requires a server query (commercial_tuition_rates table).
 *
 * @see docs/platform/operator/operational-configuration-card-pattern.md
 */
export default function BillingPreviewCard({ model, context, receded = false }: Props) {
    const [overlayOpen, setOverlayOpen] = useState(false);

    const opportunityId = context.subject.type === "opportunity" ? context.subject.id : null;
    const { data: financialConfig, loading: configLoading } = useFinancialConfig(opportunityId, overlayOpen);

    const evidence = useMemo(
        () => buildBillingPreviewCardEvidence(context, financialConfig?.enrollments ?? null),
        [context, financialConfig],
    );

    const hasChecklist = evidence.readinessItems.length > 0;

    const footerAction = hasChecklist ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setOverlayOpen((v) => !v)}
            aria-expanded={overlayOpen}
        >
            {overlayOpen ? "Hide details" : "View configuration →"}
        </button>
    ) : null;

    return (
        <div
            className="alloy-os-billing-preview"
            data-billing-card="true"
            data-fp-overlay-open={overlayOpen ? "true" : undefined}
        >
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={evidence.supportingLine}
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                statusChip={evidence.statusChip}
                statusTone={evidence.statusTone}
                density={model.density}
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={footerAction}
            />
            <CardInlineOverlay
                open={overlayOpen && hasChecklist}
                onClose={() => setOverlayOpen(false)}
                title="Financial Configuration"
                dataOverlay="billing-readiness"
            >
                {/* Billing configuration section */}
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

                {/* Placement & tuition section — placement from truth, rates from API */}
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

                {/* Billing responsibility — missing-state until write path is built */}
                <section className="alloy-os-financial-config__section">
                    <h4 className="alloy-os-financial-config__section-heading">Billing responsibility</h4>
                    {evidence.responsibilityConfigured ? null : (
                        <p className="alloy-os-financial-config__missing-state">
                            Billing responsibility not configured.
                        </p>
                    )}
                </section>
            </CardInlineOverlay>
        </div>
    );
}

/**
 * Match a placement fact to an enrollment by child label.
 * Falls back to index when multiple children share a label (rare).
 */
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

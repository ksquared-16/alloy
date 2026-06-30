"use client";

import { useMemo, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardInlineOverlay from "@/components/admin/focusPanel/cards/CardInlineOverlay";
import {
    buildBillingPreviewCardEvidence,
} from "@/lib/adminV2/runtime/focusPanel/billingPreview/buildBillingPreviewCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
};

/**
 * Billing Preview card (Status archetype). Answers "Is billing configured
 * and ready for this enrollment?".
 *
 * Summary: shows configured/not-configured status chip + tuition rate label.
 * Expanded: inline overlay lists the billing readiness checklist (billing
 * contact, tuition rate). Read-only — billing truth is owned by the billing
 * configuration workspace, not this card. Pure over `context.truth`.
 *
 * @see docs/platform/operator/universal-card-archetypes.md (Status)
 */
export default function BillingPreviewCard({ model, context, receded = false }: Props) {
    const evidence = useMemo(() => buildBillingPreviewCardEvidence(context), [context]);
    const [overlayOpen, setOverlayOpen] = useState(false);

    const hasChecklist = evidence.readinessItems.length > 0;

    const footerAction = hasChecklist ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setOverlayOpen((v) => !v)}
            aria-expanded={overlayOpen}
        >
            {overlayOpen ? "Hide checklist" : "View checklist →"}
        </button>
    ) : null;

    return (
        <div className="alloy-os-billing-preview" data-billing-card="true" data-fp-overlay-open={overlayOpen ? "true" : undefined}>
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
                title="Billing readiness"
                dataOverlay="billing-readiness"
            >
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
            </CardInlineOverlay>
        </div>
    );
}

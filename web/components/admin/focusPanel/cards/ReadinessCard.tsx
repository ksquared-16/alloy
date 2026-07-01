"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardInlineOverlay from "@/components/admin/focusPanel/cards/CardInlineOverlay";
import {
    buildReadinessCardEvidence,
    type ReadinessFactor,
} from "@/lib/adminV2/runtime/focusPanel/readiness/buildReadinessCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    /** Readiness emits cross-card handoffs to owner cards (it never edits). */
    coordination?: FocusPanelCoordination;
};

/**
 * Readiness operational card (Intelligence archetype). Answers "Is this family
 * ready to advance?". It is a DIAGNOSTIC card: it never becomes a centered Focus
 * Card. Collapsed, it shows the 2-second answer (verdict + gauge + a concise
 * status line). Deeper evidence (the factor checklist + owner pointers) appears as
 * a card-anchored INLINE OVERLAY that covers the card below WITHOUT moving the base
 * surface. Clicking an incomplete factor HANDS OFF to the card that OWNS that truth
 * (Children / Household). Pure derivation over the Operational Context — no fetch.
 *
 * @see docs/platform/operator/card-archetypes.md (Intelligence)
 * @see docs/sprints/06_2026/focus-panel-inline-overlay-finalization
 */
export default function ReadinessCard({ model, context, receded = false, coordination }: Props) {
    const evidence = useMemo(() => buildReadinessCardEvidence(context), [context]);
    const [overlayOpen, setOverlayOpen] = useState(false);

    // A diagnosis points to its OWNER card instead of editing locally. The overlay
    // closes as it hands off so it recedes cleanly behind the new Focus Card. With no
    // owner (a generic signal) the row is inert — Readiness never opens its own card.
    const handleFactor = (factor: ReadinessFactor) => {
        if (factor.status === "complete") return;
        if (factor.ownerCard && coordination) {
            setOverlayOpen(false);
            coordination.requestFocus(factor.ownerCard, factor.ownerFocus);
        }
    };

    // Alloy operational palette: blocked = red, ready = green, otherwise (almost) = amber.
    const gaugeTone =
        evidence.statusTone === "blocked" ? "risk"
        : evidence.statusTone === "ready" ? "positive"
        : "warning";

    const hasFactors = !evidence.isEmpty && evidence.factors.length > 0;

    // Collapsed body = the 2-second answer only: the gauge. No checklist by default.
    const body = evidence.isEmpty ? (
        <div className="alloy-os-household__summary" data-readiness-empty="true">
            <p className="alloy-os-household__row-detail">
                Add a primary contact and a child to score readiness
            </p>
        </div>
    ) : evidence.score != null ? (
        <div className="alloy-os-readiness__body" data-readiness-gauge>
            <Gauge value={evidence.score} tone={gaugeTone} />
        </div>
    ) : null;

    // The deeper view (factor checklist + owner pointers) lives in the inline overlay.
    const footerAction = hasFactors ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setOverlayOpen((v) => !v)}
            data-readiness-action="view"
            aria-expanded={overlayOpen}
        >
            View readiness →
        </button>
    ) : null;

    return (
        <div
            className="alloy-os-household alloy-os-readiness"
            data-readiness-card="true"
            data-readiness-card-perspective={evidence.isEmpty ? "empty" : "diagnostic"}
            data-readiness-verdict={evidence.verdict}
            data-fp-overlay-open={overlayOpen ? "true" : undefined}
        >
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={evidence.supportingLine}
                iconName={model.iconName}
                tier={model.tier}
                archetype="metric"
                statusChip={evidence.statusChip}
                statusTone={evidence.statusTone}
                density="compact"
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={footerAction}
            >
                {body}
            </UniversalCard>
            <CardInlineOverlay
                open={overlayOpen && hasFactors}
                onClose={() => setOverlayOpen(false)}
                title="Readiness"
                dataOverlay="readiness"
            >
                <div className="alloy-os-household__rows" data-readiness-checklist>
                    {evidence.factors.map((factor) => (
                        <FactorRow
                            key={factor.key}
                            factor={factor}
                            onFocus={
                                factor.status !== "complete" && factor.ownerCard
                                    ? () => handleFactor(factor)
                                    : undefined
                            }
                        />
                    ))}
                </div>
            </CardInlineOverlay>
        </div>
    );
}

function Gauge({ value, tone }: { value: number; tone: "risk" | "positive" | "warning" }) {
    return (
        <div className="alloy-os-gauge" data-tone={tone} data-readiness-score={value}>
            <div className="alloy-os-gauge__track">
                <div className="alloy-os-gauge__fill" style={{ width: `${value}%` }} />
            </div>
            <span className="alloy-os-gauge__value">{value}%</span>
        </div>
    );
}

function factorTone(status: ReadinessFactor["status"]): "positive" | "risk" | "work" {
    if (status === "complete") return "positive";
    if (status === "blocked") return "risk";
    return "work";
}

function factorLead(status: ReadinessFactor["status"]): string {
    if (status === "complete") return "✓";
    if (status === "blocked") return "✗";
    return "○";
}

const OWNER_LABEL: Record<string, string> = {
    household: "Household",
    children: "Children",
    current_work: "Current Work",
};

function FactorRow({ factor, onFocus }: { factor: ReadinessFactor; onFocus?: () => void }) {
    const tone = factorTone(factor.status);
    // A pointer hint only when the factor hands off to an owner card.
    const pointsTo = onFocus && factor.ownerCard ? OWNER_LABEL[factor.ownerCard] ?? null : null;
    const content = (
        <>
            <span
                className={clsx("alloy-os-household__avatar", `alloy-os-card-lead--${tone}`)}
                aria-hidden
            >
                {factorLead(factor.status)}
            </span>
            <span className="alloy-os-household__row-main min-w-0">
                <span className="alloy-os-household__row-name">{factor.label}</span>
                {factor.detail ? (
                    <span
                        className={clsx(
                            "alloy-os-household__row-detail",
                            tone === "risk" && "alloy-os-card-detail--risk",
                        )}
                    >
                        {factor.detail}
                    </span>
                ) : null}
            </span>
            {pointsTo ? (
                <span className="alloy-os-readiness__pointer" aria-hidden>
                    {pointsTo} →
                </span>
            ) : null}
        </>
    );
    if (onFocus) {
        return (
            <button
                type="button"
                className="alloy-os-household__row alloy-os-readiness__row"
                data-readiness-factor={factor.key}
                data-readiness-status={factor.status}
                onClick={onFocus}
            >
                {content}
            </button>
        );
    }
    return (
        <div
            className="alloy-os-household__row alloy-os-readiness__row"
            data-readiness-factor={factor.key}
            data-readiness-status={factor.status}
        >
            {content}
        </div>
    );
}

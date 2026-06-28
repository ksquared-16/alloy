"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    buildReadinessCardEvidence,
    type ReadinessFactor,
} from "@/lib/adminV2/runtime/focusPanel/readiness/buildReadinessCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
};

/**
 * Readiness operational card (Intelligence archetype). Answers "Is this family
 * ready to advance?". Overview shows the verdict + honest completion gauge;
 * Evidence reveals the contributing factor checklist; Focused shows one blocker.
 * Pure derivation over the Operational Context — no scoring fetch.
 *
 * @see docs/platform/operator/card-archetypes.md (Intelligence)
 */
export default function ReadinessCard({ model, context, receded = false }: Props) {
    const evidence = useMemo(() => buildReadinessCardEvidence(context), [context]);

    const [expanded, setExpanded] = useState(false);
    const [focusedKey, setFocusedKey] = useState<string | null>(null);

    const focused =
        !evidence.isEmpty && focusedKey
            ? evidence.factors.find((f) => f.key === focusedKey) ?? null
            : null;

    const density = !evidence.isEmpty && (expanded || focused) ? "expanded" : "compact";
    const gaugeTone =
        evidence.statusTone === "blocked" ? "risk"
        : evidence.statusTone === "ready" ? "positive"
        : "metric";

    const footerAction = evidence.isEmpty ? null : focused ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setFocusedKey(null)}
            data-readiness-action="back"
        >
            ← Readiness
        </button>
    ) : expanded ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setExpanded(false)}
            data-readiness-action="collapse"
        >
            Show less
        </button>
    ) : evidence.factors.length > 0 ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setExpanded(true)}
            data-readiness-action="expand"
        >
            View readiness →
        </button>
    ) : null;

    let body: React.ReactNode;
    let perspective: "collapsed" | "expanded" | "focused" | "empty";
    if (evidence.isEmpty) {
        perspective = "empty";
        body = (
            <div className="alloy-os-household__summary" data-readiness-empty="true">
                <p className="alloy-os-household__row-detail">
                    Add a primary contact and a child to score readiness
                </p>
            </div>
        );
    } else if (focused) {
        perspective = "focused";
        body = <FocusedFactor factor={focused} />;
    } else if (expanded) {
        perspective = "expanded";
        body = (
            <div className="alloy-os-readiness__body" data-readiness-checklist>
                {evidence.score != null ? <Gauge value={evidence.score} tone={gaugeTone} /> : null}
                <div className="alloy-os-household__rows">
                    {evidence.factors.map((factor) => (
                        <FactorRow
                            key={factor.key}
                            factor={factor}
                            onFocus={
                                factor.status !== "complete" ? () => setFocusedKey(factor.key) : undefined
                            }
                        />
                    ))}
                </div>
            </div>
        );
    } else {
        perspective = "collapsed";
        body =
            evidence.score != null ? (
                <div className="alloy-os-readiness__body" data-readiness-gauge>
                    <Gauge value={evidence.score} tone={gaugeTone} />
                </div>
            ) : null;
    }

    return (
        <div
            className="alloy-os-household alloy-os-readiness"
            data-readiness-card="true"
            data-readiness-card-perspective={perspective}
            data-readiness-verdict={evidence.verdict}
        >
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={perspective === "collapsed" ? evidence.supportingLine : null}
                iconName={model.iconName}
                tier={model.tier}
                archetype="metric"
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

function Gauge({ value, tone }: { value: number; tone: "risk" | "positive" | "metric" }) {
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

function FactorRow({ factor, onFocus }: { factor: ReadinessFactor; onFocus?: () => void }) {
    const tone = factorTone(factor.status);
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

function FocusedFactor({ factor }: { factor: ReadinessFactor }) {
    return (
        <div className="alloy-os-household__focused" data-readiness-focused={factor.key}>
            <div className="alloy-os-household__focused-header">
                <span className="alloy-os-household__group-title">{factor.label}</span>
            </div>
            <p className="alloy-os-household__row-detail">
                {factor.status === "blocked"
                    ? "This blocks advancing to enrolled."
                    : "This is still incomplete on the record."}
            </p>
            {factor.detail ? (
                <p className="alloy-os-household__row-detail">{factor.detail}</p>
            ) : null}
        </div>
    );
}

"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

import type { FocusPanelCardDensity, FocusPanelCardSpan } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import type { FocusPanelCardTier } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

export type UniversalCardProps = {
    title: string;
    insight: string;
    tier?: FocusPanelCardTier;
    statusChip?: ReactNode;
    statusTone?: "ready" | "blocked" | "at-risk" | "due" | "done" | "neutral";
    footerAction?: ReactNode;
    density?: FocusPanelCardDensity;
    gridSpan?: FocusPanelCardSpan;
    children?: ReactNode;
    className?: string;
    "data-universal-card-key"?: string;
    receded?: boolean;
};

const DENSITY_CLASS: Record<FocusPanelCardDensity, string> = {
    micro: "alloy-os-ucard--micro",
    compact: "alloy-os-ucard--compact",
    standard: "alloy-os-ucard--standard",
    expanded: "alloy-os-ucard--expanded",
};

const TIER_CLASS: Record<FocusPanelCardTier, string> = {
    attention: "alloy-os-ucard--tier-attention",
    work: "alloy-os-ucard--tier-work",
    context: "alloy-os-ucard--tier-context",
    reference: "alloy-os-ucard--tier-reference",
    historical: "alloy-os-ucard--tier-historical",
    metric: "alloy-os-ucard--tier-metric",
};

const STATUS_CLASS: Record<NonNullable<UniversalCardProps["statusTone"]>, string> = {
    ready: "alloy-os-ucard__status--ready",
    blocked: "alloy-os-ucard__status--blocked",
    "at-risk": "alloy-os-ucard__status--at-risk",
    due: "alloy-os-ucard__status--due",
    done: "alloy-os-ucard__status--done",
    neutral: "alloy-os-ucard__status--neutral",
};

/**
 * Platform Universal Card shell — one business question, meaning-first insight, optional drill body.
 */
export default function UniversalCard({
    title,
    insight,
    tier = "context",
    statusChip,
    statusTone = "neutral",
    footerAction,
    density = "compact",
    gridSpan,
    children,
    className,
    "data-universal-card-key": cardKey,
    receded = false,
}: UniversalCardProps) {
    const hasBody = children != null && children !== false;
    const isMicro = density === "micro";

    return (
        <article
            className={clsx(
                "alloy-os-ucard",
                DENSITY_CLASS[density],
                TIER_CLASS[tier],
                receded && "alloy-os-ucard--receded",
                className,
            )}
            data-universal-card="true"
            data-universal-card-density={density}
            data-universal-card-tier={tier}
            data-universal-card-span={gridSpan ?? undefined}
            data-universal-card-key={cardKey}
        >
            <header className="alloy-os-ucard__header">
                <div className="alloy-os-ucard__header-text min-w-0">
                    <div className="alloy-os-ucard__header-row">
                        <h3 className="alloy-os-ucard__title">{title}</h3>
                        {statusChip ?
                            <span
                                className={clsx("alloy-os-ucard__status", STATUS_CLASS[statusTone])}
                            >
                                {statusChip}
                            </span>
                        :   null}
                    </div>
                    {!isMicro ?
                        <p className="alloy-os-ucard__insight">{insight}</p>
                    :   <p className="alloy-os-ucard__insight alloy-os-ucard__insight--metric">{insight}</p>}
                </div>
            </header>
            {hasBody ?
                <div className="alloy-os-ucard__body">{children}</div>
            :   null}
            {footerAction ?
                <footer className="alloy-os-ucard__footer">{footerAction}</footer>
            :   null}
        </article>
    );
}

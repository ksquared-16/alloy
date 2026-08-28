"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

import { formatFocusPanelChipLabelDisplay } from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";

import type { FocusPanelCardDensity, FocusPanelCardSpan } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import type { FocusPanelCardArchetype, FocusPanelCardTier } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { SYSTEM5_TIER_TO_ROLE } from "@/lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec";
import UniversalCardIcon from "@/components/admin/focusPanel/UniversalCardIcon";

export type { FocusPanelCardRole } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

export type UniversalCardProps = {
    title: string;
    insight: string;
    supportingInsight?: string | null;
    tier?: FocusPanelCardTier;
    archetype?: FocusPanelCardArchetype;
    iconName?: string | null;
    statusChip?: ReactNode;
    statusTone?: "ready" | "blocked" | "at-risk" | "due" | "done" | "neutral";
    footerAction?: ReactNode;
    density?: FocusPanelCardDensity;
    gridSpan?: FocusPanelCardSpan;
    children?: ReactNode;
    className?: string;
    "data-universal-card-key"?: string;
    receded?: boolean;
    /**
     * WHICH OF THE THREE ELEVATED SIZES this card takes when it is raised into the depth layer.
     *
     * The Focus Panel has exactly three intentional modal classes, and they are a property of what
     * the card IS, not of who opened it:
     *
     *   command      a focused mutation — Add charge, Add allergy. Smallest: a short form does not
     *                need a workstation, and a small card is what makes it read as a command.
     *   record       an entity's detail — Children, Household, Assignment. Medium.
     *   workstation  a working surface — Financials, Health, Attendance details. Largest, because a
     *                filtered ledger or a three-column record is the work, not a summary of it.
     *
     * Declared here rather than inferred from density so a card cannot end up in the wrong size by
     * accident: Add charge was reading as a workstation purely because `expanded` was the only way
     * into the elevated host.
     */
    modalClass?: "command" | "record" | "workstation";
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
    supportingInsight,
    tier = "context",
    archetype,
    iconName,
    statusChip,
    statusTone = "neutral",
    footerAction,
    density = "compact",
    modalClass,
    gridSpan,
    children,
    className,
    "data-universal-card-key": cardKey,
    receded = false,
}: UniversalCardProps) {
    const hasBody = children != null && children !== false;
    const isMicro = density === "micro";
    const isMetricArchetype = archetype === "metric";
    const isActionArchetype = archetype === "action";
    const cardRole = SYSTEM5_TIER_TO_ROLE[tier];
    const showSupporting = Boolean(supportingInsight?.trim());

    return (
        <article
            className={clsx(
                "alloy-os-ucard",
                DENSITY_CLASS[density],
                TIER_CLASS[tier],
                archetype && `alloy-os-ucard--archetype-${archetype}`,
                isActionArchetype && "alloy-os-ucard--archetype-action-emphasis",
                receded && "alloy-os-ucard--receded",
                className,
            )}
            data-universal-card="true"
            data-universal-card-density={density}
            data-universal-card-modal={modalClass ?? undefined}
            data-universal-card-tier={tier}
            data-card-role={cardRole}
            data-card-archetype={archetype ?? undefined}
            data-system5-card="true"
            data-universal-card-span={gridSpan ?? undefined}
            data-universal-card-key={cardKey}
        >
            <header className="alloy-os-ucard__header">
                <UniversalCardIcon name={iconName ?? null} />
                <div className="alloy-os-ucard__header-text min-w-0">
                    <div className="alloy-os-ucard__header-row">
                        <h3 className="alloy-os-ucard__title">{title}</h3>
                        {statusChip ?
                            <span
                                className={clsx("alloy-os-ucard__status", STATUS_CLASS[statusTone])}
                            >
                                {typeof statusChip === "string"
                                    ? formatFocusPanelChipLabelDisplay(statusChip)
                                    :   statusChip}
                            </span>
                        :   null}
                    </div>
                    {!isMicro && insight ?
                        <p
                            className={clsx(
                                "alloy-os-ucard__insight",
                                isMetricArchetype && "alloy-os-ucard__insight--metric",
                            )}
                        >
                            {insight}
                        </p>
                    :   !isMicro ? null
                    :   <>
                            <p className="alloy-os-ucard__insight alloy-os-ucard__insight--metric">{insight}</p>
                            {showSupporting ?
                                <p className="alloy-os-ucard__supporting alloy-os-ucard__supporting--micro">{supportingInsight}</p>
                            :   null}
                        </>
                    }
                    {!isMicro && showSupporting ?
                        <p className="alloy-os-ucard__supporting">{supportingInsight}</p>
                    :   null}
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

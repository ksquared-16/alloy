"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

import CardAvatar from "@/components/admin/focusPanel/CardAvatar";

/**
 * Body idioms for the candidate cards, expressed in the REAL runtime classes measured on the
 * rendered Household, Children and What's Next cards.
 *
 * Nothing here invents a look. Four of these idioms are today namespaced to one card
 * (`alloy-os-currentwork__*`) although three cards already use them; the lab's review panel
 * records that promoting them to card-agnostic primitives is the prerequisite for these five
 * cards. Until then reusing the class is honest — it is the same CSS the operator already sees.
 */

/** Body column stack — the Household summary rhythm (8px gap). */
export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={clsx("alloy-os-household__summary", className)}>{children}</div>;
}

/**
 * Uppercase in-body section head. The family's only precedent is What's Next's `RECENT ACTIVITY`,
 * which also owns the family's single hairline rule — so a section head that follows other content
 * takes the rule, and the first one does not.
 */
export function SectionHead({ children, ruled = true }: { children: ReactNode; ruled?: boolean }) {
    return (
        <p className={clsx("alloy-os-cardlab__section-head", ruled && "alloy-os-cardlab__section-head--ruled")}>
            {children}
        </p>
    );
}

/** Label-over-value fact pair — What's Next's `context-label` / `context-value`. */
export function Fact({
    label,
    value,
    tone = "neutral",
}: {
    label: string;
    value: ReactNode;
    tone?: "neutral" | "risk" | "missing" | "positive";
}) {
    return (
        <div className="alloy-os-cardlab__fact">
            <p className="alloy-os-currentwork__context-label">{label}</p>
            <p
                className={clsx(
                    "alloy-os-currentwork__context-value",
                    tone === "risk" && "alloy-os-card-detail--risk",
                    tone === "missing" && "alloy-os-cardlab__value--missing",
                    tone === "positive" && "alloy-os-cardlab__value--positive",
                )}
            >
                {value}
            </p>
        </div>
    );
}

/** Two-column fact grid, as What's Next lays out SCHEDULED TOUR / LOCATION. */
export function FactGrid({ children }: { children: ReactNode }) {
    return <div className="alloy-os-cardlab__fact-grid">{children}</div>;
}

/** Row of equal outline buttons — What's Next's `helpful-row` / `helpful-action`. */
export function ActionRow({ children }: { children: ReactNode }) {
    return <div className="alloy-os-currentwork__helpful-row">{children}</div>;
}

type ActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "className"> & {
    children: ReactNode;
    primary?: boolean;
    /**
     * Configured but not currently executable. The platform decides this; the card only renders it.
     * A configured command is never removed for being unavailable — an operator who cannot see a
     * command cannot learn why it is unavailable.
     */
    disabled?: boolean;
    /** The stated unavailable reason, surfaced on the control itself. */
    title?: string;
};

/*
 * OPEN AT THE DOM SEAM, CLOSED AT THE DESIGN SEAM.
 *
 * `type` and `className` stay owned here — the visual contract is the point of this kit, and a
 * caller must not be able to restyle a command. Everything else a button legitimately carries is
 * forwarded, along with the ref, because two callers need exactly that and neither is cosmetic:
 *
 *   1. Radix `<DropdownMenuTrigger asChild>` attaches its ref, its pointer/keyboard handlers and
 *      its `aria-expanded`/`aria-haspopup` to the child it wraps. A child that accepts none of
 *      them renders a button that LOOKS like a menu trigger and cannot open — which is precisely
 *      what the Tour control did, and why it could not be driven from a browser at all.
 *   2. `data-process-action` / `data-process-action-group` are how a command's provenance is
 *      checkable from outside the React tree. Dropped silently, they made the Process card's
 *      projected commands indistinguishable from any other button on the surface.
 *
 * Both were being passed already. The props were simply not on the list, so they vanished with no
 * type error and no runtime warning.
 */
export const Action = forwardRef<HTMLButtonElement, ActionProps>(function Action(
    { children, primary = false, disabled = false, title, ...rest },
    ref,
) {
    // The family's primary action is FILLED bend-pine (What's Next's `primary-action`), not a
    // tinted outline. State decides which action earns it, and only one does.
    return (
        <button
            {...rest}
            ref={ref}
            type="button"
            className={
                primary ? "alloy-os-currentwork__primary-action" : "alloy-os-currentwork__helpful-action"
            }
            disabled={disabled}
            title={title}
        >
            {children}
        </button>
    );
});

/** Footer link — the platform's card action. */
export function FooterAction({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
    return (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={onClick}
        >
            {children}
        </button>
    );
}

/** Count chips — Household's `stats` / `stat` / `stat-count` / `stat-label`. */
export function StatChips({ items }: { items: { count: string; label: string }[] }) {
    return (
        <ul className="alloy-os-household__stats">
            {items.map((s) => (
                <li key={s.label}>
                    <span className="alloy-os-household__stat">
                        <span className="alloy-os-household__stat-count">{s.count}</span>
                        <span className="alloy-os-household__stat-label">{s.label}</span>
                    </span>
                </li>
            ))}
        </ul>
    );
}

/**
 * Open person row — the Household / Children idiom. No enclosure, no divider; whitespace and the
 * avatar carry the separation. `secondary` renders the Children label-over-value pair beneath.
 */
export function PersonRow({
    name,
    pill,
    pillTone = "neutral",
    avatarRole,
    lines,
    secondary,
}: {
    name: string;
    pill?: string | null;
    pillTone?: "neutral" | "positive";
    avatarRole?: "child" | "adult" | "staff";
    lines?: ReactNode;
    secondary?: ReactNode;
}) {
    return (
        <div className="alloy-os-household__row alloy-os-cardlab__person">
            <CardAvatar name={name} size={36} role={avatarRole === "child" ? "child" : "contact"} />
            <div className="alloy-os-household__row-main">
                <span className="alloy-os-household__row-name">
                    {name}
                    {pill ? (
                        <span
                            className={clsx(
                                "alloy-os-card-pill",
                                pillTone === "positive" ? "alloy-os-card-pill--positive" : "alloy-os-card-pill--neutral",
                            )}
                        >
                            {pill}
                        </span>
                    ) : null}
                </span>
                {lines ? <span className="alloy-os-household__row-detail">{lines}</span> : null}
                {secondary}
            </div>
        </div>
    );
}

/**
 * Plain fact row — a name in card ink with a quieter detail beneath. Household's `row-name` /
 * `row-detail` without the avatar, for facts that are not people.
 */
export function FactRow({
    name,
    detail,
    severe = false,
    value,
    valueTone = "neutral",
}: {
    name: string;
    detail?: string | null;
    severe?: boolean;
    value?: string | null;
    valueTone?: "neutral" | "missing";
}) {
    // Ordinary facts sit on one line — the family spends vertical space on people, not on every
    // qualifier. A severe fact takes the second line, which is what makes it read as severe.
    return (
        <div className="alloy-os-cardlab__fact-row">
            <div className={clsx("alloy-os-household__row-main", !severe && "alloy-os-cardlab__row-main--inline")}>
                <span className={clsx("alloy-os-household__row-name", severe && "alloy-os-cardlab__name--severe")}>
                    {name}
                </span>
                {detail ? (
                    <span
                        className={clsx(
                            "alloy-os-household__row-detail",
                            severe && "alloy-os-card-detail--risk",
                        )}
                    >
                        {detail}
                    </span>
                ) : null}
            </div>
            {value ? (
                <span
                    className={clsx(
                        "alloy-os-cardlab__fact-row-value",
                        valueTone === "missing" && "alloy-os-household__row-detail--missing",
                    )}
                >
                    {value}
                </span>
            ) : null}
        </div>
    );
}

/** Empty body — the family renders one quiet line, never an empty-state product. */
export function EmptyLine({ children }: { children: ReactNode }) {
    return <p className="alloy-os-household__row-detail">{children}</p>;
}

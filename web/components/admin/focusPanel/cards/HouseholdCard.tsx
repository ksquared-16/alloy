"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    buildHouseholdCardEvidence,
    type HouseholdEvidenceContact,
    type HouseholdEvidenceGroup,
    type HouseholdEvidenceGroupKey,
} from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    useReportPerspective,
    useDismissSignal,
    type FocusPanelCoordination,
    type FocusPanelPerspectiveLevel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordination";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    /** Forward-facing card boundary — Household observes this, never the drawer VM. */
    context: OperationalContext;
    receded?: boolean;
    /** Owner card: receives cross-card handoffs (e.g. from Readiness / Current Work). */
    coordination?: FocusPanelCoordination;
};

const COLLAPSED_PREVIEW_GROUPS = 4;

/**
 * Household operational card (Identity archetype). Renders the operational answer
 * "Who belongs to this household, and who can I contact?".
 *
 * Perspectives are LOCAL UI state only — collapsed → expanded → focused evidence
 * group. No perspective change performs a fetch, route change, or drawer swap;
 * the card observes the already-loaded opportunity record.
 *
 * @see docs/platform/operator/card-archetypes.md (Identity)
 * @see docs/platform/operator/card-interaction-expansion-doctrine.md (System 5B — Expand)
 */
export default function HouseholdCard({ model, context, receded = false, coordination }: Props) {
    const evidence = useMemo(
        () => buildHouseholdCardEvidence(context),
        [context],
    );

    // Permission outcome is resolved upstream and observed here — the card never
    // authorizes independently (no card-level permission fetch).
    const maskedChannels = context.capabilities.maskedChannels;
    // Empty: nothing composed yet (no primary, no groups, no children).
    const isEmpty =
        !evidence.primaryContact && evidence.groups.length === 0 && evidence.childCount === 0;

    const [expanded, setExpanded] = useState(false);
    const [focusedGroup, setFocusedGroup] = useState<HouseholdEvidenceGroupKey | null>(null);

    // Cross-card handoff: when another card points here (e.g. Readiness "primary
    // contact"), open the requested evidence group as a Perspective Change. No fetch.
    const request = coordination?.request;
    const requestNonce = request?.card === "household" ? request.nonce : null;
    useEffect(() => {
        if (request?.card !== "household") return;
        setExpanded(true);
        setFocusedGroup((request.focus as HouseholdEvidenceGroupKey | null) ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce gates re-apply
    }, [requestNonce]);

    const focused = !isEmpty && focusedGroup
        ? evidence.groups.find((g) => g.key === focusedGroup) ?? null
        : null;

    // ANY open state (expanded household, a focused group) elevates as a centered
    // Focus Card — Household never expands height inline (no row reflow).
    const level: FocusPanelPerspectiveLevel = focused || expanded ? "focused" : "base";
    useReportPerspective(coordination, "household", level);
    useDismissSignal(coordination, "household", () => {
        setFocusedGroup(null);
        setExpanded(false);
    });

    // Household children are belonging-only. Clicking a child hands off to the
    // Children card (which owns operational truth) — a Perspective Change, no fetch.
    // Household collapses itself as it hands off so it recedes cleanly to its base
    // footprint (no leftover expanded height reflowing behind the new Focus Card).
    const openChild = coordination
        ? (childId: string) => {
              setExpanded(false);
              setFocusedGroup(null);
              coordination.requestFocus("children", childId);
          }
        : undefined;

    const density = !isEmpty && (expanded || focused) ? "expanded" : "compact";
    const hasWarning = Boolean(evidence.missingCriticalWarning);
    const statusTone = hasWarning ? "at-risk" : "neutral";
    const statusChip = hasWarning ? "Needs contact" : null;

    const footerAction =
        isEmpty ? null :
        focused ? (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setFocusedGroup(null)}
                data-household-action="back"
            >
                ← All household evidence
            </button>
        ) : expanded ? (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setExpanded(false)}
                data-household-action="collapse"
            >
                ← Back to panel
            </button>
        ) : evidence.groups.length > 0 ? (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setExpanded(true)}
                data-household-action="expand"
            >
                View household →
            </button>
        ) : null;

    let body: React.ReactNode;
    let perspective: "collapsed" | "expanded" | "focused" | "empty";
    if (isEmpty) {
        perspective = "empty";
        body = <EmptyBody />;
    } else if (focused) {
        perspective = "focused";
        body = <FocusedGroupBody group={focused} masked={maskedChannels} onOpenChild={openChild} />;
    } else if (expanded) {
        perspective = "expanded";
        body = (
            <ExpandedBody
                groups={evidence.groups}
                masked={maskedChannels}
                onFocusGroup={(key) => setFocusedGroup(key)}
                onOpenChild={openChild}
            />
        );
    } else {
        perspective = "collapsed";
        body = (
            <CollapsedBody
                evidence={evidence}
                masked={maskedChannels}
                onPreviewGroup={(key) => {
                    setExpanded(true);
                    setFocusedGroup(key);
                }}
            />
        );
    }

    return (
        <div
            className="alloy-os-household"
            data-household-card="true"
            data-household-card-perspective={perspective}
        >
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={
                    perspective === "collapsed" ? evidence.lastUpdatedLabel : null
                }
                iconName={model.iconName}
                tier={model.tier}
                archetype="profile"
                statusChip={statusChip}
                statusTone={statusTone}
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

function EmptyBody() {
    return (
        <div className="alloy-os-household__summary" data-household-empty="true">
            <p className="alloy-os-household__row-detail">No household linked to this record yet</p>
        </div>
    );
}

function CollapsedBody({
    evidence,
    masked,
    onPreviewGroup,
}: {
    evidence: ReturnType<typeof buildHouseholdCardEvidence>;
    masked: boolean;
    onPreviewGroup: (key: HouseholdEvidenceGroupKey) => void;
}) {
    const allStats: { key: HouseholdEvidenceGroupKey; label: string; count: number }[] = [
        { key: "children", label: "Children", count: evidence.childCount },
        {
            key: "other_parent_guardian",
            label: "Other parents",
            count: evidence.otherParentGuardianCount,
        },
        {
            key: "household_members",
            label: "Additional contacts",
            count: evidence.additionalContactCount,
        },
        {
            key: "emergency_contacts",
            label: "Emergency contacts",
            count: evidence.emergencyContactCount,
        },
        {
            key: "authorized_pickups",
            label: "Authorized pickups",
            count: evidence.authorizedPickupCount,
        },
    ];
    const stats = allStats.filter((s) => s.count > 0);
    // The primary contact NAME is already the card answer (insight). Collapsed
    // evidence shows reachability (how to reach them) + the address — never repeats
    // the name.
    const channel = masked
        ? "Contact details restricted"
        : [evidence.primaryPhone, evidence.primaryEmail].filter(Boolean).join(" · ") || null;
    // Missing-emergency warning hands off to the emergency group; missing-primary
    // has no group yet, so it just opens the card.
    const warningTarget: HouseholdEvidenceGroupKey | null =
        evidence.emergencyContactCount === 0 && evidence.primaryContact
            ? "emergency_contacts"
            : "primary_contact";

    return (
        <div className="alloy-os-household__summary">
            {evidence.primaryContact ? (
                <p
                    className={clsx(
                        "alloy-os-household__channel",
                        !channel && "alloy-os-household__channel--missing",
                    )}
                    data-household-channel="true"
                >
                    {channel ?? "No contact channel on file"}
                </p>
            ) : (
                <p className="alloy-os-household__missing" data-household-missing="primary">
                    Primary contact needed
                </p>
            )}

            {evidence.address ? <AddressLine address={evidence.address} /> : null}

            {stats.length > 0 ? (
                <ul className="alloy-os-household__stats" data-household-stats>
                    {stats.map((stat) => (
                        <li key={stat.key}>
                            <button
                                type="button"
                                className="alloy-os-household__stat"
                                onClick={() => onPreviewGroup(stat.key)}
                                data-household-stat={stat.key}
                            >
                                <span className="alloy-os-household__stat-count">{stat.count}</span>
                                <span className="alloy-os-household__stat-label">{stat.label}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}

            {evidence.preferredContactMethod ? (
                <p className="alloy-os-household__pref">
                    Prefers {evidence.preferredContactMethod}
                </p>
            ) : null}

            {evidence.missingCriticalWarning ? (
                <button
                    type="button"
                    className="alloy-os-household__warning alloy-os-household__warning--action"
                    data-household-warning="true"
                    onClick={() => onPreviewGroup(warningTarget)}
                >
                    {evidence.missingCriticalWarning} →
                </button>
            ) : null}
        </div>
    );
}

function AddressLine({ address }: { address: string }) {
    return (
        <p className="alloy-os-household__address" data-household-address="true">
            {address}
        </p>
    );
}

function ExpandedBody({
    groups,
    masked,
    onFocusGroup,
    onOpenChild,
}: {
    groups: HouseholdEvidenceGroup[];
    masked: boolean;
    onFocusGroup: (key: HouseholdEvidenceGroupKey) => void;
    onOpenChild?: (childId: string) => void;
}) {
    return (
        <div className="alloy-os-household__groups" data-household-groups>
            {groups.map((group) => (
                <section
                    key={group.key}
                    className="alloy-os-household__group"
                    data-household-evidence-group={group.key}
                >
                    <button
                        type="button"
                        className="alloy-os-household__group-header"
                        onClick={() => onFocusGroup(group.key)}
                        data-household-group-focus={group.key}
                    >
                        <span className="alloy-os-household__group-title">{group.title}</span>
                        <span className="alloy-os-household__group-count">{group.count} →</span>
                    </button>
                    <GroupRows
                        group={group}
                        masked={masked}
                        limit={COLLAPSED_PREVIEW_GROUPS}
                        onOpenChild={onOpenChild}
                    />
                </section>
            ))}
        </div>
    );
}

function FocusedGroupBody({
    group,
    masked,
    onOpenChild,
}: {
    group: HouseholdEvidenceGroup;
    masked: boolean;
    onOpenChild?: (childId: string) => void;
}) {
    return (
        <div
            className="alloy-os-household__focused"
            data-household-focused-group={group.key}
        >
            <div className="alloy-os-household__focused-header">
                <span className="alloy-os-household__group-title">{group.title}</span>
                <span className="alloy-os-household__group-count">{group.count}</span>
            </div>
            <GroupRows group={group} masked={masked} onOpenChild={onOpenChild} />
        </div>
    );
}

function GroupRows({
    group,
    masked,
    limit,
    onOpenChild,
}: {
    group: HouseholdEvidenceGroup;
    masked: boolean;
    limit?: number;
    onOpenChild?: (childId: string) => void;
}) {
    if (group.key === "address" && group.addressLine) {
        return <AddressLine address={group.addressLine} />;
    }

    if (group.children.length > 0) {
        const visible = limit ? group.children.slice(0, limit) : group.children;
        const overflow = group.children.length - visible.length;
        // Children are belonging-only here: name + reachability. Operational truth
        // (program/schedule/status) lives in the Children card — clicking hands off.
        return (
            <div className="alloy-os-household__rows">
                <p className="alloy-os-household__group-caption" data-household-children-caption="true">
                    Belonging only — open Children for enrollment detail
                </p>
                {visible.map((child) =>
                    onOpenChild ? (
                        <button
                            key={child.id}
                            type="button"
                            className="alloy-os-household__row alloy-os-household__row--child-link"
                            onClick={() => onOpenChild(child.id)}
                            data-household-child={child.id}
                        >
                            <span className="alloy-os-household__avatar" aria-hidden>
                                {child.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="alloy-os-household__row-main min-w-0">
                                <span className="alloy-os-household__row-name">{child.name}</span>
                            </span>
                            <span className="alloy-os-readiness__pointer" aria-hidden>
                                Children →
                            </span>
                        </button>
                    ) : (
                        <div key={child.id} className="alloy-os-household__row">
                            <span className="alloy-os-household__avatar" aria-hidden>
                                {child.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="alloy-os-household__row-main min-w-0">
                                <span className="alloy-os-household__row-name">{child.name}</span>
                            </span>
                        </div>
                    ),
                )}
                {overflow > 0 ? (
                    <div className="alloy-os-household__overflow">+{overflow} more</div>
                ) : null}
            </div>
        );
    }

    const visible = limit ? group.contacts.slice(0, limit) : group.contacts;
    const overflow = group.contacts.length - visible.length;
    return (
        <div className="alloy-os-household__rows">
            {visible.map((contact) => (
                <ContactRow key={contact.personId || contact.name} contact={contact} masked={masked} />
            ))}
            {overflow > 0 ? (
                <div className="alloy-os-household__overflow">+{overflow} more</div>
            ) : null}
        </div>
    );
}

function ContactRow({ contact, masked }: { contact: HouseholdEvidenceContact; masked: boolean }) {
    const channel = contact.phone ?? contact.email;
    return (
        <div className="alloy-os-household__row" data-household-contact={contact.personId || undefined}>
            <span className="alloy-os-household__avatar" aria-hidden>
                {contact.initials}
            </span>
            <span className="alloy-os-household__row-main min-w-0">
                <span className="alloy-os-household__row-name">{contact.name}</span>
                {masked ? (
                    <span className="alloy-os-household__row-detail alloy-os-household__row-detail--locked">
                        Contact details restricted
                    </span>
                ) : channel ? (
                    <span className="alloy-os-household__row-detail">{channel}</span>
                ) : null}
            </span>
            {contact.roleLabel ? (
                <span
                    className={clsx(
                        "alloy-os-household__row-role",
                        contact.isPrimary && "alloy-os-household__row-role--primary",
                    )}
                >
                    {contact.roleLabel}
                </span>
            ) : null}
        </div>
    );
}

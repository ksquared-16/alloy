"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    buildHouseholdCardEvidence,
    type HouseholdEvidenceContact,
    type HouseholdEvidenceGroup,
    type HouseholdEvidenceGroupKey,
} from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

type Props = {
    model: FocusPanelCardModel;
    record: Record<string, unknown>;
    receded?: boolean;
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
export default function HouseholdCard({ model, record, receded = false }: Props) {
    const evidence = useMemo(
        () => buildHouseholdCardEvidence(record, model.title),
        [record, model.title],
    );

    const [expanded, setExpanded] = useState(false);
    const [focusedGroup, setFocusedGroup] = useState<HouseholdEvidenceGroupKey | null>(null);

    const focused = focusedGroup
        ? evidence.groups.find((g) => g.key === focusedGroup) ?? null
        : null;

    const density = expanded || focused ? "expanded" : "compact";
    const hasWarning = Boolean(evidence.missingCriticalWarning);
    const statusTone = hasWarning ? "at-risk" : "neutral";
    const statusChip = hasWarning ? "Needs contact" : null;

    const footerAction =
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
                Show less
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
    let perspective: "collapsed" | "expanded" | "focused";
    if (focused) {
        perspective = "focused";
        body = <FocusedGroupBody group={focused} />;
    } else if (expanded) {
        perspective = "expanded";
        body = (
            <ExpandedBody
                groups={evidence.groups}
                onFocusGroup={(key) => setFocusedGroup(key)}
            />
        );
    } else {
        perspective = "collapsed";
        body = (
            <CollapsedBody
                evidence={evidence}
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

function CollapsedBody({
    evidence,
    onPreviewGroup,
}: {
    evidence: ReturnType<typeof buildHouseholdCardEvidence>;
    onPreviewGroup: (key: HouseholdEvidenceGroupKey) => void;
}) {
    const allStats: { key: HouseholdEvidenceGroupKey; label: string; count: number }[] = [
        { key: "children", label: "Children", count: evidence.childCount },
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

    return (
        <div className="alloy-os-household__summary">
            {evidence.primaryContact ? (
                <ContactLine contact={evidence.primaryContact} channelFallback={{
                    phone: evidence.primaryPhone,
                    email: evidence.primaryEmail,
                }} />
            ) : (
                <p className="alloy-os-household__missing" data-household-missing="primary">
                    Primary contact needed
                </p>
            )}

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
                <p
                    className="alloy-os-household__warning"
                    data-household-warning="true"
                >
                    {evidence.missingCriticalWarning}
                </p>
            ) : null}
        </div>
    );
}

function ExpandedBody({
    groups,
    onFocusGroup,
}: {
    groups: HouseholdEvidenceGroup[];
    onFocusGroup: (key: HouseholdEvidenceGroupKey) => void;
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
                    <GroupRows group={group} limit={COLLAPSED_PREVIEW_GROUPS} />
                </section>
            ))}
        </div>
    );
}

function FocusedGroupBody({ group }: { group: HouseholdEvidenceGroup }) {
    return (
        <div
            className="alloy-os-household__focused"
            data-household-focused-group={group.key}
        >
            <div className="alloy-os-household__focused-header">
                <span className="alloy-os-household__group-title">{group.title}</span>
                <span className="alloy-os-household__group-count">{group.count}</span>
            </div>
            <GroupRows group={group} />
        </div>
    );
}

function GroupRows({ group, limit }: { group: HouseholdEvidenceGroup; limit?: number }) {
    if (group.children.length > 0) {
        const visible = limit ? group.children.slice(0, limit) : group.children;
        const overflow = group.children.length - visible.length;
        return (
            <div className="alloy-os-household__rows">
                {visible.map((child) => (
                    <div key={child.id} className="alloy-os-household__row">
                        <span className="alloy-os-household__avatar" aria-hidden>
                            {child.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="alloy-os-household__row-main min-w-0">
                            <span className="alloy-os-household__row-name">{child.name}</span>
                            {child.detail ? (
                                <span className="alloy-os-household__row-detail">{child.detail}</span>
                            ) : null}
                        </span>
                        {child.status ? (
                            <span className="alloy-os-household__row-status">{child.status}</span>
                        ) : null}
                    </div>
                ))}
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
                <ContactRow key={contact.personId || contact.name} contact={contact} />
            ))}
            {overflow > 0 ? (
                <div className="alloy-os-household__overflow">+{overflow} more</div>
            ) : null}
        </div>
    );
}

function ContactRow({ contact }: { contact: HouseholdEvidenceContact }) {
    const channel = contact.phone ?? contact.email;
    return (
        <div className="alloy-os-household__row" data-household-contact={contact.personId || undefined}>
            <span className="alloy-os-household__avatar" aria-hidden>
                {contact.initials}
            </span>
            <span className="alloy-os-household__row-main min-w-0">
                <span className="alloy-os-household__row-name">{contact.name}</span>
                {channel ? (
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

function ContactLine({
    contact,
    channelFallback,
}: {
    contact: HouseholdEvidenceContact;
    channelFallback: { phone: string | null; email: string | null };
}) {
    const phone = contact.phone ?? channelFallback.phone;
    const email = contact.email ?? channelFallback.email;
    const channel = [phone, email].filter(Boolean).join(" · ");
    return (
        <div className="alloy-os-household__primary" data-household-primary>
            <span className="alloy-os-household__avatar" aria-hidden>
                {contact.initials}
            </span>
            <span className="alloy-os-household__row-main min-w-0">
                <span className="alloy-os-household__row-name">
                    {contact.name}
                    <span className="alloy-os-household__row-role alloy-os-household__row-role--primary">
                        Primary
                    </span>
                </span>
                {channel ? (
                    <span className="alloy-os-household__row-detail">{channel}</span>
                ) : (
                    <span className="alloy-os-household__row-detail alloy-os-household__row-detail--missing">
                        No contact channel on file
                    </span>
                )}
            </span>
        </div>
    );
}

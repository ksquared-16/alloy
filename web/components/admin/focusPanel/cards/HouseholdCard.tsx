"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import HouseholdContactEdit from "@/components/admin/focusPanel/cards/HouseholdContactEdit";
import {
    buildHouseholdCardEvidence,
    type HouseholdEvidenceContact,
    type HouseholdEvidenceGroup,
    type HouseholdEvidenceGroupKey,
} from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import {
    householdGroupFieldKeys,
    readHouseholdNestedConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceConfig";
import { HOUSEHOLD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import ComposableRegionShell from "@/components/admin/focusPanel/drillIn/ComposableRegionShell";
import ComposableFieldShell from "@/components/admin/focusPanel/drillIn/ComposableFieldShell";
import InlineRuntimeFieldList from "@/components/admin/focusPanel/drillIn/InlineRuntimeFieldList";
import AddSectionMenu from "@/components/admin/focusPanel/drillIn/AddSectionMenu";
import InlineSectionControls from "@/components/admin/focusPanel/drillIn/InlineSectionControls";
import {
    renderChildFields,
    renderContactFields,
    type HouseholdEvidenceChildExtended,
} from "@/lib/adminV2/runtime/focusPanel/household/householdSurfaceFields";
import {
    nestedGroupLabel,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { usePublishedFocusPanelSummaryDoc } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import { seedHouseholdContactValuesForPerson } from "@/lib/adminV2/runtime/focusPanel/household/householdContactEditState";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type {
    FocusPanelCoordination,
    FocusPanelPerspectiveLevel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import type { FocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    /** Forward-facing card boundary — Household observes this, never the drawer VM. */
    context: OperationalContext;
    receded?: boolean;
    /** Owner card: receives cross-card handoffs (e.g. from Readiness / Current Work). */
    coordination?: FocusPanelCoordination;
    /** Injected save seam (Edit depth). Absent → card stays read-only. */
    mutation?: FocusPanelMutation;
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
export default function HouseholdCard({ model, context, receded = false, coordination, mutation }: Props) {
    const composer = useFocusPanelComposer();
    const publishedDoc = usePublishedFocusPanelSummaryDoc(true);
    const nestedConfig = useMemo(() => {
        if (composer?.enabled) return composer.configFor(HOUSEHOLD_SURFACE_ID);
        return readHouseholdNestedConfigFromDoc(publishedDoc);
    }, [composer, publishedDoc]);
    const evidence = useMemo(
        () => buildHouseholdCardEvidence(context, { nestedConfig }),
        [context, nestedConfig],
    );
    const groupFieldKeys = useCallback(
        (groupKey: HouseholdEvidenceGroupKey) => householdGroupFieldKeys(nestedConfig, groupKey),
        [nestedConfig],
    );

    // Permission outcome is resolved upstream and observed here — the card never
    // authorizes independently (no card-level permission fetch).
    const maskedChannels = context.capabilities.maskedChannels;
    // Empty: nothing composed yet (no primary, no groups, no children).
    const isEmpty =
        !evidence.primaryContact && evidence.groups.length === 0 && evidence.childCount === 0;

    const [expanded, setExpanded] = useState(false);
    const [focusedGroup, setFocusedGroup] = useState<HouseholdEvidenceGroupKey | null>(null);
    // TARGETED editing: which specific person row is being edited (null = none). Editing
    // is per-row, not card-wide — only the selected contact becomes an edit form.
    const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
    // Transient card-level confirmation after a successful contact save.
    const [justSaved, setJustSaved] = useState(false);
    const savedChipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (savedChipTimer.current) clearTimeout(savedChipTimer.current); }, []);
    const handleContactSaved = () => {
        setEditingPersonId(null);
        setJustSaved(true);
        if (savedChipTimer.current) clearTimeout(savedChipTimer.current);
        savedChipTimer.current = setTimeout(() => setJustSaved(false), 2600);
    };

    // Edit is a capability of Focus, targeted at one person row. Seed the draft for the
    // selected person from observed truth. Each editable row owns its own affordance.
    const canEdit = Boolean(mutation?.canEdit);
    const editingSeed = useMemo(
        () => (editingPersonId ? seedHouseholdContactValuesForPerson(context.truth, editingPersonId) : null),
        [editingPersonId, context.truth],
    );
    const editing = Boolean(editingPersonId && editingSeed);
    const onEditContact = canEdit
        ? (personId: string) => {
              composer?.setDrillDepth({ kind: "contact-edit", personId });
              composer?.select({ kind: "region", surfaceId: HOUSEHOLD_SURFACE_ID, groupKey: "contact_edit" });
              setEditingPersonId(personId);
          }
        : undefined;

    // Cross-card handoff: when another card points here (e.g. Readiness "primary
    // contact"), open the requested evidence group as a Perspective Change. No fetch.
    const request = coordination?.request;
    const requestNonce = request?.card === "household" ? request.nonce : null;
    useEffect(() => {
        if (request?.card !== "household") return;
        // Re-opened (e.g. via Back from Children) → restore the requested focus state.
        setEditingPersonId(null);
        setExpanded(true);
        setFocusedGroup((request.focus as HouseholdEvidenceGroupKey | null) ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce gates re-apply
    }, [requestNonce]);

    const focused = !isEmpty && focusedGroup
        ? evidence.groups.find((g) => g.key === focusedGroup) ?? null
        : null;

    // ANY open state elevates as a centered Focus Card — Household never expands
    // height inline (no row reflow). Edit is the deepest state OF Focus.
    const level: FocusPanelPerspectiveLevel =
        editing ? "edit" : focused || expanded ? "focused" : "base";
    useReportPerspective(coordination, "household", level);
    useDismissSignal(coordination, "household", () => {
        setEditingPersonId(null);
        setFocusedGroup(null);
        setExpanded(false);
    });

    // Household children are belonging-only. Clicking a child hands off to the
    // Children card (which owns operational truth) — a Perspective Change, no fetch.
    // Household collapses itself as it hands off so it recedes cleanly to its base
    // footprint (no leftover expanded height reflowing behind the new Focus Card).
    const openChild = coordination
        ? (childId: string) => {
              // Record where this handoff came FROM so Back returns to this exact
              // Household state (focused group, or expanded when none).
              const source = { card: "household" as const, focus: focusedGroup };
              setExpanded(false);
              setFocusedGroup(null);
              coordination.requestFocus("children", childId, source);
          }
        : undefined;

    const density = !isEmpty && (expanded || focused) ? "expanded" : "compact";
    const hasWarning = Boolean(evidence.missingCriticalWarning);
    // The transient saved chip takes precedence so the card visibly confirms the save.
    const statusTone = justSaved ? "ready" : hasWarning ? "at-risk" : "neutral";
    const statusChip = justSaved ? "✓ Saved" : hasWarning ? "Needs contact" : null;

    const footerAction =
        // Editing owns its own Cancel / Save controls — no card footer action.
        isEmpty || editing ? null :
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
            // Editing is targeted per-row (each contact owns its Edit affordance) — no
            // card-wide Edit contact link here.
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
    let perspective: "collapsed" | "expanded" | "focused" | "edit" | "empty";
    if (isEmpty) {
        perspective = "empty";
        body = <EmptyBody />;
    } else if (editing && editingSeed) {
        perspective = "edit";
        body = (
            <HouseholdContactEdit
                key={editingSeed.personId}
                personId={editingSeed.personId}
                personName={editingSeed.name}
                initial={editingSeed.values}
                save={mutation!.savePersonContact}
                onClose={() => setEditingPersonId(null)}
                onSaved={handleContactSaved}
                nestedConfig={nestedConfig}
            />
        );
    } else if (focused) {
        perspective = "focused";
        body = (
            <FocusedGroupBody
                group={focused}
                masked={maskedChannels}
                onOpenChild={openChild}
                onEditContact={onEditContact}
                onAddEmergencyContact={
                    canEdit && mutation ? () => mutation.openAddEmergencyContact() : undefined
                }
                resolveFieldKeys={groupFieldKeys}
                composing={composer?.isComposingSurface(HOUSEHOLD_SURFACE_ID) ?? false}
                nestedConfig={nestedConfig}
            />
        );
    } else if (expanded) {
        perspective = "expanded";
        body = (
            <ExpandedBody
                groups={evidence.groups}
                masked={maskedChannels}
                onFocusGroup={(key) => setFocusedGroup(key)}
                onOpenChild={openChild}
                onEditContact={onEditContact}
                onAddEmergencyContact={
                    canEdit && mutation ? () => mutation.openAddEmergencyContact() : undefined
                }
                resolveFieldKeys={groupFieldKeys}
                composing={composer?.isComposingSurface(HOUSEHOLD_SURFACE_ID) ?? false}
                nestedConfig={nestedConfig}
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
                onAddEmergencyContact={
                    canEdit && mutation ? () => mutation.openAddEmergencyContact() : undefined
                }
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
                insight={householdHeadline(evidence)}
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

/**
 * Household-level headline that does NOT restate the child count (the chips carry it)
 * nor the primary name (the primary-contact row carries it, with a Primary badge). Uses
 * the family surname when a primary contact exists; falls back to the needs-attention
 * answer otherwise. The full sentence still lives on `evidence.answerLine` for deeper
 * states / other consumers.
 */
function householdHeadline(evidence: ReturnType<typeof buildHouseholdCardEvidence>): string {
    const name = evidence.primaryContact?.name?.trim();
    if (name) {
        const surname = name.split(/\s+/).pop();
        return surname ? `${surname} household` : "Household";
    }
    return evidence.answerLine;
}

function CollapsedBody({
    evidence,
    masked,
    onPreviewGroup,
    onAddEmergencyContact,
}: {
    evidence: ReturnType<typeof buildHouseholdCardEvidence>;
    masked: boolean;
    onPreviewGroup: (key: HouseholdEvidenceGroupKey) => void;
    onAddEmergencyContact?: () => void;
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
                <div className="alloy-os-household__primary-row" data-household-primary-row="true">
                    <CardAvatar name={evidence.primaryContact.name} imageUrl={evidence.primaryContact.imageUrl} size={30} />
                    <div className="alloy-os-household__row-main min-w-0">
                        <span className="alloy-os-household__row-name">
                            {evidence.primaryContact.name}
                            <span className="alloy-os-card-pill alloy-os-card-pill--positive alloy-os-household__primary-badge">Primary</span>
                        </span>
                        <span
                            className={clsx(
                                "alloy-os-household__row-detail",
                                !channel && "alloy-os-household__channel--missing",
                            )}
                            data-household-channel="true"
                        >
                            {channel ?? "No contact channel on file"}
                        </span>
                    </div>
                </div>
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
                    onClick={() => {
                        if (
                            warningTarget === "emergency_contacts"
                            && evidence.emergencyContactCount === 0
                            && onAddEmergencyContact
                        ) {
                            onAddEmergencyContact();
                            return;
                        }
                        onPreviewGroup(warningTarget);
                    }}
                >
                    {evidence.emergencyContactCount === 0 && evidence.primaryContact
                        ? "Add emergency contact →"
                        : `${evidence.missingCriticalWarning} →`}
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
    onEditContact,
    onAddEmergencyContact,
    resolveFieldKeys,
    composing,
    nestedConfig,
}: {
    groups: HouseholdEvidenceGroup[];
    masked: boolean;
    onFocusGroup: (key: HouseholdEvidenceGroupKey) => void;
    onOpenChild?: (childId: string) => void;
    onEditContact?: (personId: string) => void;
    onAddEmergencyContact?: () => void;
    resolveFieldKeys: (groupKey: HouseholdEvidenceGroupKey) => string[];
    composing: boolean;
    nestedConfig: NestedSurfaceConfig | null;
}) {
    return (
        <div className="alloy-os-household__groups" data-household-groups>
            {groups.map((group) => (
                <ComposableRegionShell
                    key={group.key}
                    as="section"
                    surfaceId={HOUSEHOLD_SURFACE_ID}
                    groupKey={group.key}
                    label={group.title}
                    className="alloy-os-household__group"
                    dataAttrs={{ "data-household-evidence-group": group.key }}
                >
                    <button
                        type="button"
                        className="alloy-os-household__group-header"
                        onClick={() => !composing && onFocusGroup(group.key)}
                        data-household-group-focus={group.key}
                    >
                        {composing ? (
                            <InlineSectionControls surfaceId={HOUSEHOLD_SURFACE_ID} groupKey={group.key} />
                        ) : null}
                        <span className="alloy-os-household__group-title">
                            {(composing && nestedConfig ? nestedGroupLabel(nestedConfig, group.key) : null) ?? group.title}
                        </span>
                        <span className="alloy-os-household__group-count">{`${group.count} →`}</span>
                    </button>
                    <GroupRows
                        group={group}
                        masked={masked}
                        limit={COLLAPSED_PREVIEW_GROUPS}
                        onOpenChild={onOpenChild}
                        onEditContact={onEditContact}
                        onAddEmergencyContact={onAddEmergencyContact}
                        fieldKeys={resolveFieldKeys(group.key)}
                        nestedConfig={nestedConfig}
                        composing={composing}
                    />
                    {composing ? (
                        <RegionEditLayer
                            surfaceId={HOUSEHOLD_SURFACE_ID}
                            groupKey={group.key}
                            composing={composing}
                        />
                    ) : null}
                </ComposableRegionShell>
            ))}
            {composing ? <AddSectionMenu surfaceId={HOUSEHOLD_SURFACE_ID} /> : null}
        </div>
    );
}

function FocusedGroupBody({
    group,
    masked,
    onOpenChild,
    onEditContact,
    onAddEmergencyContact,
    resolveFieldKeys,
    composing,
    nestedConfig,
}: {
    group: HouseholdEvidenceGroup;
    masked: boolean;
    onOpenChild?: (childId: string) => void;
    onEditContact?: (personId: string) => void;
    onAddEmergencyContact?: () => void;
    resolveFieldKeys: (groupKey: HouseholdEvidenceGroupKey) => string[];
    composing: boolean;
    nestedConfig: NestedSurfaceConfig | null;
}) {
    return (
        <ComposableRegionShell
            as="div"
            surfaceId={HOUSEHOLD_SURFACE_ID}
            groupKey={group.key}
            label={group.title}
            className="alloy-os-household__focused"
            dataAttrs={{ "data-household-focused-group": group.key }}
        >
            <div className="alloy-os-household__focused-header">
                <span className="alloy-os-household__group-title">{group.title}</span>
                <span className="alloy-os-household__group-count">{group.count}</span>
            </div>
            <GroupRows
                group={group}
                masked={masked}
                onOpenChild={onOpenChild}
                onEditContact={onEditContact}
                onAddEmergencyContact={onAddEmergencyContact}
                fieldKeys={resolveFieldKeys(group.key)}
                nestedConfig={nestedConfig}
                composing={composing}
            />
            {composing ? (
                <RegionEditLayer
                    surfaceId={HOUSEHOLD_SURFACE_ID}
                    groupKey={group.key}
                    composing={composing}
                />
            ) : null}
        </ComposableRegionShell>
    );
}

/** Edit-layer field controls — runtime rows stay visible above (Final Surface Composer doctrine). */
function RegionEditLayer({
    surfaceId,
    groupKey,
    composing,
}: {
    surfaceId: string;
    groupKey: string;
    composing: boolean;
}) {
    if (!composing) return null;
    return (
        <InlineRuntimeFieldList
            surfaceId={surfaceId}
            groupKey={groupKey}
            suppressPreview
            whenRegionSelectedOnly
        />
    );
}

function EmergencyEmptyState({
    onAdd,
    composing,
}: {
    onAdd?: () => void;
    composing: boolean;
}) {
    return (
        <div className="alloy-os-household__empty-action" data-household-emergency-empty="true">
            <p className="alloy-os-household__row-detail">No emergency contacts on file</p>
            {onAdd && !composing ? (
                <button
                    type="button"
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                    data-household-add-emergency="true"
                    onClick={onAdd}
                >
                    Add emergency contact →
                </button>
            ) : composing ? (
                <p className="alloy-os-household__row-detail" data-household-emergency-compose-hint="true">
                    Configure fields below · operators add contacts from runtime
                </p>
            ) : null}
        </div>
    );
}

function GroupRows({
    group,
    masked,
    limit,
    onOpenChild,
    onEditContact,
    onAddEmergencyContact,
    fieldKeys = [],
    nestedConfig = null,
    composing = false,
}: {
    group: HouseholdEvidenceGroup;
    masked: boolean;
    limit?: number;
    onOpenChild?: (childId: string) => void;
    onEditContact?: (personId: string) => void;
    onAddEmergencyContact?: () => void;
    fieldKeys?: string[];
    nestedConfig?: NestedSurfaceConfig | null;
    composing?: boolean;
}) {
    if (group.key === "address" && group.addressLine) {
        return <AddressLine address={group.addressLine} />;
    }

    if (group.key === "emergency_contacts" && group.contacts.length === 0) {
        return <EmergencyEmptyState onAdd={onAddEmergencyContact} composing={composing} />;
    }

    if (group.children.length > 0) {
        const visible = limit ? group.children.slice(0, limit) : group.children;
        const overflow = group.children.length - visible.length;
        const useConfiguredFields = fieldKeys.length > 0;
        return (
            <div className="alloy-os-household__rows">
                {!useConfiguredFields ? (
                    <p className="alloy-os-household__group-caption" data-household-children-caption="true">
                        Belonging only — open Children for enrollment detail
                    </p>
                ) : null}
                {visible.map((child) => {
                    const fields = useConfiguredFields
                        ? renderChildFields(child as HouseholdEvidenceChildExtended, fieldKeys, {
                              config: nestedConfig,
                              groupKey: group.key,
                          })
                        : [{ key: "child.name", label: "Name", value: child.name, isName: true }];
                    const nameField = fields.find((f) => f.isName) ?? fields[0];
                    const detailFields = fields.filter((f) => f !== nameField);
                    const rowInner = (
                        <>
                            <CardAvatar name={child.name} imageUrl={child.imageUrl ?? null} size={26} />
                            <span className="alloy-os-household__row-main min-w-0">
                                {nameField ? (
                                    <span className="alloy-os-household__row-name">{nameField.value}</span>
                                ) : null}
                                {detailFields.map((f) => (
                                    <ComposableFieldShell
                                        key={f.key}
                                        surfaceId={HOUSEHOLD_SURFACE_ID}
                                        groupKey={group.key}
                                        fieldKey={f.key}
                                        className="alloy-os-household__row-detail"
                                    >
                                        {f.value}
                                    </ComposableFieldShell>
                                ))}
                            </span>
                            {onOpenChild ? (
                                <span className="alloy-os-readiness__pointer" aria-hidden>
                                    Children →
                                </span>
                            ) : null}
                        </>
                    );
                    return onOpenChild ? (
                        <button
                            key={child.id}
                            type="button"
                            className="alloy-os-household__row alloy-os-household__row--child-link"
                            onClick={() => onOpenChild(child.id)}
                            data-household-child={child.id}
                        >
                            {rowInner}
                        </button>
                    ) : (
                        <div key={child.id} className="alloy-os-household__row">
                            {rowInner}
                        </div>
                    );
                })}
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
                <ContactRow
                    key={contact.personId || contact.name}
                    contact={contact}
                    masked={masked}
                    onEdit={composing ? undefined : onEditContact}
                    fieldKeys={fieldKeys}
                    groupKey={group.key}
                    nestedConfig={nestedConfig}
                />
            ))}
            {overflow > 0 ? (
                <div className="alloy-os-household__overflow">+{overflow} more</div>
            ) : null}
        </div>
    );
}

/** A contact is editable when the card can mutate, the row has a REAL person id
 *  (not the "primary" placeholder), and channels aren't permission-masked. */
function isEditableContact(contact: HouseholdEvidenceContact, masked: boolean, onEdit?: (id: string) => void): boolean {
    return Boolean(onEdit) && !masked && Boolean(contact.personId) && contact.personId !== "primary";
}

function ContactRow({
    contact,
    masked,
    onEdit,
    fieldKeys = [],
    groupKey = "household_members",
    nestedConfig = null,
}: {
    contact: HouseholdEvidenceContact;
    masked: boolean;
    onEdit?: (personId: string) => void;
    fieldKeys?: string[];
    groupKey?: HouseholdEvidenceGroupKey;
    nestedConfig?: NestedSurfaceConfig | null;
}) {
    const configured = fieldKeys.length > 0;
    const fields = configured
        ? renderContactFields(contact, fieldKeys, { masked }, { config: nestedConfig, groupKey })
        : [];
    const channel = contact.phone ?? contact.email;
    const editable = isEditableContact(contact, masked, onEdit);
    const nameField = configured
        ? fields.find((f) => f.isName)
        : null;
    const detailFields = configured ? fields.filter((f) => !f.isName) : [];
    return (
        <div className="alloy-os-household__row" data-household-contact={contact.personId || undefined}>
            <CardAvatar name={contact.name} imageUrl={contact.imageUrl ?? null} size={26} />
            <span className="alloy-os-household__row-main min-w-0">
                <span className="alloy-os-household__row-name">
                    {configured && nameField ? (
                        <ComposableFieldShell
                            surfaceId={HOUSEHOLD_SURFACE_ID}
                            groupKey={groupKey}
                            fieldKey={nameField.key}
                        >
                            {nameField.value}
                        </ComposableFieldShell>
                    ) : (
                        contact.name
                    )}
                </span>
                {configured ? (
                    detailFields.map((f) => (
                        <ComposableFieldShell
                            key={f.key}
                            surfaceId={HOUSEHOLD_SURFACE_ID}
                            groupKey={groupKey}
                            fieldKey={f.key}
                            className="alloy-os-household__row-detail"
                        >
                            {f.value}
                        </ComposableFieldShell>
                    ))
                ) : masked ? (
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
            {editable ? (
                <button
                    type="button"
                    className="alloy-os-household__row-edit"
                    data-household-edit-contact={contact.personId}
                    aria-label={`Edit ${contact.name}`}
                    title={`Edit ${contact.name}`}
                    onClick={() => onEdit!(contact.personId)}
                >
                    Edit
                </button>
            ) : null}
        </div>
    );
}

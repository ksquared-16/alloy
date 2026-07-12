"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import HouseholdContactEdit from "@/components/admin/focusPanel/cards/HouseholdContactEdit";
import {
    buildHouseholdCardEvidence,
    type HouseholdEvidenceGroup,
    type HouseholdEvidenceGroupKey,
} from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import { buildHouseholdIdentityCardVM } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import IdentityRecordSummary from "@/components/admin/focusPanel/identity/IdentityRecordSummary";
import IdentityDisclosureSurface from "@/components/admin/focusPanel/identity/IdentityDisclosureSurface";
import IdentityCollectionContext from "@/components/admin/focusPanel/identity/IdentityCollectionContext";
import IdentityDisclosureBackAction from "@/components/admin/focusPanel/identity/IdentityDisclosureBackAction";
import { useIdentityDisclosureState } from "@/lib/adminV2/runtime/focusPanel/identity/useIdentityDisclosureState";
import IdentityComposeCanvasShell from "@/components/admin/focusPanel/identity/IdentityComposeCanvasShell";
import IdentityComposeSectionCanvas from "@/components/admin/focusPanel/identity/IdentityComposeSectionCanvas";
import IdentityEvidenceCollectionsPanel from "@/components/adminV2/settings/surfaces/composer/IdentityEvidenceCollectionsPanel";
import { shouldRenderIdentityComposeCanvas } from "@/lib/adminV2/runtime/focusPanel/identity/identityComposeMode";
import { builderPurposeForDisclosureDepth } from "@/lib/adminV2/runtime/focusPanel/identity/useSyncBuilderDisclosure";
import { backIdentityDisclosure } from "@/lib/adminV2/runtime/focusPanel/identity/identityDisclosureState";
import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import type { IdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import {
    readHouseholdNestedConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceConfig";
import {
    applyHouseholdDisplayView,
    type HouseholdNestedDisplayView,
} from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceRuntime";
import { HOUSEHOLD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import ComposableRegionShell from "@/components/admin/focusPanel/drillIn/ComposableRegionShell";
import NestedSurfaceAddField from "@/components/admin/focusPanel/drillIn/NestedSurfaceAddField";
import AddSectionMenu from "@/components/admin/focusPanel/drillIn/AddSectionMenu";
import InlineSectionControls from "@/components/admin/focusPanel/drillIn/InlineSectionControls";
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

type HouseholdComposerPreview = {
    perspective: "expanded" | "focused";
    focusedGroup?: HouseholdEvidenceGroupKey | null;
    displayView?: HouseholdNestedDisplayView;
    onSelectGroup?: (key: HouseholdEvidenceGroupKey) => void;
    onSelectContact?: (personId: string) => void;
    onSelectChild?: () => void;
};

type Props = {
    model: FocusPanelCardModel;
    /** Forward-facing card boundary — Household observes this, never the drawer VM. */
    context: OperationalContext;
    receded?: boolean;
    /** Owner card: receives cross-card handoffs (e.g. from Readiness / Current Work). */
    coordination?: FocusPanelCoordination;
    /** Injected save seam (Edit depth). Absent → card stays read-only. */
    mutation?: FocusPanelMutation;
    /** Legacy nested runtime canvas — forces perspective without live save. */
    composerPreview?: HouseholdComposerPreview;
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
export default function HouseholdCard({
    model,
    context,
    receded = false,
    coordination,
    mutation,
    composerPreview,
}: Props) {
    const composer = useFocusPanelComposer();
    const publishedDoc = usePublishedFocusPanelSummaryDoc(true);
    const nestedConfig = useMemo(() => {
        if (composer?.enabled) return composer.configFor(HOUSEHOLD_SURFACE_ID);
        return readHouseholdNestedConfigFromDoc(publishedDoc);
    }, [composer, publishedDoc]);
    const composingHouseholdSurface = composer?.isComposingSurface(HOUSEHOLD_SURFACE_ID) ?? false;
    const {
        state: disclosure,
        enterContext,
        selectIdentity,
        enterEvidence,
        back: backDisclosure,
        reset: resetDisclosure,
    } = useIdentityDisclosureState();
    const evidence = useMemo(() => {
        const base = buildHouseholdCardEvidence(context, { nestedConfig });
        return composerPreview?.displayView
            ? applyHouseholdDisplayView(base, composerPreview.displayView)
            : base;
    }, [context, nestedConfig, composerPreview?.displayView]);
    const composePurpose: IdentityConfigurationPurpose | null = composingHouseholdSurface
        ? composer?.activeConfigPurpose ?? "summary"
        : null;

    const showComposeCanvas = shouldRenderIdentityComposeCanvas({
        composing: composingHouseholdSurface,
        composeCanvasMode: composer?.composeCanvasMode,
    });
    const composeSelectedIdentityId = composingHouseholdSurface ? composer?.selectedIdentityId ?? null : null;
    const composeSelectedGroupKey =
        composer?.selection?.kind === "region" || composer?.selection?.kind === "field"
            ? composer.selection.groupKey
            : "primary_contact";

    const focusPersonForCompose = (personId: string, sectionKey: string) => {
        composer?.setSelectedIdentityId(personId);
        composer?.setActiveConfigPurpose("details");
        composer?.select({ kind: "region", surfaceId: HOUSEHOLD_SURFACE_ID, groupKey: sectionKey });
    };

    useEffect(() => {
        if (!composingHouseholdSurface) return;
        resetDisclosure();
    }, [composingHouseholdSurface, resetDisclosure]);


    useEffect(() => {
        if (!composingHouseholdSurface) return;
        setEditingPersonId(null);
    }, [composingHouseholdSurface]);

    const backWithComposerSync = () => {
        const next = backIdentityDisclosure(disclosure);
        backDisclosure();
        if (composingHouseholdSurface && composer) {
            composer.setActiveConfigPurpose(builderPurposeForDisclosureDepth(next.depth));
            composer.setSelectedIdentityId(next.selectedIdentityId ?? null);
        }
    };

    const handleSelectIdentityForCompose = (personId: string, sectionKey: string) => {
        if (showComposeCanvas) {
            focusPersonForCompose(personId, sectionKey);
            return;
        }
        selectIdentity(personId, sectionKey);
    };
    useEffect(() => {
        if (!composerPreview) return;
        enterContext();
    }, [composerPreview, enterContext]);

    // Permission outcome is resolved upstream and observed here — the card never
    // authorizes independently (no card-level permission fetch).
    const maskedChannels = context.capabilities.maskedChannels;
    // Empty: nothing composed yet (no primary, no groups, no children).
    const isEmpty =
        !evidence.primaryContact && evidence.groups.length === 0 && evidence.childCount === 0;
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
        setEditingPersonId(null);
        enterContext();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce gates re-apply
    }, [requestNonce, enterContext]);

    const householdIdentityVm = useMemo(
        () =>
            buildHouseholdIdentityCardVM({
                config: nestedConfig,
                groups: evidence.groups,
                canMutate: Boolean(mutation?.canEdit) && !maskedChannels && !composingHouseholdSurface,
                maskedChannels,
            }),
        [nestedConfig, evidence.groups, mutation?.canEdit, maskedChannels, composingHouseholdSurface],
    );
    const selectedIdentityRecord = useMemo((): IdentityRecordVM | null => {
        if (!disclosure.selectedIdentityId) return null;
        for (const section of householdIdentityVm.sections) {
            const found = section.items.find((item) => item.id === disclosure.selectedIdentityId);
            if (found) return found;
        }
        return null;
    }, [disclosure.selectedIdentityId, householdIdentityVm.sections]);

    const composeSelectedRecord = useMemo((): IdentityRecordVM | null => {
        if (!composeSelectedIdentityId) return null;
        for (const section of householdIdentityVm.sections) {
            const found = section.items.find((item) => item.id === composeSelectedIdentityId);
            if (found) return found;
        }
        return null;
    }, [composeSelectedIdentityId, householdIdentityVm.sections]);

    // ANY open state elevates as a centered Focus Card — Household never expands
    // height inline (no row reflow). Edit is the deepest state OF Focus.
    const level: FocusPanelPerspectiveLevel =
        editing ? "edit" : disclosure.depth !== "summary" ? "focused" : "base";
    useReportPerspective(coordination, "household", level);
    useDismissSignal(coordination, "household", () => {
        setEditingPersonId(null);
        resetDisclosure();
    });

    // Household children are belonging-only. Clicking a child hands off to the
    // Children card (which owns operational truth) — a Perspective Change, no fetch.
    // Household collapses itself as it hands off so it recedes cleanly to its base
    // footprint (no leftover expanded height reflowing behind the new Focus Card).
    const openChild = coordination
        ? (childId: string) => {
              // Record where this handoff came FROM so Back returns to this exact
              // Household state (focused group, or expanded when none).
              const source = { card: "household" as const, focus: disclosure.selectedSectionKey ?? null };
              resetDisclosure();
              coordination.requestFocus("children", childId, source);
          }
        : undefined;

    const density = !isEmpty && disclosure.depth !== "summary" ? "expanded" : "compact";
    const hasWarning = Boolean(evidence.missingCriticalWarning);
    // The transient saved chip takes precedence so the card visibly confirms the save.
    const statusTone = justSaved ? "ready" : hasWarning ? "at-risk" : "neutral";
    const statusChip = justSaved ? "✓ Saved" : hasWarning ? "Needs contact" : null;

    const footerAction =
        isEmpty || editing ? null :
        disclosure.depth === "evidence" && selectedIdentityRecord ?
            <IdentityDisclosureBackAction label="← Back to details" onBack={composingHouseholdSurface ? backWithComposerSync : backDisclosure} dataAction="back-to-details" />
        : disclosure.depth === "details" && selectedIdentityRecord ?
            <IdentityDisclosureBackAction label="← View household" onBack={composingHouseholdSurface ? backWithComposerSync : backDisclosure} dataAction="back-to-context" />
        : disclosure.depth === "context" ?
            <IdentityDisclosureBackAction label="← Back to panel" onBack={composingHouseholdSurface ? backWithComposerSync : backDisclosure} dataAction="back-to-summary" />
        : evidence.groups.length > 0 ?
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => enterContext()}
                data-household-action="expand"
            >
                View household →
            </button>
        : null;

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
    } else if (showComposeCanvas && nestedConfig && composer) {
        const purpose = composePurpose ?? "summary";
        perspective = purpose === "summary" ? "collapsed" : "focused";
        const primarySection = householdIdentityVm.sections.find((section) => section.key === "primary_contact");
        const secondarySection = householdIdentityVm.sections.find((section) => section.key === "other_parent_guardian");
        const primaryRecord = primarySection?.items[0] ?? null;
        const secondaryRecords = secondarySection?.items ?? [];
        body = (
            <IdentityComposeCanvasShell
                activePurpose={purpose}
                onSelectPurpose={composer.setActiveConfigPurpose}
                composeCanvasMode={composer.composeCanvasMode}
                groupLabel="Household contacts"
                onBack={() => composer.exitDrillIn()}
            >
                {purpose === "evidence" ? (
                    <IdentityEvidenceCollectionsPanel
                        surfaceId={HOUSEHOLD_SURFACE_ID}
                        groupKey={composeSelectedGroupKey}
                        config={nestedConfig}
                        onChange={(next) => composer.updateConfig(HOUSEHOLD_SURFACE_ID, next)}
                    />
                ) : purpose === "details" ? (
                    composeSelectedRecord ? (
                        <IdentityComposeSectionCanvas
                            surfaceId={HOUSEHOLD_SURFACE_ID}
                            groupKey={composeSelectedGroupKey}
                            record={composeSelectedRecord}
                            purpose="details"
                        />
                    ) : (
                        <ExpandedBody
                            groups={evidence.groups}
                            masked={maskedChannels}
                            onSelectIdentity={handleSelectIdentityForCompose}
                            onOpenChild={openChild}
                            onEditContact={undefined}
                            onAddEmergencyContact={undefined}
                            composing
                            composePurpose={purpose}
                            nestedConfig={nestedConfig}
                            composePickerOnly
                        />
                    )
                ) : purpose === "context_facts" ? (
                    <ExpandedBody
                        groups={evidence.groups}
                        masked={maskedChannels}
                        onSelectIdentity={handleSelectIdentityForCompose}
                        onOpenChild={openChild}
                        onEditContact={undefined}
                        onAddEmergencyContact={undefined}
                        composing
                        composePurpose={purpose}
                        nestedConfig={nestedConfig}
                    />
                ) : (
                    <div className="alloy-os-household__summary">
                        <div className="identity-summary-columns" data-identity-summary-columns="true">
                            <ComposableRegionShell
                                surfaceId={HOUSEHOLD_SURFACE_ID}
                                groupKey="primary_contact"
                                className="alloy-os-household__summary-region identity-summary-columns__cell"
                                dataAttrs={{ "data-household-summary-region": "primary_contact" }}
                            >
                                <IdentityComposeSectionCanvas
                                    surfaceId={HOUSEHOLD_SURFACE_ID}
                                    groupKey="primary_contact"
                                    record={primaryRecord}
                                    purpose="summary"
                                />
                            </ComposableRegionShell>
                            <ComposableRegionShell
                                surfaceId={HOUSEHOLD_SURFACE_ID}
                                groupKey="other_parent_guardian"
                                className="alloy-os-household__summary-region identity-summary-columns__cell"
                                dataAttrs={{ "data-household-summary-region": "other_parent_guardian" }}
                            >
                                <IdentityComposeSectionCanvas
                                    surfaceId={HOUSEHOLD_SURFACE_ID}
                                    groupKey="other_parent_guardian"
                                    record={secondaryRecords[0] ?? null}
                                    purpose="summary"
                                />
                            </ComposableRegionShell>
                        </div>
                        {evidence.address ? <AddressLine address={evidence.address} /> : null}
                    </div>
                )}
            </IdentityComposeCanvasShell>
        );
    } else if (selectedIdentityRecord && (disclosure.depth === "details" || disclosure.depth === "evidence")) {
        perspective = disclosure.depth === "evidence" ? "focused" : "focused";
        body = (
            <IdentityDisclosureSurface
                record={selectedIdentityRecord}
                depth={disclosure.depth}
                onEditContact={onEditContact}
                onEnterEvidence={
                    disclosure.depth === "details"
                        ? () => enterEvidence(selectedIdentityRecord.id, disclosure.selectedSectionKey)
                        : undefined
                }
            />
        );
    } else if (disclosure.depth === "context") {
        perspective = "expanded";
        body = (
            <ExpandedBody
                groups={evidence.groups}
                masked={maskedChannels}
                onOpenChild={openChild}
                onEditContact={onEditContact}
                onSelectIdentity={
                    composingHouseholdSurface ? handleSelectIdentityForCompose : (personId, sectionKey) => selectIdentity(personId, sectionKey)
                }
                onAddEmergencyContact={
                    canEdit && mutation ? () => mutation.openAddEmergencyContact() : undefined
                }
                composing={composer?.isComposingSurface(HOUSEHOLD_SURFACE_ID) ?? false}
                composePurpose={composePurpose}
                nestedConfig={nestedConfig}
            />
        );
    } else {
        perspective = "collapsed";
        body = (
            <CollapsedBody
                evidence={evidence}
                masked={maskedChannels}
                composing={composer?.isComposingSurface(HOUSEHOLD_SURFACE_ID) ?? false}
                composePurpose={composePurpose}
                nestedConfig={nestedConfig}
                canEdit={canEdit}
                onPreviewGroup={() => enterContext()}
                onEditContact={onEditContact}
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
    composing = false,
    composePurpose = null,
    nestedConfig,
    canEdit,
    onPreviewGroup,
    onAddEmergencyContact,
    onEditContact,
}: {
    evidence: ReturnType<typeof buildHouseholdCardEvidence>;
    masked: boolean;
    composing?: boolean;
    composePurpose?: IdentityConfigurationPurpose | null;
    nestedConfig: NestedSurfaceConfig | null;
    canEdit?: boolean;
    onPreviewGroup: (key: HouseholdEvidenceGroupKey) => void;
    onAddEmergencyContact?: () => void;
    onEditContact?: (personId: string) => void;
}) {
    const identityVm = useMemo(
        () =>
            buildHouseholdIdentityCardVM({
                config: nestedConfig,
                groups: evidence.groups,
                canMutate: Boolean(canEdit) && !masked && !composing,
                maskedChannels: masked,
            }),
        [nestedConfig, evidence.groups, canEdit, masked, composing],
    );
    const primarySection = identityVm.sections.find((section) => section.key === "primary_contact");
    const secondarySection = identityVm.sections.find((section) => section.key === "other_parent_guardian");
    const primaryRecord = primarySection?.items[0] ?? null;
    const secondaryRecords = secondarySection?.items ?? [];
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
    const warningTarget: HouseholdEvidenceGroupKey | null =
        evidence.emergencyContactCount === 0 && evidence.primaryContact
            ? "emergency_contacts"
            : "primary_contact";

    return (
        <div className="alloy-os-household__summary">
            <div className="identity-summary-columns" data-identity-summary-columns="true">
            <ComposableRegionShell
                surfaceId={HOUSEHOLD_SURFACE_ID}
                groupKey="primary_contact"
                className="alloy-os-household__summary-region identity-summary-columns__cell"
                dataAttrs={{ "data-household-summary-region": "primary_contact" }}
            >
                {primaryRecord ? (
                    <IdentityRecordSummary
                        record={primaryRecord}
                        depth="summary"
                        onEditContact={
                            primaryRecord.id !== "primary" && !masked && !composing
                                ? onEditContact
                                : undefined
                        }
                        onEditField={
                            primaryRecord.id !== "primary" && onEditContact && !masked && !composing
                                ? () => onEditContact(primaryRecord.id)
                                : undefined
                        }
                        dataAttr="primary"
                    />
                ) : evidence.primaryContact ? (
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
                                    masked && "alloy-os-household__channel--missing",
                                )}
                                data-household-channel="true"
                            >
                                {masked
                                    ? "Contact details restricted"
                                    : [evidence.primaryPhone, evidence.primaryEmail].filter(Boolean).join(" · ")
                                        || "No contact channel on file"}
                            </span>
                        </div>
                    </div>
                ) : (
                    <p className="alloy-os-household__missing" data-household-missing="primary">
                        Primary contact needed
                    </p>
                )}

            </ComposableRegionShell>

            {secondaryRecords.length > 0 ? (
                <ComposableRegionShell
                    surfaceId={HOUSEHOLD_SURFACE_ID}
                    groupKey="other_parent_guardian"
                    className="alloy-os-household__summary-region identity-summary-columns__cell"
                    dataAttrs={{ "data-household-summary-region": "other_parent_guardian" }}
                >
                    {secondaryRecords.map((record) => (
                        <IdentityRecordSummary
                            key={record.id}
                            record={record}
                            depth="summary"
                            onEditContact={!masked && !composing ? onEditContact : undefined}
                            onEditField={
                                onEditContact && !masked && !composing
                                    ? () => onEditContact(record.id)
                                    : undefined
                            }
                            dataAttr={record.id}
                        />
                    ))}

                </ComposableRegionShell>
            ) : composing ? (
                <ComposableRegionShell
                    surfaceId={HOUSEHOLD_SURFACE_ID}
                    groupKey="other_parent_guardian"
                    className="alloy-os-household__summary-region identity-summary-columns__cell"
                    dataAttrs={{ "data-household-summary-region": "other_parent_guardian" }}
                >
                    <p className="alloy-os-household__row-detail">Add secondary parent fields when contacts exist</p>
                    <p className="alloy-os-household__row-detail">Add secondary parent fields when contacts exist</p>
                </ComposableRegionShell>
            ) : null}
            </div>

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
    onSelectIdentity,
    onOpenChild,
    onEditContact,
    onAddEmergencyContact,
    composing,
    composePurpose = null,
    nestedConfig,
    composePickerOnly = false,
}: {
    groups: HouseholdEvidenceGroup[];
    masked: boolean;
    onSelectIdentity: (personId: string, sectionKey: string) => void;
    onOpenChild?: (childId: string) => void;
    onEditContact?: (personId: string) => void;
    onAddEmergencyContact?: () => void;
    composing: boolean;
    composePurpose?: IdentityConfigurationPurpose | null;
    nestedConfig: NestedSurfaceConfig | null;
    composePickerOnly?: boolean;
}) {
    return (
        <div className="alloy-os-household__groups" data-household-groups data-identity-depth="context">
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
                    <div className="alloy-os-household__group-header">
                        {composing ? (
                            <InlineSectionControls surfaceId={HOUSEHOLD_SURFACE_ID} groupKey={group.key} />
                        ) : null}
                        <span className="alloy-os-household__group-title">
                            {(composing && nestedConfig ? nestedGroupLabel(nestedConfig, group.key) : null) ?? group.title}
                        </span>
                        <span className="alloy-os-household__group-count">{group.count}</span>
                    </div>
                    <GroupRows
                        group={group}
                        masked={masked}
                        onOpenChild={onOpenChild}
                        onSelectIdentity={onSelectIdentity}
                        onEditContact={onEditContact}
                        onAddEmergencyContact={onAddEmergencyContact}
                        nestedConfig={nestedConfig}
                        composing={composing}
                        composePurpose={composePurpose}
                        composePickerOnly={composePickerOnly}
                    />
                    {composing && !composePickerOnly && composePurpose !== "context_facts" ? <NestedSurfaceAddField surfaceId={HOUSEHOLD_SURFACE_ID} groupKey={group.key} /> : null}
                </ComposableRegionShell>
            ))}
            {composing ? <AddSectionMenu surfaceId={HOUSEHOLD_SURFACE_ID} /> : null}
        </div>
    );
}


/** Household groups render runtime rows; Add field is one per selected region. */
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
    onSelectIdentity,
    onEditContact,
    onAddEmergencyContact,
    nestedConfig = null,
    composing = false,
    composePurpose = null,
    composePickerOnly = false,
}: {
    group: HouseholdEvidenceGroup;
    masked: boolean;
    limit?: number;
    onOpenChild?: (childId: string) => void;
    onSelectIdentity?: (personId: string, sectionKey: string) => void;
    onEditContact?: (personId: string) => void;
    onAddEmergencyContact?: () => void;
    nestedConfig?: NestedSurfaceConfig | null;
    composing?: boolean;
    composePurpose?: IdentityConfigurationPurpose | null;
    composePickerOnly?: boolean;
}) {
    if (group.key === "address" && group.addressLine) {
        return <AddressLine address={group.addressLine} />;
    }

    if (group.key === "emergency_contacts" && group.contacts.length === 0) {
        return <EmergencyEmptyState onAdd={onAddEmergencyContact} composing={composing} />;
    }

    const identitySection = buildHouseholdIdentityCardVM({
        config: nestedConfig,
        groups: [group],
        canMutate: Boolean(onEditContact) && !masked && !composing,
        maskedChannels: masked,
    }).sections.find((section) => section.key === group.key);
    const items = identitySection?.items ?? [];
    const visible = limit ? items.slice(0, limit) : items;
    const overflow = items.length - visible.length;
    return (
        <div className="alloy-os-household__rows">
            {group.children.length > 0 ? (
                <p className="alloy-os-household__group-caption" data-household-children-caption="true">
                    Belonging only — open Children for enrollment detail
                </p>
            ) : null}
            {composing && (composePurpose === "context_facts" || composePickerOnly) && visible[0] ? (
                <>
                    {!composePickerOnly ? (
                        <IdentityComposeSectionCanvas
                            surfaceId={HOUSEHOLD_SURFACE_ID}
                            groupKey={group.key}
                            record={visible[0]}
                            purpose={composePickerOnly ? "details" : "context_facts"}
                        />
                    ) : null}
                    <IdentityCollectionContext
                        records={visible}
                        selectable={Boolean(onSelectIdentity)}
                        onSelectIdentity={
                            onSelectIdentity
                                ? (personId) => onSelectIdentity(personId, group.key)
                                : undefined
                        }
                    />
                </>
            ) : group.contacts.length > 0 ? (
                <IdentityCollectionContext
                    records={visible}
                    selectable={Boolean(onSelectIdentity && !composing)}
                    onSelectIdentity={
                        onSelectIdentity && !composing
                            ? (personId) => onSelectIdentity(personId, group.key)
                            : undefined
                    }
                    onEditContact={onEditContact && !composing && !masked ? onEditContact : undefined}
                    onEditField={
                        onEditContact && !composing && !masked
                            ? (fieldRef) => {
                                  const record = visible.find((row) =>
                                      [...row.summaryRows, ...row.contextRows].some((r) =>
                                          r.cells.some((c) => c.fieldRef === fieldRef),
                                      ),
                                  );
                                  if (record) onEditContact(record.id);
                              }
                            : undefined
                    }
                />
            ) : (
                visible.map((record) => (
                    <IdentityRecordSummary
                        key={record.id}
                        record={record}
                        depth="summary"
                        onActivate={group.children.length > 0 ? onOpenChild : undefined}
                        dataAttr={record.id}
                    />
                ))
            )}
            {overflow > 0 ? (
                <div className="alloy-os-household__overflow">+{overflow} more</div>
            ) : null}
        </div>
    );
}

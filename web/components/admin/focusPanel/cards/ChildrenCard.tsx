"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
    BadgeCheck,
    Cake,
    CalendarClock,
    CalendarDays,
    Clock,
    DoorOpen,
    FileText,
    GraduationCap,
    User,
    type LucideIcon,
} from "lucide-react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import ChildFocusEdit from "@/components/admin/focusPanel/cards/ChildFocusEdit";
import IdentityRecordSummary from "@/components/admin/focusPanel/identity/IdentityRecordSummary";
import IdentityFieldGrid from "@/components/admin/focusPanel/identity/IdentityFieldGrid";
import IdentityExpandedDetails from "@/components/admin/focusPanel/identity/IdentityExpandedDetails";
import IdentityDisclosureBackAction from "@/components/admin/focusPanel/identity/IdentityDisclosureBackAction";
import IdentityDisclosureSurface from "@/components/admin/focusPanel/identity/IdentityDisclosureSurface";
import IdentityCollectionContext from "@/components/admin/focusPanel/identity/IdentityCollectionContext";
import { useIdentityDisclosureState } from "@/lib/adminV2/runtime/focusPanel/identity/useIdentityDisclosureState";
import ComposableRegionShell from "@/components/admin/focusPanel/drillIn/ComposableRegionShell";
import NestedSurfaceFieldLayoutSurface, {
    type LayoutSurfaceFieldMeta,
} from "@/components/admin/focusPanel/drillIn/NestedSurfaceFieldLayoutSurface";
import ChildProfileAvatarComposer from "@/components/admin/focusPanel/drillIn/ChildProfileAvatarComposer";
import EvidenceSectionCard from "@/components/admin/focusPanel/drillIn/EvidenceSectionCard";
import AddSectionMenu from "@/components/admin/focusPanel/drillIn/AddSectionMenu";
import EmergencyContactsSection from "@/components/admin/focusPanel/emergencyContacts/EmergencyContactsSection";
import {
    buildChildrenCardEvidence,
    type ChildrenEvidenceChild,
} from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import {
    childFocusViewFromConfig,
    isChildFocusFieldSaveSupported,
    type ChildFocusFieldKey,
    type ChildFocusView,
} from "@/lib/adminV2/runtime/focusPanel/children/childIdentityFieldRuntime";
import { seedChildFocusEditValues } from "@/lib/adminV2/runtime/focusPanel/children/childFocusEditState";
import { usePublishedFocusPanelSummaryDoc } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import {
    CHILDREN_FOCUS_GROUP_KEYS,
    childrenDetailFieldKeysFromNestedConfig,
    childrenEmergencyContactsSectionFromConfig,
    childrenEvidenceSectionsFromNestedConfig,
    childrenFocusRowsFromNestedConfig,
    readChildrenNestedConfigFromDoc,
    type ChildrenEvidenceSectionView,
    type ChildrenFocusFieldRow,
} from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
import {
    CHILDREN_SURFACE_ID,
    fieldPresentationLabel,
    groupShowAvatarForNestedGroup,
    isNestedGroupEnabled,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { cardCapabilities, cardRelatedViews } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLifecycle";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import {
    focusPanelCardBackLabel,
    type FocusPanelCoordination,
    type FocusPanelPerspectiveLevel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { buildChildIdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import IdentityComposeCanvasShell from "@/components/admin/focusPanel/identity/IdentityComposeCanvasShell";
import IdentityComposeChildPicker from "@/components/admin/focusPanel/identity/IdentityComposeChildPicker";
import IdentityComposeSectionCanvas from "@/components/admin/focusPanel/identity/IdentityComposeSectionCanvas";
import IdentityEvidenceCollectionsPanel from "@/components/adminV2/settings/surfaces/composer/IdentityEvidenceCollectionsPanel";
import { shouldRenderIdentityComposeCanvas } from "@/lib/adminV2/runtime/focusPanel/identity/identityComposeMode";
import { builderPurposeForDisclosureDepth } from "@/lib/adminV2/runtime/focusPanel/identity/useSyncBuilderDisclosure";
import { identityDisclosureCoordinationLevel } from "@/lib/adminV2/runtime/focusPanel/identity/identityDisclosureState";
import { backIdentityDisclosure } from "@/lib/adminV2/runtime/focusPanel/identity/identityDisclosureState";
import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";

type ChildrenComposerPreview = {
    perspective: "roster" | "child_focus" | "child_edit";
    focusedChildId?: string;
    childFocusView?: ChildFocusView;
    onSelectChild?: () => void;
};

type Props = {
    model: FocusPanelCardModel;
    /** Forward-facing card boundary — Children observes this, never the drawer VM. */
    context: OperationalContext;
    receded?: boolean;
    /** Owner card: receives cross-card handoffs (e.g. from Readiness). */
    coordination?: FocusPanelCoordination;
    /** Injected save seam (Edit depth). Absent → editable fields stay read-only. */
    mutation?: FocusPanelMutation;
    /** Surface composer runtime canvas — forces perspective without live save. */
    composerPreview?: ChildrenComposerPreview;
};

const CAPS = cardCapabilities("children");
const RELATED_VIEWS = cardRelatedViews("children");

/**
 * Children operational card — reference implementation of the Universal Card Lifecycle
 * (Universal Card Behavior V1). The Child card OWNS its operational truth as evidence
 * groups: Identity · Placement (Program/Room/Schedule/Teacher/Desired Start) · Medical ·
 * Documents · Readiness · Notes. Placement is an evidence group, NOT its own card.
 *
 *   - Summary   — roster: each child as a scannable mini-profile.
 *   - Focus     — current truth (identity + placement) in a strong schedule structure.
 *   - Edit      — config-driven child drill-in with live save when fields are editable.
 *   - Expanded  — the SAME question with ADDITIONAL configured evidence groups
 *                 (placement / medical / documents / pickup / notes / readiness). Not history.
 *   - Related Views — optional report drill-downs (Schedule History, Placement History).
 *
 * @see docs/platform/operator/universal-card-lifecycle.md
 */
export default function ChildrenCard({
    model,
    context,
    receded = false,
    coordination,
    mutation,
    composerPreview,
}: Props) {
    const composer = useFocusPanelComposer();
    const publishedDoc = usePublishedFocusPanelSummaryDoc(true);
    const composingChildrenSurface = composer?.isComposingSurface(CHILDREN_SURFACE_ID) ?? false;
    const childrenSurfaceConfig = useMemo(
        () => (composingChildrenSurface ? composer?.configFor(CHILDREN_SURFACE_ID) ?? null : readChildrenNestedConfigFromDoc(publishedDoc)),
        [composer, composingChildrenSurface, publishedDoc],
    );
    // Focus read layout is authored on canonical `children_surface`.
    // `child_surface` is adapted only through readChildrenNestedConfigFromDoc.
    const childFocusView = useMemo(
        () => composerPreview?.childFocusView ?? childFocusViewFromConfig(childrenSurfaceConfig),
        [composerPreview?.childFocusView, childrenSurfaceConfig],
    );
    const focusRows = useMemo(
        () => childrenFocusRowsFromNestedConfig(childrenSurfaceConfig),
        [childrenSurfaceConfig],
    );
    const evidenceSections = useMemo(
        () => childrenEvidenceSectionsFromNestedConfig(childrenSurfaceConfig),
        [childrenSurfaceConfig],
    );
    const emergencyContactsSection = useMemo(
        () =>
            childrenSurfaceConfig && isNestedGroupEnabled(childrenSurfaceConfig, "emergency_contacts")
                ? childrenEmergencyContactsSectionFromConfig(childrenSurfaceConfig)
                : null,
        [childrenSurfaceConfig],
    );
    const childDetailFieldKeys = useMemo(
        () => childrenDetailFieldKeysFromNestedConfig(childrenSurfaceConfig),
        [childrenSurfaceConfig],
    );
    const evidence = useMemo(
        () => buildChildrenCardEvidence(context, { childDetailFieldKeys }),
        [context, childDetailFieldKeys],
    );

    const hasEditableChildFields = childFocusView.focusFields.some((field) => field.editable);
    const canEditChild = Boolean(mutation?.canEdit && hasEditableChildFields && !composerPreview);
    const opportunityStartDate =
        context.truth.start_date != null ? String(context.truth.start_date).slice(0, 10) : null;

    const [editing, setEditing] = useState(false);
    const [relatedViewId, setRelatedViewId] = useState<string | null>(null);
    const {
        state: disclosure,
        enterContext,
        selectIdentity,
        enterEvidence,
        back: backDisclosure,
        reset: resetDisclosure,
    } = useIdentityDisclosureState();

    const request = coordination?.request;
    const requestNonce = request?.card === "children" ? request.nonce : null;
    useEffect(() => {
        if (request?.card !== "children") return;
        if (composingChildrenSurface && composer?.composeCanvasMode !== "preview") return;
        enterContext();
        if (request.focus) selectIdentity(String(request.focus), "roster");
        setEditing(false);
        setRelatedViewId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce gates re-apply
    }, [requestNonce, enterContext, selectIdentity, composingChildrenSurface, composer?.composeCanvasMode]);

    useEffect(() => {
        if (!composerPreview) return;
        if (composerPreview.perspective === "roster") {
            enterContext();
            setEditing(false);
            return;
        }
        const previewChildId =
            composerPreview.focusedChildId ?? evidence.children[0]?.id ?? null;
        enterContext();
        if (previewChildId) selectIdentity(previewChildId);
        setEditing(composerPreview.perspective === "child_edit");
    }, [composerPreview, evidence.children, enterContext, selectIdentity]);

    const composePurpose: IdentityConfigurationPurpose | null = composingChildrenSurface
        ? composer?.activeConfigPurpose ?? "summary"
        : null;

    const showComposeCanvas = shouldRenderIdentityComposeCanvas({
        composing: composingChildrenSurface,
        composeCanvasMode: composer?.composeCanvasMode,
    });
    const composeFocusedChild =
        composingChildrenSurface && composer?.selectedIdentityId
            ? evidence.children.find((c) => c.id === composer.selectedIdentityId) ?? null
            : null;

    const focusChildForCompose = (id: string) => {
        composer?.setSelectedIdentityId(id);
        composer?.setActiveConfigPurpose("details");
        composer?.setDrillDepth({ kind: "child-focus", childId: id });
        composer?.select({ kind: "region", surfaceId: CHILDREN_SURFACE_ID, groupKey: "identity" });
    };

    useEffect(() => {
        if (!composingChildrenSurface || composer?.composeCanvasMode === "preview") return;
        resetDisclosure();
    }, [composingChildrenSurface, composer?.composeCanvasMode, resetDisclosure]);


    const backWithComposerSync = () => {
        const next = backIdentityDisclosure(disclosure);
        backDisclosure();
        if (composingChildrenSurface && composer) {
            composer.setActiveConfigPurpose(builderPurposeForDisclosureDepth(next.depth));
            composer.setSelectedIdentityId(next.selectedIdentityId ?? null);
        }
    };

    const isEmpty = evidence.count === 0;
    const focused =
        !isEmpty && disclosure.selectedIdentityId
            ? evidence.children.find((c) => c.id === disclosure.selectedIdentityId) ?? null
            : null;
    const editSeed = useMemo(
        () => (editing && focused ? seedChildFocusEditValues(context.truth, focused.id) : null),
        [editing, focused, context.truth],
    );

    const selectChildIdentity = (id: string) => {
        if (composerPreview?.onSelectChild) {
            composerPreview.onSelectChild();
            return;
        }
        if (showComposeCanvas) {
            focusChildForCompose(id);
            return;
        }
        selectIdentity(id, "roster");
        setEditing(false);
        setRelatedViewId(null);
    };
    const backToFocus = () => {
        setEditing(false);
        setRelatedViewId(null);
        if (disclosure.depth === "evidence") {
            backDisclosure();
        }
    };

    const level: FocusPanelPerspectiveLevel = showComposeCanvas
        ? "base"
        : identityDisclosureCoordinationLevel({
              depth: disclosure.depth,
              editing: Boolean(editing && focused),
          });
    useReportPerspective(coordination, "children", level);
    useDismissSignal(coordination, "children", () => {
        setEditing(false);
        setRelatedViewId(null);
        resetDisclosure();
    });

    const density = !isEmpty && disclosure.depth !== "summary" ? "expanded" : "compact";
    const statusTone = evidence.hasAttention ? "at-risk" : "neutral";
    const statusChip = isEmpty ? null : evidence.hasAttention ? "Needs info" : `${evidence.count}`;

    const backOrigin = editing ? null : coordination?.previousFocus ?? null;
    const backToSourceButton = backOrigin ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => coordination?.back?.()}
            data-children-action="back-to-source"
        >
            ← Back to {focusPanelCardBackLabel(backOrigin.card)}
        </button>
    ) : null;

    // Nav grammar: LEFT = back / out · RIGHT = the single deeper action (Edit). Expanded
    // and Related Views are reached from quiet in-body links (see FocusedChild).
    const firstName = focused?.name.split(" ")[0];
    const backToFocusButton = (action: string) => (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={backToFocus}
            data-children-action={action}
        >
            ← Back to {firstName}
        </button>
    );

    let runtimeFooterAction: React.ReactNode;
    if (isEmpty) {
        runtimeFooterAction = null;
    } else if (editing && focused) {
        runtimeFooterAction = backToFocusButton("cancel-edit");
    } else if (relatedViewId && focused) {
        runtimeFooterAction = backToFocusButton("close-related");
    } else if (disclosure.depth === "evidence" && focused) {
        runtimeFooterAction = backToFocusButton("collapse-evidence");
    } else if (focused && disclosure.depth === "details") {
        runtimeFooterAction = (
            <div className="alloy-os-card-nav">
                {backToSourceButton ?? (
                    <IdentityDisclosureBackAction
                        label="← All children"
                        onBack={composingChildrenSurface ? backWithComposerSync : backDisclosure}
                        dataAction="back"
                    />
                )}
                {canEditChild ?
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        onClick={() => setEditing(true)}
                        data-children-edit-trigger={focused.id}
                    >
                        {deeperEditLabel(focused)} →
                    </button>
                :   null}
                {CAPS.supportsExpanded && evidenceSections.length > 0 ?
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        onClick={() => enterEvidence(focused.id, "roster")}
                        data-children-evidence-trigger={focused.id}
                    >
                        View evidence →
                    </button>
                :   null}
            </div>
        );
    } else if (disclosure.depth === "context") {
        runtimeFooterAction =
            backToSourceButton ?? (
                <IdentityDisclosureBackAction
                    label="← Back to panel"
                    onBack={composingChildrenSurface ? backWithComposerSync : backDisclosure}
                    dataAction="collapse"
                />
            );
    } else {
        runtimeFooterAction = (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => enterContext()}
                data-children-action="expand"
            >
                View children →
            </button>
        );
    }


    const footerAction = showComposeCanvas
        ? null
        : composingChildrenSurface && composer?.composeCanvasMode === "configure"
            ? null
            : runtimeFooterAction;

    const focusedIdentityRecord = useMemo(() => {
        if (!focused || !childrenSurfaceConfig) return null;
        return buildChildIdentityRecordVM({
            config: childrenSurfaceConfig,
            child: focused,
            groupKey: "identity",
            canMutate: canEditChild,
            isFieldSaveSupported: (fieldRef) =>
                isChildFocusFieldSaveSupported(fieldRef as ChildFocusFieldKey),
        });
    }, [focused, childrenSurfaceConfig, canEditChild]);

    const contextRosterRecords = useMemo(
        () =>
            evidence.children.map((child) => ({
                ...buildChildIdentityRecordVM({
                    config: childrenSurfaceConfig,
                    child,
                    groupKey: "roster",
                }),
                badge: child.status,
            })),
        [evidence.children, childrenSurfaceConfig],
    );

    let lifecycle: "empty" | "summary" | "focus" | "edit" | "expanded" | "related";
    let body: React.ReactNode;
    if (isEmpty) {
        lifecycle = "empty";
        body = (
            <div className="alloy-os-household__summary" data-children-empty="true">
                <p className="alloy-os-household__row-detail">No children linked to this record yet</p>
            </div>
        );
    } else if (showComposeCanvas && childrenSurfaceConfig && composer) {
        const purpose = composePurpose ?? "summary";
        lifecycle = purpose === "summary" ? "summary" : "focus";
        const rosterSummaryRecord = evidence.children[0]
            ? buildChildIdentityRecordVM({
                  config: childrenSurfaceConfig,
                  child: evidence.children[0]!,
                  groupKey: "roster",
              })
            : null;
        body = (
            <IdentityComposeCanvasShell
                activePurpose={purpose}
                onSelectPurpose={composer.setActiveConfigPurpose}
                composeCanvasMode={composer.composeCanvasMode}
                surfaceId={CHILDREN_SURFACE_ID}
                selectedGroupKey="roster"
                groupLabel="Children roster"
                onBack={() => composer.exitDrillIn()}
            >
                {purpose === "evidence" ? (
                    <IdentityEvidenceCollectionsPanel
                        surfaceId={CHILDREN_SURFACE_ID}
                        groupKey="roster"
                        config={childrenSurfaceConfig}
                        onChange={(next) => composer.updateConfig(CHILDREN_SURFACE_ID, next)}
                    />
                ) : purpose === "details" ? (
                    composeFocusedChild ? (
                        <FocusedChild
                            child={composeFocusedChild}
                            editing={false}
                            editSeed={null}
                            expandedOpen={false}
                            relatedViewId={null}
                            childFocusView={childFocusView}
                            focusRows={focusRows}
                            evidenceSections={evidenceSections}
                            emergencyContactsSection={emergencyContactsSection}
                            context={context}
                            childrenSurfaceConfig={childrenSurfaceConfig}
                            opportunityStartDate={opportunityStartDate}
                            mutation={mutation}
                            composerPreview={composerPreview}
                            composingChildrenSurface
                            disclosureDepth="details"
                            onExpand={undefined}
                            onOpenRelated={(id) => setRelatedViewId(id)}
                            onRequestEdit={undefined}
                            onEditClose={() => setEditing(false)}
                        />
                    ) : (
                        <IdentityComposeChildPicker
                            children={evidence.children}
                            selectedId={composer.selectedIdentityId}
                            onSelect={focusChildForCompose}
                        />
                    )
                ) : purpose === "context_facts" ? (
                    <ComposableRegionShell
                        surfaceId={CHILDREN_SURFACE_ID}
                        groupKey="roster"
                        label="Roster rows"
                        className="alloy-os-children__composer-region"
                        dataAttrs={{ "data-children-roster-region": "true", "data-identity-depth": "context" }}
                    >
                        <IdentityComposeSectionCanvas
                            surfaceId={CHILDREN_SURFACE_ID}
                            groupKey="roster"
                            record={contextRosterRecords[0] ?? null}
                            purpose="context_facts"
                        />
                        <IdentityComposeChildPicker
                            children={evidence.children}
                            selectedId={composer.selectedIdentityId}
                            onSelect={focusChildForCompose}
                            hint="Select a child to configure Detail Fields"
                        />
                    </ComposableRegionShell>
                ) : (
                    <ComposableRegionShell
                        surfaceId={CHILDREN_SURFACE_ID}
                        groupKey="roster"
                        label="Roster rows"
                        className="alloy-os-children__composer-region"
                        dataAttrs={{ "data-children-roster-region": "true", "data-identity-depth": "summary" }}
                    >
                        <IdentityComposeSectionCanvas
                            surfaceId={CHILDREN_SURFACE_ID}
                            groupKey="roster"
                            record={rosterSummaryRecord}
                            purpose="summary"
                        />
                    </ComposableRegionShell>
                )}
            </IdentityComposeCanvasShell>
        );
    } else if (focused && editing && editSeed && disclosure.depth === "details") {
        lifecycle = "edit";
        body = (
            <ChildFocusEdit
                seed={editSeed}
                childName={focused.name}
                childSurfaceConfig={childrenSurfaceConfig}
                opportunityStartDate={opportunityStartDate}
                save={mutation!.saveInquiryChild}
                onClose={() => setEditing(false)}
                onSaved={() => setEditing(false)}
            />
        );
    } else if (focused && relatedViewId && disclosure.depth === "details") {
        lifecycle = "related";
        body = <ChildRelatedReport child={focused} viewId={relatedViewId} />;
    } else if (focused && focusedIdentityRecord && (disclosure.depth === "evidence" || disclosure.depth === "details")) {
        lifecycle = disclosure.depth === "evidence" ? "expanded" : "focus";
        body = (
            <>
                <IdentityDisclosureSurface
                    record={{ ...focusedIdentityRecord, badge: focused.status }}
                    depth={disclosure.depth}
                    onEnterEvidence={
                        disclosure.depth === "details" && evidenceSections.length > 0
                            ? () => enterEvidence(focused.id, "roster")
                            : undefined
                    }
                    onEditField={canEditChild ? () => setEditing(true) : undefined}
                />
                {disclosure.depth === "details" && emergencyContactsSection && childrenSurfaceConfig ? (
                    <EmergencyContactsSection
                        child={focused}
                        context={context}
                        section={emergencyContactsSection}
                        config={childrenSurfaceConfig}
                        mutation={mutation}
                        composing={composingChildrenSurface}
                    />
                ) : null}
            </>
        );
    } else if (disclosure.depth === "context") {
        lifecycle = "focus";
        body = (
            <ComposableRegionShell
                surfaceId={CHILDREN_SURFACE_ID}
                groupKey="roster"
                label="Roster rows"
                className="alloy-os-children__composer-region"
                dataAttrs={{ "data-children-roster-region": "true", "data-identity-depth": "context" }}
            >
                <IdentityCollectionContext
                        records={contextRosterRecords}
                        selectable
                        onSelectIdentity={selectChildIdentity}
                    />
            </ComposableRegionShell>
        );
    } else {
        lifecycle = "summary";
        body = (
            <ComposableRegionShell
                surfaceId={CHILDREN_SURFACE_ID}
                groupKey="roster"
                label="Roster rows"
                className="alloy-os-children__composer-region"
                dataAttrs={{ "data-children-roster-region": "true", "data-identity-depth": "summary" }}
            >
                <div className="alloy-os-children__roster" data-children-roster>
                        {evidence.children.map((child) => (
                            <ChildSummaryRow
                                key={child.id}
                                child={child}
                                depth="summary"
                                childrenSurfaceConfig={childrenSurfaceConfig}
                                onActivate={
                                    composingChildrenSurface ? undefined : selectChildIdentity
                                }
                            />
                        ))}
                    </div>
            </ComposableRegionShell>
        );
    }

    return (
        <div
            className="alloy-os-household alloy-os-children"
            data-children-card="true"
            data-children-card-perspective={
                lifecycle === "summary"
                    ? "collapsed"
                    : lifecycle === "focus"
                      ? "focused"
                      : lifecycle
            }
            data-children-lifecycle={lifecycle}
        >
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={lifecycle === "summary" && disclosure.depth === "summary" ? evidence.supportingLine : null}
                iconName={model.iconName}
                tier={model.tier}
                archetype="collection"
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

function StatusPill({ child }: { child: ChildrenEvidenceChild }) {
    if (!child.status) return null;
    return (
        <span
            className={clsx("alloy-os-card-pill", `alloy-os-card-pill--${child.statusTone}`)}
            data-children-status={child.statusTone}
        >
            {child.status}
        </span>
    );
}

function Ico({ icon: Icon }: { icon: LucideIcon }) {
    return (
        <span className="alloy-os-child-truth__icon" aria-hidden>
            <Icon size={15} strokeWidth={1.75} />
        </span>
    );
}

function TruthRow({
    icon,
    label,
    value,
}: {
    icon: LucideIcon;
    label: string;
    value: string | null;
}) {
    return (
        <div className="alloy-os-child-truth__row" data-child-truth={label}>
            <Ico icon={icon} />
            <span className="alloy-os-child-truth__label">{label}</span>
            <span className={clsx("alloy-os-child-truth__value", !value && "alloy-os-child-truth__value--empty")}>
                {value ?? "Not set"}
            </span>
        </div>
    );
}

/** Summary: a scannable per-child mini-profile — details stack under the name. */
function ChildSummaryRow({
    child,
    childrenSurfaceConfig,
    depth = "summary",
    onActivate,
}: {
    child: ChildrenEvidenceChild;
    childrenSurfaceConfig: ReturnType<typeof readChildrenNestedConfigFromDoc>;
    depth?: "summary" | "context";
    onActivate?: (childId: string) => void;
}) {
    const record = buildChildIdentityRecordVM({
        config: childrenSurfaceConfig,
        child,
        groupKey: "roster",
    });
    return (
        <div className="alloy-os-children__summary-row" data-children-child={child.id}>
            <IdentityRecordSummary
                record={{ ...record, badge: child.status }}
                depth={depth}
                onActivate={onActivate}
            />
            {child.missingLine ? (
                <span className="alloy-os-children__summary-line alloy-os-card-detail--risk" data-children-missing={child.id}>
                    {child.missingLine}
                </span>
            ) : null}
        </div>
    );
}

function ChildFlags({ child }: { child: ChildrenEvidenceChild }) {
    if (child.flags.length === 0) return null;
    return (
        <div className="alloy-os-card-flags">
            {child.flags.map((flag) => (
                <span key={flag.label} className={clsx("alloy-os-card-flag", `alloy-os-card-flag--${flag.tone}`)}>
                    {flag.label}
                </span>
            ))}
        </div>
    );
}

/** Directional deeper-action label — names the most relevant editable gap. */
function deeperEditLabel(child: ChildrenEvidenceChild): string {
    if (!child.program) return "Set program";
    if (!child.schedule) return "Resolve schedule";
    if (!child.startDate) return "Set desired start";
    return "Edit schedule";
}

const WEEKDAYS = ["M", "T", "W", "T", "F"] as const;

function splitSchedule(schedule: string | null): { daysText: string | null; timesText: string | null } {
    if (!schedule) return { daysText: null, timesText: null };
    const parts = schedule.split("·").map((s) => s.trim()).filter(Boolean);
    const timeIdx = parts.findIndex((p) => /\d/.test(p) && /[:apm]/i.test(p));
    const timesText = timeIdx >= 0 ? parts[timeIdx]! : null;
    const daysText = parts.filter((_, i) => i !== timeIdx).join(" · ") || schedule;
    return { daysText, timesText };
}

function scheduleDaySelection(daysText: string | null): boolean[] {
    if (!daysText) return [false, false, false, false, false];
    const s = daysText.toLowerCase();
    if (/(m\s*[–-]\s*f|mon\s*[–-]\s*fri|full|daily|every day|5 day)/.test(s)) {
        return [true, true, true, true, true];
    }
    return ["mon", "tue", "wed", "thu", "fri"].map((n) => s.includes(n));
}

/** Schedule day chips + times — shared by Focus + Edit (same strong structure). */
function ChildScheduleBlock({ child }: { child: ChildrenEvidenceChild }) {
    const { daysText, timesText } = splitSchedule(child.schedule);
    const days = scheduleDaySelection(daysText);
    return (
        <div className="alloy-os-child-edit__section" data-child-schedule>
            <span className="alloy-os-child-edit__label">Schedule</span>
            <div className="alloy-os-child-edit__chips" role="group" aria-label="Schedule days">
                {WEEKDAYS.map((d, i) => (
                    <span key={i} className={clsx("alloy-os-child-edit__chip", days[i] && "alloy-os-child-edit__chip--on")}>
                        {d}
                    </span>
                ))}
            </div>
            {timesText ? (
                <div className="alloy-os-child-truth__row alloy-os-child-edit__times" data-child-truth="Times">
                    <Ico icon={Clock} />
                    <span className="alloy-os-child-truth__label">Times</span>
                    <span className="alloy-os-child-truth__value">{timesText}</span>
                </div>
            ) : null}
        </div>
    );
}

/** Placement truth — config-driven fields for Focus + read-only Edit preview. */
function ConfiguredChildEnrollmentBody({
    child,
    focusRows,
    childrenSurfaceConfig,
    composingChildrenSurface,
    onRequestEdit,
}: {
    child: ChildrenEvidenceChild;
    focusRows: ChildrenFocusFieldRow[];
    childrenSurfaceConfig: ReturnType<typeof readChildrenNestedConfigFromDoc>;
    composingChildrenSurface: boolean;
    onRequestEdit?: () => void;
}) {
    const composer = useFocusPanelComposer();
    const fieldsByGroup = useMemo(() => {
        const map = new Map<(typeof CHILDREN_FOCUS_GROUP_KEYS)[number], LayoutSurfaceFieldMeta[]>();
        for (const groupKey of CHILDREN_FOCUS_GROUP_KEYS) {
            const groupRows = focusRows.filter(
                (row) =>
                    row.groupKey === groupKey
                    && !(
                        groupKey === "identity"
                        && (row.fieldKey === "child.display_name" || row.fieldKey === "child.name")
                    ),
            );
            const layoutFields: LayoutSurfaceFieldMeta[] = groupRows.map((row) => {
                if (row.fieldKey === "inquiry_child.schedule_type") {
                    return {
                        fieldKey: row.fieldKey,
                        label: row.label,
                        value: child.schedule,
                        renderBlock: () => <ChildScheduleBlock child={child} />,
                    };
                }
                const meta = CHILDREN_FIELD_TRUTH_META[row.fieldKey];
                return {
                    fieldKey: row.fieldKey,
                    label: row.label,
                    icon: meta?.icon,
                    value: meta?.get(child) ?? null,
                };
            });
            map.set(groupKey, layoutFields);
        }
        return map;
    }, [child, focusRows]);

    if (composingChildrenSurface && childrenSurfaceConfig) {
        return (
            <div className="alloy-os-child-edit" data-children-enrollment={child.id}>
                {CHILDREN_FOCUS_GROUP_KEYS.map((groupKey) => (
                    <NestedSurfaceFieldLayoutSurface
                        key={groupKey}
                        surfaceId={CHILDREN_SURFACE_ID}
                        groupKey={groupKey}
                        fields={fieldsByGroup.get(groupKey) ?? []}
                        tier="details"
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="alloy-os-child-edit" data-children-enrollment={child.id}>
            {(["placement", "readiness"] as const).map((groupKey) => {
                const record = buildChildIdentityRecordVM({
                    config: childrenSurfaceConfig,
                    child,
                    groupKey,
                    canMutate: Boolean(onRequestEdit),
                    isFieldSaveSupported: (fieldRef) =>
                        isChildFocusFieldSaveSupported(fieldRef as ChildFocusFieldKey),
                });
                if (record.summaryRows.length === 0 && record.expandedRows.length === 0) return null;
                return (
                    <section key={groupKey} className="identity-section" data-child-identity-group={groupKey}>
                        <IdentityFieldGrid
                            rows={record.summaryRows}
                            onEditField={onRequestEdit ? () => onRequestEdit() : undefined}
                        />
                        <IdentityExpandedDetails
                            rows={record.expandedRows}
                            onEditField={onRequestEdit ? () => onRequestEdit() : undefined}
                        />
                    </section>
                );
            })}
        </div>
    );
}

const CHILDREN_FIELD_TRUTH_META: Record<string, { icon: LucideIcon; get: (c: ChildrenEvidenceChild) => string | null }> = {
    "child.display_name": { icon: User, get: (c) => c.name },
    "child.first_name": { icon: User, get: (c) => c.firstName ?? null },
    "child.last_name": { icon: User, get: (c) => c.lastName ?? null },
    "child.preferred_name": { icon: User, get: (c) => c.preferredName ?? null },
    "child.nickname": { icon: User, get: (c) => c.nickname ?? null },
    "child.date_of_birth": { icon: Cake, get: (c) => c.dobAge },
    "child.dob_age": { icon: Cake, get: (c) => c.dobAge },
    "child.age": { icon: Cake, get: (c) => c.dobAge },
    "inquiry_child.program": { icon: GraduationCap, get: (c) => c.program },
    "child.room": { icon: DoorOpen, get: (c) => c.room },
    "child.start_date": { icon: CalendarClock, get: (c) => c.startDate },
    "child.desired_start_date": { icon: CalendarClock, get: (c) => c.startDate },
    "inquiry_child.schedule_type": { icon: CalendarDays, get: (c) => c.schedule },
    "inquiry_child.desired_schedule_type": { icon: CalendarDays, get: (c) => c.schedule },
    "child.status": { icon: BadgeCheck, get: (c) => c.status },
    "child.readiness_summary": {
        icon: BadgeCheck,
        get: (c) => (c.needsAttention ? c.missingLine : "Ready"),
    },
    "child.medical_summary": { icon: BadgeCheck, get: () => null },
    "child.documents_summary": { icon: FileText, get: () => null },
    "child.pickup_summary": { icon: User, get: () => null },
    "child.communications_summary": { icon: FileText, get: () => null },
    "child.notes_summary": { icon: FileText, get: () => null },
};

/** One evidence group in the Expanded overlay. */
function EvidenceGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="alloy-os-child-egroup" data-children-egroup={title}>
            <p className="alloy-os-child-egroup__title">{title}</p>
            {children}
        </section>
    );
}

function EmptyEvidence({ text }: { text: string }) {
    return <p className="alloy-os-child-egroup__empty">{text}</p>;
}

/** Expanded: configured evidence archive sections (not the operational Focus tier). */
function ChildExpandedEvidence({
    child,
    sections,
    childrenSurfaceConfig,
    onRequestEdit,
}: {
    child: ChildrenEvidenceChild;
    sections: ChildrenEvidenceSectionView[];
    childrenSurfaceConfig: ReturnType<typeof readChildrenNestedConfigFromDoc>;
    onRequestEdit?: () => void;
}) {
    if (sections.length === 0) {
        return (
            <div className="alloy-os-child-expanded" data-children-expanded={child.id}>
                <EvidenceGroup title="Evidence">
                    <EmptyEvidence text="No evidence sections configured" />
                </EvidenceGroup>
            </div>
        );
    }

    return (
        <div className="alloy-os-child-expanded" data-children-expanded={child.id}>
            {sections.map((section) => {
                const record = buildChildIdentityRecordVM({
                    config: childrenSurfaceConfig,
                    child,
                    groupKey: section.key,
                    canMutate: Boolean(onRequestEdit),
                    isFieldSaveSupported: (fieldRef) =>
                        isChildFocusFieldSaveSupported(fieldRef as ChildFocusFieldKey),
                });
                const rows = [...record.summaryRows, ...record.expandedRows];
                return (
                    <EvidenceGroup key={section.key} title={section.label}>
                        {rows.length === 0 ? (
                            <EmptyEvidence text={`No ${section.label.toLowerCase()} on file`} />
                        ) : (
                            <IdentityFieldGrid
                                rows={rows}
                                onEditField={
                                    onRequestEdit
                                        ? () => onRequestEdit()
                                        : undefined
                                }
                            />
                        )}
                    </EvidenceGroup>
                );
            })}
        </div>
    );
}

/** Related View: a related operational REPORT (history), distinct from Expanded. */
function ChildRelatedReport({ child, viewId }: { child: ChildrenEvidenceChild; viewId: string }) {
    const config =
        viewId === "placement_history"
            ? { title: "Placement History", columns: ["Effective", "Program · Room", "Status"] as [string, string, string], empty: "No placement changes recorded yet" }
            : { title: "Schedule History", columns: ["Effective", "Schedule", "Status"] as [string, string, string], empty: "No schedule changes recorded yet" };
    return (
        <div className="alloy-os-child-report" data-children-related-report={viewId}>
            <p className="alloy-os-child-report__title">{config.title}</p>
            <div className="alloy-os-child-report__table">
                <div className="alloy-os-child-report__row alloy-os-child-report__row--head">
                    {config.columns.map((c) => (
                        <span key={c}>{c}</span>
                    ))}
                </div>
                <p className="alloy-os-child-report__empty">{config.empty}</p>
            </div>
            <p className="alloy-os-child-report__foot">A related operational report — {child.name.split(" ")[0]}’s {config.title.toLowerCase()}.</p>
        </div>
    );
}

/** Quiet row of related-report links (distinct from Expanded). */
function RelatedViewsRow({ onOpen }: { onOpen: (id: string) => void }) {
    if (RELATED_VIEWS.length === 0) return null;
    return (
        <div className="alloy-os-child-related" data-children-related-views="true">
            <span className="alloy-os-child-related__label">Related views</span>
            <span className="alloy-os-child-related__links">
                {RELATED_VIEWS.map((v) => (
                    <button
                        key={v.id}
                        type="button"
                        className="alloy-os-child-related__link"
                        data-related-view={v.id}
                        onClick={() => onOpen(v.id)}
                    >
                        {v.label} →
                    </button>
                ))}
            </span>
        </div>
    );
}

/** Fields are the layout surface via NestedSurfaceFieldLayoutSurface. */

function FocusedChild({
    child,
    editing,
    editSeed,
    expandedOpen,
    relatedViewId,
    childFocusView,
    focusRows,
    evidenceSections,
    emergencyContactsSection = null,
    context,
    childrenSurfaceConfig,
    opportunityStartDate,
    mutation,
    composerPreview,
    composingChildrenSurface,
    disclosureDepth = "details",
    onExpand,
    onOpenRelated,
    onRequestEdit,
    onEditClose,
}: {
    child: ChildrenEvidenceChild;
    editing: boolean;
    editSeed: ReturnType<typeof seedChildFocusEditValues>;
    expandedOpen: boolean;
    relatedViewId: string | null;
    childFocusView: ChildFocusView;
    focusRows: ChildrenFocusFieldRow[];
    evidenceSections: ChildrenEvidenceSectionView[];
    emergencyContactsSection?: ChildrenEvidenceSectionView | null;
    context: OperationalContext;
    childrenSurfaceConfig: ReturnType<typeof readChildrenNestedConfigFromDoc>;
    opportunityStartDate: string | null;
    mutation?: FocusPanelMutation;
    composerPreview?: ChildrenComposerPreview;
    composingChildrenSurface: boolean;
    disclosureDepth?: "details" | "evidence";
    onExpand?: () => void;
    onOpenRelated: (id: string) => void;
    onRequestEdit?: () => void;
    onEditClose: () => void;
}) {
    const headerDob = childFocusView.headerShowDob || childFocusView.headerShowAge ? child.dobAge : null;
    const composer = useFocusPanelComposer();
    const previewImageUrl = composer?.childAvatarPreviewUrl(child.id) ?? child.imageUrl;
    const showHeaderAvatar = childrenSurfaceConfig
        ? groupShowAvatarForNestedGroup(childrenSurfaceConfig, "identity")
        : true;
    const identityRecord = buildChildIdentityRecordVM({
        config: childrenSurfaceConfig,
        child,
        groupKey: "identity",
        canMutate: Boolean(onRequestEdit),
        isFieldSaveSupported: (fieldRef) =>
            isChildFocusFieldSaveSupported(fieldRef as ChildFocusFieldKey),
    });

    return (
        <div
            className="alloy-os-household__focused"
            data-children-focused-child={child.id}
            data-children-edit={editing ? "true" : undefined}
        >
            {composingChildrenSurface ? <div className="alloy-os-child-focus__header">
                {showHeaderAvatar ? (
                    composingChildrenSurface ? (
                        <ChildProfileAvatarComposer
                            surfaceId={CHILDREN_SURFACE_ID}
                            groupKey="identity"
                            childId={child.id}
                            childName={child.name}
                            imageUrl={previewImageUrl}
                            personId={child.personId ?? null}
                            size={40}
                        />
                    ) : (
                        <CardAvatar name={child.name} imageUrl={previewImageUrl} size={40} />
                    )
                ) : null}
                <div className="alloy-os-child-focus__id min-w-0">
                    <span className="alloy-os-household__group-title">{child.name}</span>
                    {headerDob ? (
                        <span className="alloy-os-child-focus__sub">
                            <Cake size={13} strokeWidth={1.75} /> {headerDob}
                        </span>
                    ) : null}
                </div>
                <StatusPill child={child} />
            </div> : (
                <IdentityRecordSummary
                    record={{ ...identityRecord, badge: child.status }}
                    depth={disclosureDepth}
                    onEditField={onRequestEdit ? () => onRequestEdit() : undefined}
                />
            )}

            {relatedViewId ? (
                <ChildRelatedReport child={child} viewId={relatedViewId} />
            ) : expandedOpen ? (
                <ChildExpandedEvidence
                    child={child}
                    sections={evidenceSections}
                    childrenSurfaceConfig={childrenSurfaceConfig}
                    onRequestEdit={onRequestEdit}
                />
            ) : editing && editSeed ? (
                <ChildFocusEdit
                    seed={editSeed}
                    childName={child.name}
                    childSurfaceConfig={childrenSurfaceConfig}
                    opportunityStartDate={opportunityStartDate}
                    previewOnly={Boolean(composerPreview)}
                    save={mutation!.saveInquiryChild}
                    onClose={onEditClose}
                    onSaved={onEditClose}
                />
            ) : editing && composerPreview ? (
                <ChildFocusEdit
                    seed={
                        editSeed ?? {
                            childId: child.id,
                            row: {
                                id: child.id,
                                customer_member_id: "preview",
                                person_id: null,
                                display_name: child.name,
                                dob: null,
                                age: null,
                                program_category_id: null,
                                program_key: null,
                                desired_program_label: child.program,
                                schedule_type: null,
                                desired_schedule_label: child.schedule,
                                outcome_status_key: null,
                                outcome_status_label: child.status,
                                notes: null,
                                start_date: child.startDate,
                                location_id: null,
                                location_label: child.room,
                                program_room_cohort_key: null,
                                program_room_cohort_label: child.room,
                                custom_fields: {},
                                first_name: null,
                                last_name: null,
                                linked_on_inquiry: true,
                                ocm_id: null,
                            },
                            values: {
                                location_id: "",
                                program_category_id: "",
                                program_room_cohort_key: "",
                                schedule_type: "",
                                start_date: child.startDate ?? "",
                                dob: "",
                            },
                            identityBaseline: { first_name: "", last_name: "", dob: "" },
                        }
                    }
                    childName={child.name}
                    childSurfaceConfig={childrenSurfaceConfig}
                    opportunityStartDate={opportunityStartDate}
                    previewOnly
                    save={async () => ({ ok: true })}
                    onClose={onEditClose}
                />
            ) : (
                <>
                    <div
                        className="alloy-os-children__focus-tier"
                        data-children-focus-tier="true"
                    >
                        {composingChildrenSurface ? (
                            <p className="fp-composer-tier-label">Focus fields</p>
                        ) : null}
                        <ConfiguredChildEnrollmentBody
                            child={child}
                            focusRows={focusRows}
                            childrenSurfaceConfig={childrenSurfaceConfig}
                            composingChildrenSurface={composingChildrenSurface}
                            onRequestEdit={onRequestEdit}
                        />
                    </div>
                    <ChildFlags child={child} />
                    {emergencyContactsSection && childrenSurfaceConfig ? (
                        <EmergencyContactsSection
                            child={child}
                            context={context}
                            section={emergencyContactsSection}
                            config={childrenSurfaceConfig}
                            mutation={mutation}
                            composing={composingChildrenSurface}
                        />
                    ) : null}
                    {composingChildrenSurface ? (
                        <div
                            className="alloy-os-children__evidence-tier"
                            data-children-evidence-tier="true"
                        >
                            <p className="fp-composer-tier-label">Evidence sections</p>
                            <p className="fp-composer-tier-hint">Archive fields shown behind View all evidence</p>
                            <AddSectionMenu
                                surfaceId={CHILDREN_SURFACE_ID}
                                variant="evidence"
                                triggerLabel="+ Add evidence section"
                            />
                            {evidenceSections.map((section) => (
                                <EvidenceSectionCard
                                    key={section.key}
                                    surfaceId={CHILDREN_SURFACE_ID}
                                    groupKey={section.key}
                                    label={section.label}
                                    fields={section.fieldKeys.map((fieldKey) => {
                                        const meta = CHILDREN_FIELD_TRUTH_META[fieldKey];
                                        const catalog = fieldKey.replace(/^[a-z_]+\./, "").replace(/_/g, " ");
                                        return {
                                            fieldKey,
                                            label: childrenSurfaceConfig
                                                ? fieldPresentationLabel(
                                                      childrenSurfaceConfig,
                                                      section.key,
                                                      fieldKey,
                                                      catalog,
                                                  )
                                                : catalog,
                                            icon: meta?.icon,
                                            value: meta?.get(child) ?? null,
                                        };
                                    })}
                                />
                            ))}
                        </div>
                    ) : null}
                    {onExpand ? (
                        <button
                            type="button"
                            className="alloy-os-child-history-link"
                            onClick={onExpand}
                            data-children-action="expand-evidence"
                        >
                            <FileText size={13} strokeWidth={1.75} /> View all evidence →
                        </button>
                    ) : null}
                    <RelatedViewsRow onOpen={onOpenRelated} />
                </>
            )}
        </div>
    );
}

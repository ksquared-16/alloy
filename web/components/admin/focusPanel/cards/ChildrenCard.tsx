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
import ComposableRegionShell from "@/components/admin/focusPanel/drillIn/ComposableRegionShell";
import InlineRuntimeFieldList from "@/components/admin/focusPanel/drillIn/InlineRuntimeFieldList";
import AddSectionMenu from "@/components/admin/focusPanel/drillIn/AddSectionMenu";
import {
    buildChildrenCardEvidence,
    type ChildrenEvidenceChild,
} from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import {
    CHILD_SURFACE_ID,
    childFocusViewFromConfig,
    readChildNestedConfigFromDoc,
    type ChildFocusView,
} from "@/lib/adminV2/runtime/focusPanel/children/childNestedSurfaceRuntime";
import { seedChildFocusEditValues } from "@/lib/adminV2/runtime/focusPanel/children/childFocusEditState";
import { usePublishedFocusPanelSummaryDoc } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import {
    CHILDREN_FOCUS_GROUP_KEYS,
    childrenDetailFieldKeysFromNestedConfig,
    childrenEvidenceSectionsFromNestedConfig,
    childrenFocusRowsFromNestedConfig,
    childrenRosterCollapsedFieldKeysFromNestedConfig,
    readChildrenNestedConfigFromDoc,
    type ChildrenEvidenceSectionView,
    type ChildrenFocusFieldRow,
} from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
import { CHILDREN_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
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
    const childSurfaceConfig = useMemo(
        () => (composer?.isComposingSurface(CHILD_SURFACE_ID) ? composer.configFor(CHILD_SURFACE_ID) : readChildNestedConfigFromDoc(publishedDoc)),
        [composer, publishedDoc],
    );
    // Focus read layout is authored on `children_surface` (same surface as composer drill-in).
    // `child_surface` remains the edit/save policy seam — untouched by this card boundary.
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
    const childDetailFieldKeys = useMemo(
        () => childrenDetailFieldKeysFromNestedConfig(childrenSurfaceConfig),
        [childrenSurfaceConfig],
    );
    const childRosterFieldKeys = useMemo(
        () => childrenRosterCollapsedFieldKeysFromNestedConfig(childrenSurfaceConfig),
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

    const [rosterOpen, setRosterOpen] = useState(false);
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [expandedOpen, setExpandedOpen] = useState(false);
    const [relatedViewId, setRelatedViewId] = useState<string | null>(null);

    const request = coordination?.request;
    const requestNonce = request?.card === "children" ? request.nonce : null;
    useEffect(() => {
        if (request?.card !== "children") return;
        setRosterOpen(true);
        setFocusedId(request.focus ?? null);
        setEditing(false);
        setExpandedOpen(false);
        setRelatedViewId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce gates re-apply
    }, [requestNonce]);

    useEffect(() => {
        if (!composerPreview) return;
        if (composerPreview.perspective === "roster") {
            setRosterOpen(true);
            setFocusedId(null);
            setEditing(false);
            return;
        }
        const previewChildId =
            composerPreview.focusedChildId ?? evidence.children[0]?.id ?? null;
        setRosterOpen(true);
        setFocusedId(previewChildId);
        setEditing(composerPreview.perspective === "child_edit");
    }, [composerPreview, evidence.children]);

    const isEmpty = evidence.count === 0;
    const focused =
        !isEmpty && focusedId ? evidence.children.find((c) => c.id === focusedId) ?? null : null;
    const editSeed = useMemo(
        () => (editing && focused ? seedChildFocusEditValues(context.truth, focused.id) : null),
        [editing, focused, context.truth],
    );

    const focusChild = (id: string) => {
        if (composerPreview?.onSelectChild) {
            composerPreview.onSelectChild();
            return;
        }
        setFocusedId(id);
        setEditing(false);
        setExpandedOpen(false);
        setRelatedViewId(null);
        if (composingChildrenSurface) {
            composer?.setDrillDepth({ kind: "child-focus", childId: id });
            composer?.select({ kind: "region", surfaceId: CHILDREN_SURFACE_ID, groupKey: "identity" });
        }
    };
    const backToFocus = () => {
        setEditing(false);
        setExpandedOpen(false);
        setRelatedViewId(null);
    };

    const level: FocusPanelPerspectiveLevel =
        editing && focused ? "edit" : focused || rosterOpen ? "focused" : "base";
    useReportPerspective(coordination, "children", level);
    useDismissSignal(coordination, "children", () => {
        setEditing(false);
        setExpandedOpen(false);
        setRelatedViewId(null);
        setFocusedId(null);
        setRosterOpen(false);
    });

    const density = !isEmpty && (rosterOpen || focused) ? "expanded" : "compact";
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

    let footerAction: React.ReactNode;
    if (isEmpty) {
        footerAction = null;
    } else if (editing && focused) {
        footerAction = backToFocusButton("cancel-edit");
    } else if (relatedViewId && focused) {
        footerAction = backToFocusButton("close-related");
    } else if (expandedOpen && focused) {
        footerAction = backToFocusButton("collapse-expanded");
    } else if (focused) {
        footerAction = (
            <div className="alloy-os-card-nav">
                {backToSourceButton ?? (
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        onClick={() => setFocusedId(null)}
                        data-children-action="back"
                    >
                        ← All children
                    </button>
                )}
                {canEditChild ? (
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        onClick={() => setEditing(true)}
                        data-children-edit-trigger={focused.id}
                    >
                        {deeperEditLabel(focused)} →
                    </button>
                ) : null}
            </div>
        );
    } else if (rosterOpen) {
        footerAction =
            backToSourceButton ?? (
                <button
                    type="button"
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                    onClick={() => setRosterOpen(false)}
                    data-children-action="collapse"
                >
                    ← Back to panel
                </button>
            );
    } else {
        footerAction = (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setRosterOpen(true)}
                data-children-action="expand"
            >
                View children →
            </button>
        );
    }

    let lifecycle: "empty" | "summary" | "focus" | "edit" | "expanded" | "related";
    let body: React.ReactNode;
    if (isEmpty) {
        lifecycle = "empty";
        body = (
            <div className="alloy-os-household__summary" data-children-empty="true">
                <p className="alloy-os-household__row-detail">No children linked to this record yet</p>
            </div>
        );
    } else if (focused) {
        lifecycle = editing ? "edit" : relatedViewId ? "related" : expandedOpen ? "expanded" : "focus";
        body = (
            <FocusedChild
                child={focused}
                editing={editing}
                editSeed={editSeed}
                expandedOpen={expandedOpen}
                relatedViewId={relatedViewId}
                childFocusView={childFocusView}
                focusRows={focusRows}
                evidenceSections={evidenceSections}
                childSurfaceConfig={childSurfaceConfig}
                opportunityStartDate={opportunityStartDate}
                mutation={mutation}
                composerPreview={composerPreview}
                composingChildrenSurface={composingChildrenSurface}
                onExpand={CAPS.supportsExpanded ? () => setExpandedOpen(true) : undefined}
                onOpenRelated={(id) => setRelatedViewId(id)}
                onEditClose={() => setEditing(false)}
            />
        );
    } else {
        lifecycle = "summary";
        body = (
            <ComposableRegionShell
                surfaceId={CHILDREN_SURFACE_ID}
                groupKey="roster"
                label="Roster rows"
                className="alloy-os-children__composer-region"
                dataAttrs={{ "data-children-roster-region": "true" }}
            >
                <div className="alloy-os-children__roster" data-children-roster>
                    {evidence.children.map((child) => (
                        <ChildSummaryRow
                            key={child.id}
                            child={child}
                            onFocus={() => focusChild(child.id)}
                            fieldKeys={childRosterFieldKeys}
                        />
                    ))}
                </div>
                {composingChildrenSurface ? (
                    <RegionEditLayer
                        surfaceId={CHILDREN_SURFACE_ID}
                        groupKey="roster"
                        composing={composingChildrenSurface}
                    />
                ) : null}
            </ComposableRegionShell>
        );
    }

    return (
        <div
            className="alloy-os-household alloy-os-children"
            data-children-card="true"
            data-children-card-perspective={lifecycle === "summary" ? (rosterOpen ? "expanded" : "collapsed") : lifecycle}
            data-children-lifecycle={lifecycle}
        >
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={lifecycle === "summary" && !rosterOpen ? evidence.supportingLine : null}
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

/**
 * Roster field → icon + accessor. Lets the PUBLISHED Children Surface config choose which
 * per-child fields render in the summary roster, and their order — reusing the same
 * `metadata.nestedSurfaces["children_surface"]` config that drives the detail line. Keys not
 * mapped here (name/status) render elsewhere; a field with no value for a child is skipped.
 */
const ROSTER_FIELD_META: Record<string, { icon: LucideIcon; get: (c: ChildrenEvidenceChild) => string | null }> = {
    "child.date_of_birth": { icon: Cake, get: (c) => c.dobAge },
    "inquiry_child.program": { icon: GraduationCap, get: (c) => c.program },
    "child.room": { icon: DoorOpen, get: (c) => c.room },
    "inquiry_child.schedule_type": { icon: CalendarDays, get: (c) => c.schedule },
    "inquiry_child.desired_schedule_type": { icon: CalendarDays, get: (c) => c.schedule },
    "child.start_date": { icon: CalendarClock, get: (c) => c.startDate },
    "child.desired_start_date": { icon: CalendarClock, get: (c) => c.startDate },
};

/** Roster meta lines: from the published config field order, else the default order (back-compat). */
function childRosterMeta(
    child: ChildrenEvidenceChild,
    fieldKeys: readonly string[],
): { icon: LucideIcon; value: string }[] {
    const configured = fieldKeys.filter((k) => k in ROSTER_FIELD_META);
    if (configured.length) {
        return configured.flatMap((k) => {
            const m = ROSTER_FIELD_META[k]!;
            const value = m.get(child);
            return value ? [{ icon: m.icon, value }] : [];
        });
    }
    const meta: { icon: LucideIcon; value: string }[] = [];
    if (child.dobAge) meta.push({ icon: Cake, value: child.dobAge });
    if (child.program) meta.push({ icon: GraduationCap, value: child.program });
    if (child.room) meta.push({ icon: DoorOpen, value: child.room });
    if (child.schedule) meta.push({ icon: CalendarDays, value: child.schedule });
    return meta;
}

/** Summary: a scannable per-child mini-profile — details stack under the name. */
function ChildSummaryRow({
    child,
    onFocus,
    fieldKeys,
}: {
    child: ChildrenEvidenceChild;
    onFocus: () => void;
    /** Published Children Surface field order (empty → default order). */
    fieldKeys: readonly string[];
}) {
    const meta = childRosterMeta(child, fieldKeys);
    return (
        <button
            type="button"
            className="alloy-os-children__summary-row"
            onClick={onFocus}
            data-children-child={child.id}
        >
            <CardAvatar name={child.name} imageUrl={child.imageUrl} size={36} />
            <span className="alloy-os-children__summary-main min-w-0">
                <span className="alloy-os-children__summary-head">
                    <span className="alloy-os-household__row-name">{child.name}</span>
                    <StatusPill child={child} />
                </span>
                <span className="alloy-os-children__summary-meta">
                    {meta.map((m, i) => (
                        <span key={i} className="alloy-os-children__summary-line">
                            <Ico icon={m.icon} />
                            <span>{m.value}</span>
                        </span>
                    ))}
                    {child.missingLine ? (
                        <span className="alloy-os-children__summary-line alloy-os-card-detail--risk" data-children-missing={child.id}>
                            {child.missingLine}
                        </span>
                    ) : null}
                </span>
            </span>
        </button>
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

function TruthRow({ icon, label, value }: { icon: LucideIcon; label: string; value: string | null }) {
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
}: {
    child: ChildrenEvidenceChild;
    focusRows: ChildrenFocusFieldRow[];
}) {
    const bodyRows = focusRows.filter(
        (row) =>
            !(
                row.groupKey === "identity"
                && (row.fieldKey === "child.display_name" || row.fieldKey === "child.name")
            ),
    );

    return (
        <div className="alloy-os-child-edit" data-children-enrollment={child.id}>
            {bodyRows.map((field) => {
                if (field.fieldKey === "inquiry_child.schedule_type") {
                    return <ChildScheduleBlock key={field.fieldKey} child={child} />;
                }
                const meta = CHILDREN_FIELD_TRUTH_META[field.fieldKey];
                if (!meta) return null;
                return (
                    <TruthRow
                        key={field.fieldKey}
                        icon={meta.icon}
                        label={field.label}
                        value={meta.get(child)}
                    />
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
}: {
    child: ChildrenEvidenceChild;
    sections: ChildrenEvidenceSectionView[];
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
            {sections.map((section) => (
                <EvidenceGroup key={section.key} title={section.label}>
                    {section.fieldKeys.length === 0 ? (
                        <EmptyEvidence text={`No ${section.label.toLowerCase()} on file`} />
                    ) : (
                        section.fieldKeys.map((fieldKey) => {
                            const meta = CHILDREN_FIELD_TRUTH_META[fieldKey];
                            if (!meta) return null;
                            const value = meta.get(child);
                            return (
                                <TruthRow
                                    key={fieldKey}
                                    icon={meta.icon}
                                    label={fieldKey.replace(/^[a-z_]+\./, "").replace(/_/g, " ")}
                                    value={value}
                                />
                            );
                        })
                    )}
                </EvidenceGroup>
            ))}
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

/** Edit-layer field controls — runtime rows stay visible above (Final Surface Composer doctrine). */
function RegionEditLayer({
    surfaceId,
    groupKey,
    composing,
    discoverable = false,
}: {
    surfaceId: string;
    groupKey: string;
    composing: boolean;
    discoverable?: boolean;
}) {
    if (!composing) return null;
    return (
        <InlineRuntimeFieldList
            surfaceId={surfaceId}
            groupKey={groupKey}
            suppressPreview
            whenRegionSelectedOnly={!discoverable}
        />
    );
}

function FocusedChild({
    child,
    editing,
    editSeed,
    expandedOpen,
    relatedViewId,
    childFocusView,
    focusRows,
    evidenceSections,
    childSurfaceConfig,
    opportunityStartDate,
    mutation,
    composerPreview,
    composingChildrenSurface,
    onExpand,
    onOpenRelated,
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
    childSurfaceConfig: ReturnType<typeof readChildNestedConfigFromDoc>;
    opportunityStartDate: string | null;
    mutation?: FocusPanelMutation;
    composerPreview?: ChildrenComposerPreview;
    composingChildrenSurface: boolean;
    onExpand?: () => void;
    onOpenRelated: (id: string) => void;
    onEditClose: () => void;
}) {
    const headerDob = childFocusView.headerShowDob || childFocusView.headerShowAge ? child.dobAge : null;

    return (
        <div
            className="alloy-os-household__focused"
            data-children-focused-child={child.id}
            data-children-edit={editing ? "true" : undefined}
        >
            <div className="alloy-os-child-focus__header">
                <CardAvatar name={child.name} imageUrl={child.imageUrl} size={40} />
                <div className="alloy-os-child-focus__id min-w-0">
                    <span className="alloy-os-household__group-title">{child.name}</span>
                    {headerDob ? (
                        <span className="alloy-os-child-focus__sub">
                            <Cake size={13} strokeWidth={1.75} /> {headerDob}
                        </span>
                    ) : null}
                </div>
                <StatusPill child={child} />
            </div>

            {relatedViewId ? (
                <ChildRelatedReport child={child} viewId={relatedViewId} />
            ) : expandedOpen ? (
                <ChildExpandedEvidence child={child} sections={evidenceSections} />
            ) : editing && editSeed ? (
                <ChildFocusEdit
                    seed={editSeed}
                    childName={child.name}
                    childSurfaceConfig={childSurfaceConfig}
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
                    childSurfaceConfig={childSurfaceConfig}
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
                        <ConfiguredChildEnrollmentBody child={child} focusRows={focusRows} />
                        {composingChildrenSurface
                            ? CHILDREN_FOCUS_GROUP_KEYS.map((groupKey) => (
                                  <RegionEditLayer
                                      key={groupKey}
                                      surfaceId={CHILDREN_SURFACE_ID}
                                      groupKey={groupKey}
                                      composing={composingChildrenSurface}
                                      discoverable
                                  />
                              ))
                            : null}
                    </div>
                    <ChildFlags child={child} />
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
                                <ComposableRegionShell
                                    key={section.key}
                                    surfaceId={CHILDREN_SURFACE_ID}
                                    groupKey={section.key}
                                    label={section.label}
                                    className="alloy-os-children__composer-region"
                                    dataAttrs={{ "data-children-evidence-region": section.key }}
                                >
                                    <p className="alloy-os-child-egroup__title">{section.label}</p>
                                    <RegionEditLayer
                                        surfaceId={CHILDREN_SURFACE_ID}
                                        groupKey={section.key}
                                        composing={composingChildrenSurface}
                                        discoverable
                                    />
                                </ComposableRegionShell>
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

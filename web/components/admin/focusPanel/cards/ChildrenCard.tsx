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
import {
    buildChildrenCardEvidence,
    type ChildrenEvidenceChild,
} from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import { usePublishedFocusPanelSummaryDoc } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import {
    childrenDetailFieldKeysFromNestedConfig,
    readChildrenNestedConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
import { cardCapabilities, cardRelatedViews } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLifecycle";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
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

type Props = {
    model: FocusPanelCardModel;
    /** Forward-facing card boundary — Children observes this, never the drawer VM. */
    context: OperationalContext;
    receded?: boolean;
    /** Owner card: receives cross-card handoffs (e.g. from Readiness). */
    coordination?: FocusPanelCoordination;
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
 *   - Edit      — that structure as a READ-ONLY PREVIEW (no save adapter → no fake save).
 *   - Expanded  — the SAME question with ADDITIONAL configured evidence groups
 *                 (placement / medical / documents / pickup / notes / readiness). Not history.
 *   - Related Views — optional report drill-downs (Schedule History, Placement History).
 *
 * @see docs/platform/operator/universal-card-lifecycle.md
 */
export default function ChildrenCard({ model, context, receded = false, coordination }: Props) {
    // Published Children Surface config (metadata.nestedSurfaces["children_surface"]),
    // authored in /settings/surfaces. Null until loaded / when unpublished → default
    // field order. This is the runtime consuming the nested-surface authoring model.
    const publishedDoc = usePublishedFocusPanelSummaryDoc(true);
    const childDetailFieldKeys = useMemo(() => {
        const config = readChildrenNestedConfigFromDoc(publishedDoc);
        return childrenDetailFieldKeysFromNestedConfig(config);
    }, [publishedDoc]);
    const evidence = useMemo(
        () => buildChildrenCardEvidence(context, { childDetailFieldKeys }),
        [context, childDetailFieldKeys],
    );

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

    const isEmpty = evidence.count === 0;
    const focused =
        !isEmpty && focusedId ? evidence.children.find((c) => c.id === focusedId) ?? null : null;

    const focusChild = (id: string) => {
        setFocusedId(id);
        setEditing(false);
        setExpandedOpen(false);
        setRelatedViewId(null);
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
                {CAPS.supportsInlineEdit ? (
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
                expandedOpen={expandedOpen}
                relatedViewId={relatedViewId}
                onExpand={CAPS.supportsExpanded ? () => setExpandedOpen(true) : undefined}
                onOpenRelated={(id) => setRelatedViewId(id)}
            />
        );
    } else {
        lifecycle = "summary";
        body = (
            <div className="alloy-os-children__roster" data-children-roster>
                {evidence.children.map((child) => (
                    <ChildSummaryRow
                        key={child.id}
                        child={child}
                        onFocus={() => focusChild(child.id)}
                        fieldKeys={childDetailFieldKeys}
                    />
                ))}
            </div>
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

/** Placement truth — schedule block + program/room/teacher/start (Focus + Edit). */
function ChildEnrollmentBody({ child }: { child: ChildrenEvidenceChild }) {
    return (
        <div className="alloy-os-child-edit" data-children-enrollment={child.id}>
            <ChildScheduleBlock child={child} />
            <TruthRow icon={GraduationCap} label="Program" value={child.program} />
            <TruthRow icon={DoorOpen} label="Room" value={child.room} />
            <TruthRow icon={User} label="Teacher" value={child.teacher} />
            <TruthRow icon={CalendarClock} label="Start date" value={child.startDate} />
        </div>
    );
}

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

/** Expanded: the SAME question with ADDITIONAL configured evidence groups (not history). */
function ChildExpandedEvidence({ child }: { child: ChildrenEvidenceChild }) {
    const readiness = [
        { label: "Program selected", ok: Boolean(child.program) },
        { label: "Schedule set", ok: Boolean(child.schedule) },
        { label: "Desired start set", ok: Boolean(child.startDate) },
    ];
    return (
        <div className="alloy-os-child-expanded" data-children-expanded={child.id}>
            <EvidenceGroup title="Placement">
                <TruthRow icon={GraduationCap} label="Program" value={child.program} />
                <TruthRow icon={DoorOpen} label="Room" value={child.room} />
                <TruthRow icon={CalendarDays} label="Schedule" value={child.schedule} />
                <TruthRow icon={User} label="Teacher" value={child.teacher} />
                <TruthRow icon={CalendarClock} label="Desired start" value={child.startDate} />
            </EvidenceGroup>
            <EvidenceGroup title="Medical">
                <EmptyEvidence text="No medical information on file" />
            </EvidenceGroup>
            <EvidenceGroup title="Documents">
                <EmptyEvidence text="No documents on file" />
            </EvidenceGroup>
            <EvidenceGroup title="Pickup instructions">
                <EmptyEvidence text="No pickup instructions on file" />
            </EvidenceGroup>
            <EvidenceGroup title="Notes">
                <EmptyEvidence text="No notes" />
            </EvidenceGroup>
            <EvidenceGroup title="Readiness">
                <div className="alloy-os-child-readiness">
                    {readiness.map((r) => (
                        <span key={r.label} className={clsx("alloy-os-child-readiness__row", r.ok && "alloy-os-child-readiness__row--ok")}>
                            <BadgeCheck size={13} strokeWidth={1.75} /> {r.label}
                            <span className="alloy-os-child-readiness__state">{r.ok ? "Ready" : "Needed"}</span>
                        </span>
                    ))}
                </div>
            </EvidenceGroup>
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

function FocusedChild({
    child,
    editing,
    expandedOpen,
    relatedViewId,
    onExpand,
    onOpenRelated,
}: {
    child: ChildrenEvidenceChild;
    editing: boolean;
    expandedOpen: boolean;
    relatedViewId: string | null;
    onExpand?: () => void;
    onOpenRelated: (id: string) => void;
}) {
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
                    {child.dobAge ? (
                        <span className="alloy-os-child-focus__sub">
                            <Cake size={13} strokeWidth={1.75} /> {child.dobAge}
                        </span>
                    ) : null}
                </div>
                <StatusPill child={child} />
            </div>

            {relatedViewId ? (
                <ChildRelatedReport child={child} viewId={relatedViewId} />
            ) : expandedOpen ? (
                <ChildExpandedEvidence child={child} />
            ) : editing ? (
                <div data-children-edit-preview={child.id} data-children-edit-readonly="true">
                    <ChildEnrollmentBody child={child} />
                    <p className="alloy-os-card-edit__notice" data-card-edit-notice="true">
                        Preview — schedule/program editing isn’t saveable yet
                    </p>
                </div>
            ) : (
                <>
                    <ChildEnrollmentBody child={child} />
                    <ChildFlags child={child} />
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

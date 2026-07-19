/**
 * Derive Focus Panel Universal Card models from opportunity VM — not from layout sections.
 */

import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import { resolveLeadDrawerCommandHeaderMeta } from "@/lib/layout/runtime/resolveLeadDrawerHeaderContext";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type {
    FocusPanelCardGridSpec,
    FocusPanelCardKey,
    FocusPanelCardModel,
    FocusPanelCardPayload,
    FocusPanelCollectionItem,
    FocusPanelLauncherRow,
    FocusPanelProfileField,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { RuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import {
    footprintToGridSpan,
    system5DefaultActionForCard,
    system5FootprintForCard,
    system5IconForCard,
} from "@/lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec";
import { system5ArchetypeForCard } from "@/lib/adminV2/runtime/focusPanel/system5CardArchetypes";
import {
    formatFocusPanelChipLabel,
    formatFocusPanelDisplayLabel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";

const chip = (value: string | null | undefined): string | null => formatFocusPanelChipLabel(value);

const WORK_LAUNCHER_ROWS: FocusPanelLauncherRow[] = [
    {
        key: "manual",
        label: "Manual",
        description: "Start work directly on this record",
        actionLabel: "Start",
    },
    {
        key: "bos_assist",
        label: "BOS Assist",
        description: "Guided operator assist for this stage",
        actionLabel: "Assist",
    },
    {
        key: "import_intake",
        label: "Import / Intake",
        description: "Bring in external records or documents",
        actionLabel: "Import",
    },
];

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function card(
    partial: Omit<FocusPanelCardModel, "visible" | "iconName" | "archetype"> & {
        visible?: boolean;
        iconName?: string | null;
        archetype?: FocusPanelCardModel["archetype"];
        primaryAction?: FocusPanelCardModel["primaryAction"] | null;
        payload?: FocusPanelCardPayload;
    },
): FocusPanelCardModel {
    const defaultAction = system5DefaultActionForCard(partial.key);
    return {
        visible: true,
        archetype: partial.archetype ?? system5ArchetypeForCard(partial.key),
        iconName: partial.iconName ?? system5IconForCard(partial.key),
        primaryAction:
            partial.primaryAction !== undefined ? partial.primaryAction : (defaultAction ?? null),
        ...partial,
    };
}

type StageWorkRuntime = OpportunityDrawerViewModel["workspace"]["stage_work_runtime"];

function stageWorkInsight(runtime: StageWorkRuntime): string {
    const primary = runtime?.primary;
    if (!primary) return "No active work for this stage.";
    const label = primary.label?.trim() || primary.template_key || "Work";
    if (primary.state === "open") return label;
    if (primary.state === "completed") return `${label} · completed`;
    return `${label} · planned`;
}

/**
 * The canonical `current_work` card model — the SINGLE source both Focus Panel Work-mode producers
 * use (drawer VM AND provisioning answer), so the Current Work cell is byte-identical pending →
 * enriched (no change on Settlement). Depends only on the stage-work runtime + the next-action label,
 * both carried by the commit-critical answer.
 */
export function buildCurrentWorkCardModel(input: {
    stageWorkRuntime: StageWorkRuntime;
    nextActionLabel: string | null;
}): FocusPanelCardModel {
    const primaryOpen = input.stageWorkRuntime?.primary?.state === "open";
    return card({
        key: "current_work",
        title: "Current Work",
        insight: stageWorkInsight(input.stageWorkRuntime),
        secondaryInsight: primaryOpen
            ? "Due today · continue stage steps"
            : input.nextActionLabel
              ? `Next: ${input.nextActionLabel}`
              : "No open work item right now",
        tier: "work",
        span: 1,
        density: "compact",
        statusChip: primaryOpen ? chip("due") : null,
        statusTone: primaryOpen ? "due" : "neutral",
    });
}

function blockerInsight(displayVm: OpportunityDrawerViewModel): { insight: string; count: number } {
    const attention = displayVm.summaries.attention;
    if (attention?.needs_attention && attention.primary_reason) {
        const suffix =
            attention.reason_count > 1 ? ` (+${attention.reason_count - 1} more)` : "";
        return { insight: `${attention.primary_reason}${suffix}`, count: attention.reason_count };
    }
    const tasks = displayVm.summaries.tasks;
    if (tasks?.open_count && tasks.open_count > 0) {
        return {
            insight: `${tasks.open_count} open task${tasks.open_count === 1 ? "" : "s"} need attention`,
            count: tasks.open_count,
        };
    }
    return { insight: "Ready to proceed", count: 0 };
}

function tourInsight(displayVm: OpportunityDrawerViewModel): { insight: string; supporting: string | null } {
    const bookings = displayVm.summaries.active_tour_bookings ?? [];
    if (bookings.length === 0) {
        return { insight: "No tour scheduled", supporting: "Schedule when family is ready to visit" };
    }
    const next = bookings[0];
    const when = next?.start_at ? String(next.start_at).slice(0, 16).replace("T", " · ") : null;
    const status = formatFocusPanelChipLabel(next?.status_key?.trim() ?? "scheduled");
    return {
        insight: when ? `Tour ${when}` : "Tour scheduled",
        supporting: status ? `Status: ${status}` : null,
    };
}

function childStatusPhrase(row: { display_name?: string | null; outcome_status_key?: string | null; outcome_status_label?: string | null }): string {
    const firstName = (row.display_name ?? "Child").split(/\s+/)[0] ?? "Child";
    const label =
        formatFocusPanelDisplayLabel(row.outcome_status_label) ??
        formatFocusPanelChipLabel(row.outcome_status_key);
    if (label) return `${firstName} — ${label}`;
    return `${firstName} — In progress`;
}

function childrenInsight(record: Record<string, unknown>): { insight: string; detail: string | null } {
    const rows = mapRawInquiryChildrenToDrawerRows((record._inquiry_children as unknown[]) ?? []);
    if (rows.length === 0) return { insight: "No children linked", detail: "Link children to track enrollment progress" };
    const active = rows.filter((r) => r.outcome_status_key !== "declined");
    const insight =
        active.length === 1 ? "1 child enrolling" : `${active.length} children enrolling`;
    const detail = rows.slice(0, 2).map(childStatusPhrase).join(" · ");
    const suffix = rows.length > 2 ? ` · +${rows.length - 2} more` : "";
    return { insight, detail: detail ? `${detail}${suffix}` : null };
}

function missionStory(input: {
    displayVm: OpportunityDrawerViewModel;
    perspective: RuntimePerspective | null;
    stageRuntime: OpportunityDrawerViewModel["workspace"]["stage_work_runtime"];
    statusLabel: string | null;
}): { insight: string; supporting: string | null } {
    const nextAction = input.displayVm.actions.header_menu[0]?.label?.trim();
    const purpose = input.stageRuntime?.purpose?.trim();
    const stageLabel = input.stageRuntime?.stage_label?.trim() || input.statusLabel?.trim();
    const perspectiveMission = input.perspective?.defaultMission?.trim();

    if (nextAction) {
        return {
            insight: nextAction,
            supporting:
                perspectiveMission ||
                purpose ||
                (stageLabel ? `Advance ${stageLabel.toLowerCase()} workflow` : "Waiting for operator follow-through"),
        };
    }
    const primaryWork = input.stageRuntime?.primary?.label?.trim();
    if (primaryWork) {
        return {
            insight: primaryWork,
            supporting: purpose || perspectiveMission || "Continue stage work to move forward",
        };
    }
    if (purpose) {
        return { insight: purpose, supporting: perspectiveMission || "Mission proof for current stage" };
    }
    return {
        insight: stageLabel ? `Complete ${stageLabel} work` : "Define next step for this record",
        supporting: perspectiveMission || "Capture and validate key info to advance",
    };
}

function householdInsight(record: Record<string, unknown>, title: string): string {
    const meta = resolveLeadDrawerCommandHeaderMeta(record, { title });
    if (meta.contactRow) return meta.contactRow;
    if (meta.metaRow) return meta.metaRow;
    return "Primary contact on file";
}

function householdProfileFields(record: Record<string, unknown>): FocusPanelProfileField[] {
    const ident = (record._identity as Record<string, unknown> | null | undefined) ?? null;
    const primaryPerson =
        ident?.primary_person && typeof ident.primary_person === "object"
            ? (ident.primary_person as { label?: unknown })
            : null;

    return [
        {
            label: "Primary Contact",
            value:
                trimOrNull(record["person.primary_contact_name"]) ?? trimOrNull(primaryPerson?.label),
        },
        {
            label: "Secondary Contact",
            value: trimOrNull(record["person.secondary_contact_name"]),
        },
        {
            label: "Phone",
            value:
                trimOrNull(record["person.primary_phone"]) ??
                trimOrNull(record["person.secondary_phone"]),
        },
        {
            label: "Email",
            value:
                trimOrNull(record["person.primary_email"]) ??
                trimOrNull(record["person.secondary_email"]),
        },
    ];
}

function childrenCollectionItems(record: Record<string, unknown>): {
    items: FocusPanelCollectionItem[];
    overflowCount: number;
} {
    const rows = mapRawInquiryChildrenToDrawerRows((record._inquiry_children as unknown[]) ?? []);
    const visible = rows.slice(0, 3).map((row) => {
        const firstName = (row.display_name ?? "Child").split(/\s+/)[0] ?? "Child";
        const status =
            formatFocusPanelDisplayLabel(row.outcome_status_label) ??
            formatFocusPanelChipLabel(row.outcome_status_key) ??
            "In progress";
        return { label: firstName, status };
    });
    return { items: visible, overflowCount: Math.max(0, rows.length - 3) };
}

function statusIssuesFromVm(displayVm: OpportunityDrawerViewModel): string[] {
    const issues: string[] = [];
    const attention = displayVm.summaries.attention;
    if (attention?.primary_reason?.trim()) {
        issues.push(attention.primary_reason.trim());
    }
    if (attention?.reason_count && attention.reason_count > 1) {
        issues.push(`${attention.reason_count - 1} additional signal${attention.reason_count - 1 === 1 ? "" : "s"}`);
    }
    const tasks = displayVm.summaries.tasks;
    if (tasks?.open_count && tasks.open_count > 0) {
        const first = tasks.open_tasks?.[0]?.title?.trim();
        if (first && !issues.some((i) => i.toLowerCase().includes(first.toLowerCase()))) {
            issues.push(`${first}${tasks.open_count > 1 ? " · overdue" : " · overdue task"}`);
        } else if (tasks.open_count > 0) {
            issues.push(`${tasks.open_count} overdue task${tasks.open_count === 1 ? "" : "s"}`);
        }
    }
    const tour = displayVm.summaries.active_tour_bookings ?? [];
    if (tour.length === 0 && attention?.needs_attention) {
        issues.push("Tour not scheduled");
    }
    return issues.slice(0, 4);
}

function readinessIssues(displayVm: OpportunityDrawerViewModel): string[] {
    const issues: string[] = [];
    const attention = displayVm.summaries.attention;
    if (attention?.primary_reason?.trim()) {
        issues.push(attention.primary_reason.trim());
    }
    const blockers = blockerInsight(displayVm);
    if (blockers.count > 1 && attention?.primary_reason) {
        issues.push(`${blockers.count - 1} more required item${blockers.count - 1 === 1 ? "" : "s"}`);
    } else if (blockers.count > 0 && !attention?.primary_reason) {
        issues.push(blockers.insight);
    }
    return issues.slice(0, 4);
}

function timelineEventsFromRecord(record: Record<string, unknown>, statusLabel: string | null): {
    when: string;
    label: string;
}[] {
    const events: { when: string; label: string }[] = [];
    const updated = trimOrNull(record.updated_at);
    if (updated) {
        events.push({ when: "Recent", label: `Record updated · ${updated.slice(0, 10)}` });
    }
    if (trimOrNull(record.follow_up_notes)) {
        events.push({ when: "Notes", label: "Follow-up notes captured" });
    }
    if (statusLabel) {
        events.push({ when: "Status", label: `Currently ${statusLabel}` });
    }
    if (events.length === 0) {
        events.push({ when: "Today", label: "Record opened in workspace" });
    }
    return events.slice(0, 5);
}

function readinessKpiInsight(displayVm: OpportunityDrawerViewModel): {
    insight: string;
    supporting: string | null;
    tone: FocusPanelCardModel["statusTone"];
    chip: string | null;
} {
    const attention = displayVm.summaries.attention;
    const blockers = blockerInsight(displayVm);
    if (attention?.primary_reason?.trim() && blockers.count > 0) {
        return {
            insight: attention.primary_reason.trim(),
            supporting:
                blockers.count > 1
                    ? `${blockers.count} required items before advancing`
                    : "1 required item before advancing",
            tone: "blocked",
            chip: chip("blocked"),
        };
    }
    if (blockers.count > 0) {
        return {
            insight: blockers.insight,
            supporting: `${blockers.count} required item${blockers.count === 1 ? "" : "s"} before advancing`,
            tone: "blocked",
            chip: chip("blocked"),
        };
    }
    return { insight: "Ready to advance", supporting: "No blockers detected", tone: "ready", chip: chip("ready") };
}

function healthSupportingInsight(displayVm: OpportunityDrawerViewModel): string | null {
    const parts: string[] = [];
    const attention = displayVm.summaries.attention;
    if (attention?.primary_reason?.trim()) {
        parts.push(attention.primary_reason.trim());
    }
    const blockers = blockerInsight(displayVm);
    if (blockers.count > 1 && !attention?.primary_reason) {
        parts.push(`${blockers.count} blockers`);
    }
    const tasks = displayVm.summaries.tasks?.open_count ?? 0;
    if (tasks > 0) {
        parts.push(`${tasks} overdue task${tasks === 1 ? "" : "s"}`);
    }
    return parts.length ? parts.join(" · ") : null;
}

function communicationsInsight(displayVm: OpportunityDrawerViewModel): {
    insight: string;
    secondary: string | null;
} {
    const reminders = displayVm.summaries.reminders;
    const scheduledCount = reminders?.scheduled_send_count ?? 0;
    const followUp = reminders?.next_follow_up_iso;
    if (scheduledCount > 0) {
        return {
            insight: `${scheduledCount} scheduled send${scheduledCount === 1 ? "" : "s"}`,
            secondary: "Recent outreach context — open inbox to reply or compose.",
        };
    }
    if (followUp) {
        const when = String(followUp).slice(0, 10);
        return {
            insight: `Follow-up due ${when}`,
            secondary: "Latest thread summary available in inbox.",
        };
    }
    return {
        insight: "No recent outreach logged",
        secondary: "Message sending stays action-driven or inbox-driven.",
    };
}

function healthInsight(displayVm: OpportunityDrawerViewModel): {
    insight: string;
    tone: FocusPanelCardModel["statusTone"];
    chip: string | null;
} {
    const trust = displayVm.header.oper_trust_preview;
    if (trust?.headline?.trim()) {
        const tone: FocusPanelCardModel["statusTone"] =
            trust.risk_urgency_hint === "high" ? "at-risk"
            : trust.risk_urgency_hint === "medium" ? "due"
            : "ready";
        return { insight: trust.headline.trim(), tone, chip: chip(tone === "ready" ? "ready" : "at-risk") };
    }
    if (displayVm.summaries.attention?.needs_attention) {
        return { insight: "Needs attention", tone: "at-risk", chip: chip("at-risk") };
    }
    return { insight: "On track", tone: "ready", chip: chip("ready") };
}

/**
 * Canonical Household card model — SHARED by both Focus Panel Work-mode producers (drawer VM AND
 * provisioning answer), so the card is identical pending → enriched (A). Reads only the paint record;
 * the commit-critical producer supplies the same household keys the answer carries, so this is READY
 * at commit — never a blank reserved rectangle.
 */
export function buildHouseholdCardModel(record: Record<string, unknown>, title: string): FocusPanelCardModel {
    return card({
        key: "household",
        title: "Household",
        insight: householdInsight(record, title),
        tier: "reference",
        span: 2,
        density: "compact",
        payload: { profileFields: householdProfileFields(record) },
    });
}

/** Canonical Children card model — SHARED by both producers (see {@link buildHouseholdCardModel}). */
export function buildChildrenCardModel(record: Record<string, unknown>): FocusPanelCardModel {
    const children = childrenInsight(record);
    const childCollection = childrenCollectionItems(record);
    return card({
        key: "children",
        title: "Children",
        insight: children.insight,
        tier: "reference",
        span: 2,
        density: "compact",
        primaryAction: childCollection.items.length > 0 ? { label: "View all →", variant: "secondary" } : null,
        payload:
            childCollection.items.length > 0
                ? { collectionItems: childCollection.items, overflowCount: childCollection.overflowCount }
                : undefined,
        secondaryInsight: childCollection.items.length === 0 ? children.detail : null,
    });
}

function buildCardModels(input: {
    displayVm: OpportunityDrawerViewModel;
    record: Record<string, unknown>;
    title: string;
    perspective: RuntimePerspective | null;
    statusLabel: string | null;
}): Map<FocusPanelCardKey, FocusPanelCardModel> {
    const { displayVm, record, title, perspective, statusLabel } = input;
    const blockers = blockerInsight(displayVm);
    const children = childrenInsight(record);
    const comms = communicationsInsight(displayVm);
    const stageRuntime = displayVm.workspace.stage_work_runtime;
    const headerPrimaryAction = displayVm.actions.header_menu[0] ?? null;
    const missionStoryLine = missionStory({ displayVm, perspective, stageRuntime, statusLabel });
    const tour = tourInsight(displayVm);

    const map = new Map<FocusPanelCardKey, FocusPanelCardModel>();
    const healthIssues = statusIssuesFromVm(displayVm);
    const readinessIssueList = readinessIssues(displayVm);
    const childCollection = childrenCollectionItems(record);
    const householdFields = householdProfileFields(record);

    map.set(
        "attention",
        card({
            key: "attention",
            title: "Why Now",
            insight:
                displayVm.summaries.attention?.primary_reason ??
                (displayVm.summaries.attention?.needs_attention ? "Needs attention" : "No urgent signal"),
            secondaryInsight:
                displayVm.summaries.attention?.needs_attention && displayVm.summaries.attention.reason_count > 1
                    ? `${displayVm.summaries.attention.reason_count} signals need review`
                    : displayVm.summaries.attention?.needs_attention
                      ? "Review before advancing this record"
                      : null,
            tier: "attention",
            span: 1,
            density: "compact",
            statusChip: displayVm.summaries.attention?.needs_attention ? chip("at-risk") : chip("ready"),
            statusTone: displayVm.summaries.attention?.needs_attention ? "at-risk" : "ready",
            visible: Boolean(displayVm.summaries.attention?.visible),
        }),
    );

    map.set(
        "current_mission",
        card({
            key: "current_mission",
            title: "Current Mission",
            insight: missionStoryLine.insight,
            secondaryInsight: missionStoryLine.supporting,
            tier: "work",
            span: 1,
            density: "compact",
            statusChip: formatFocusPanelDisplayLabel(statusLabel),
            statusTone: "neutral",
            primaryAction: { label: "Open workflow →", variant: "primary" },
        }),
    );

    map.set(
        "current_work",
        buildCurrentWorkCardModel({
            stageWorkRuntime: stageRuntime,
            nextActionLabel: headerPrimaryAction?.label ?? null,
        }),
    );

    const readiness = readinessKpiInsight(displayVm);
    const health = healthInsight(displayVm);
    const documentsOutstanding =
        displayVm.summaries.attention?.needs_attention && displayVm.summaries.attention.primary_reason
            ? 1
            : 0;
    map.set(
        "readiness_kpi",
        card({
            key: "readiness_kpi",
            title: "Readiness",
            insight: readiness.insight,
            secondaryInsight: readiness.supporting,
            tier: "metric",
            span: 1,
            density: "compact",
            statusChip: readiness.chip,
            statusTone: readiness.tone,
            primaryAction: readiness.tone === "blocked" ? { label: "Resolve →", variant: "primary" } : null,
            payload: readinessIssueList.length > 0 ? { statusIssues: readinessIssueList } : undefined,
        }),
    );

    map.set(
        "health",
        card({
            key: "health",
            title: "Enrollment Health",
            insight: health.insight,
            secondaryInsight: healthSupportingInsight(displayVm),
            tier: "metric",
            span: 1,
            density: "compact",
            statusChip: health.chip,
            statusTone: health.tone,
            payload: healthIssues.length > 0 ? { statusIssues: healthIssues } : undefined,
        }),
    );

    map.set(
        "tour_summary",
        card({
            key: "tour_summary",
            title: "Tour",
            insight: tour.insight,
            secondaryInsight: tour.supporting,
            tier: "context",
            span: 1,
            density: "compact",
        }),
    );

    map.set(
        "required_information",
        card({
            key: "required_information",
            title: "Required Information",
            insight: blockers.insight,
            tier: "work",
            span: "row",
            density: "compact",
            statusChip: blockers.count > 0 ? `${blockers.count} blocker${blockers.count === 1 ? "" : "s"}` : chip("ready"),
            statusTone: blockers.count > 0 ? "blocked" : "ready",
            primaryAction:
                blockers.count > 0 ?
                    { label: "Resolve blockers →", variant: "primary" }
                :   null,
        }),
    );

    map.set("household", buildHouseholdCardModel(record, title));
    map.set("children", buildChildrenCardModel(record));

    map.set(
        "communications",
        card({
            key: "communications",
            title: "Communications",
            insight: comms.insight,
            tier: "context",
            span: "row",
            density: "compact",
            secondaryInsight: comms.secondary,
        }),
    );

    map.set(
        "documents",
        card({
            key: "documents",
            title: "Documents",
            insight:
                documentsOutstanding > 0 ? "Forms and missing information"
                :   "Forms up to date",
            secondaryInsight:
                documentsOutstanding > 0
                    ? `${documentsOutstanding} form outstanding`
                    : "No outstanding document blockers",
            tier: "context",
            span: "row",
            density: "compact",
        }),
    );

    map.set(
        "work_launcher",
        card({
            key: "work_launcher",
            title: "Work Launcher",
            insight: "Choose how to start or resume work",
            tier: "work",
            span: "row",
            density: "compact",
            primaryAction: null,
            payload: { launcherRows: WORK_LAUNCHER_ROWS },
        }),
    );

    map.set(
        "workflow_steps",
        card({
            key: "workflow_steps",
            title: "Current Step",
            insight: stageRuntime?.stage_label ?? statusLabel ?? "Stage work",
            tier: "work",
            span: "row",
            density: "expanded",
        }),
    );

    map.set(
        "tasks",
        card({
            key: "tasks",
            title: "Tasks",
            insight:
                displayVm.summaries.tasks?.open_count ?
                    `${displayVm.summaries.tasks.open_count} follow-up${displayVm.summaries.tasks.open_count === 1 ? "" : "s"}`
                :   "No open tasks",
            tier: "work",
            span: 2,
            density: "compact",
            payload:
                displayVm.summaries.tasks?.open_tasks?.length ?
                    {
                        collectionItems: displayVm.summaries.tasks.open_tasks.slice(0, 3).map((t) => ({
                            label: t.title ?? "Task",
                            status: t.status ?? "open",
                        })),
                        overflowCount: Math.max(
                            0,
                            (displayVm.summaries.tasks.open_count ?? 0) - 3,
                        ),
                    }
                :   undefined,
        }),
    );

    map.set(
        "automations",
        card({
            key: "automations",
            title: "Automations",
            insight: "After completion",
            tier: "context",
            span: 2,
            density: "compact",
        }),
    );

    map.set(
        "primary_next_action",
        card({
            key: "primary_next_action",
            title: "Primary Next Action",
            insight: headerPrimaryAction?.label ?? "No action configured",
            tier: "work",
            span: "row",
            density: "compact",
            visible: !headerPrimaryAction,
            primaryAction:
                headerPrimaryAction ?
                    { label: `${headerPrimaryAction.label} →`, variant: "primary" }
                :   null,
        }),
    );

    map.set(
        "timeline",
        card({
            key: "timeline",
            title: "Timeline",
            insight: "Recent activity",
            tier: "historical",
            span: "row",
            density: "expanded",
            primaryAction: null,
            payload: { timelineEvents: timelineEventsFromRecord(record, statusLabel) },
        }),
    );

    map.set(
        "notes",
        card({
            key: "notes",
            title: "Notes",
            insight: record.follow_up_notes ? "Follow-up notes on file" : "No notes yet",
            tier: "historical",
            span: 2,
            density: "compact",
        }),
    );

    map.set(
        "audit",
        card({
            key: "audit",
            title: "Audit",
            insight: "Workflow and system events",
            tier: "historical",
            span: 2,
            density: "compact",
        }),
    );

    map.set(
        "workflow_history",
        card({
            key: "workflow_history",
            title: "Workflow History",
            insight: "Stage transitions and outcomes",
            tier: "historical",
            span: 2,
            density: "compact",
        }),
    );

    map.set(
        "billing_preview",
        card({
            key: "billing_preview",
            title: "Billing Preview",
            insight: record["billing_configured"]
                ? "Billing configured"
                : trimOrNull(record["tuition_rate_label"]) ?? "Billing not configured",
            tier: "context",
            span: 1,
            density: "compact",
            statusChip: record["billing_configured"] ? "Configured" : null,
            statusTone: record["billing_configured"] ? "ready" : "neutral",
        }),
    );

    return map;
}

/**
 * Overview (Summary) composition — Core Four validation pass.
 *
 * Scoped intentionally to the four production operational cards so the operating
 * model can be evaluated cleanly:
 *   Household (wide) · Children (wide) · Current Work (narrow) · Readiness (medium)
 *
 * Why Now, Current Mission, Enrollment Health, Tour, Communications and Documents
 * are NOT deleted — their card models are still built (and used by Work / Activity
 * and the Experience Builder catalog). They are temporarily suppressed from the
 * Overview grid while we converge the Core Four visual rhythm.
 *
 * Cell widths come from the archetype footprint system (`system5FootprintForCard`),
 * not a flat `span: 1`. Each row pairs a wide identity/collection card with its
 * adjacent assessment/work card so the Overview holds a calm two-row rhythm at the
 * verified three-column width.
 *
 * Exported as the single source of truth for the config-driven slice:
 * `buildFocusPanelSummaryDefaultDoc()` re-encodes this grid into a `LayoutDoc`,
 * and the parity test asserts the round-trip is identical.
 */
const summaryCell = (
    key: FocusPanelCardKey,
    density: FocusPanelCardGridSpec["rows"][number]["cells"][number]["density"],
    tier: FocusPanelCardGridSpec["rows"][number]["cells"][number]["tier"],
) => ({
    key,
    span: footprintToGridSpan(system5FootprintForCard(key)),
    density,
    tier,
});

export const SUMMARY_GRID: FocusPanelCardGridSpec = {
    rows: [
        {
            cells: [
                summaryCell("current_work", "standard", "work"),
                summaryCell("household", "standard", "reference"),
            ],
        },
        {
            cells: [
                summaryCell("children", "standard", "reference"),
                summaryCell("readiness_kpi", "compact", "metric"),
            ],
        },
        {
            cells: [
                summaryCell("tour_summary", "compact", "context"),
                summaryCell("communications", "standard", "reference"),
            ],
        },
        {
            cells: [summaryCell("documents", "standard", "reference")],
        },
    ],
};

const WORK_GRID_SPLIT: FocusPanelCardGridSpec = {
    rows: [
        { cells: [{ key: "attention", span: "row", density: "compact", tier: "attention" }] },
        {
            cells: [
                { key: "workflow_steps", span: 1, density: "compact", tier: "work" },
                { key: "required_information", span: 1, density: "compact", tier: "work" },
            ],
        },
        { cells: [{ key: "work_launcher", span: 1, density: "compact", tier: "work" }] },
        {
            cells: [
                { key: "tasks", span: 1, density: "compact", tier: "work" },
                { key: "automations", span: 1, density: "compact", tier: "context" },
            ],
        },
        { cells: [{ key: "primary_next_action", span: "row", density: "compact", tier: "work" }] },
    ],
};

const WORK_GRID_ACTIVE: FocusPanelCardGridSpec = {
    rows: [
        { cells: [{ key: "attention", span: "row", density: "compact", tier: "attention" }] },
        {
            cells: [
                { key: "workflow_steps", span: 1, density: "standard", tier: "work" },
                { key: "required_information", span: 1, density: "compact", tier: "work" },
            ],
        },
        { cells: [{ key: "work_launcher", span: 1, density: "compact", tier: "work" }] },
        {
            cells: [
                { key: "tasks", span: 1, density: "compact", tier: "work" },
                { key: "automations", span: 1, density: "compact", tier: "context" },
            ],
        },
        { cells: [{ key: "primary_next_action", span: "row", density: "compact", tier: "work" }] },
    ],
};

/** Activity uses horizontal workspace — grid unused. */
const ACTIVITY_GRID: FocusPanelCardGridSpec = { rows: [] };

export function deriveOpportunityFocusPanelPresentation(input: {
    mode: FocusPanelMode;
    displayVm: OpportunityDrawerViewModel;
    record: Record<string, unknown>;
    title: string;
    perspective: RuntimePerspective | null;
    statusLabel: string | null;
}): { grid: FocusPanelCardGridSpec; cards: Map<FocusPanelCardKey, FocusPanelCardModel> } {
    const cards = buildCardModels(input);
    const workflowActive = Boolean(
        input.displayVm.workspace.work_intent_runtime?.state === "open" ||
            input.displayVm.workspace.stage_work_runtime?.primary?.state === "open",
    );
    return { grid: resolveFocusPanelModeGrid(input.mode, workflowActive), cards };
}

/**
 * The code default grid-spec for a mode — the source-agnostic composition selector the grid uses when
 * it consumes a `FocusPanelWorkModeModel` (Summary composition is overridden by the published doc).
 */
export function resolveFocusPanelModeGrid(mode: FocusPanelMode, workflowActive: boolean): FocusPanelCardGridSpec {
    if (mode === "work") return workflowActive ? WORK_GRID_ACTIVE : WORK_GRID_SPLIT;
    if (mode === "activity") return ACTIVITY_GRID;
    return SUMMARY_GRID;
}

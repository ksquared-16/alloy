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
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { RuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";

function card(
    partial: Omit<FocusPanelCardModel, "visible"> & { visible?: boolean },
): FocusPanelCardModel {
    return { visible: true, ...partial };
}

function stageWorkInsight(displayVm: OpportunityDrawerViewModel): string {
    const runtime = displayVm.workspace.stage_work_runtime;
    const primary = runtime?.primary;
    if (!primary) return "No active work for this stage.";
    const label = primary.label?.trim() || primary.template_key || "Work";
    if (primary.state === "open") return label;
    if (primary.state === "completed") return `${label} · completed`;
    return `${label} · planned`;
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

function tourInsight(displayVm: OpportunityDrawerViewModel): string {
    const bookings = displayVm.summaries.active_tour_bookings ?? [];
    if (bookings.length === 0) return "No tour scheduled";
    const next = bookings[0];
    const when = next?.scheduled_at ? String(next.scheduled_at).slice(0, 16).replace("T", " · ") : null;
    return when ? `Tour ${when}` : "Tour scheduled";
}

function childrenInsight(record: Record<string, unknown>): { insight: string; detail: string | null } {
    const rows = mapRawInquiryChildrenToDrawerRows((record._inquiry_children as unknown[]) ?? []);
    if (rows.length === 0) return { insight: "No children linked", detail: null };
    const enrolling = rows.filter((r) => r.outcome_status_key !== "declined").length;
    const insight = `${enrolling} enrolling`;
    const names = rows
        .slice(0, 2)
        .map((r) => r.display_name ?? "Child")
        .join(" · ");
    const detail =
        rows.length > 2 ? `${names} +${rows.length - 2} more` : names;
    return { insight, detail };
}

function householdInsight(record: Record<string, unknown>, title: string): string {
    const meta = resolveLeadDrawerCommandHeaderMeta(record, { title });
    if (meta.contactRow) return meta.contactRow;
    if (meta.metaRow) return meta.metaRow;
    return "Primary contact on file";
}

function readinessKpiInsight(displayVm: OpportunityDrawerViewModel): {
    insight: string;
    tone: FocusPanelCardModel["statusTone"];
    chip: string | null;
} {
    const blockers = blockerInsight(displayVm);
    if (blockers.count > 0) {
        return {
            insight: `${blockers.count} blocker${blockers.count === 1 ? "" : "s"}`,
            tone: "blocked",
            chip: "blocked",
        };
    }
    return { insight: "Ready", tone: "ready", chip: "ready" };
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
        return { insight: trust.headline.trim(), tone, chip: tone === "ready" ? "ready" : "at-risk" };
    }
    if (displayVm.summaries.attention?.needs_attention) {
        return { insight: "Needs attention", tone: "at-risk", chip: "at-risk" };
    }
    return { insight: "On track", tone: "ready", chip: "ready" };
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
    const stageRuntime = displayVm.workspace.stage_work_runtime;
    const mission =
        perspective?.defaultMission?.trim() ||
        perspective?.label?.trim() ||
        stageRuntime?.purpose?.trim() ||
        stageRuntime?.stage_label?.trim() ||
        "Current mission";

    const map = new Map<FocusPanelCardKey, FocusPanelCardModel>();

    map.set(
        "attention",
        card({
            key: "attention",
            title: "Why Now",
            insight:
                displayVm.summaries.attention?.primary_reason ??
                (displayVm.summaries.attention?.needs_attention ? "Needs attention" : "No urgent signal"),
            tier: "attention",
            span: 1,
            density: "compact",
            statusChip: displayVm.summaries.attention?.needs_attention ? "at-risk" : "ready",
            statusTone: displayVm.summaries.attention?.needs_attention ? "at-risk" : "ready",
            visible: Boolean(displayVm.summaries.attention?.visible),
        }),
    );

    map.set(
        "current_mission",
        card({
            key: "current_mission",
            title: "Current Mission",
            insight: mission,
            tier: "work",
            span: 1,
            density: "compact",
            statusChip: statusLabel,
            statusTone: "neutral",
        }),
    );

    map.set(
        "current_work",
        card({
            key: "current_work",
            title: "Current Work",
            insight: stageWorkInsight(displayVm),
            tier: "work",
            span: 1,
            density: "compact",
            statusChip: stageRuntime?.primary?.state === "open" ? "due" : null,
            statusTone: stageRuntime?.primary?.state === "open" ? "due" : "neutral",
        }),
    );

    const readiness = readinessKpiInsight(displayVm);
    map.set(
        "readiness_kpi",
        card({
            key: "readiness_kpi",
            title: "Readiness",
            insight: readiness.insight,
            tier: "metric",
            span: 1,
            density: "micro",
            statusChip: readiness.chip,
            statusTone: readiness.tone,
        }),
    );

    const health = healthInsight(displayVm);
    map.set(
        "health",
        card({
            key: "health",
            title: "Health",
            insight: health.insight,
            tier: "metric",
            span: 1,
            density: "micro",
            statusChip: health.chip,
            statusTone: health.tone,
        }),
    );

    map.set(
        "tour_summary",
        card({
            key: "tour_summary",
            title: "Tour",
            insight: tourInsight(displayVm),
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
            statusChip: blockers.count > 0 ? `${blockers.count} blocker${blockers.count === 1 ? "" : "s"}` : "ready",
            statusTone: blockers.count > 0 ? "blocked" : "ready",
            primaryAction:
                blockers.count > 0 ?
                    { label: "Resolve blockers →", variant: "primary" }
                :   null,
        }),
    );

    map.set(
        "household",
        card({
            key: "household",
            title: "Household",
            insight: householdInsight(record, title),
            tier: "reference",
            span: 2,
            density: "compact",
            secondaryInsight: resolveLeadDrawerCommandHeaderMeta(record, { title }).metaRow,
        }),
    );

    map.set(
        "children",
        card({
            key: "children",
            title: "Children",
            insight: children.insight,
            tier: "reference",
            span: 2,
            density: "compact",
            secondaryInsight: children.detail,
            primaryAction: children.detail ? { label: "Expand →", variant: "secondary" } : null,
        }),
    );

    map.set(
        "communications",
        card({
            key: "communications",
            title: "Communications",
            insight: "Recent threads and outreach",
            tier: "historical",
            span: "row",
            density: "compact",
        }),
    );

    map.set(
        "documents",
        card({
            key: "documents",
            title: "Documents",
            insight: "Forms and missing information",
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
            insight: "Manual · BOS Assist · Import",
            tier: "work",
            span: "row",
            density: "compact",
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
            insight: displayVm.actions.header_menu[0]?.label ?? "No action configured",
            tier: "work",
            span: "row",
            density: "compact",
            primaryAction:
                displayVm.actions.header_menu[0] ?
                    { label: `${displayVm.actions.header_menu[0].label} →`, variant: "primary" }
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

    return map;
}

const SUMMARY_GRID: FocusPanelCardGridSpec = {
    rows: [
        {
            cells: [
                { key: "attention", span: 1, density: "compact", tier: "attention" },
                { key: "current_mission", span: 1, density: "compact", tier: "work" },
                { key: "current_work", span: 1, density: "compact", tier: "work" },
                { key: "health", span: 1, density: "micro", tier: "metric" },
            ],
        },
        {
            cells: [
                { key: "readiness_kpi", span: 1, density: "micro", tier: "metric" },
                { key: "tour_summary", span: 1, density: "compact", tier: "context" },
            ],
        },
        {
            cells: [
                { key: "household", span: 2, density: "compact", tier: "reference" },
                { key: "children", span: 2, density: "compact", tier: "reference" },
            ],
        },
        {
            cells: [{ key: "communications", span: "row", density: "compact", tier: "historical" }],
        },
        {
            cells: [{ key: "documents", span: "row", density: "compact", tier: "context" }],
        },
    ],
};

const WORK_GRID_IDLE: FocusPanelCardGridSpec = {
    rows: [
        { cells: [{ key: "current_mission", span: "row", density: "compact", tier: "work" }] },
        { cells: [{ key: "required_information", span: "row", density: "compact", tier: "work" }] },
        { cells: [{ key: "work_launcher", span: "row", density: "compact", tier: "work" }] },
        {
            cells: [
                { key: "tasks", span: 2, density: "compact", tier: "work" },
                { key: "automations", span: 2, density: "compact", tier: "context" },
            ],
        },
        { cells: [{ key: "primary_next_action", span: "row", density: "compact", tier: "work" }] },
    ],
};

const WORK_GRID_ACTIVE: FocusPanelCardGridSpec = {
    rows: [
        { cells: [{ key: "attention", span: "row", density: "compact", tier: "attention" }] },
        { cells: [{ key: "workflow_steps", span: "row", density: "expanded", tier: "work" }] },
        { cells: [{ key: "required_information", span: "row", density: "compact", tier: "work" }] },
        { cells: [{ key: "work_launcher", span: "row", density: "compact", tier: "work" }] },
        {
            cells: [
                { key: "tasks", span: 2, density: "compact", tier: "work" },
                { key: "automations", span: 2, density: "compact", tier: "context" },
            ],
        },
        { cells: [{ key: "primary_next_action", span: "row", density: "compact", tier: "work" }] },
    ],
};

const ACTIVITY_GRID: FocusPanelCardGridSpec = {
    rows: [
        { cells: [{ key: "timeline", span: "row", density: "expanded", tier: "historical" }] },
        {
            cells: [
                { key: "communications", span: 2, density: "standard", tier: "historical" },
                { key: "documents", span: 2, density: "standard", tier: "historical" },
            ],
        },
        {
            cells: [
                { key: "notes", span: 2, density: "standard", tier: "historical" },
                { key: "workflow_history", span: 2, density: "standard", tier: "historical" },
            ],
        },
        {
            cells: [
                { key: "audit", span: 2, density: "standard", tier: "historical" },
            ],
        },
    ],
};

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

    if (input.mode === "work") {
        return { grid: workflowActive ? WORK_GRID_ACTIVE : WORK_GRID_IDLE, cards };
    }
    if (input.mode === "activity") {
        return { grid: ACTIVITY_GRID, cards };
    }
    return { grid: SUMMARY_GRID, cards };
}

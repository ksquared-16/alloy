/**
 * Derive Focus Panel Universal Card models from opportunity VM — not from layout sections.
 */

import { FOCUS_PANEL_BUSINESS_PROCESS_CARD_KEY } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import { normalizeFocusPanelChildrenRowsFromTruth } from "@/lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation";
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
    system5DefaultActionForCard,
    system5IconForCard,
} from "@/lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec";
import { deriveFocusPanelGridFromLayoutDoc } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelCardsFromLayoutDoc";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { system5ArchetypeForCard } from "@/lib/adminV2/runtime/focusPanel/system5CardArchetypes";
import {
    buildReadinessCardEvidence,
    type ReadinessEvidenceContext,
} from "@/lib/adminV2/runtime/focusPanel/readiness/buildReadinessCardEvidence";
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
        title: "What's Next",
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
    // Through the canonical normalizer, not the raw key: a durable child record supplies its one
    // member under `_durable_child_rows`, and reading `_inquiry_children` directly would report
    // "No children linked" about the child the card is FOR.
    const { rows } = normalizeFocusPanelChildrenRowsFromTruth(record);
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
    // See {@link childrenInsight} — the collection source is decided by the normalizer, once.
    const { rows } = normalizeFocusPanelChildrenRowsFromTruth(record);
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

/**
 * Canonical Readiness card model — SHARED by both Focus Panel Work-mode producers (see
 * {@link buildHouseholdCardModel}). Derived from the SAME evidence the ReadinessCard body renders
 * (`buildReadinessCardEvidence`), so model and card never disagree. Requires only observed truth
 * (primary contact + `_inquiry_children`) plus the attention signal — all of which the
 * commit-critical answer context carries, so Readiness is READY at commit; the attention blockers
 * that arrive with Settlement enrich the same cell in place.
 */
export function buildReadinessCardModel(context: ReadinessEvidenceContext): FocusPanelCardModel {
    const evidence = buildReadinessCardEvidence(context);
    return card({
        key: "readiness_kpi",
        title: "Readiness",
        insight: evidence.answerLine,
        secondaryInsight: evidence.supportingLine,
        tier: "metric",
        span: 1,
        density: "compact",
        statusChip: evidence.statusChip,
        statusTone: evidence.statusTone,
        primaryAction: evidence.statusTone === "blocked" ? { label: "Resolve →", variant: "primary" } : null,
        payload: evidence.blockers.length > 0 ? { statusIssues: evidence.blockers } : undefined,
    });
}

/** The enriched path's readiness slice of the context — truth + the settlement attention signal. */
function readinessContextFromVm(
    displayVm: OpportunityDrawerViewModel,
    record: Record<string, unknown>,
): ReadinessEvidenceContext {
    const attention = displayVm.summaries.attention;
    return {
        truth: record,
        signals: {
            attention: {
                needsAttention: Boolean(attention?.needs_attention),
                primaryReason: attention?.primary_reason ?? null,
                reasonCount: attention?.reason_count ?? 0,
            },
        },
    };
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

/**
 * Canonical Employment card model.
 *
 * MEANING FIRST, and the meaning is PERSON-OWNED: every word of the insight comes from the
 * `PersonEmploymentComposition` that `lib/employment` built. This function only chooses WHICH
 * composition to lead with (the case's primary contact, else the first employed contact). It
 * derives no employment state of its own.
 *
 * `visible: false` when no linked contact holds employment. Per the readiness contract that
 * makes the card `not_applicable`: the configured cell is KEPT and renders its muted treatment,
 * which is the honest answer for a family with no staff — never an empty "Employment" shell
 * asserting a relationship that does not exist.
 */
export function buildEmploymentCardModel(record: Record<string, unknown>): FocusPanelCardModel {
    const projection = record._case_employment as
        | {
              primary?: { person_id?: unknown } | null;
              people?: Array<{
                  person_id?: unknown;
                  person_label?: unknown;
                  employment?: {
                      is_staff?: boolean;
                      current?: {
                          state_label?: string | null;
                          position_label?: string | null;
                          primary_location_label?: string | null;
                          employment_type_label?: string | null;
                      } | null;
                      periods?: Array<{ position_label?: string | null }>;
                  } | null;
              }>;
          }
        | null
        | undefined;

    const people = Array.isArray(projection?.people) ? projection.people : [];
    if (people.length === 0) {
        return card({
            key: "employment",
            title: "Employment",
            insight: "No one on this family works here",
            tier: "reference",
            span: 2,
            density: "compact",
            primaryAction: null,
            visible: false,
        });
    }

    const primaryId = trimOrNull(projection?.primary?.person_id);
    const lead =
        (primaryId ? people.find((p) => trimOrNull(p.person_id) === primaryId) : null) ?? people[0]!;
    const employment = lead.employment ?? null;
    const current = employment?.current ?? null;
    const name = trimOrNull(lead.person_label);

    // The one sentence the operator needs: who, in what capacity, where.
    let insight: string;
    if (current) {
        const role = trimOrNull(current.position_label) ?? "Staff";
        const where = trimOrNull(current.primary_location_label);
        insight = `${name ? `${name} — ` : ""}${role}${where ? ` at ${where}` : ""}`;
    } else {
        const role = trimOrNull(employment?.periods?.[0]?.position_label);
        insight = `${name ? `${name} ` : ""}worked here${role ? ` as ${role}` : ""}`;
    }

    const others = people.length - 1;
    const secondaryInsight =
        others > 0
            ? `${others} other contact${others === 1 ? "" : "s"} with employment here`
            : trimOrNull(current?.employment_type_label);

    return card({
        key: "employment",
        title: "Employment",
        insight,
        secondaryInsight,
        tier: "reference",
        span: 2,
        density: "compact",
        statusChip: chip(trimOrNull(current?.state_label)),
        statusTone: current && employment?.is_staff ? "ready" : "neutral",
        // Read-only on this surface. Add / Edit / End employment are operator capabilities at
        // /organization/staff; offering them here would be a second execution path for one
        // capability — the exact mistake the tour lifecycle bar made.
        primaryAction: null,
    });
}

function schedulingCollectionItems(record: Record<string, unknown>): {
    items: FocusPanelCollectionItem[];
    overflowCount: number;
} {
    const rows = mapRawInquiryChildrenToDrawerRows((record._inquiry_children as unknown[]) ?? []);
    const visible = rows.slice(0, 3).map((row) => {
        const firstName = (row.display_name ?? "Child").split(/\s+/)[0] ?? "Child";
        // Operational schedule assignments do not exist until enrollment/Registration;
        // at the case-grain lead stage each child reads "Needs a room" (honest state,
        // never a fabricated schedule). Room · pattern display arrives with the
        // scheduling projection once the child is enrolled.
        return { label: firstName, status: "Needs a room" };
    });
    return { items: visible, overflowCount: Math.max(0, rows.length - 3) };
}

/**
 * Canonical Scheduling card model — case-grain, per the Children pattern. Shows the
 * family's children and their scheduling state; the Create-schedule command
 * (configured) is launched from the card action. Room · weekly pattern · dates are
 * set at Registration once enrollment creates the operational agreement.
 */
/** Canonical Milestones card model — composer + runtime share this producer. */
export function buildMilestonesCardModel(record: Record<string, unknown>): FocusPanelCardModel {
    const raw = record["milestones"];
    const count = Array.isArray(raw) ? raw.length : 0;
    return card({
        key: "milestones",
        title: "Milestones",
        insight: count > 0 ? `${count} milestone${count === 1 ? "" : "s"}` : "No milestones yet",
        secondaryInsight: count > 0 ? "Completed · committed · upcoming outcomes" : null,
        tier: "context",
        span: 1,
        density: "compact",
        statusChip: count > 0 ? String(count) : null,
        statusTone: count > 0 ? "ready" : "neutral",
        primaryAction: null,
    });
}

export function buildSchedulingCardModel(record: Record<string, unknown>): FocusPanelCardModel {
    const rows = mapRawInquiryChildrenToDrawerRows((record._inquiry_children as unknown[]) ?? []);
    const count = rows.length;
    const collection = schedulingCollectionItems(record);
    const insight =
        count === 0
            ? "No children to assign"
            : count === 1
              ? "1 child · no assignments yet"
              : `${count} children · assignments vary`;
    void collection;
    return card({
        key: "scheduling",
        title: "Assignments",
        insight,
        tier: "reference",
        span: 2,
        density: "compact",
        statusChip: null,
        statusTone: "neutral",
        // The card component renders per-child status + opens the work surface on
        // click; no card-level primary action or collection payload.
        primaryAction: null,
        secondaryInsight: count > 0 ? "Open a child to view or add assignments" : null,
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

    const currentWorkModel = buildCurrentWorkCardModel({
        stageWorkRuntime: stageRuntime,
        nextActionLabel: headerPrimaryAction?.label ?? null,
    });
    map.set("current_work", currentWorkModel);
    // THE SUCCESSOR PUBLISHES THE SAME MODEL UNDER THE CANONICAL IDENTITY.
    //
    // Configuration naming `current_work` normalizes to `business_process`, so composition asks for
    // the successor — and a successor with no model would DISAPPEAR the card from every tenant that
    // already configured it. Until Slice 2 deepens the presentation into the combined Process card,
    // the successor renders exactly what the predecessor did: same truth, same content, one entry
    // selected. There is no second source of work truth here, only a second name for it.
    map.set(FOCUS_PANEL_BUSINESS_PROCESS_CARD_KEY, {
        ...currentWorkModel,
        key: FOCUS_PANEL_BUSINESS_PROCESS_CARD_KEY,
    });

    const health = healthInsight(displayVm);
    const documentsOutstanding =
        displayVm.summaries.attention?.needs_attention && displayVm.summaries.attention.primary_reason
            ? 1
            : 0;
    map.set("readiness_kpi", buildReadinessCardModel(readinessContextFromVm(displayVm, record)));

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
    map.set("employment", buildEmploymentCardModel(record));
    map.set("scheduling", buildSchedulingCardModel(record));
    map.set("milestones", buildMilestonesCardModel(record));

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
        "attendance",
        card({
            key: "attendance",
            title: "Attendance",
            // The day itself is the insight, and only the scoped child has one — the card fills this
            // in from its own VM rather than the case record, which knows nothing about who is scoped.
            insight: "",
            tier: "work",
            span: 2,
            density: "compact",
        }),
    );

    map.set(
        "financials",
        card({
            key: "financials",
            title: "Financials",
            // The balance is the insight, and only the composed read model knows it — the card fills
            // this in from its own VM rather than from the case record, which knows no charges.
            insight: "",
            tier: "work",
            span: 2,
            // The V5 summary is this card's canonical presentation. A placement that wants supporting
            // context declares `compact` and the card states the balance without the breakdown.
            density: "standard",
        }),
    );

    map.set(
        "billing_preview",
        card({
            key: "billing_preview",
            title: "Billing Preview",
            // DEFERRED SOURCE — no verdict from unwired plumbing. `billing_configured` and
            // `tuition_rate_label` are read here but written NOWHERE in the platform, so the old
            // `?? "Billing not configured"` asserted a business conclusion on every record from
            // fields nothing populates. The authoritative source is the financial-config API,
            // resolved by `buildBillingPreviewCardEvidence` (which BillingPreviewCard renders);
            // this base model only holds the cell until then. See CARD-READINESS-LIFECYCLE.md.
            insight: record["billing_configured"]
                ? "Billing configured"
                : trimOrNull(record["tuition_rate_label"]) ?? "",
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
 * THE Work composition. This one IS the render: `OpportunityFocusPanelModeGrid` hands it to
 * `FocusPanelCardGrid` as `rows` with no `publishedLayout` and no `composeCards`, so the legacy
 * responsive grid paints it. Only `key`, cell ORDER and `span` reach the DOM (`legacyGridRows`
 * drops `tier`/`density`; `resolveFocusPanelCellGridSpan` maps `span` to `gridColumn`).
 *
 * Browser-measured on the Work surface (prod build, :3013, 1440px): strategy `legacy-grid`,
 * 3 columns, cells attention(row, 875px) · workflow_steps(1, 285px) · required_information(1) ·
 * work_launcher(1) · tasks(1) · automations(1) · primary_next_action(row) — this order and
 * emphasis exactly. At 520px the grid collapses to 1 column and every cell goes full width.
 *
 * ONE composition, not two: the former WORK_GRID_ACTIVE was byte-identical to this except
 * `workflow_steps.density: "standard"`, a field the legacy grid path discards — so the
 * `workflowActive` branch selected between two grids that rendered identically. `workflowActive`
 * remains a real runtime state (it drives `data-focus-panel-work-state`), it just does not change
 * composition. `focusPanelWorkCompositionParity.test.ts` locks the rendered shape.
 *
 * NOTE: `work` is not currently offered in the mode switch (`FOCUS_PANEL_SWITCH_MODES` is
 * `["summary","activity"]`), but it stays reachable via a persisted session mode, so this is live
 * compatibility surface — not dead code.
 */
const WORK_GRID: FocusPanelCardGridSpec = {
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
 * it consumes a `FocusPanelWorkModeModel`.
 *
 * Work owns its composition here (this IS the Work render path). Summary does NOT: it resolves from
 * the active `LayoutDoc` — the org's published doc, else the code-owned default composition — so this
 * branch derives from that same authority rather than declaring a second, independently-authored one.
 * (`OpportunityFocusPanelModeGrid` takes Summary's cells and cell resolution from
 * `deriveFocusPanelSummaryCompositionInputs`, so the Summary value here is not a render fallback.)
 */
export function resolveFocusPanelModeGrid(mode: FocusPanelMode, workflowActive: boolean): FocusPanelCardGridSpec {
    // `workflowActive` no longer selects a composition — see WORK_GRID. Kept in the signature
    // because it is a real runtime state and callers pass it.
    void workflowActive;
    if (mode === "work") return WORK_GRID;
    if (mode === "activity") return ACTIVITY_GRID;
    return deriveFocusPanelGridFromLayoutDoc(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
}

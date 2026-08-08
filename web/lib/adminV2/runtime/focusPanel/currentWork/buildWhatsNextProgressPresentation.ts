/**
 * Compact work-sequence selection for What's Next Card V2.
 *
 * Derives from configured/runtime work instances — never hardcodes scenario
 * counts (e.g. "3 attempts") or stage names. Presentation picks the useful
 * subset: recently completed · current · next.
 */

import type { StageWorkItemProjection, StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { CurrentWorkChecklistItemVM } from "./currentWorkSurfaceTypes";
import type {
    WhatsNextProgressItem,
    WhatsNextProgressMode,
    WhatsNextProgressPresentation,
} from "./whatsNextCardTypes";

export type WhatsNextSequenceStep = {
    key: string;
    label: string;
    state: "completed" | "current" | "upcoming";
    detail?: string | null;
    description?: string | null;
    templateKey?: string | null;
};

const MAX_VISIBLE = 3;

function statusLabelForRole(role: WhatsNextProgressItem["role"]): string {
    if (role === "completed") return "Completed";
    if (role === "current") return "In Progress";
    return "Upcoming";
}

function roleFromState(state: WhatsNextSequenceStep["state"]): WhatsNextProgressItem["role"] {
    if (state === "completed") return "completed";
    if (state === "current") return "current";
    return "upcoming";
}

function mapRuntimeState(state: StageWorkItemProjection["state"]): WhatsNextSequenceStep["state"] {
    if (state === "completed") return "completed";
    if (state === "open") return "current";
    return "upcoming";
}

function formatCompletedAt(iso: string | null | undefined): string | null {
    if (!iso?.trim()) return null;
    // Compact presentation date — keep ISO-local slice stable without inventing TZ infra here.
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    try {
        return new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        }).format(d);
    } catch {
        return null;
    }
}

/** Ordered steps from stage-work runtime (primary + additional). */
export function sequenceStepsFromStageRuntime(
    runtime: StageWorkRuntimeProjection | null | undefined,
): WhatsNextSequenceStep[] {
    if (!runtime) return [];
    const items = [runtime.primary, ...runtime.additional].filter(
        (item): item is StageWorkItemProjection => item != null,
    );
    if (items.length === 0) return [];

    // Prefer configured template_keys order when it covers the projected items.
    const byKey = new Map<string, StageWorkItemProjection>();
    for (const item of items) {
        if (!byKey.has(item.template_key)) byKey.set(item.template_key, item);
    }
    const ordered: StageWorkItemProjection[] = [];
    const seen = new Set<string>();
    for (const key of runtime.template_keys ?? []) {
        const item = byKey.get(key);
        if (item && !seen.has(item.template_key)) {
            ordered.push(item);
            seen.add(item.template_key);
        }
    }
    for (const item of items) {
        if (!seen.has(item.template_key)) {
            ordered.push(item);
            seen.add(item.template_key);
        }
    }

    const openIndex = ordered.findIndex((item) => item.state === "open" || item.state === "planned");
    return ordered.map((item, index) => {
        let state = mapRuntimeState(item.state);
        // Only one "current" — first open/planned; later planned stay upcoming.
        if (state === "current" && openIndex >= 0 && index !== openIndex) {
            state = "upcoming";
        }
        if (state === "upcoming" && openIndex >= 0 && index === openIndex) {
            state = "current";
        }
        return {
            key: item.work_id?.trim() || `${item.template_key}:${index}`,
            label: item.label?.trim() || "Work",
            state,
            detail: item.state === "completed" ? formatCompletedAt(item.completed_at) : null,
            description: item.description?.trim() || null,
            templateKey: item.template_key,
        };
    });
}

/** Fallback: stage_work checklist rows when runtime sequence is empty/single. */
export function sequenceStepsFromStageWorkChecklist(
    checklist: CurrentWorkChecklistItemVM[] | null | undefined,
): WhatsNextSequenceStep[] {
    const rows = (checklist ?? []).filter((row) => row.kind === "stage_work");
    if (rows.length === 0) return [];
    const currentIndex = rows.findIndex((row) => row.status !== "complete");
    return rows.map((row, index) => {
        let state: WhatsNextSequenceStep["state"] =
            row.status === "complete" ? "completed" : "upcoming";
        if (currentIndex >= 0 && index === currentIndex) state = "current";
        else if (currentIndex < 0 && index === rows.length - 1 && row.status === "complete") {
            state = "completed";
        } else if (row.status !== "complete" && (currentIndex < 0 || index > currentIndex)) {
            state = "upcoming";
        }
        return {
            key: row.key,
            label: row.label,
            state,
            detail: null,
            description: row.description ?? null,
            templateKey: row.key,
        };
    });
}

/**
 * Repeated-work attempt slots from a single open/active work item's attempt policy.
 * Does not hardcode attempt totals — uses completion_policy_max_attempts / attempt_count.
 */
export function sequenceStepsFromAttemptPolicy(
    item: StageWorkItemProjection | null | undefined,
): WhatsNextSequenceStep[] {
    if (!item) return [];
    const attemptCount = Math.max(0, Math.floor(item.attempt_count ?? 0));
    const maxConfigured =
        item.completion_policy_max_attempts != null && item.completion_policy_max_attempts > 0
            ? Math.floor(item.completion_policy_max_attempts)
            : null;
    const minConfigured =
        item.completion_policy_min_attempts != null && item.completion_policy_min_attempts > 0
            ? Math.floor(item.completion_policy_min_attempts)
            : null;

    const isOpen = item.state === "open" || item.state === "planned";
    // Visible total: configured max, else min, else derived from attempts + current slot when open.
    const derivedTotal =
        maxConfigured
        ?? minConfigured
        ?? (attemptCount > 0 || isOpen ? Math.max(attemptCount + (isOpen ? 1 : 0), 1) : 0);

    if (derivedTotal <= 1 && attemptCount === 0) return [];

    const total = Math.max(derivedTotal, attemptCount + (isOpen ? 1 : 0), 1);
    const steps: WhatsNextSequenceStep[] = [];
    for (let i = 1; i <= total; i += 1) {
        let state: WhatsNextSequenceStep["state"] = "upcoming";
        if (i <= attemptCount) state = "completed";
        else if (isOpen && i === attemptCount + 1) state = "current";
        else if (!isOpen && item.state === "completed" && i === total) state = "completed";
        steps.push({
            key: `${item.template_key}:attempt:${i}`,
            label: `Attempt ${i}`,
            state,
            detail: null,
            description: null,
            templateKey: item.template_key,
        });
    }
    return steps;
}

function detectMode(steps: WhatsNextSequenceStep[]): WhatsNextProgressMode {
    if (steps.length === 0) return "sequential";
    const keys = steps.map((s) => s.templateKey).filter(Boolean);
    const unique = new Set(keys);
    const allAttempts = steps.every((s) => /^Attempt\s+\d+$/i.test(s.label));
    if (allAttempts) return "repeated";
    if (unique.size === 1 && steps.length > 1) return "repeated";
    return "sequential";
}

/**
 * Prefer: recently completed · current · next.
 * Collapse older completed into a count label when needed.
 */
export function selectCompactProgressSequence(
    steps: WhatsNextSequenceStep[],
): WhatsNextProgressPresentation | null {
    if (steps.length === 0) return null;

    const mode = detectMode(steps);
    const currentIndex = steps.findIndex((s) => s.state === "current");
    const allCompleted = steps.every((s) => s.state === "completed");

    let focusIndices: number[] = [];

    if (allCompleted || (currentIndex < 0 && steps[steps.length - 1]?.state === "completed")) {
        // Terminal: completion state only (last completed).
        focusIndices = [steps.length - 1];
    } else if (currentIndex < 0) {
        // No explicit current — show leading upcoming pair if any.
        const firstUpcoming = steps.findIndex((s) => s.state === "upcoming");
        if (firstUpcoming >= 0) {
            focusIndices = firstUpcoming > 0 ? [firstUpcoming - 1, firstUpcoming] : [firstUpcoming];
            if (firstUpcoming + 1 < steps.length) focusIndices.push(firstUpcoming + 1);
        } else {
            focusIndices = steps.map((_, i) => i).slice(0, MAX_VISIBLE);
        }
    } else {
        const prev = currentIndex - 1;
        const next = currentIndex + 1;
        if (prev >= 0 && next < steps.length) {
            focusIndices = [prev, currentIndex, next];
        } else if (prev < 0 && next < steps.length) {
            focusIndices = [currentIndex, next];
            if (next + 1 < steps.length) focusIndices.push(next + 1);
        } else if (prev >= 0 && next >= steps.length) {
            focusIndices = prev > 0 ? [prev - 1, prev, currentIndex] : [prev, currentIndex];
        } else {
            focusIndices = [currentIndex];
        }
    }

    // Cap visible nodes.
    if (focusIndices.length > MAX_VISIBLE) {
        focusIndices = focusIndices.slice(-MAX_VISIBLE);
    }

    const firstVisible = focusIndices[0] ?? 0;
    const earlierCompleted = steps
        .slice(0, firstVisible)
        .filter((s) => s.state === "completed").length;

    const collapsedEarlierLabel =
        earlierCompleted > 0
            ? mode === "repeated"
                ? `${earlierCompleted} earlier attempt${earlierCompleted === 1 ? "" : "s"} completed`
                : `${earlierCompleted} earlier step${earlierCompleted === 1 ? "" : "s"} completed`
            : null;

    const items: WhatsNextProgressItem[] = focusIndices.map((index) => {
        const step = steps[index]!;
        const role = roleFromState(step.state);
        return {
            key: step.key,
            label: step.label,
            role,
            statusLabel: statusLabelForRole(role),
            detail: step.detail ?? null,
        };
    });

    const current = steps.find((s) => s.state === "current") ?? null;
    const after =
        currentIndex >= 0 && currentIndex + 1 < steps.length ? steps[currentIndex + 1] : null;

    const completedCount = steps.filter((s) => s.state === "completed").length;
    const repeatedHeadline =
        mode === "repeated" && steps.length > 1
            ? `${completedCount} of ${steps.length} attempts`
            : null;

    return {
        mode,
        items,
        collapsedEarlierLabel,
        repeatedHeadline,
        currentDetail: current?.description ?? null,
        // Repeated mode already labels the next attempt in the column — avoid echoing "Attempt N".
        afterDetail:
            after?.description?.trim()
            || (mode === "repeated" ? null : after?.label ?? null),
    };
}

/**
 * Build progress presentation from runtime → attempt policy → checklist fallback.
 */
export function buildWhatsNextProgressPresentation(args: {
    runtime?: StageWorkRuntimeProjection | null;
    checklist?: CurrentWorkChecklistItemVM[] | null;
    primaryWorkItem?: StageWorkItemProjection | null;
}): WhatsNextProgressPresentation | null {
    const fromRuntime = sequenceStepsFromStageRuntime(args.runtime ?? null);
    if (fromRuntime.length > 1) {
        return selectCompactProgressSequence(fromRuntime);
    }

    // Single runtime item may still be repeated work via attempt policy.
    const attemptSteps = sequenceStepsFromAttemptPolicy(
        args.primaryWorkItem ?? args.runtime?.primary ?? null,
    );
    if (attemptSteps.length > 1) {
        return selectCompactProgressSequence(attemptSteps);
    }

    const fromChecklist = sequenceStepsFromStageWorkChecklist(args.checklist);
    if (fromChecklist.length > 0) {
        return selectCompactProgressSequence(fromChecklist);
    }

    if (fromRuntime.length === 1) {
        return selectCompactProgressSequence(fromRuntime);
    }

    return null;
}

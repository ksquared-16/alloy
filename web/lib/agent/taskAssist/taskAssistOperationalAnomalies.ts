import { normalizeSimilarityText, similarityRatio, titlesAreSimilar } from "@/lib/agent/taskAssist/taskAssistStringSimilarity";

export type OperationalAnomalyKind =
    | "similar_open_task"
    | "same_day_open_task"
    | "similar_scheduled_send"
    | "similar_proposal_draft"
    | "recent_similar_message";

export type OperationalAnomalyWarning = {
    kind: OperationalAnomalyKind;
    message: string;
    existingId: string | null;
    existingLabel: string | null;
    allowUpdateExisting: boolean;
};

export type OperationalTaskSnapshot = {
    id: string;
    title: string;
    due_at: string;
    status: string;
};

export type ScheduledSendSnapshot = {
    id: string;
    scheduled_for: string;
    status: string;
    body_snapshot?: string | null;
};

export type ProposalSnapshot = {
    id: string;
    status: string;
    draft_body?: string | null;
    instruction?: string | null;
};

export type RecentMessageSnapshot = {
    id: string;
    body: string | null;
    created_at: string | null;
    direction?: string | null;
};

function sameLocalDay(aIso: string, bIso: string): boolean {
    const a = new Date(aIso);
    const b = new Date(bIso);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
    return (
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
    );
}

function scheduledTimesNear(aIso: string, bIso: string, windowMs = 2 * 60 * 60 * 1000): boolean {
    const a = Date.parse(aIso);
    const b = Date.parse(bIso);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return Math.abs(a - b) <= windowMs;
}

function bodySimilar(a: string, b: string): boolean {
    const na = normalizeSimilarityText(a);
    const nb = normalizeSimilarityText(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    return similarityRatio(na, nb) >= 0.65;
}

export function detectOperationalAnomalies(params: {
    intent: "create_reminder" | "schedule_message" | "draft_message";
    title?: string | null;
    dueAtIso?: string | null;
    scheduledForIso?: string | null;
    messageBody?: string | null;
    messageGoal?: string | null;
    openTasks: OperationalTaskSnapshot[];
    pendingScheduledSends: ScheduledSendSnapshot[];
    openProposals?: ProposalSnapshot[];
    recentOutboundMessages?: RecentMessageSnapshot[];
}): OperationalAnomalyWarning | null {
    const title = (params.title ?? params.messageGoal ?? "").trim();
    const openTasks = params.openTasks.filter((t) => t.status === "open");

    if (params.intent === "create_reminder" && params.dueAtIso) {
        for (const t of openTasks) {
            if (titlesAreSimilar(title, t.title)) {
                return {
                    kind: "similar_open_task",
                    message: `There is already a follow-up reminder (“${t.title}”) due ${formatWhen(t.due_at)}. Keep both or cancel?`,
                    existingId: t.id,
                    existingLabel: t.title,
                    allowUpdateExisting: false,
                };
            }
            if (sameLocalDay(params.dueAtIso, t.due_at)) {
                return {
                    kind: "same_day_open_task",
                    message: `You already have an open task due that day (“${t.title}”). Keep both or cancel?`,
                    existingId: t.id,
                    existingLabel: t.title,
                    allowUpdateExisting: false,
                };
            }
        }
    }

    if (params.intent === "schedule_message" && params.scheduledForIso) {
        const pending = params.pendingScheduledSends.filter((s) => s.status === "pending");
        for (const s of pending) {
            if (scheduledTimesNear(params.scheduledForIso, s.scheduled_for)) {
                return {
                    kind: "similar_scheduled_send",
                    message: `A message is already scheduled for ${formatWhen(s.scheduled_for)}. Keep both or cancel?`,
                    existingId: s.id,
                    existingLabel: null,
                    allowUpdateExisting: false,
                };
            }
        }
    }

    const goal = (params.messageGoal ?? params.messageBody ?? "").trim();
    if (goal && params.openProposals?.length) {
        for (const p of params.openProposals) {
            if (p.status !== "open" && p.status !== "pending") continue;
            const draft = (p.draft_body ?? p.instruction ?? "").trim();
            if (draft && bodySimilar(goal, draft)) {
                return {
                    kind: "similar_proposal_draft",
                    message: "A similar draft is already saved for this record. Keep both or cancel?",
                    existingId: p.id,
                    existingLabel: null,
                    allowUpdateExisting: false,
                };
            }
        }
    }

    if (goal && params.recentOutboundMessages?.length) {
        const cutoff = Date.now() - 48 * 60 * 60 * 1000;
        for (const m of params.recentOutboundMessages) {
            if ((m.direction ?? "").toLowerCase() !== "outbound") continue;
            const created = m.created_at ? Date.parse(m.created_at) : NaN;
            if (Number.isNaN(created) || created < cutoff) continue;
            if (bodySimilar(goal, m.body ?? "")) {
                return {
                    kind: "recent_similar_message",
                    message: "A similar message was sent recently. Keep both or cancel?",
                    existingId: m.id,
                    existingLabel: null,
                    allowUpdateExisting: false,
                };
            }
        }
    }

    return null;
}

function formatWhen(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    return new Date(t).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

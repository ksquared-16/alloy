/**
 * Work Items V3 — deterministic conversation → draft resolution (no BOS API in Slice 2).
 */

import { defaultOperationalWorkDueLocal } from "@/lib/admin/operationalWork/operationalWorkDateTimeLocal";
import {
    mutateWorkItemDraft,
    setWorkItemDraftIntentText,
    type WorkItemDraftEntity,
    type WorkItemDraftV1,
} from "@/lib/workItems/workItemDraftV1";

export type WorkItemConversationTurn = {
    id: string;
    role: "operator" | "system";
    text: string;
};

export type WorkItemClarificationChip = {
    id: string;
    label: string;
    mutation: WorkItemConversationMutation;
};

export type WorkItemConversationMutation =
    | { kind: "set_link_mode"; mode: "general" | "linked" }
    | { kind: "set_due_default" }
    | { kind: "set_assignee"; userId: string | null }
    | { kind: "set_entity"; entity: WorkItemDraftEntity | null }
    | { kind: "set_category"; category: string }
    | { kind: "set_priority"; priority: "low" | "medium" | "high" };

let turnCounter = 0;

export function createConversationTurnId(): string {
    turnCounter += 1;
    return `wi-turn-${turnCounter}`;
}

function pad2(n: number): string {
    return String(n).padStart(2, "0");
}

function localIsoFromDate(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseDueHint(text: string): string | null {
    const lower = text.toLowerCase();
    const d = new Date();

    if (/\btoday\b/.test(lower)) {
        d.setHours(17, 0, 0, 0);
        return localIsoFromDate(d);
    }
    if (/\btomorrow\b/.test(lower)) {
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return localIsoFromDate(d);
    }
    if (/\bnext week\b/.test(lower)) {
        d.setDate(d.getDate() + 7);
        d.setHours(9, 0, 0, 0);
        return localIsoFromDate(d);
    }

    const timeMatch = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
    if (timeMatch) {
        let hour = Number.parseInt(timeMatch[1], 10);
        const minute = timeMatch[2] ? Number.parseInt(timeMatch[2], 10) : 0;
        const meridiem = timeMatch[3];
        if (meridiem === "pm" && hour < 12) hour += 12;
        if (meridiem === "am" && hour === 12) hour = 0;
        d.setHours(hour, minute, 0, 0);
        return localIsoFromDate(d);
    }

    return null;
}

function extractTitleCandidate(text: string): string {
    const trimmed = text.trim();
    const withoutPrefix = trimmed.replace(/^(title|task|work item)\s*:\s*/i, "").trim();
    const firstSentence = withoutPrefix.split(/[.!?\n]/)[0]?.trim() ?? withoutPrefix;
    return firstSentence.slice(0, 140);
}

export function applyWorkItemConversationMutation(
    draft: WorkItemDraftV1,
    mutation: WorkItemConversationMutation,
): WorkItemDraftV1 {
    switch (mutation.kind) {
        case "set_link_mode":
            return mutateWorkItemDraft(draft, {
                link_mode: mutation.mode,
                entity: mutation.mode === "general" ? null : draft.entity,
            });
        case "set_due_default":
            return mutateWorkItemDraft(draft, { due_at: defaultOperationalWorkDueLocal() });
        case "set_assignee":
            return mutateWorkItemDraft(draft, { assigned_to_user_id: mutation.userId });
        case "set_entity":
            return mutateWorkItemDraft(draft, { entity: mutation.entity });
        case "set_category":
            return mutateWorkItemDraft(draft, { category: mutation.category });
        case "set_priority":
            return mutateWorkItemDraft(draft, { priority: mutation.priority });
        default:
            return draft;
    }
}

export function resolveWorkItemConversationTurn(params: {
    draft: WorkItemDraftV1;
    operatorText: string;
    currentUserId?: string | null;
}): {
    draft: WorkItemDraftV1;
    systemReply: string;
    chips: WorkItemClarificationChip[];
} {
    const raw = params.operatorText.trim();
    let draft = setWorkItemDraftIntentText(params.draft, raw);
    const lower = raw.toLowerCase();
    const notes: string[] = [];

    if (/\bgeneral\b/.test(lower) || /\bno record\b/.test(lower)) {
        draft = mutateWorkItemDraft(draft, { link_mode: "general", entity: null });
        notes.push("Set as general work (no record link).");
    }

    if (/\blink(ed)?\b/.test(lower) || /\bfor record\b/.test(lower)) {
        draft = mutateWorkItemDraft(draft, { link_mode: "linked" });
        notes.push("This work item will be linked to a record.");
    }

    if (/\bassign to me\b/.test(lower) && params.currentUserId?.trim()) {
        draft = mutateWorkItemDraft(draft, { assigned_to_user_id: params.currentUserId.trim() });
        notes.push("Assigned to you.");
    }

    if (/\bhigh priority\b|\burgent\b/.test(lower)) {
        draft = mutateWorkItemDraft(draft, { priority: "high" });
        notes.push("Marked high priority.");
    } else if (/\blow priority\b/.test(lower)) {
        draft = mutateWorkItemDraft(draft, { priority: "low" });
        notes.push("Marked low priority.");
    }

    if (/\bfollow[- ]?up\b/.test(lower)) {
        draft = mutateWorkItemDraft(draft, { category: "follow_up" });
        notes.push("Category set to follow-up.");
    }

    const dueHint = parseDueHint(raw);
    if (dueHint) {
        draft = mutateWorkItemDraft(draft, { due_at: new Date(dueHint).toISOString() });
        notes.push("Due date updated from your message.");
    }

    if (!draft.title.trim() && raw.length >= 3) {
        const title = extractTitleCandidate(raw);
        if (title) {
            draft = mutateWorkItemDraft(draft, { title });
            notes.push("Title captured from your description.");
        }
    } else if (raw.length > 0 && raw !== draft.title) {
        const existing = draft.description?.trim() ?? "";
        draft = mutateWorkItemDraft(draft, {
            description: existing ? `${existing}\n${raw}` : raw,
        });
        notes.push("Added detail to the description.");
    }

    const chips = buildClarificationChipsForDraft(draft, params.currentUserId);

    const systemReply =
        notes.length > 0 ?
            notes.join(" ")
        :   "Got it. I updated the draft preview — add a title, due date, and assignee if anything is still missing.";

    return { draft, systemReply, chips };
}


export function buildClarificationChipsForDraft(
    draft: WorkItemDraftV1,
    currentUserId?: string | null,
): WorkItemClarificationChip[] {
    const chips: WorkItemClarificationChip[] = [];
    if (!draft.due_at) {
        chips.push({ id: "due-default", label: "Due tomorrow 9am", mutation: { kind: "set_due_default" } });
    }
    if (!draft.assigned_to_user_id?.trim() && currentUserId?.trim()) {
        chips.push({
            id: "assign-me",
            label: "Assign to me",
            mutation: { kind: "set_assignee", userId: currentUserId.trim() },
        });
    }
    if (draft.link_mode === "linked" && !draft.entity?.id) {
        chips.push({ id: "link-mode-general", label: "Make general work", mutation: { kind: "set_link_mode", mode: "general" } });
    } else if (draft.link_mode === "general") {
        chips.push({ id: "link-mode-linked", label: "Link to a record", mutation: { kind: "set_link_mode", mode: "linked" } });
    }
    return chips;
}

export function buildInitialSystemTurn(): WorkItemConversationTurn {
    return {
        id: createConversationTurnId(),
        role: "system",
        text: "Describe what needs to happen. I'll build a work item draft you can review before creating.",
    };
}

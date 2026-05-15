/**
 * Card 9c — Deterministic Task Assist command intent (no LLM).
 */

import { stripTaskAssistCommandPrefixes } from "@/lib/agent/taskAssist/taskAssistCommandBarResolution";

export type TaskAssistCommandIntentType = "draft_message" | "schedule_message" | "create_reminder" | "unknown";

export type TaskAssistCommandIntentConfidence = "high" | "medium" | "low";

export type TaskAssistCommandIntent = {
    intent_type: TaskAssistCommandIntentType;
    channel_hint: "sms" | "email" | null;
    timing_hint_text: string | null;
    message_goal_text: string | null;
    search_text_hint: string | null;
    confidence: TaskAssistCommandIntentConfidence;
    warnings: string[];
    /** When true, caller must not proceed with Task Assist resolution. */
    workflow_blocked: boolean;
};

const WORKFLOW_RE =
    /\b(workflow|automatically|every\s+time|when\s+.+\s+happens|trigger(?:ed|s)?|rules?)\b/i;

const REMINDER_RE =
    /\b(remind(?:\s+me|\s+them|\s+us)?|reminder|follow[\s-]?up|create\s+(?:a\s+)?(?:reminder|task)|operational\s+task)\b/i;

const MESSAGE_RE = /\b(text|sms|email|message|send|draft|notify)\b/i;

const SMS_RE = /\b(text|sms)\b/i;
const EMAIL_RE = /\bemail\b/i;

const TIMING_RE =
    /\b(tomorrow|next\s+week|later|tonight|this\s+evening|schedule(?:d)?|send\s+later|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i;

const ABOUT_RE = /\b(?:about|regarding|re:)\s+(.+?)(?:\s+(?:tomorrow|next\s+week|later|tonight|at\s+\d)|$)/i;

/** Names / families for entity search — strip timing and trailing goal clauses. */
const SEARCH_STOP =
    /\b(about|regarding|missing|forms|tomorrow|next\s+week|later|tonight|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|please|thanks)\b/gi;

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

/** Best-effort `datetime-local` value from a timing hint (operator can edit). */
export function timingHintToDatetimeLocal(hint: string | null | undefined): string | null {
    if (!hint?.trim()) return null;
    const h = hint.trim().toLowerCase();
    const now = new Date();
    const d = new Date(now);

    const atMatch = h.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    let hour = 9;
    let minute = 0;
    if (atMatch) {
        hour = Number(atMatch[1]);
        minute = atMatch[2] ? Number(atMatch[2]) : 0;
        const ap = atMatch[3]?.toLowerCase();
        if (ap === "pm" && hour < 12) hour += 12;
        if (ap === "am" && hour === 12) hour = 0;
        if (!ap && hour <= 7) hour += 12;
    }

    if (h.includes("tomorrow")) {
        d.setDate(d.getDate() + 1);
    } else if (h.includes("next week")) {
        d.setDate(d.getDate() + 7);
    } else if (h.includes("later") || h.includes("tonight") || h.includes("this evening")) {
        d.setHours(d.getHours() + 2);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } else if (!atMatch && !h.includes("tomorrow") && !h.includes("next week")) {
        return null;
    }

    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= now.getTime() && !h.includes("tomorrow") && !h.includes("next week")) {
        d.setDate(d.getDate() + 1);
    }
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function extractTimingHint(raw: string): string | null {
    const m = raw.match(TIMING_RE);
    return m ? m[0].trim() : null;
}

function extractMessageGoal(raw: string): string | null {
    const m = raw.match(ABOUT_RE);
    if (m?.[1]) return m[1].trim().replace(/\s+/g, " ").slice(0, 240) || null;
    return null;
}

function buildSearchTextHint(raw: string, goal: string | null): string | null {
    let s = stripTaskAssistCommandPrefixes(raw);
    s = s.replace(TIMING_RE, " ").trim();
    if (goal) {
        s = s.replace(new RegExp(`\\b(?:about|regarding|re:)\\s+${goal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), " ");
    }
    s = s.replace(SEARCH_STOP, " ").replace(/\s+/g, " ").trim();
    s = s.replace(/^(the|a|an)\s+/i, "").trim();
    s = s.replace(/\bfamily\b/gi, " ").replace(/\s+/g, " ").trim();
    if (s.length < 2) return null;
    return s.slice(0, 64);
}

/**
 * Parse operator natural language into Task Assist intent + hints (deterministic).
 */
export function parseTaskAssistCommandIntent(input: string): TaskAssistCommandIntent {
    const raw = input.trim().slice(0, 500);
    const warnings: string[] = [];

    if (!raw) {
        return {
            intent_type: "unknown",
            channel_hint: null,
            timing_hint_text: null,
            message_goal_text: null,
            search_text_hint: null,
            confidence: "low",
            warnings: ["Empty command."],
            workflow_blocked: false,
        };
    }

    if (WORKFLOW_RE.test(raw)) {
        return {
            intent_type: "unknown",
            channel_hint: null,
            timing_hint_text: null,
            message_goal_text: null,
            search_text_hint: null,
            confidence: "high",
            warnings: ["That sounds like Workflow Assist, not Task Assist."],
            workflow_blocked: true,
        };
    }

    const timing_hint_text = extractTimingHint(raw);
    const message_goal_text = extractMessageGoal(raw);
    const search_text_hint = buildSearchTextHint(raw, message_goal_text);

    let channel_hint: "sms" | "email" | null = null;
    if (EMAIL_RE.test(raw)) channel_hint = "email";
    else if (SMS_RE.test(raw)) channel_hint = "sms";

    const hasReminder = REMINDER_RE.test(raw);
    const hasMessage = MESSAGE_RE.test(raw) || Boolean(message_goal_text);
    const hasTiming = Boolean(timing_hint_text);

    let intent_type: TaskAssistCommandIntentType = "unknown";
    let confidence: TaskAssistCommandIntentConfidence = "low";

    if (hasReminder && !hasMessage) {
        intent_type = "create_reminder";
        confidence = "medium";
    } else if (hasReminder && hasMessage) {
        intent_type = "create_reminder";
        confidence = "medium";
        warnings.push("Command mentions both messaging and reminder — using reminder flow.");
    } else if (hasMessage && hasTiming) {
        intent_type = "schedule_message";
        confidence = channel_hint ? "high" : "medium";
    } else if (hasMessage) {
        intent_type = "draft_message";
        confidence = channel_hint ? "high" : "medium";
    } else if (hasTiming) {
        intent_type = "schedule_message";
        confidence = "low";
        warnings.push("Timing detected without a clear message action — confirm channel and body in the workspace.");
    } else if (search_text_hint) {
        intent_type = "unknown";
        confidence = "low";
        warnings.push("No clear Task Assist action — find a target first, then choose draft, schedule, or reminder.");
    }

    return {
        intent_type,
        channel_hint,
        timing_hint_text,
        message_goal_text,
        search_text_hint,
        confidence,
        warnings,
        workflow_blocked: false,
    };
}

export type TaskAssistCommandBootstrap = {
    intent_type: TaskAssistCommandIntentType;
    channel_hint?: "sms" | "email" | null;
    instruction?: string | null;
    timing_hint_text?: string | null;
    open_schedule?: boolean;
    reminder_title?: string | null;
    reminder_due_hint?: string | null;
};

export function buildTaskAssistCommandBootstrap(intent: TaskAssistCommandIntent): TaskAssistCommandBootstrap {
    const instruction =
        intent.message_goal_text?.trim() ||
        (intent.intent_type === "draft_message" || intent.intent_type === "schedule_message" ?
            intent.search_text_hint
        :   null);

    const reminderTitle =
        intent.intent_type === "create_reminder" ?
            intent.message_goal_text?.trim() || "Follow up"
        :   null;

    return {
        intent_type: intent.intent_type,
        channel_hint: intent.channel_hint,
        instruction: instruction?.trim() || null,
        timing_hint_text: intent.timing_hint_text,
        open_schedule: intent.intent_type === "schedule_message",
        reminder_title: reminderTitle,
        reminder_due_hint: intent.intent_type === "create_reminder" ? intent.timing_hint_text : null,
    };
}

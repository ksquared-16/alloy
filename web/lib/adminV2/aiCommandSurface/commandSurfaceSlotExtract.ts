/**
 * Interaction Layer V1 — deterministic NL slot extraction (no LLM).
 */

const WORKFLOW_RE =
    /\b(workflow|automatically|every\s+time|when\s+.+\s+(?:happens|complete|completes|finish|finishes)|trigger(?:ed|s)?|rules?)\b/i;

const REMINDER_RE =
    /\b(remind(?:\s+me|\s+them|\s+us)?|reminder|follow[\s-]?up|create\s+(?:a\s+)?(?:reminder|task)|operational\s+task)\b/i;

const MESSAGE_RE = /\b(text|sms|email|message|send|draft|notify)\b/i;

const SMS_RE = /\b(text|sms)\b/i;
const EMAIL_RE = /\bemail\b/i;

const TIMING_RE =
    /\b(tomorrow|next\s+week|later|tonight|this\s+evening|schedule(?:d)?|send\s+later|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i;

const JOB_LAYOUT_RE =
    /\b(job\s+overview|overview\s+layout|overview|layout|panel|section|widget|configure|customer[\s-]?focused|make\s+the|hide|show|rearrange|reorder|more\s+customer)\b/i;

const STRIP_COMMS_PREFIX =
    /^\s*(please\s+)?(text|sms|email|message|send|draft|notify)\s+/i;

const STRIP_REMINDER_PREFIX =
    /^\s*(please\s+)?(remind(?:\s+me|\s+them|\s+us)?|reminder|follow[\s-]?up|create\s+(?:a\s+)?(?:reminder|task))\s+/i;

/** Goal clause follows entity phrase. */
const GOAL_DELIMITER_RE = /\s+(?:that|about|regarding|re:|saying|to\s+say)\s+/i;

const REMINDER_ENTITY_RE =
    /\b(?:with|for)\s+((?:the\s+|a\s+|an\s+)?[A-Za-z][\w'\-]*(?:\s+[A-Za-z][\w'\-]*)*(?:\s+(?:family|household))?)\b/i;

export type CommandSurfaceSlots = {
    raw: string;
    entity_search_text: string | null;
    message_goal_text: string | null;
    timing_phrase: string | null;
    channel_hint: "sms" | "email" | null;
    comms_verb: boolean;
    reminder_verb: boolean;
    layout_verb: boolean;
    workflow_like: boolean;
};

function cleanEntityPhrase(fragment: string | undefined | null): string | null {
    if (!fragment?.trim()) return null;
    let t = fragment
        .trim()
        .replace(/^(please\s+)?(to\s+)?/i, "")
        .replace(/^(the|a|an)\s+/i, "")
        .replace(TIMING_RE, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (t.length < 2) return null;
    return t.slice(0, 64);
}

function splitEntityAndGoal(source: string): { entity: string | null; goal: string | null } {
    const idx = source.search(GOAL_DELIMITER_RE);
    if (idx >= 0) {
        const match = source.slice(idx).match(GOAL_DELIMITER_RE);
        const delimLen = match?.[0]?.length ?? 0;
        const entityPart = source.slice(0, idx);
        const goalPart = source.slice(idx + delimLen).trim();
        return {
            entity: cleanEntityPhrase(entityPart),
            goal: goalPart.replace(/\s+/g, " ").trim().slice(0, 240) || null,
        };
    }

    const reminderEntity = source.match(REMINDER_ENTITY_RE);
    if (reminderEntity?.[1]) {
        const entity = cleanEntityPhrase(reminderEntity[1]);
        const goal = source
            .replace(REMINDER_ENTITY_RE, " ")
            .replace(/^(to\s+)?follow[\s-]?up\s*/i, "")
            .replace(TIMING_RE, " ")
            .replace(/\s+/g, " ")
            .trim();
        return {
            entity,
            goal: goal.length >= 2 ? goal.slice(0, 240) : null,
        };
    }

    return { entity: cleanEntityPhrase(source), goal: null };
}

/**
 * Extract entity phrase, message goal, timing, and coarse verb flags from operator NL.
 */
export function extractCommandSurfaceSlots(input: string): CommandSurfaceSlots {
    const raw = input.trim().slice(0, 500);
    if (!raw) {
        return {
            raw: "",
            entity_search_text: null,
            message_goal_text: null,
            timing_phrase: null,
            channel_hint: null,
            comms_verb: false,
            reminder_verb: false,
            layout_verb: false,
            workflow_like: false,
        };
    }

    const timingMatch = raw.match(TIMING_RE);
    const timing_phrase = timingMatch ? timingMatch[0].trim() : null;

    let channel_hint: "sms" | "email" | null = null;
    if (EMAIL_RE.test(raw)) channel_hint = "email";
    else if (SMS_RE.test(raw)) channel_hint = "sms";

    const comms_verb = MESSAGE_RE.test(raw);
    const reminder_verb = REMINDER_RE.test(raw);
    const layout_verb = JOB_LAYOUT_RE.test(raw);
    const workflow_like = WORKFLOW_RE.test(raw);

    let working = raw;
    if (STRIP_COMMS_PREFIX.test(working)) {
        working = working.replace(STRIP_COMMS_PREFIX, "").trim();
    } else if (STRIP_REMINDER_PREFIX.test(working)) {
        working = working.replace(STRIP_REMINDER_PREFIX, "").replace(/^to\s+/i, "").trim();
    }

    if (timing_phrase) {
        working = working.replace(TIMING_RE, " ").replace(/\s+/g, " ").trim();
    }

    const { entity, goal } = splitEntityAndGoal(working);

    return {
        raw,
        entity_search_text: entity,
        message_goal_text: goal,
        timing_phrase,
        channel_hint,
        comms_verb,
        reminder_verb,
        layout_verb,
        workflow_like,
    };
}

export { WORKFLOW_RE, MESSAGE_RE, REMINDER_RE, JOB_LAYOUT_RE, TIMING_RE };

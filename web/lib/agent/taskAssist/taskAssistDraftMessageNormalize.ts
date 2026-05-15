import type { TaskAssistOpportunityContextV1 } from "@/lib/agent/taskAssist/taskAssistOpportunityContext";

/** First inquiry child display name when confidently available (metadata or member). */
export function extractTaskAssistPrimaryChildName(context: TaskAssistOpportunityContextV1): string | null {
    const fromMeta = context.primary_child_display_name?.trim();
    if (fromMeta) return fromMeta;
    return null;
}

/** First word before "(" from the first recipient label — for warm greetings only. */
export function extractRecipientGreetingFirstName(context: TaskAssistOpportunityContextV1): string | null {
    const label = context.recipient_candidates[0]?.display_label?.trim();
    if (!label) return null;
    const beforeParen = label.split("(")[0]?.trim() ?? "";
    const firstWord = beforeParen.split(/\s+/)[0]?.trim();
    if (!firstWord || !/^[A-Za-z][A-Za-z'.-]*$/.test(firstWord)) return null;
    return firstWord;
}

function matchesTourInterestFollowUp(lowerGoal: string): boolean {
    if (!/\btour\b/.test(lowerGoal)) return false;
    if (/\binterested\b/.test(lowerGoal)) return true;
    if (/\bconfirm\b/.test(lowerGoal) && /\binterest/.test(lowerGoal)) return true;
    if (/\bschedul(e|ing)\s+a\s+tour\b/.test(lowerGoal)) return true;
    return false;
}

function formatTourInterestFollowUp(params: { channel: "sms" | "email"; recipientFirstName: string | null }): string {
    const { channel, recipientFirstName } = params;
    const core =
        "just checking in to see if you're still interested in scheduling a tour. We'd be happy to help with next steps.";
    if (channel === "email") {
        const intro = recipientFirstName ? `Hi ${recipientFirstName},\n\n` : "Hello,\n\n";
        return `${intro}${core.charAt(0).toUpperCase()}${core.slice(1)}`;
    }
    if (recipientFirstName) return `Hi ${recipientFirstName}, ${core}`;
    return `Hi, ${core}`;
}

/**
 * Normalize operator goal text for family-facing drafts — avoid awkward third-person child references
 * unless a specific child name is known.
 */
export function normalizeTaskAssistMessageGoal(
    raw: string,
    opts?: { primaryChildName?: string | null }
): string {
    let s = raw.trim();
    if (!s) return s;

    const childName = opts?.primaryChildName?.trim() || null;

    s = s.replace(/\bin\s+schedule\s+a\s+tour\b/gi, "in scheduling a tour");
    s = s.replace(/\binterested\s+in\s+schedule\b/gi, "interested in scheduling");
    s = s.replace(/\bschedule\s+a\s+tour\b/gi, "scheduling a tour");

    if (childName) {
        s = s.replace(/\b(her|his|their)\s+youngest\s+child\b/gi, childName);
        s = s.replace(/\byoungest\s+child\b/gi, childName);
    } else {
        s = s.replace(/\b(her|his|their)\s+youngest\s+child\b/gi, "the youngest child in your family");
        s = s.replace(/\byoungest\s+child\b/gi, "the youngest child in your family");
    }

    s = s.replace(/\b(her|his|their)\s+child\b/gi, childName ?? "your child");

    return s.replace(/\s{2,}/g, " ").trim();
}

/** Warm, concise SMS/email opening from normalized goal text (deterministic V1). */
export function formatTaskAssistDraftOpening(params: {
    instruction: string;
    channel: "sms" | "email";
    context: TaskAssistOpportunityContextV1;
}): string {
    const childName = extractTaskAssistPrimaryChildName(params.context);
    let goal = normalizeTaskAssistMessageGoal(params.instruction, { primaryChildName: childName });
    if (!goal) return params.channel === "sms" ? "Hello!" : "Hello,";

    goal = goal.replace(/^that\s+/i, "").replace(/^we'?re\s+/i, "").trim();

    const recipientFirst = extractRecipientGreetingFirstName(params.context);
    const lower = goal.toLowerCase();
    if (matchesTourInterestFollowUp(lower)) {
        return formatTourInterestFollowUp({ channel: params.channel, recipientFirstName: recipientFirst });
    }

    if (/excited/.test(lower) && /start/.test(lower)) {
        const subject = childName ?? (goal.match(/youngest child in your family/i) ? "the youngest child in your family" : "your family");
        if (childName) {
            return `We're excited for ${childName} to start with us soon!`;
        }
        if (/youngest child in your family/i.test(goal)) {
            return "We're excited for the youngest child in your family to start with us soon!";
        }
        return `We're excited for ${subject} to start with us soon!`;
    }

    let out = goal.charAt(0).toUpperCase() + goal.slice(1);
    if (!/[.!?]$/.test(out)) out += params.channel === "sms" ? "!" : ".";
    return out.slice(0, 800);
}

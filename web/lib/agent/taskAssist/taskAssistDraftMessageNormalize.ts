import type { TaskAssistOpportunityContextV1 } from "@/lib/agent/taskAssist/taskAssistOpportunityContext";

/** First inquiry child display name when confidently available (metadata or member). */
export function extractTaskAssistPrimaryChildName(context: TaskAssistOpportunityContextV1): string | null {
    const fromMeta = context.primary_child_display_name?.trim();
    if (fromMeta) return fromMeta;
    return null;
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

    const lower = goal.toLowerCase();
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

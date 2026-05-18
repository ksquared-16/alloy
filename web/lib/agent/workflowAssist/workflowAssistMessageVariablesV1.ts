/**
 * Workflow Assist message variable audit (2026-05).
 *
 * **Workflow runtime** (`web/lib/workflowTemplate.ts`): `{{dot.path}}` resolved from event payload
 * (e.g. `{{contact.phone}}`, `{{person.phone}}`, `{{opportunity.id}}`, `{{job.title}}`).
 *
 * **Needs-attention / Task Assist templates** (`suggestedContentTemplates.ts`): `{{contact_name}}` and
 * `{{team_line}}` are filled client-side before display — NOT workflow merge fields.
 *
 * **No canonical first-name token** exists for workflow SMS bodies today. Prefer operator preview copy
 * without invented merge fields, or bracket placeholders like `[Family first name]` in preview only.
 */

/** Documented workflow action merge paths (see Admin workflow action editor placeholders). */
export const WORKFLOW_DOCUMENTED_MERGE_PATHS = [
    "contact.phone",
    "contact.email",
    "contact.id",
    "person.phone",
    "person.email",
    "person.id",
    "opportunity.id",
    "customer.id",
    "job.id",
    "job.title",
    "schedule.start_at",
] as const;

/** Tokens that appear in legacy Assist drafts but are NOT workflow merge fields. */
export const WORKFLOW_ASSIST_UNSUPPORTED_PREVIEW_TOKENS = ["contact_name", "team_line"] as const;

const MERGE_TOKEN_RE = /\{\{([^}]+)\}\}/g;

export function extractMergeTokensFromPreview(text: string): string[] {
    const found = new Set<string>();
    for (const m of text.matchAll(MERGE_TOKEN_RE)) {
        const inner = (m[1] ?? "").trim();
        if (inner) found.add(inner);
    }
    return [...found];
}

export function findUnsupportedPreviewTokens(text: string): string[] {
    const tokens = extractMergeTokensFromPreview(text);
    return tokens.filter((t) =>
        (WORKFLOW_ASSIST_UNSUPPORTED_PREVIEW_TOKENS as readonly string[]).includes(t) ||
        (WORKFLOW_ASSIST_UNSUPPORTED_PREVIEW_TOKENS as readonly string[]).some((bad) => t.startsWith(`${bad}.`))
    );
}

/** Operator-safe tour reminder preview (no merge fields). */
export function buildTourReminderOperatorPreviewMessage(leadDays: number): string {
    const days = Number.isFinite(leadDays) && leadDays >= 1 ? Math.floor(leadDays) : 3;
    const dayWord = days === 1 ? "day" : "days";
    return (
        `Reminder: your upcoming tour is coming up in about ${days} ${dayWord}. ` +
        `Reply here if you need to reschedule.`
    );
}

export function buildGenericOperatorPreviewMessage(): string {
    return "Following up from our team. Let us know if you have questions or need help with next steps.";
}

/**
 * Sanitize preview text for operator card: replace unsupported tokens with bracket hints.
 */
export function sanitizeWorkflowAssistPreviewMessage(body: string): {
    body: string;
    unresolved_tokens: string[];
} {
    const unsupported = findUnsupportedPreviewTokens(body);
    if (!unsupported.length) {
        return { body: body.trim(), unresolved_tokens: [] };
    }
    let out = body;
    for (const token of unsupported) {
        const label =
            token === "contact_name" ? "[Family first name]"
            : token === "team_line" ? "[Your team name]"
            :   `[${token}]`;
        out = out.replace(new RegExp(`\\{\\{\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "g"), label);
    }
    return { body: out.trim(), unresolved_tokens: unsupported };
}

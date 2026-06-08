/**
 * Workflow Assist message variable audit (2026-05).
 *
 * **Workflow runtime** (`web/lib/workflowTemplate.ts`): `{{dot.path}}` resolved from event payload
 * (e.g. `{{contact.phone}}`, `{{person.phone}}`, `{{opportunity.id}}`, `{{job.title}}`).
 *
 * **Opportunity tour fields** (`opportunity.metadata.tour_date` / `tour_time`): present on enriched
 * opportunity rows in workflow payloads (see `enrichWorkflowEventPayloadEntities` in workflowRun.ts).
 * Values are stored as `yyyy-MM-dd` and `HH:mm` — operators should confirm display formatting in Automations.
 *
 * **Needs-attention / Task Assist templates** (`suggestedContentTemplates.ts`): `{{contact_name}}` and
 * `{{team_line}}` are filled client-side before display — NOT workflow merge fields.
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
    "opportunity.metadata.tour_date",
    "opportunity.metadata.tour_time",
    "customer.id",
    "job.id",
    "job.title",
    "schedule.start_at",
    "location.name",
] as const;

export const TOUR_REMINDER_TOUR_DATE_MERGE_PATH = "opportunity.metadata.tour_date" as const;
export const TOUR_REMINDER_TOUR_TIME_MERGE_PATH = "opportunity.metadata.tour_time" as const;

/** Tokens that appear in legacy Assist drafts but are NOT workflow merge fields. */
export const WORKFLOW_ASSIST_UNSUPPORTED_PREVIEW_TOKENS = ["contact_name", "team_line"] as const;

export type WorkflowAssistUnresolvedMappingV1 = {
    field: string;
    label: string;
    merge_path: string | null;
    placeholder: string;
    needs_mapping: true;
};

export type WorkflowAssistReminderIntentV1 = {
    action: "send_reminder";
    channel: "sms" | "email";
    timing: { kind: "days_before_scheduled_tour"; days: number };
    entity_type: "opportunity";
    recipient_intent: "primary_family_sms_recipient";
    tour_date_field: typeof TOUR_REMINDER_TOUR_DATE_MERGE_PATH;
    tour_time_field: typeof TOUR_REMINDER_TOUR_TIME_MERGE_PATH;
    message_preview: string;
    unresolved_mappings: WorkflowAssistUnresolvedMappingV1[];
};

const MERGE_TOKEN_RE = /\{\{([^}]+)\}\}/g;

export function mergeTokenForPath(path: string): string {
    return `{{${path}}}`;
}

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
    const documented = new Set<string>(WORKFLOW_DOCUMENTED_MERGE_PATHS);
    return tokens.filter((t) => {
        if ((WORKFLOW_ASSIST_UNSUPPORTED_PREVIEW_TOKENS as readonly string[]).includes(t)) return true;
        if ((WORKFLOW_ASSIST_UNSUPPORTED_PREVIEW_TOKENS as readonly string[]).some((bad) => t.startsWith(`${bad}.`))) {
            return true;
        }
        if (documented.has(t as (typeof WORKFLOW_DOCUMENTED_MERGE_PATHS)[number])) return false;
        return false;
    });
}

export function buildTourReminderUnresolvedMappingsV1(): WorkflowAssistUnresolvedMappingV1[] {
    return [
        {
            field: "tour_date",
            label: "Tour date",
            merge_path: TOUR_REMINDER_TOUR_DATE_MERGE_PATH,
            placeholder: "[tour date]",
            needs_mapping: true,
        },
        {
            field: "tour_time",
            label: "Tour time",
            merge_path: TOUR_REMINDER_TOUR_TIME_MERGE_PATH,
            placeholder: "[tour time]",
            needs_mapping: true,
        },
        {
            field: "recipient",
            label: "Recipient",
            merge_path: "person.phone",
            placeholder: "[recipient]",
            needs_mapping: true,
        },
    ];
}

export function buildTourReminderReminderIntentV1(input: {
    lead_days: number;
    channel?: "sms" | "email";
    message_preview: string;
}): WorkflowAssistReminderIntentV1 {
    const days = Number.isFinite(input.lead_days) && input.lead_days >= 1 ? Math.floor(input.lead_days) : 3;
    return {
        action: "send_reminder",
        channel: input.channel ?? "sms",
        timing: { kind: "days_before_scheduled_tour", days },
        entity_type: "opportunity",
        recipient_intent: "primary_family_sms_recipient",
        tour_date_field: TOUR_REMINDER_TOUR_DATE_MERGE_PATH,
        tour_time_field: TOUR_REMINDER_TOUR_TIME_MERGE_PATH,
        message_preview: input.message_preview.slice(0, 4000),
        unresolved_mappings: buildTourReminderUnresolvedMappingsV1(),
    };
}

/** Operator-safe tour reminder preview using documented workflow merge paths. */
export function buildTourReminderOperatorPreviewMessage(_leadDays: number): string {
    return (
        `Reminder: your tour is scheduled for ${mergeTokenForPath(TOUR_REMINDER_TOUR_DATE_MERGE_PATH)} at ` +
        `${mergeTokenForPath(TOUR_REMINDER_TOUR_TIME_MERGE_PATH)}. Reply here if you need to reschedule.`
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

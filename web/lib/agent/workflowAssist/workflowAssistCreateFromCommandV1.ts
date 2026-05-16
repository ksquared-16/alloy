/**
 * Workflow Assist — deterministic NL → create_workflow propose requests (no LLM).
 */

import type { WorkflowAssistProposeRequestV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import {
    buildTourReminderActionScaffolds,
    buildWorkflowAssistScopeDisplay,
    type WorkflowAssistDraftActionScaffoldV1,
    type WorkflowScopeMetadataV1,
} from "@/lib/workflows/workflowScopeMetadata";

export type WorkflowAssistCreateTemplateIdV1 = "tour_reminder" | "enrollment_when_move" | "generic_stub";

export type WorkflowAssistCreateIntentV1 = {
    version: 1;
    sub_intent: "create_workflow_proposal";
    template_id: WorkflowAssistCreateTemplateIdV1;
    parse_reason: string;
};

const CREATE_VERB_RE = /\b(create|make|add|new|set\s+up|build)\b/i;
const WORKFLOW_NOUN_RE = /\b(workflows?|automations?)\b/i;
const TOUR_RE = /\btours?\b/i;
const REMIND_RE = /\b(remind(?:er)?|reminder|notify|notification|send\s+a\s+reminder)\b/i;
const WHEN_MOVE_RE = /\bwhen\b.+\b(move|transition|set\s+status|ready\s+to)\b/i;

function parseDaysBeforeTour(text: string): number | null {
    const m = text.match(/\b(\d{1,2})\s+days?\s+before\b/i);
    if (m?.[1]) {
        const n = Number.parseInt(m[1], 10);
        if (Number.isFinite(n) && n >= 1 && n <= 30) return n;
    }
    return null;
}

/**
 * Returns a create intent when operator language requests a new workflow/automation draft.
 * Checked before read-intent parsing in the command surface router.
 */
export function parseWorkflowAssistCreateIntent(raw: string): WorkflowAssistCreateIntentV1 | null {
    const t = raw.trim().slice(0, 500);
    if (!t) return null;

    const explicitCreate = CREATE_VERB_RE.test(t) && WORKFLOW_NOUN_RE.test(t);
    const automationWhen = CREATE_VERB_RE.test(t) && /\bautomation\b/i.test(t) && /\bwhen\b/i.test(t);
    const tourReminderPhrase =
        (REMIND_RE.test(t) && TOUR_RE.test(t)) ||
        (explicitCreate && TOUR_RE.test(t) && (REMIND_RE.test(t) || /\bbefore\b/i.test(t)));
    const whenMove = WHEN_MOVE_RE.test(t) && (WORKFLOW_NOUN_RE.test(t) || /\bautomation\b/i.test(t) || /\bwhen\b/i.test(t));

    if (tourReminderPhrase) {
        return {
            version: 1,
            sub_intent: "create_workflow_proposal",
            template_id: "tour_reminder",
            parse_reason: explicitCreate ? "create_verb_tour_reminder" : "remind_tour_language",
        };
    }

    if (automationWhen || (explicitCreate && /\bwhen\b/i.test(t))) {
        return {
            version: 1,
            sub_intent: "create_workflow_proposal",
            template_id: "enrollment_when_move",
            parse_reason: "create_automation_when_clause",
        };
    }

    if (whenMove && !/\b(show|list|summary|which|why|fail)\b/i.test(t)) {
        return {
            version: 1,
            sub_intent: "create_workflow_proposal",
            template_id: "enrollment_when_move",
            parse_reason: "when_move_language",
        };
    }

    if (explicitCreate) {
        return {
            version: 1,
            sub_intent: "create_workflow_proposal",
            template_id: "generic_stub",
            parse_reason: "create_workflow_generic",
        };
    }

    return null;
}

export type WorkflowAssistCreateRouteContextV1 = {
    scope?: WorkflowScopeMetadataV1 | null;
    scope_labels?: { department_name?: string | null; work_unit_name?: string | null };
};

export type WorkflowAssistCreateProposeBuildV1 = {
    request: WorkflowAssistProposeRequestV1;
    scope_labels?: { department_name?: string | null; work_unit_name?: string | null };
    interpreted: {
        template_id: WorkflowAssistCreateTemplateIdV1;
        headline: string;
        trigger_label: string;
        actions_label: string;
        scope_label: string;
        unknowns: string[];
        draft_action_scaffolds?: WorkflowAssistDraftActionScaffoldV1[];
    };
};

function metadataForCreate(
    template_id: WorkflowAssistCreateTemplateIdV1,
    scope: WorkflowScopeMetadataV1 | null | undefined,
    draft_actions?: WorkflowAssistDraftActionScaffoldV1[]
) {
    const hasScope = Boolean(scope?.department_id || scope?.work_unit_id);
    if (!hasScope && !draft_actions?.length) return undefined;
    return {
        ...(hasScope && scope ? { scope } : {}),
        workflow_assist: {
            source: "workflow_assist_create_v1",
            template_id,
            ...(draft_actions?.length ? { draft_actions } : {}),
        },
    };
}

/** Map create intent + original command to a propose POST body. */
export function buildWorkflowAssistCreateProposeFromIntent(
    intent: WorkflowAssistCreateIntentV1,
    command: string,
    routeContext: WorkflowAssistCreateRouteContextV1 = {}
): WorkflowAssistCreateProposeBuildV1 {
    const days = parseDaysBeforeTour(command);
    const scope = routeContext.scope ?? null;
    const scope_display = buildWorkflowAssistScopeDisplay({
        scope,
        labels: routeContext.scope_labels,
    });

    if (intent.template_id === "tour_reminder") {
        const leadDays = days ?? 3;
        const draft_action_scaffolds = buildTourReminderActionScaffolds(leadDays);
        return {
            request: {
                version: 1,
                proposal_kind: "create_workflow",
                draft: {
                    name: "Tour Reminder Draft",
                    description:
                        `Assist-generated disabled draft: reminder ~${leadDays} day(s) before tour-related enrollment signals. ` +
                        "Action scaffold requires review. Review message content before enabling. Workflow remains disabled.",
                    event_type: "opportunity_schedule_tour_followup",
                    entity_type: "opportunity",
                    enabled: false,
                    metadata: metadataForCreate("tour_reminder", scope, draft_action_scaffolds),
                    draft_action_scaffolds,
                },
            },
            scope_labels: routeContext.scope_labels,
            interpreted: {
                template_id: "tour_reminder",
                headline: "Proposed tour reminder workflow (disabled draft)",
                trigger_label: `opportunity_schedule_tour_followup · opportunity (~${leadDays}d before tour — configure in Automations)`,
                actions_label:
                    "1 scaffolded log step (placeholder) — intended SMS reminder stored in metadata; review before enabling",
                scope_label: scope_display.label,
                draft_action_scaffolds,
                unknowns: [
                    "Exact offset timing and channel are not set by Assist.",
                    "Conditions (site, status, tour date field) must be configured manually.",
                    "Action scaffold requires review — does not send or schedule messages while disabled.",
                ],
            },
        };
    }

    if (intent.template_id === "enrollment_when_move") {
        return {
            request: {
                version: 1,
                proposal_kind: "create_workflow",
                draft: {
                    name: "Status transition draft (review required)",
                    description:
                        "Assist-generated disabled draft from a when/move style request. Uses a generic opportunity status trigger placeholder. " +
                        "Map the real form-complete event, target status, and actions in Automations before enabling.",
                    event_type: "opportunity_status_changed",
                    entity_type: "opportunity",
                    enabled: false,
                    metadata: metadataForCreate("enrollment_when_move", scope),
                },
            },
            scope_labels: routeContext.scope_labels,
            interpreted: {
                template_id: "enrollment_when_move",
                headline: "Proposed status-move workflow (disabled draft)",
                trigger_label: "opportunity_status_changed · opportunity (placeholder)",
                actions_label: "No transition actions scaffolded — configure status change steps in Automations",
                scope_label: scope_display.label,
                unknowns: [
                    "Source status / form-complete event not inferred from this command.",
                    "Target status (e.g. Ready to Enroll) must be set in workflow conditions/actions.",
                ],
            },
        };
    }

    return {
        request: {
            version: 1,
            proposal_kind: "create_workflow",
            draft: {
                name: "Assist draft (disabled)",
                description:
                    "Generic Assist starter — not production-ready. Review name, event/entity, conditions, and actions in Automations, then enable manually.",
                event_type: "opportunity_status_changed",
                entity_type: "opportunity",
                enabled: false,
                metadata: metadataForCreate("generic_stub", scope),
            },
        },
        scope_labels: routeContext.scope_labels,
        interpreted: {
            template_id: "generic_stub",
            headline: "Proposed workflow (disabled draft)",
            trigger_label: "opportunity_status_changed · opportunity (placeholder)",
            actions_label: "No steps scaffolded",
            scope_label: scope_display.label,
            unknowns: ["No template matched this command — configure manually in Automations."],
        },
    };
}

/**
 * Production-shaped published plan fixtures for Current Work tests.
 * Mirrors departments.metadata.lifecycle_builder_v1 as stored by /processes.
 */

import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

function enrollmentLeadActionCatalog(): StageActionCatalogV1 {
    return {
        version: 1,
        candidate_actions: [
            { action_key: "schedule_tour", recommendation: "recommended" },
            { action_key: "send_tour_invitation", recommendation: "ready" },
            { action_key: "close_lead", recommendation: "context_dependent" },
            { action_key: "quick_message", recommendation: "ready" },
        ],
    };
}

/** Apply explicit Work Template action/outcome refs for Contact Family runtime tests. */
export function applyEnrollmentLeadWorkTemplateActions(plan: StageOperatingPlanV1): StageOperatingPlanV1 {
    return {
        ...plan,
        work_templates: plan.work_templates.map((template) => {
            if (template.template_key !== "contact_family") return template;
            return {
                ...template,
                execution_mode: "direct_action",
                primary_action: { action_ref: "quick_message", override_label: "Contact Family" },
                helpful_actions: [
                    { action_ref: "schedule_tour" },
                    { action_ref: "send_tour_invitation" },
                    { action_ref: "quick_message" },
                    { action_ref: "add_child" },
                    { action_ref: "send_form" },
                ],
                outcome_refs: [
                    { outcome_ref: "reached_family" },
                    { outcome_ref: "left_message" },
                    { outcome_ref: "needs_follow_up" },
                    { outcome_ref: "interested" },
                    { outcome_ref: "not_interested" },
                ],
            };
        }),
    };
}

/** Published enrollment lead stage with explicit builder field rules for checklist truth tests. */
export function enrollmentLeadWithFieldRulesPublishedDepartmentMetadata(): Record<string, unknown> {
    const base = enrollmentLeadPublishedDepartmentMetadata();
    return {
        ...base,
        [LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY]: {
            version: 1,
            by_stage_key: {
                lead: {
                    required_rule_ids: [
                        "child:first_name",
                        "child:program_interest",
                        "child:desired_schedule",
                        "child:start_date",
                    ],
                    recommended_rule_ids: [],
                },
            },
        },
    };
}

export type EnrollmentFixtureChild = {
    name: string;
    program?: string | null;
    schedule?: string | null;
    startDate?: string | null;
};

export type EnrollmentFixtureContact = {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
};

export function buildEnrollmentRecordTruth(options: {
    children?: EnrollmentFixtureChild[];
    contact?: EnrollmentFixtureContact | null;
}): Record<string, unknown> {
    const children = options.children ?? [];
    const contact = options.contact;
    const [firstName, ...rest] = (contact?.firstName ?? "Alex").split(/\s+/);
    const lastName = contact?.lastName ?? (rest.join(" ") || "Rivera");

    return {
        status_key: "lead",
        primary_person_id: contact === null ? null : "person-primary",
        first_name: contact === null ? null : firstName,
        last_name: contact === null ? null : lastName,
        email: contact?.email ?? "alex@example.com",
        phone: contact?.phone ?? "555-0100",
        _inquiry_children: children.map((child, index) => {
            const [childFirst, ...childRest] = child.name.trim().split(/\s+/);
            return {
                id: `child-row-${index}`,
                person_id: `child-person-${index}`,
                customer_member_id: `member-${index}`,
                first_name: childFirst ?? child.name,
                last_name: childRest.join(" ") || null,
                program_category_id: child.program,
                schedule_type: child.schedule,
                start_date: child.startDate,
            };
        }),
    };
}

/** Published enrollment lead stage — explicit operating plan + action catalog on stage record. */
export function enrollmentLeadPublishedDepartmentMetadata(): Record<string, unknown> {
    const operatingPlan = applyEnrollmentLeadWorkTemplateActions(
        defaultStageOperatingPlanForEnrollmentStage("lead")!,
    );
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: "proc-enrollment",
            processes: [
                {
                    id: "proc-enrollment",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: [
                        {
                            id: "stage-lead",
                            key: "lead",
                            label: "Lead",
                            sort_order: 0,
                            is_active: true,
                            stage_operating_plan_v1: operatingPlan,
                            action_catalog_v1: enrollmentLeadActionCatalog(),
                        },
                    ],
                },
            ],
        },
    };
}

function billingOperatingPlan(): StageOperatingPlanV1 {
    return {
        version: 1,
        lifecycle_key: "billing",
        stage_key: "collect_payment",
        journey_segment: "family",
        purpose: "Collect payment for the billing period.",
        work_templates: [
            {
                template_key: "collect_payment",
                label: "Collect Payment",
                description: "Collect payment for July 2026.",
                required: true,
                primary: true,
                due_policy: { kind: "offset_days", days: 3 },
                owner_strategy: "record_owner",
                work_definition_key: "collect_payment",
                execution_mode: "direct_action",
                primary_action: { action_ref: "record_payment" },
                helpful_actions: [
                    { action_ref: "send_reminder" },
                    { action_ref: "payment_plan" },
                    { action_ref: "send_email" },
                    { action_ref: "adjust_invoice" },
                ],
                outcome_refs: [
                    { outcome_ref: "paid" },
                    { outcome_ref: "promise_to_pay" },
                    { outcome_ref: "unable_to_collect" },
                ],
            },
        ],
        outcomes: [
            {
                outcome_key: "paid",
                label: "Paid",
                work_template_key: "collect_payment",
                successful: true,
            },
            {
                outcome_key: "promise_to_pay",
                label: "Promise to Pay",
                work_template_key: "collect_payment",
            },
            {
                outcome_key: "unable_to_collect",
                label: "Unable to Collect",
                work_template_key: "collect_payment",
            },
            {
                outcome_key: "payment_received",
                label: "Payment received",
                work_template_key: "collect_payment",
                successful: true,
            },
            {
                outcome_key: "payment_plan",
                label: "Payment plan agreed",
                work_template_key: "collect_payment",
            },
        ],
        outcome_rules: [],
        attention_rules: [],
    };
}

function billingActionCatalog(): StageActionCatalogV1 {
    return {
        version: 1,
        candidate_actions: [
            { action_key: "record_payment", recommendation: "recommended" },
            { action_key: "send_reminder", recommendation: "ready" },
            { action_key: "payment_plan", recommendation: "ready" },
            { action_key: "send_email", recommendation: "ready" },
            { action_key: "adjust_invoice", recommendation: "ready" },
            { action_key: "waive_fee", recommendation: "context_dependent" },
            { action_key: "escalate_to_director", recommendation: "context_dependent" },
        ],
    };
}

/** Published billing collect-payment stage fixture. */
export function billingCollectPaymentPublishedDepartmentMetadata(): Record<string, unknown> {
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: "proc-billing",
            processes: [
                {
                    id: "proc-billing",
                    key: "billing",
                    name: "Billing",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: [
                        {
                            id: "stage-collect",
                            key: "collect_payment",
                            label: "Collect Payment",
                            sort_order: 0,
                            is_active: true,
                            stage_operating_plan_v1: billingOperatingPlan(),
                            action_catalog_v1: billingActionCatalog(),
                        },
                    ],
                },
            ],
        },
    };
}

/**
 * Canonical Business Process template → platform work definition resolution.
 *
 * Contract:
 *   Business Process Template → Work Definition → Operational Task
 *
 * A template must resolve to a platform catalog definition enabled for the stage.
 * Unresolved templates fail validation at save and reject at runtime spawn.
 */

import { getPlatformWorkDefinition } from "@/lib/admin/operationalWork/platformWorkDefinitionCatalog";
import { resolveWorkDefinition } from "@/lib/admin/operationalWork/resolveWorkDefinition";
import type { ResolveWorkDefinitionsParams } from "@/lib/admin/operationalWork/workDefinitionTypes";
import type { PlatformWorkDefinitionKey } from "@/lib/admin/operationalWork/workDefinitionTypes";
import type { StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/** Enrollment default bindings for template keys that are not catalog definition keys. */
export const ENROLLMENT_TEMPLATE_WORK_DEFINITION_DEFAULTS: Readonly<
    Record<string, PlatformWorkDefinitionKey>
> = {
    review_lead: "contact_family",
    review_new_inquiry: "contact_family",
    review_inquiry: "contact_family",
    contact_attempt_1: "contact_family",
    contact_attempt_2: "contact_family",
    contact_attempt_3: "contact_family",
    confirm_tour_date: "contact_family",
    send_tour_reminder: "contact_family",
    follow_up_decision: "contact_family",
    confirm_offer_response: "contact_family",
    review_waitlist_position: "contact_family",
    offer_spot: "contact_family",
    confirm_child_info: "collect_missing_information",
    confirm_location_program: "collect_missing_information",
    review_child_paths: "collect_missing_information",
    send_enrollment_packet: "collect_missing_information",
    confirm_start_date: "collect_missing_information",
    pre_start_checklist: "collect_missing_information",
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

export type ResolveWorkDefinitionKeyFromTemplateResult =
    | { ok: true; work_definition_key: PlatformWorkDefinitionKey; source: "explicit" | "catalog_key" | "default_binding" }
    | { ok: false; reason: "missing_template_key" | "unresolved_definition" | "definition_not_available" };

/** Resolve the platform work definition key for a stage work template (no side effects). */
export function resolveWorkDefinitionKeyFromTemplate(
    template: Pick<StageWorkTemplateV1, "template_key" | "work_definition_key">,
): ResolveWorkDefinitionKeyFromTemplateResult {
    const templateKey = trimOrNull(template.template_key);
    if (!templateKey) return { ok: false, reason: "missing_template_key" };

    const explicit = trimOrNull(template.work_definition_key);
    if (explicit) {
        if (!getPlatformWorkDefinition(explicit)) {
            return { ok: false, reason: "unresolved_definition" };
        }
        return { ok: true, work_definition_key: explicit as PlatformWorkDefinitionKey, source: "explicit" };
    }

    if (getPlatformWorkDefinition(templateKey)) {
        return {
            ok: true,
            work_definition_key: templateKey as PlatformWorkDefinitionKey,
            source: "catalog_key",
        };
    }

    const bound = ENROLLMENT_TEMPLATE_WORK_DEFINITION_DEFAULTS[templateKey];
    if (bound && getPlatformWorkDefinition(bound)) {
        return { ok: true, work_definition_key: bound, source: "default_binding" };
    }

    return { ok: false, reason: "unresolved_definition" };
}

/** Resolve and verify stage-scoped availability via lifecycle metadata. */
export function resolveEffectiveWorkDefinitionKeyFromTemplate(
    template: Pick<StageWorkTemplateV1, "template_key" | "work_definition_key">,
    resolveParams?: ResolveWorkDefinitionsParams,
): ResolveWorkDefinitionKeyFromTemplateResult {
    const resolved = resolveWorkDefinitionKeyFromTemplate(template);
    if (!resolved.ok) return resolved;

    const effective = resolveWorkDefinition(resolved.work_definition_key, resolveParams ?? {});
    if (!effective) {
        return { ok: false, reason: "definition_not_available" };
    }

    return resolved;
}

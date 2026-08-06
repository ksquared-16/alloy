/**
 * Resolve the configuration a participant decision needs — the plan, the work template, and the
 * capability identity behind each decision.
 *
 * Shared by the read path (rendering the rows) and the write path (executing one), so a decision
 * the surface offered is resolved from exactly the same configuration the executor will read.
 * Splitting these would let a decision render from one source and execute against another, which
 * is the shape of every configuration-drift bug on this stage so far.
 *
 * CAPABILITY HONESTY. A participant decision names a capability; the process selects capabilities
 * in `command_set_v1`. A decision naming a capability the process did NOT select is a configuration
 * error — the same "stage orphan" the effective-command resolver already reports — and it is
 * refused here rather than executed on the grounds that the target vocabulary happened to be
 * well-formed. This is what keeps `participant_decisions` from becoming a second command catalog
 * with its own private authority.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { commandSetHasEnabledKey } from "@/lib/lifecycle/processCommandSetV1";
import { getPlatformCapability } from "@/lib/platform/commands/capabilityRegistry";
import type {
    StageOperatingPlanV1,
    StageWorkParticipantDecisionV1,
    StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

export type ParticipantDecisionContext = {
    departmentId: string;
    stageKey: string;
    plan: StageOperatingPlanV1;
    template: StageWorkTemplateV1;
    /** The RESOLVED template key — callers must use this, not what they asked for. */
    templateKey: string;
    departmentMetadata: Record<string, unknown>;
    /** Operator label for a decision — its override, else the capability's registered label. */
    resolveDecisionLabel: (decision: StageWorkParticipantDecisionV1) => string;
    /** Null when the decision's capability is not process-selected. */
    assertCapabilitySelected: (decision: StageWorkParticipantDecisionV1) => string | null;
};

export type ResolveParticipantDecisionContextResult =
    | { ok: true; context: ParticipantDecisionContext }
    | { ok: false; status: number; message: string };

export async function resolveParticipantDecisionContext(params: {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    stageKey: string;
    /** Optional — omitted when the caller knows the stage but not its work templates. */
    templateKey?: string | null;
}): Promise<ResolveParticipantDecisionContextResult> {
    const departmentId = params.departmentId.trim();
    const stageKey = params.stageKey.trim();
    const requestedTemplateKey = params.templateKey?.trim() ?? "";
    if (!departmentId || !stageKey) {
        return { ok: false, status: 400, message: "department_id and stage_key are required" };
    }

    const { data: dept, error } = await params.supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    if (error) return { ok: false, status: 500, message: error.message };
    if (!dept) return { ok: false, status: 404, message: "Department not found" };

    const departmentMetadata =
        dept.metadata != null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    const plan = resolveEffectiveStageOperatingPlan({
        departmentMetadata,
        builderStageKey: stageKey,
    }).plan;
    if (!plan) return { ok: false, status: 404, message: "No operating plan for this stage" };

    /**
     * Which work item carries the decisions.
     *
     * A caller that names one gets that one. A caller that does not — the drawer, which knows the
     * stage but not its templates — gets the template that actually declares participant decisions.
     * When several do, the choice is genuinely the caller's to make and picking the first would be
     * a silent default deciding which children's surface renders, so it is refused instead.
     */
    const carriers = plan.work_templates.filter((t) => (t.participant_decisions ?? []).length > 0);

    if (!requestedTemplateKey && carriers.length > 1) {
        return { ok: false, status: 400, message: "template_key is required for this stage" };
    }

    /**
     * No carrier is NOT an error. "This stage has no per-child decisions" is the ordinary answer
     * for most stages, and for this stage while the configuration is still an unpublished draft —
     * the runtime reads the published projection, so a saved-but-unpublished decision set is
     * correctly invisible here. Resolving to the stage's first work template lets the caller
     * receive a clean `configured: false` instead of a 404 it would have to interpret.
     */
    const template =
        requestedTemplateKey ?
            plan.work_templates.find((t) => t.template_key === requestedTemplateKey) ?? null
        :   carriers[0] ?? plan.work_templates[0] ?? null;

    if (!template) {
        return { ok: false, status: 404, message: "Work item not configured for this stage" };
    }
    const templateKey = template.template_key;

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    // Already parsed onto the record by the builder config reader — re-parsing here would be a
    // second interpretation of the same bytes.
    const commandSet = process?.command_set_v1 ?? null;

    /** Alias-tolerant identity, so a decision may name an alias the command set records canonically. */
    const canonical = (key: string): string =>
        getPlatformCapability(key)?.canonicalCommandKey ?? key.trim();

    return {
        ok: true,
        context: {
            departmentId,
            stageKey,
            plan,
            template,
            templateKey,
            departmentMetadata,
            resolveDecisionLabel: (decision) => {
                const authored = decision.label?.trim();
                if (authored) return authored;
                const capability = getPlatformCapability(decision.action_ref);
                return capability?.operatorLabel?.trim() || decision.action_ref;
            },
            assertCapabilitySelected: (decision) => {
                const capability = getPlatformCapability(decision.action_ref);
                if (!capability) {
                    return `"${decision.action_ref}" is not a registered capability.`;
                }
                if (!commandSetHasEnabledKey(commandSet, decision.action_ref, canonical)) {
                    return (
                        `This option is configured but its command is not enabled for this process. `
                        + `Enable it in the Business Process command set first.`
                    );
                }
                return null;
            },
        },
    };
}

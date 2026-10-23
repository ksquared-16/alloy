/**
 * BP V2 D5 — the Enrollment template, applied with the commands its stages actually execute.
 *
 * `enrollmentProcessTemplate.ts` is pure configuration data and is imported widely; the capability registry
 * and the command-set machinery below are not, so this step lives here and is applied where the template is
 * applied (the Business Process builder's `apply_enrollment_v2_template`). Importing them from the template
 * module itself creates an import cycle.
 *
 * Two things, both read with the publish validator's own resolution so the two cannot disagree:
 *
 *  1. A template stage references only commands the platform can execute. The default Tour work lists
 *     `send_confirmation`, `send_reminder` and `reschedule` as helpful actions; none is a registered capability,
 *     directly or through its intent key (Current Work derives Reschedule / Cancel Tour from the tour booking
 *     itself), so none ever executes — and none can be selected in a command set. They are dropped.
 *  2. The process selects the commands its stages use plus the per-child capabilities the Decision work's
 *     participant decisions name — the runtime refuses a per-child path whose command the process did not
 *     select, and publication refuses a command set that misses a referenced command. Stamped the way every
 *     save stamps first, then added (idempotent; an explicitly disabled command is never re-enabled).
 */

import {
    applyEnrollmentTemplateInConfig,
    ENROLLMENT_PER_CHILD_CAPABILITIES,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { ensureProcessCommandSetV1OnSave } from "@/lib/lifecycle/ensureProcessCommandSetV1OnSave";
import {
    updateProcessCommandSet,
    type LifecycleBuilderProcessRecord,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveStageCommands } from "@/lib/lifecycle/stageCommands";
import { normalizeActionRefToIntentKey } from "@/lib/lifecycle/workTemplateActionIntentCatalog";
import { tryResolvePlatformCapability } from "@/lib/platform/commands/capabilityRegistry";

export function executableCommandRef(ref: string): boolean {
    const key = ref.trim();
    if (!key) return false;
    if (tryResolvePlatformCapability(key).status === "known") return true;
    const intent = normalizeActionRefToIntentKey(key);
    return Boolean(intent) && tryResolvePlatformCapability(intent!).status === "known";
}

function withExecutableHelpfulActionsOnly(process: LifecycleBuilderProcessRecord): LifecycleBuilderProcessRecord {
    return {
        ...process,
        stages: process.stages.map((stage) => {
            const plan = stage.stage_operating_plan_v1;
            if (!plan) return stage;
            return {
                ...stage,
                stage_operating_plan_v1: {
                    ...plan,
                    work_templates: (plan.work_templates ?? []).map((w) =>
                        w.helpful_actions ? { ...w, helpful_actions: w.helpful_actions.filter((a) => executableCommandRef(a.action_ref)) } : w,
                    ),
                },
            };
        }),
    };
}

/** The process's command selection: what its stages use, plus the per-child capabilities. */
export function withEnrollmentTemplateCommandSelection(process: LifecycleBuilderProcessRecord): LifecycleBuilderProcessRecord {
    const stamped = ensureProcessCommandSetV1OnSave(withExecutableHelpfulActionsOnly(process));
    const used = new Set<string>(ENROLLMENT_PER_CHILD_CAPABILITIES);
    for (const stage of stamped.stages) {
        for (const row of resolveStageCommands(stage.stage_operating_plan_v1 ?? null).commands) if (row.action_ref.trim()) used.add(row.action_ref.trim());
        for (const row of stage.action_catalog_v1?.candidate_actions ?? []) if (row.action_key.trim()) used.add(row.action_key.trim());
    }
    const { config, rejected } = updateProcessCommandSet({ version: 1, active_process_id: stamped.id, processes: [stamped] }, stamped.id, {
        addCapabilityKeys: [...used],
    });
    if (rejected.length) {
        throw new Error(`Enrollment template: commands not registered in the capability registry: ${rejected.map((r) => r.requested).join(", ")}`);
    }
    return config.processes[0]!;
}

/** `apply_enrollment_v2_template`: the template's stages and tracks, with the commands they execute selected. */
export function applyEnrollmentTemplateWithCommandsInConfig(config: LifecycleBuilderV1, processId: string): LifecycleBuilderV1 {
    const applied = applyEnrollmentTemplateInConfig(config, processId);
    const pid = processId.trim();
    return { ...applied, processes: applied.processes.map((p) => (p.id === pid ? withEnrollmentTemplateCommandSelection(p) : p)) };
}

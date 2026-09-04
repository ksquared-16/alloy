/**
 * D-96 SPLIT — pinned work semantics, live command placement.
 *
 * A running process instance pins the Business Process revision that governs it, so an in-flight
 * journey is not silently reinterpreted when an administrator republishes. That pin is correct for
 * everything that decides what already-created work MEANS: work identity, subject grain, completion
 * policy, outcomes and their targets, and the requirements governing completion.
 *
 * Process-card commands are not that. They answer "what can the operator do now?" — placement, not
 * historical transaction truth. They were pinned only because `helpful_actions` happens to live
 * inside the work-template payload, and the consequence was that a published `/process` edit had no
 * effect on records already in the stage: measured on a pinned Waitlist instance, live configuration
 * read `[send_tour_invitation, schedule_tour, add_family_member, send_form]` while the pinned
 * revision still read `[…, quick_message, …]`, and the operator saw the revision.
 *
 * So the pinned payload is kept, and ONLY the command refs are resolved from current published
 * configuration. Nothing is rewritten in the stored revision — historical configuration stays
 * historical evidence, and this resolution happens at read time.
 *
 * Live placement does not weaken any invariant: a newly configured command still runs the whole
 * server-authoritative path (registered capability → context → subject → eligibility → inputs →
 * preview → confirmation → execution). Configuration decides what is OFFERED; the runtime decides
 * what can RUN.
 */

import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

/** Where the command refs on a resolved stage came from. */
export type CommandPlacementSource = "live_published" | "pinned_fallback";

export type ResolvedCommandPlacement = {
    source: CommandPlacementSource;
    /** Command refs now in force for the stage, by work-template key. Diagnostics only. */
    refsByTemplateKey: Record<string, string[]>;
};

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec | null {
    return value != null && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function keyOf(value: unknown): string {
    const record = asRecord(value);
    const key = record?.key;
    return typeof key === "string" ? key.trim() : "";
}

function templateKeyOf(value: unknown): string {
    const record = asRecord(value);
    const key = record?.template_key;
    return typeof key === "string" ? key.trim() : "";
}

function commandRefs(template: unknown): string[] {
    const helpful = asArray(asRecord(template)?.helpful_actions);
    return helpful
        .map((row) => {
            const ref = asRecord(row)?.action_ref;
            return typeof ref === "string" ? ref.trim() : "";
        })
        .filter(Boolean);
}

/**
 * Resolve the command placement in force for one stage, over a pinned revision.
 *
 * Matching is by STABLE IDENTITY — process key, then stage key, then work-template key. Never by
 * label, display order, or array position: a template matched by position is a different template
 * wearing its neighbour's commands, which is exactly the substitution this whole seam exists to
 * stop.
 *
 * Returns the pinned payload with live command refs overlaid on the matched stage. The input is
 * never mutated; only the path that changes is rebuilt.
 */
export function overlayLiveCommandPlacementOntoPinnedRevision(params: {
    pinnedBuilderPayload: Rec;
    liveDepartmentMetadata: Rec | null | undefined;
    stageKey: string;
}): { payload: Rec; placement: ResolvedCommandPlacement } {
    const stageKey = params.stageKey.trim();
    const pinned = params.pinnedBuilderPayload;
    const liveProcess = activeLifecycleProcess(
        lifecycleBuilderFromDepartmentMetadata(params.liveDepartmentMetadata ?? {}),
    );

    const pinnedProcesses = asArray(pinned.processes);
    // No live counterpart at all — the process this journey runs under is gone from current
    // configuration. It still has to be able to finish, so its own revision keeps answering. This is
    // compatibility fallback, recorded as such, not normal operation.
    if (!liveProcess || !stageKey || pinnedProcesses.length === 0) {
        return { payload: pinned, placement: { source: "pinned_fallback", refsByTemplateKey: {} } };
    }

    const liveStage = asArray((liveProcess as unknown as Rec).stages).find((s) => keyOf(s) === stageKey);
    if (!liveStage) {
        return { payload: pinned, placement: { source: "pinned_fallback", refsByTemplateKey: {} } };
    }

    const liveTemplates = asArray(asRecord(asRecord(liveStage)?.stage_operating_plan_v1)?.work_templates);
    const refsByTemplateKey: Record<string, string[]> = {};
    let touchedStage = false;

    const nextProcesses = pinnedProcesses.map((processNode) => {
        const processRecord = asRecord(processNode);
        if (!processRecord || keyOf(processNode) !== (liveProcess.key ?? "").trim()) return processNode;

        const stages = asArray(processRecord.stages);
        const nextStages = stages.map((stageNode) => {
            const stageRecord = asRecord(stageNode);
            if (!stageRecord || keyOf(stageNode) !== stageKey) return stageNode;

            const plan = asRecord(stageRecord.stage_operating_plan_v1);
            if (!plan) return stageNode;
            const templates = asArray(plan.work_templates);
            if (templates.length === 0) return stageNode;

            touchedStage = true;
            const nextTemplates = templates.map((templateNode) => {
                const templateRecord = asRecord(templateNode);
                if (!templateRecord) return templateNode;
                const tKey = templateKeyOf(templateNode);
                const liveTemplate = tKey ? liveTemplates.find((t) => templateKeyOf(t) === tKey) : undefined;

                /*
                 * The live template decides, INCLUDING when it configures none. An explicitly empty
                 * command set is a decision the operator made and must survive; reviving the pinned
                 * list here would re-add a command they removed.
                 *
                 * A template the live stage no longer configures at all resolves to no commands
                 * rather than borrowing another template's — the work still completes under its
                 * pinned semantics, but nothing offers commands nobody placed there.
                 */
                const nextHelpful = liveTemplate ? asArray(asRecord(liveTemplate)?.helpful_actions) : [];
                refsByTemplateKey[tKey || "(unkeyed)"] = commandRefs({ helpful_actions: nextHelpful });
                return { ...templateRecord, helpful_actions: nextHelpful };
            });

            return { ...stageRecord, stage_operating_plan_v1: { ...plan, work_templates: nextTemplates } };
        });

        return { ...processRecord, stages: nextStages };
    });

    if (!touchedStage) {
        // The pinned revision does not configure this stage's work at all; there is nothing to
        // overlay onto, and the live side has no pinned counterpart to correct.
        return { payload: pinned, placement: { source: "pinned_fallback", refsByTemplateKey: {} } };
    }

    return {
        payload: { ...pinned, processes: nextProcesses },
        placement: { source: "live_published", refsByTemplateKey },
    };
}

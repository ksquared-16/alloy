/**
 * Execution-graph findings, scoped to the stage an operator is editing.
 *
 * WHY THIS EXISTS
 *
 * The drafting-half issue counter (decision D3) reported operating-contract and work-definition
 * findings only. Those are the findings the stage editor owns directly — so a stage whose
 * *execution graph* was broken saved cleanly, said nothing, and then got refused at publish. The
 * operator learned about it at the gate instead of at the edit.
 *
 * Graph findings now feed the same counter. What must NOT happen is the opposite failure: showing
 * every process-wide defect on every stage card, so each stage reports its neighbours' problems
 * and the count becomes noise nobody reads.
 *
 * SCOPE RULE
 *
 * A finding belongs to a stage when the stage is the thing that can repair it:
 *
 *   - the finding names the stage (`stage_key`)
 *   - or it names a transition DECLARED ON that stage, since outgoing transitions are the stage's
 *     own configuration
 *   - or it names an outcome/movement on that stage
 *
 * A finding about a *different* stage's transition is deliberately excluded even when it mentions
 * this stage as a destination: the repair happens over there, and telling this operator about it
 * would be handing them someone else's work.
 */

import {
    buildExecutionGraph,
    validateExecutionGraph,
} from "@/lib/businessProcesses/configuration/executionGraphValidation";
import type { ConfigurationDiagnostic } from "@/lib/businessProcesses/configuration/configurationDiagnostics";
import type { StageOperatingContractIssue } from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";

/**
 * Stable identity for a graph finding.
 *
 * `code` + `path` — the path names the configuration object, so it survives copy changes. Message
 * text is never part of the key: a reworded finding is the same finding, and keying on text would
 * report every copy edit as a newly introduced defect.
 */
export function executionGraphFindingKey(finding: ConfigurationDiagnostic): string {
    const detailId =
        finding.detail && typeof finding.detail === "object"
            ? String(
                  (finding.detail as Record<string, unknown>).transition_ref ??
                      (finding.detail as Record<string, unknown>).rule_key ??
                      (finding.detail as Record<string, unknown>).outcome_key ??
                      "",
              )
            : "";
    return [finding.code, finding.path ?? "", finding.stage_key ?? "", detailId].join("|");
}

/** Does this finding belong to the stage being edited? */
export function findingBelongsToStage(
    finding: ConfigurationDiagnostic,
    stageKey: string,
    transitionRefsDeclaredOnStage: ReadonlySet<string>,
): boolean {
    const stage = stageKey.trim();
    if (!stage) return false;
    if ((finding.stage_key ?? "").trim() === stage) return true;

    // A transition declared on this stage is this stage's configuration, wherever the validator
    // chose to attribute the finding.
    const ref =
        finding.detail && typeof finding.detail === "object"
            ? String((finding.detail as Record<string, unknown>).transition_ref ?? "")
            : "";
    if (ref && transitionRefsDeclaredOnStage.has(ref)) return true;

    // Path-based fallback: `processes[…].stages[lead].…` names the owning stage directly.
    return (finding.path ?? "").includes(`.stages[${stage}]`);
}

/**
 * Graph findings for one stage, expressed as operating-contract issues so the existing delta
 * classifier can treat them identically to every other finding.
 *
 * `severity` is preserved: a graph warning stays a warning, a graph error stays an error. What
 * makes an error blocking is whether THIS edit introduced it, which the classifier decides — not
 * this function.
 */
export function stageExecutionGraphFindings(
    processRaw: unknown,
    stageKey: string,
): StageOperatingContractIssue[] {
    const graph = buildExecutionGraph(processRaw);
    const { errors, warnings } = validateExecutionGraph(graph);

    const declaredHere = new Set(
        graph.transitions
            .filter((t) => t.declared_on_stage_key === stageKey)
            .map((t) => t.transition_ref)
            .filter(Boolean),
    );

    const asIssue = (
        finding: ConfigurationDiagnostic,
        severity: "error" | "warning",
    ): StageOperatingContractIssue => ({
        // Reuse an existing code so the union stays closed; the real identity is the controlId,
        // which carries the graph finding's own stable key.
        code: "outcome_transition_invalid",
        severity,
        message: finding.message,
        controlId: `execution-graph::${executionGraphFindingKey(finding)}`,
    });

    return [
        ...errors.filter((f) => findingBelongsToStage(f, stageKey, declaredHere)).map((f) => asIssue(f, "error")),
        ...warnings.filter((f) => findingBelongsToStage(f, stageKey, declaredHere)).map((f) => asIssue(f, "warning")),
    ];
}

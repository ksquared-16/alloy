/**
 * Explanation formatting helpers for Organization Calculation results.
 */

import type { ExplanationStep } from "@/lib/organizationCalculations/evaluate";

export function formatExplanationSummary(steps: ExplanationStep[]): string {
    if (steps.length === 0) return "No evaluation steps.";
    const last = steps[steps.length - 1]!;
    const out = last.output == null ? "unknown" : String(last.output);
    return `${last.label}: ${out}`;
}

export function formatExplanationLines(steps: ExplanationStep[]): string[] {
    return steps.map((step) => {
        const inputs =
            step.inputs.length === 0 ?
                ""
            :   ` (${step.inputs.map((i) => `${i.label}=${i.value ?? "∅"}`).join(", ")})`;
        const notes = step.notes?.length ? ` — ${step.notes.join("; ")}` : "";
        return `${step.label}${inputs} → ${step.output ?? "∅"}${notes}`;
    });
}

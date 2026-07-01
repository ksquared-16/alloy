import type { ActionWorkspaceStep } from "@/lib/admin/actions/actionWorkspaceTypes";

export type CreateLeadProgressStep = "paste" | "review_draft" | "create_lead" | "creating" | "complete";

export const CREATE_LEAD_PROGRESS_STEPS: ReadonlyArray<{
    key: CreateLeadProgressStep;
    label: string;
}> = [
    { key: "paste", label: "Paste information" },
    { key: "review_draft", label: "Review draft" },
    { key: "create_lead", label: "Create lead" },
] as const;

export function resolveCreateLeadProgressStep(input: {
    step: ActionWorkspaceStep;
    materialAnalyzed: boolean;
    validationOk: boolean;
}): CreateLeadProgressStep {
    if (input.step === "success") return "complete";
    if (input.step === "execute") return "creating";
    if (input.step === "gather" && input.validationOk && input.materialAnalyzed) return "create_lead";
    if (input.step === "gather" && input.materialAnalyzed) return "review_draft";
    return "paste";
}

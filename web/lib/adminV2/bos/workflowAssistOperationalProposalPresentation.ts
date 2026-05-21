/**
 * Workflow Assist → Operational Proposal frame copy (BOS UX coherence Card 9).
 */

export const WORKFLOW_ASSIST_PROPOSAL_TYPE_LABEL = "Workflow proposal";
export const WORKFLOW_ASSIST_PROPOSAL_SOURCE_LABEL = "Workflow Assist";

export const WORKFLOW_ASSIST_DISABLED_DRAFT_BOUNDARY_COPY =
    "This creates a disabled draft. No messages will send until the workflow is reviewed and enabled.";

export function workflowAssistProposalTitleFromSuggestion(args: {
    proposalKind: string;
    draftName?: string | null;
    targetWorkflowId?: string | null;
    createHeadline?: string | null;
}): string {
    if (args.createHeadline?.trim()) return args.createHeadline.trim();
    if (args.proposalKind === "create_workflow") {
        return `Create disabled workflow: ${args.draftName?.trim() || "—"}`;
    }
    if (args.proposalKind === "pause_workflow") {
        return `Disable workflow ${args.targetWorkflowId ?? ""}`.trim();
    }
    return `Edit workflow ${args.targetWorkflowId ?? ""}`.trim();
}

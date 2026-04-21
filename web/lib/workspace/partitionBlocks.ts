import type {
    WorkspaceBlock,
    WorkspaceActionsBlock,
    WorkspaceAttentionBlock,
    WorkspaceContextBlock,
    WorkspaceGrowthWorkspaceActionsBlock,
    WorkspaceKpiBlock,
    WorkspaceQueueBlock,
    WorkspaceSignalsBlock,
} from "./types";

/** Split layout blocks by type for zone-based rendering (order preserved within each bucket). */
export function partitionDepartmentBlocks(blocks: WorkspaceBlock[]) {
    const signals: WorkspaceSignalsBlock[] = [];
    const queues: WorkspaceQueueBlock[] = [];
    const attentions: WorkspaceAttentionBlock[] = [];
    const kpis: WorkspaceKpiBlock[] = [];
    const actions: WorkspaceActionsBlock[] = [];
    const growthWorkspaceActions: WorkspaceGrowthWorkspaceActionsBlock[] = [];
    const contexts: WorkspaceContextBlock[] = [];

    for (const b of blocks) {
        switch (b.type) {
            case "signals":
                signals.push(b);
                break;
            case "queue":
                queues.push(b);
                break;
            case "attention":
                attentions.push(b);
                break;
            case "kpi":
                kpis.push(b);
                break;
            case "actions":
                actions.push(b);
                break;
            case "growth_workspace_actions":
                growthWorkspaceActions.push(b);
                break;
            case "context":
                contexts.push(b);
                break;
            default:
                break;
        }
    }

    return { signals, queues, attentions, kpis, actions, growthWorkspaceActions, contexts };
}

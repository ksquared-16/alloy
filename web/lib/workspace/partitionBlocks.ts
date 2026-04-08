import type {
    WorkspaceBlock,
    WorkspaceActionsBlock,
    WorkspaceContextBlock,
    WorkspaceKpiBlock,
    WorkspaceQueueBlock,
    WorkspaceSignalsBlock,
} from "./types";

/** Split layout blocks by type for zone-based rendering (order preserved within each bucket). */
export function partitionDepartmentBlocks(blocks: WorkspaceBlock[]) {
    const signals: WorkspaceSignalsBlock[] = [];
    const queues: WorkspaceQueueBlock[] = [];
    const kpis: WorkspaceKpiBlock[] = [];
    const actions: WorkspaceActionsBlock[] = [];
    const contexts: WorkspaceContextBlock[] = [];

    for (const b of blocks) {
        switch (b.type) {
            case "signals":
                signals.push(b);
                break;
            case "queue":
                queues.push(b);
                break;
            case "kpi":
                kpis.push(b);
                break;
            case "actions":
                actions.push(b);
                break;
            case "context":
                contexts.push(b);
                break;
            default:
                break;
        }
    }

    return { signals, queues, kpis, actions, contexts };
}

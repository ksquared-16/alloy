import {
    fetchCommunicationScheduledSends,
    fetchOperationalTasks,
    fetchTaskAssistProposals,
    readJson,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import type {
    OperationalTaskSnapshot,
    ProposalSnapshot,
    ScheduledSendSnapshot,
} from "@/lib/agent/taskAssist/taskAssistOperationalAnomalies";

export type EntityOperationalFetchResult = {
    openTasks: OperationalTaskSnapshot[];
    pendingScheduledSends: ScheduledSendSnapshot[];
    openProposals: ProposalSnapshot[];
};

export async function fetchEntityOperationalAnomalyContext(entityId: string): Promise<EntityOperationalFetchResult> {
    const [taskRes, sendRes, propRes] = await Promise.all([
        fetchOperationalTasks(entityId),
        fetchCommunicationScheduledSends(entityId),
        fetchTaskAssistProposals(entityId),
    ]);

    const taskJson = await readJson<{ ok?: boolean; tasks?: OperationalTaskSnapshot[] }>(taskRes);
    const sendJson = await readJson<{ ok?: boolean; scheduled_sends?: ScheduledSendSnapshot[] }>(sendRes);
    const propJson = await readJson<{
        ok?: boolean;
        proposals?: Array<{
            id: string;
            status: string;
            payload?: { draft_body?: string; instruction?: string };
        }>;
    }>(propRes);

    const openTasks = (taskJson.tasks ?? []).filter((t) => t.status === "open");
    const pendingScheduledSends = (sendJson.scheduled_sends ?? []).filter((s) => s.status === "pending");
    const openProposals: ProposalSnapshot[] = (propJson.proposals ?? [])
        .filter((p) => p.status === "open" || p.status === "pending")
        .map((p) => ({
            id: p.id,
            status: p.status,
            draft_body: p.payload?.draft_body ?? null,
            instruction: p.payload?.instruction ?? null,
        }));

    return { openTasks, pendingScheduledSends, openProposals };
}

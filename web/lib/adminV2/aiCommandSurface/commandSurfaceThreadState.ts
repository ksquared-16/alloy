import type {
    CommandSurfaceThreadState,
    CommandSurfaceThreadTurn,
    CommandSurfaceThreadTurnInput,
} from "./commandSurfaceThreadTypes";

export function newThreadTurnId(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyThreadState(): CommandSurfaceThreadState {
    return { turns: [] };
}

export function appendThreadTurn(
    state: CommandSurfaceThreadState,
    turn: CommandSurfaceThreadTurnInput & { id?: string; at?: string }
): CommandSurfaceThreadState {
    const full: CommandSurfaceThreadTurn = {
        ...turn,
        id: turn.id ?? newThreadTurnId(),
        at: turn.at ?? new Date().toISOString(),
    } as CommandSurfaceThreadTurn;
    return { turns: [...state.turns, full] };
}

export function updateThreadTurn(
    state: CommandSurfaceThreadState,
    turnId: string,
    patch: Partial<CommandSurfaceThreadTurn>
): CommandSurfaceThreadState {
    return {
        turns: state.turns.map((t) => (t.id === turnId ? ({ ...t, ...patch } as CommandSurfaceThreadTurn) : t)),
    };
}

export function toggleActionCardExpanded(
    state: CommandSurfaceThreadState,
    turnId: string
): CommandSurfaceThreadState {
    return {
        turns: state.turns.map((t) => {
            if (t.id !== turnId || t.kind !== "action_card") return t;
            if (t.card.type === "task_assist") {
                return { ...t, card: { ...t.card, expanded: !t.card.expanded } };
            }
            if (t.card.type === "job_layout") {
                return { ...t, card: { ...t.card, expanded: !t.card.expanded } };
            }
            return t;
        }),
    };
}

type TaskAssistActionCard = Extract<
    Extract<CommandSurfaceThreadTurn, { kind: "action_card" }>["card"],
    { type: "task_assist" }
>;

export function patchTaskAssistActionCard(
    state: CommandSurfaceThreadState,
    turnId: string,
    patch: Partial<TaskAssistActionCard>
): CommandSurfaceThreadState {
    return {
        turns: state.turns.map((t) => {
            if (t.id !== turnId || t.kind !== "action_card" || t.card.type !== "task_assist") return t;
            return { ...t, card: { ...t.card, ...patch } };
        }),
    };
}

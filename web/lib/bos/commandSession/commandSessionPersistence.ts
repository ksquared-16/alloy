import type { BosCommandSession, BosCommandSessionPhase } from "@/lib/bos/commandSession/types";

/** sessionStorage key for the active unfinished BOS command session (tab-scoped). */
export const BOS_COMMAND_SESSION_STORAGE_KEY = "alloy-bos-command-session-v1";

/** Max characters retained per source text blob (plan: ~32KB). */
export const BOS_COMMAND_SOURCE_TEXT_MAX_CHARS = 32_768;

/** Soft cap on serialized session JSON; oversized payloads are not persisted. */
export const BOS_COMMAND_SESSION_MAX_JSON_CHARS = 512_000;

const TERMINAL_CLEAR_PHASES: ReadonlySet<BosCommandSessionPhase> = new Set([
    "completed",
    "discarded",
]);

function canUseSessionStorage(): boolean {
    return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

/**
 * Truncate draft source texts before persistence. Does not mutate the live session
 * unless the caller applies the returned copy.
 */
export function sanitizeBosCommandSessionForPersistence(
    session: BosCommandSession
): BosCommandSession {
    const sourceTexts = session.draft.sourceTexts.map((entry) => {
        if (entry.text.length <= BOS_COMMAND_SOURCE_TEXT_MAX_CHARS) return entry;
        return {
            ...entry,
            text: entry.text.slice(0, BOS_COMMAND_SOURCE_TEXT_MAX_CHARS),
        };
    });
    return {
        ...session,
        draft: {
            ...session.draft,
            sourceTexts,
        },
    };
}

export function isBosCommandSessionPersistable(session: BosCommandSession): boolean {
    return !TERMINAL_CLEAR_PHASES.has(session.phase);
}

function isBosCommandSessionShape(value: unknown): value is BosCommandSession {
    if (!value || typeof value !== "object") return false;
    const s = value as Record<string, unknown>;
    return (
        typeof s.sessionId === "string" &&
        typeof s.phase === "string" &&
        typeof s.mode === "string" &&
        s.invocation != null &&
        typeof s.invocation === "object" &&
        s.draft != null &&
        typeof s.draft === "object" &&
        Array.isArray(s.messages) &&
        typeof s.requestSeq === "number"
    );
}

export function loadPersistedBosCommandSession(): BosCommandSession | null {
    if (!canUseSessionStorage()) return null;
    try {
        const raw = sessionStorage.getItem(BOS_COMMAND_SESSION_STORAGE_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!isBosCommandSessionShape(parsed)) return null;
        if (!isBosCommandSessionPersistable(parsed)) {
            clearPersistedBosCommandSession();
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Persist an unfinished session. Clears storage for terminal phases.
 * Returns false when skipped (SSR, terminal, or quota/size).
 */
export function persistBosCommandSession(session: BosCommandSession): boolean {
    if (!canUseSessionStorage()) return false;
    if (!isBosCommandSessionPersistable(session)) {
        clearPersistedBosCommandSession();
        return false;
    }
    try {
        const sanitized = sanitizeBosCommandSessionForPersistence(session);
        const json = JSON.stringify(sanitized);
        if (json.length > BOS_COMMAND_SESSION_MAX_JSON_CHARS) {
            return false;
        }
        sessionStorage.setItem(BOS_COMMAND_SESSION_STORAGE_KEY, json);
        return true;
    } catch {
        return false;
    }
}

export function clearPersistedBosCommandSession(): void {
    if (!canUseSessionStorage()) return;
    try {
        sessionStorage.removeItem(BOS_COMMAND_SESSION_STORAGE_KEY);
    } catch {
        /* ignore */
    }
}

/**
 * Persist or clear based on phase — call after every successful reduce.
 */
export function syncPersistedBosCommandSession(session: BosCommandSession): void {
    if (!isBosCommandSessionPersistable(session)) {
        clearPersistedBosCommandSession();
        return;
    }
    persistBosCommandSession(session);
}

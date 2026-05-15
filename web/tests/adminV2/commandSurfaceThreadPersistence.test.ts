import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyThreadState, appendThreadTurn } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadState";
import {
    clearPersistedCommandSurfaceSession,
    loadPersistedCommandSurfaceSession,
    persistCommandSurfaceSession,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadPersistence";

function installSessionStorageMock(): void {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
    });
    vi.stubGlobal("window", { sessionStorage: globalThis.sessionStorage });
}

describe("commandSurfaceThreadPersistence", () => {
    beforeEach(() => {
        installSessionStorageMock();
        clearPersistedCommandSurfaceSession();
    });

    it("persists and reloads thread within sessionStorage", () => {
        const thread = appendThreadTurn(createEmptyThreadState(), {
            kind: "user_message",
            text: "Text the Mitchell family",
        });

        persistCommandSurfaceSession({ thread, threadExpanded: false });
        const loaded = loadPersistedCommandSurfaceSession();

        expect(loaded.thread.turns).toHaveLength(1);
        expect(loaded.thread.turns[0]?.kind).toBe("user_message");
        expect(loaded.threadExpanded).toBe(false);
    });

    it("clear removes persisted session", () => {
        persistCommandSurfaceSession({
            thread: appendThreadTurn(createEmptyThreadState(), { kind: "user_message", text: "hello" }),
            threadExpanded: true,
        });
        clearPersistedCommandSurfaceSession();
        const loaded = loadPersistedCommandSurfaceSession();
        expect(loaded.thread.turns).toHaveLength(0);
    });
});

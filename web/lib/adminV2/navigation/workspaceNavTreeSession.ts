import type { WorkspaceNavTreeSnapshot } from "@/lib/adminV2/navigation/workspaceNavTreeCache";

const STORAGE_KEY = "alloy:v1:admV2:shell:navTree";
const MAX_AGE_MS = 30 * 60 * 1000;

type StoredNavTreePayload = {
    v: 1;
    loadedAtMs: number;
    depts: WorkspaceNavTreeSnapshot["depts"];
    wus: WorkspaceNavTreeSnapshot["wus"];
    error: string | null;
};

export function readWorkspaceNavTreeSession(): WorkspaceNavTreeSnapshot | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredNavTreePayload;
        if (parsed?.v !== 1 || !Array.isArray(parsed.depts)) return null;
        if (Date.now() - parsed.loadedAtMs > MAX_AGE_MS) return null;
        return {
            depts: parsed.depts,
            wus: Array.isArray(parsed.wus) ? parsed.wus : [],
            error: parsed.error ?? null,
            loadedAtMs: parsed.loadedAtMs,
        };
    } catch {
        return null;
    }
}

export function writeWorkspaceNavTreeSession(snapshot: WorkspaceNavTreeSnapshot): void {
    if (typeof window === "undefined" || !snapshot.depts.length) return;
    try {
        const payload: StoredNavTreePayload = {
            v: 1,
            loadedAtMs: snapshot.loadedAtMs,
            depts: snapshot.depts,
            wus: snapshot.wus,
            error: snapshot.error,
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
        /* ignore quota */
    }
}

export function clearWorkspaceNavTreeSession(): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}

/**
 * Client loader for the caller's own hide-only workspace visibility override (Access V3, S5).
 *
 * Framework-free so it can be tested without a DOM; `useWorkspaceVisibilityOverride` is the React
 * binding. One cache entry per principal (user + organization).
 *
 * ── STALE ANSWERS ARE NEVER APPLIED ──
 *
 * - Every request names the principal it was made for (`user_id` / `org_id`), and the server refuses a
 *   request whose session is someone else's. A response is accepted only if it names that same
 *   principal ({@link parseOverrideResponse}).
 * - Every load, save, reset and invalidation advances that principal's generation; a response that
 *   returns after a later operation started is discarded, so an old GET cannot overwrite a newer save.
 * - Entries are read by principal: a sidebar for one user never sees another user's entry.
 *
 * ── NOTHING PRETENDS TO BE SAVED ──
 *
 * There is no optimistic update. The applied override changes only when the server says `saved: true`;
 * otherwise the outcome says why it was not saved and the previous answer stays in force. While the
 * store is absent (held migration), the entry is `unavailable` and the role defaults apply.
 */

import type { HideOnlyVisibilityOverride, VisibilityPrincipal, WorkspaceSurfaceKey } from "@/lib/access/workspaceVisibility";
import {
    WORKSPACE_VISIBILITY_OVERRIDE_PATH,
    parseOverrideResponse,
    principalKey,
    sameVisibilityPrincipal,
} from "@/lib/access/workspaceVisibilityOverrides";

export type OverrideEntryStatus = "loading" | "loaded" | "unavailable" | "error";

export type OverrideSaveOutcome =
    | { saved: true }
    | { saved: false; reason: "store_unavailable" | "refused" | "failed" | "superseded" };

export type OverrideEntry = {
    principal: VisibilityPrincipal;
    status: OverrideEntryStatus;
    /** The override in force: only ever one the server returned for this principal. */
    override: HideOnlyVisibilityOverride | null;
    saving: boolean;
    lastSave: OverrideSaveOutcome | null;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">>;

function principalQuery(p: VisibilityPrincipal): string {
    return `?user_id=${encodeURIComponent(p.userId)}&org_id=${encodeURIComponent(p.orgId)}`;
}

export class WorkspaceVisibilityOverrideLoader {
    private entries = new Map<string, OverrideEntry>();
    private generations = new Map<string, number>();
    private listeners = new Set<() => void>();

    constructor(private readonly fetchImpl: FetchLike) {}

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /** This principal's entry, or `null`. Never another principal's. */
    get(principal: VisibilityPrincipal | null | undefined): OverrideEntry | null {
        if (!principal) return null;
        const entry = this.entries.get(principalKey(principal)) ?? null;
        return entry && sameVisibilityPrincipal(entry.principal, principal) ? entry : null;
    }

    /** Load once per principal: a cached or in-flight entry is reused; a failed one is retried. */
    ensure(principal: VisibilityPrincipal): void {
        const entry = this.get(principal);
        if (!entry || entry.status === "error") void this.load(principal);
    }

    async load(principal: VisibilityPrincipal): Promise<void> {
        const key = principalKey(principal);
        const gen = this.advance(key);
        const prior = this.get(principal);
        this.put(key, { principal, status: "loading", override: prior?.override ?? null, saving: false, lastSave: prior?.lastSave ?? null });
        let next: Pick<OverrideEntry, "status" | "override">;
        try {
            const res = await this.fetchImpl(`${WORKSPACE_VISIBILITY_OVERRIDE_PATH}${principalQuery(principal)}`, {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
            });
            const parsed = res.ok ? parseOverrideResponse(await res.json(), principal) : null;
            next =
                parsed == null || parsed.unavailableReason === "read_failed" ? { status: "error", override: null }
                : parsed.store === "unavailable" ? { status: "unavailable", override: null }
                : { status: "loaded", override: parsed.override };
        } catch {
            next = { status: "error", override: null };
        }
        if (!this.current(key, gen)) return;
        this.put(key, { principal, ...next, saving: false, lastSave: prior?.lastSave ?? null });
    }

    /** Replace the hidden keys. An empty list is a reset. */
    save(principal: VisibilityPrincipal, hiddenSurfaceKeys: readonly WorkspaceSurfaceKey[]): Promise<OverrideSaveOutcome> {
        return this.write(principal, "PUT", {
            user_id: principal.userId,
            org_id: principal.orgId,
            hidden_surface_keys: [...hiddenSurfaceKeys],
        });
    }

    reset(principal: VisibilityPrincipal): Promise<OverrideSaveOutcome> {
        return this.write(principal, "DELETE", null);
    }

    /** Drop one principal's entry, or every entry (sign-out). In-flight answers for them are discarded. */
    invalidate(principal?: VisibilityPrincipal | null): void {
        const keys = principal ? [principalKey(principal)] : [...this.entries.keys()];
        for (const key of keys) {
            this.advance(key);
            this.entries.delete(key);
        }
        this.emit();
    }

    /** Keep only `principal`'s entry (a user or organization switch drops the previous one). */
    retainOnly(principal: VisibilityPrincipal): void {
        const keep = principalKey(principal);
        let changed = false;
        for (const key of [...this.entries.keys()]) {
            if (key === keep) continue;
            this.advance(key);
            this.entries.delete(key);
            changed = true;
        }
        if (changed) this.emit();
    }

    private async write(principal: VisibilityPrincipal, method: "PUT" | "DELETE", body: unknown): Promise<OverrideSaveOutcome> {
        const key = principalKey(principal);
        const gen = this.advance(key);
        const prior = this.get(principal);
        const base: OverrideEntry = prior ?? { principal, status: "loading", override: null, saving: false, lastSave: null };
        this.put(key, { ...base, saving: true });

        let outcome: OverrideSaveOutcome;
        // A failed write keeps the last known answer; with none known it settles to `error` (retryable),
        // never `loading`, which nothing would resolve.
        let next: Pick<OverrideEntry, "status" | "override"> = {
            status: base.status === "loading" ? "error" : base.status,
            override: base.override,
        };
        try {
            const res = await this.fetchImpl(`${WORKSPACE_VISIBILITY_OVERRIDE_PATH}${principalQuery(principal)}`, {
                method,
                credentials: "same-origin",
                cache: "no-store",
                ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
            });
            const json: unknown = await res.json().catch(() => null);
            const parsed = parseOverrideResponse(json, principal);
            const saved = res.ok && parsed?.store === "available" && (json as { saved?: unknown }).saved === true;
            if (saved) {
                outcome = { saved: true };
                next = { status: "loaded", override: parsed!.override };
            } else if (res.status === 503 || parsed?.unavailableReason === "not_provisioned") {
                outcome = { saved: false, reason: "store_unavailable" };
                next = { status: "unavailable", override: null };
            } else if (res.status === 400 || res.status === 401 || res.status === 403) {
                outcome = { saved: false, reason: "refused" };
            } else {
                outcome = { saved: false, reason: "failed" };
            }
        } catch {
            outcome = { saved: false, reason: "failed" };
        }
        if (!this.current(key, gen)) return { saved: false, reason: "superseded" };
        this.put(key, { principal, ...next, saving: false, lastSave: outcome });
        return outcome;
    }

    private advance(key: string): number {
        const gen = (this.generations.get(key) ?? 0) + 1;
        this.generations.set(key, gen);
        return gen;
    }

    private current(key: string, gen: number): boolean {
        return this.generations.get(key) === gen;
    }

    private put(key: string, entry: OverrideEntry): void {
        this.entries.set(key, entry);
        this.emit();
    }

    private emit(): void {
        for (const l of this.listeners) l();
    }
}

/**
 * The override to apply: a server answer for this same principal that is loaded (or being reloaded —
 * the entry only ever holds this principal's last server answer). Otherwise role defaults (`null`).
 */
export function appliedOverride(entry: OverrideEntry | null, principal: VisibilityPrincipal | null | undefined): HideOnlyVisibilityOverride | null {
    if (!entry || (entry.status !== "loaded" && entry.status !== "loading")) return null;
    if (!sameVisibilityPrincipal(entry.principal, principal)) return null;
    return entry.override;
}

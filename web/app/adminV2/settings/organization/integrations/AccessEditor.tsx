"use client";

/**
 * Editing what an existing Installation may do, and where.
 *
 * Both editors are pure data entry. The boundary is applied in SQL by
 * `list_external_locations`, the capability vocabulary comes from the canonical
 * catalog, and the saved result is read back from the server rather than assumed
 * — so what the operator sees after saving is what Alloy will actually enforce,
 * not what this form hoped for.
 */

import { useCallback, useEffect, useState } from "react";

type Capability = { scope: string; title: string; detail: string; access: "read" | "write"; recognised: boolean };
type Location = { id: string; name: string | null; type: string; siteId: string | null; parentId: string | null };

export function LocationAccessEditor({
    installationId,
    boundaryMode,
    onSaved,
    onCancel,
}: {
    installationId: string;
    boundaryMode: "org_wide" | "locations";
    onSaved: () => Promise<void> | void;
    onCancel: () => void;
}) {
    const [locations, setLocations] = useState<Location[]>([]);
    const [mode, setMode] = useState(boundaryMode);
    const [selected, setSelected] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        void (async () => {
            const res = await fetch("/api/admin/integrations/locations", { cache: "no-store" });
            if (res.ok) setLocations(((await res.json()) as { locations: Location[] }).locations);
        })();
    }, []);

    const save = useCallback(async () => {
        setBusy(true); setError(null);
        try {
            const res = await fetch(`/api/admin/integrations/installations/${installationId}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ boundaryMode: mode, locationIds: mode === "locations" ? selected : [] }),
            });
            if (!res.ok) {
                const b = (await res.json().catch(() => ({}))) as { error?: string };
                setError(b.error ?? "That change was not saved.");
                return;
            }
            await onSaved();
        } finally { setBusy(false); }
    }, [installationId, mode, selected, onSaved]);

    const sites = locations.filter((l) => l.type === "site");

    return (
        <div className="mt-3 rounded border p-3" data-testid="location-access-editor">
            <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2" data-testid="editor-boundary-org-wide">
                    <input type="radio" checked={mode === "org_wide"} onChange={() => setMode("org_wide")} />
                    <span>All locations</span>
                </label>
                <label className="flex items-center gap-2" data-testid="editor-boundary-selected">
                    <input type="radio" checked={mode === "locations"} onChange={() => setMode("locations")} />
                    <span>Selected locations</span>
                </label>
            </div>

            {mode === "locations" && (
                <ul className="mt-2 flex flex-col gap-1" data-testid="editor-site-list">
                    {sites.map((s) => (
                        <li key={s.id}>
                            <label className="flex items-center gap-2" data-testid={`editor-site-${s.id}`}>
                                <input
                                    type="checkbox"
                                    checked={selected.includes(s.id)}
                                    onChange={(e) => setSelected((p) => e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id))}
                                />
                                <span>{s.name ?? s.id}</span>
                                <span className="text-xs opacity-60">
                                    {locations.filter((l) => l.siteId === s.id && l.type === "unit").length} rooms
                                </span>
                            </label>
                        </li>
                    ))}
                </ul>
            )}

            {mode === "locations" && selected.length === 0 && (
                <p className="mt-2 text-xs opacity-75" data-testid="editor-restricted-empty-warning">
                    With no sites selected this integration can reach nothing. That is not the same as all locations.
                </p>
            )}

            {error && <p className="mt-2 text-sm" data-testid="editor-error">{error}</p>}

            <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" data-testid="editor-save" onClick={() => void save()}>
                    {busy ? "Saving…" : "Save access"}
                </button>
                <button type="button" className="rounded border px-2 py-1 text-xs" data-testid="editor-cancel" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

export function CapabilityEditor({
    installationId,
    grantedScopes,
    onSaved,
    onCancel,
}: {
    installationId: string;
    grantedScopes: string[];
    onSaved: () => Promise<void> | void;
    onCancel: () => void;
}) {
    const [catalog, setCatalog] = useState<Capability[]>([]);
    const [scopes, setScopes] = useState<string[]>(grantedScopes);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        void (async () => {
            const res = await fetch("/api/admin/integrations/capabilities", { cache: "no-store" });
            if (res.ok) setCatalog(((await res.json()) as { capabilities: Capability[] }).capabilities);
        })();
    }, []);

    /*
     * A scope this Alloy does not define but the installation already holds stays
     * VISIBLE and stays selected. Dropping it from the list would silently revoke
     * it on the next save — a change nobody asked for, made by omission.
     */
    const unknownHeld = scopes.filter((s) => !catalog.some((c) => c.scope === s));

    const save = useCallback(async () => {
        setBusy(true); setError(null);
        try {
            const res = await fetch(`/api/admin/integrations/installations/${installationId}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ grantedScopes: scopes }),
            });
            if (!res.ok) {
                const b = (await res.json().catch(() => ({}))) as { error?: string };
                setError(b.error ?? "That change was not saved.");
                return;
            }
            await onSaved();
        } finally { setBusy(false); }
    }, [installationId, scopes, onSaved]);

    const toggle = (scope: string, on: boolean) =>
        setScopes((p) => on ? [...new Set([...p, scope])] : p.filter((s) => s !== scope));

    return (
        <div className="mt-3 rounded border p-3" data-testid="capability-editor">
            <ul className="flex flex-col gap-2">
                {catalog.map((c) => (
                    <li key={c.scope}>
                        <label className="flex items-start gap-2" data-testid={`editor-capability-${c.scope}`}>
                            <input type="checkbox" checked={scopes.includes(c.scope)} onChange={(e) => toggle(c.scope, e.target.checked)} />
                            <span>
                                <span className="font-medium">{c.title}</span>
                                <span className="block text-xs opacity-75">{c.detail}</span>
                                <span className="block text-xs opacity-60">
                                    {c.access === "write" ? "Can make changes" : "Read only"} · {c.scope}
                                </span>
                            </span>
                        </label>
                    </li>
                ))}
                {unknownHeld.map((s) => (
                    <li key={s}>
                        <label className="flex items-start gap-2" data-testid={`editor-capability-${s}`}>
                            <input type="checkbox" checked onChange={(e) => toggle(s, e.target.checked)} />
                            <span>
                                <span className="font-medium">{s}</span>
                                <span className="block text-xs opacity-75">
                                    Not recognised by this version of Alloy. Treated as sensitive and kept until you remove it.
                                </span>
                            </span>
                        </label>
                    </li>
                ))}
            </ul>

            <p className="mt-2 text-xs opacity-70">
                A capability existing here does not mean Alloy publishes an endpoint for it yet.
            </p>

            {error && <p className="mt-2 text-sm" data-testid="capability-editor-error">{error}</p>}

            <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" data-testid="capability-save" onClick={() => void save()}>
                    {busy ? "Saving…" : "Save capabilities"}
                </button>
                <button type="button" className="rounded border px-2 py-1 text-xs" data-testid="capability-cancel" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

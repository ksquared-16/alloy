"use client";

/**
 * Editing what an existing Installation may do, and where.
 *
 * Both editors are pure data entry. The boundary is applied in SQL by `list_external_locations`, the
 * capability vocabulary comes from the canonical catalog, and the saved result is read back from the
 * server rather than assumed — so what the operator sees after saving is what Alloy will actually
 * enforce, not what this form hoped for.
 *
 * ── WHAT AN OPERATOR IS ACTUALLY DECIDING ──
 *
 * A capability is a sentence about what the software may do; a scope key is the identifier a
 * developer writes in code. Both are true, and only one of them belongs in front of an
 * administrator, so the key is present and quiet. The same applies to the honest and easily
 * misread fact that Alloy defines capabilities it does not yet publish an endpoint for: it is
 * stated once, calmly, where it changes a decision — not as a warning stapled to the form.
 */

import { Building2, Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge, type Capability } from "./presentation";

type Location = { id: string; name: string | null; type: string; siteId: string | null; parentId: string | null };

export function LocationAccessEditor({
    installationId,
    boundaryMode,
    selectedLocationIds,
    onSaved,
    onCancel,
}: {
    installationId: string;
    boundaryMode: "org_wide" | "locations";
    /**
     * The boundary as it stands. Without it this editor opened with nothing ticked on an
     * installation that had two sites selected, and saving from that state narrowed access to
     * nothing — the most damaging kind of quiet defect, because the form looked like it was
     * working.
     */
    selectedLocationIds?: string[];
    onSaved: () => Promise<void> | void;
    onCancel: () => void;
}) {
    const [locations, setLocations] = useState<Location[]>([]);
    const [mode, setMode] = useState(boundaryMode);
    const [selected, setSelected] = useState<string[]>(selectedLocationIds ?? []);
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
        <div className="mt-2.5 rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.35] p-3" data-testid="location-access-editor">
            <h3 className="text-[9px] font-semibold uppercase tracking-[0.11em] text-alloy-midnight/38">
                Where this integration may operate
            </h3>

            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                <BoundaryChoice
                    testId="editor-boundary-org-wide"
                    checked={mode === "org_wide"}
                    onSelect={() => setMode("org_wide")}
                    title="All locations"
                    detail="Every site this organization has now, and any site added later."
                />
                <BoundaryChoice
                    testId="editor-boundary-selected"
                    checked={mode === "locations"}
                    onSelect={() => setMode("locations")}
                    title="Selected locations"
                    detail="Only the sites you tick below, including the rooms within them."
                />
            </div>

            {mode === "locations" && (
                <>
                    <ul className="mt-2 grid gap-1 sm:grid-cols-2" data-testid="editor-site-list">
                        {sites.length === 0 && (
                            <li className="text-[12px] text-alloy-midnight/55">This organization has no sites yet.</li>
                        )}
                        {sites.map((s) => {
                            const rooms = locations.filter((l) => l.siteId === s.id && l.type === "unit").length;
                            const on = selected.includes(s.id);
                            return (
                                <li key={s.id}>
                                    <label
                                        className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 transition ${
                                            on ?
                                                "border-alloy-bend-pine/40 bg-alloy-bend-pine/[0.06]"
                                            :   "border-alloy-forge/10 bg-white hover:border-alloy-forge/25"
                                        }`}
                                        data-testid={`editor-site-${s.id}`}
                                    >
                                        <input
                                            type="checkbox"
                                            className="mt-0.5"
                                            checked={on}
                                            onChange={(e) => setSelected((p) => e.target.checked ? [...new Set([...p, s.id])] : p.filter((x) => x !== s.id))}
                                        />
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-1.5">
                                                <Building2 className="h-3 w-3 shrink-0 text-alloy-midnight/35" aria-hidden />
                                                <span className="truncate text-[12.5px] font-medium text-alloy-midnight">{s.name ?? s.id}</span>
                                            </span>
                                            <span className="mt-0.5 block text-[11px] text-alloy-midnight/50">
                                                {rooms === 0 ? "No rooms" : `${rooms} room${rooms === 1 ? "" : "s"} included`}
                                            </span>
                                        </span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>

                    {selected.length === 0 ?
                        <p
                            className="mt-2 rounded-lg border border-alloy-ember/25 bg-alloy-ember/[0.05] px-2.5 py-1.5 text-[11.5px] leading-[1.55] text-alloy-midnight/80"
                            data-testid="editor-restricted-empty-warning"
                        >
                            With no sites selected this integration can reach nothing. That is a valid
                            choice, and it is <strong className="font-semibold">not</strong> the same as
                            granting all locations.
                        </p>
                    :   <p className="mt-2 text-[11.5px] text-alloy-midnight/60">
                            {selected.length} site{selected.length === 1 ? "" : "s"} selected. Rooms within a
                            selected site are included; family and vendor addresses are never shared.
                        </p>
                    }
                </>
            )}

            {error && (
                <p className="mt-2 text-[12px] font-medium text-alloy-ember" data-testid="editor-error">{error}</p>
            )}

            <div className="mt-2.5 flex gap-1.5">
                <button type="button" disabled={busy} className="config-primary-btn config-primary-btn--sm" data-testid="editor-save" onClick={() => void save()}>
                    {busy ? "Saving…" : "Save access"}
                </button>
                <button type="button" className="config-secondary-btn config-secondary-btn--sm" data-testid="editor-cancel" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

function BoundaryChoice({
    checked,
    onSelect,
    title,
    detail,
    testId,
}: {
    checked: boolean;
    onSelect: () => void;
    title: string;
    detail: string;
    testId: string;
}) {
    return (
        <label
            className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition ${
                checked ? "border-alloy-bend-pine/45 bg-alloy-bend-pine/[0.06]" : "border-alloy-forge/10 bg-white hover:border-alloy-forge/25"
            }`}
            data-testid={testId}
        >
            <input type="radio" className="mt-0.5" checked={checked} onChange={onSelect} />
            <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-alloy-midnight">{title}</span>
                <span className="mt-0.5 block text-[11px] leading-[1.5] text-alloy-midnight/58">{detail}</span>
            </span>
        </label>
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
        <div className="mt-2.5 rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.35] p-3" data-testid="capability-editor">
            <h3 className="text-[9px] font-semibold uppercase tracking-[0.11em] text-alloy-midnight/38">
                What this integration may do
            </h3>
            <p className="mt-1 text-[11.5px] leading-[1.55] text-alloy-midnight/60">
                Grant only what it needs. You can change this at any time, and the change applies to the
                next request.
            </p>

            <ul className="mt-2 grid gap-1.5">
                {catalog.map((c) => (
                    <li key={c.scope}>
                        <CapabilityChoice
                            testId={`editor-capability-${c.scope}`}
                            checked={scopes.includes(c.scope)}
                            onToggle={(on) => toggle(c.scope, on)}
                            title={c.title}
                            detail={c.detail}
                            access={c.access}
                            scope={c.scope}
                            recognised={c.recognised}
                        />
                    </li>
                ))}
                {unknownHeld.map((s) => (
                    <li key={s}>
                        <CapabilityChoice
                            testId={`editor-capability-${s}`}
                            checked
                            onToggle={(on) => toggle(s, on)}
                            title={s}
                            detail="Not recognised by this version of Alloy. Treated as sensitive and kept until you remove it."
                            access="write"
                            scope={s}
                            recognised={false}
                        />
                    </li>
                ))}
            </ul>

            {/*
              * The distinction that keeps a partner out of a week-long dead end, said once and
              * plainly rather than as an implementation warning bolted to the form.
              */}
            <p className="mt-2 text-[11.5px] leading-[1.55] text-alloy-midnight/55">
                Capabilities describe access Alloy defines. A granted capability does not by itself mean
                Alloy publishes an endpoint for it yet — the developer documentation lists exactly which
                operations are callable today.
            </p>

            {error && (
                <p className="mt-2 text-[12px] font-medium text-alloy-ember" data-testid="capability-editor-error">{error}</p>
            )}

            <div className="mt-2.5 flex gap-1.5">
                <button type="button" disabled={busy} className="config-primary-btn config-primary-btn--sm" data-testid="capability-save" onClick={() => void save()}>
                    {busy ? "Saving…" : "Save capabilities"}
                </button>
                <button type="button" className="config-secondary-btn config-secondary-btn--sm" data-testid="capability-cancel" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

/** One capability, with the operator's language first and the developer's identifier second. */
export function CapabilityChoice({
    checked,
    onToggle,
    title,
    detail,
    access,
    scope,
    recognised,
    testId,
}: {
    checked: boolean;
    onToggle: (on: boolean) => void;
    title: string;
    detail: string;
    access: "read" | "write";
    scope: string;
    recognised: boolean;
    testId: string;
}) {
    return (
        <label
            className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition ${
                checked ? "border-alloy-bend-pine/45 bg-alloy-bend-pine/[0.06]" : "border-alloy-forge/10 bg-white hover:border-alloy-forge/25"
            }`}
            data-testid={testId}
        >
            <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12.5px] font-semibold text-alloy-midnight">{title}</span>
                    {/* Reads and writes must never look alike. */}
                    <Badge tone={access === "write" ? "neutral" : "muted"}>
                        {access === "write" ? "Can make changes" : "Read only"}
                    </Badge>
                    {!recognised && <Badge tone="attention">Not recognised</Badge>}
                    {checked && <Check className="h-3 w-3 text-[#007d68]" aria-hidden />}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.55] text-alloy-midnight/62">{detail}</span>
                <span className="mt-0.5 block font-mono text-[10.5px] text-alloy-midnight/38">{scope}</span>
            </span>
        </label>
    );
}

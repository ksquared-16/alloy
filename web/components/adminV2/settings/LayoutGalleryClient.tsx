"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import {
    rollbackCandidateVersions,
    summarizeSurfaceLayoutRecords,
    type SurfaceRegistryApiEntry,
    type SurfaceRegistryApiResponse,
} from "@/lib/layout/layoutGalleryModel";

type ListResponse = { records: EntityLayoutRecord[] };

function statusBadge(status: "published" | "draft" | "coming_soon" | "enabled") {
    if (status === "published") {
        return (
            <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800">
                Published
            </span>
        );
    }
    if (status === "draft") {
        return (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                Draft
            </span>
        );
    }
    if (status === "enabled") {
        return (
            <span className="rounded-full border border-alloy-pine/20 bg-alloy-pine/[0.08] px-2 py-0.5 text-[11px] font-medium text-alloy-pine">
                Enabled
            </span>
        );
    }
    return (
        <span className="rounded-full border border-alloy-forge/15 bg-alloy-stone/[0.08] px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/50">
            Coming soon
        </span>
    );
}

function formatWhen(iso: string | null | undefined): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
        return "—";
    }
}

function SurfaceGalleryCard({
    entry,
    summary,
    canMutate,
    busy,
    onOpenEdit,
    onDuplicateDefault,
    onRollback,
    showVersions,
    onToggleVersions,
}: {
    entry: SurfaceRegistryApiEntry;
    summary: ReturnType<typeof summarizeSurfaceLayoutRecords> | null;
    canMutate: boolean;
    busy: string | null;
    onOpenEdit: () => void;
    onDuplicateDefault: () => void;
    onRollback: (versionId: string) => void;
    showVersions: boolean;
    onToggleVersions: () => void;
}) {
    const isComingSoon = entry.availability === "coming_soon";
    const published = summary?.published ?? null;
    const latestDraft = summary?.latestDraft ?? null;
    const rollbackCandidates = useMemo(
        () => rollbackCandidateVersions(summary?.orgVersions ?? [], published),
        [summary?.orgVersions, published],
    );

    return (
        <article
            className={[
                "flex h-full flex-col rounded-xl border shadow-sm transition-colors",
                isComingSoon ?
                    "border-alloy-forge/10 bg-alloy-stone/[0.04]"
                :   "border-alloy-forge/12 border-l-4 border-l-alloy-pine bg-white/90",
            ].join(" ")}
            data-testid={`layout-gallery-card-${entry.surface_key}`}
        >
            <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-base font-semibold tracking-tight text-alloy-midnight">{entry.label}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/55">{entry.description}</p>
                    </div>
                    {statusBadge(isComingSoon ? "coming_soon" : "enabled")}
                </div>

                {!isComingSoon && entry.layout_zones.length > 0 ?
                    <div className="flex flex-wrap gap-1.5">
                        {entry.layout_zones.map((zone) => (
                            <span
                                key={zone}
                                className="rounded-md border border-alloy-forge/10 bg-alloy-stone/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45"
                            >
                                {zone.replace(/_/g, " ")}
                            </span>
                        ))}
                    </div>
                :   null}

                {!isComingSoon ?
                    <div className="space-y-2 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.03] px-3 py-2.5 text-xs text-alloy-midnight/70">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-alloy-midnight/80">Live layout</span>
                            {published ?
                                <>
                                    {statusBadge("published")}
                                    <span>
                                        v{published.version} · {published.name}
                                    </span>
                                    <span className="text-alloy-midnight/45">· {formatWhen(published.publishedAt)}</span>
                                </>
                            :   <span className="text-alloy-midnight/50">No org-published layout yet — using platform default</span>}
                        </div>
                        {latestDraft ?
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-alloy-midnight/80">Draft</span>
                                {statusBadge("draft")}
                                <span>
                                    v{latestDraft.version} · {latestDraft.name}
                                </span>
                                <span className="text-alloy-midnight/45">· updated {formatWhen(latestDraft.updatedAt ?? latestDraft.createdAt)}</span>
                            </div>
                        :   null}
                    </div>
                :   null}

                {!isComingSoon ?
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                        <button
                            type="button"
                            disabled={!!busy || !canMutate}
                            onClick={onOpenEdit}
                            className="rounded-lg border border-alloy-pine/30 bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-alloy-pine/90 disabled:cursor-not-allowed disabled:opacity-50"
                            data-testid={`layout-gallery-open-${entry.surface_key}`}
                        >
                            {busy === "open" ? "Opening…" : published || latestDraft ? "Open / Edit" : "Start layout"}
                        </button>
                        <button
                            type="button"
                            disabled={!!busy || !canMutate || !summary?.duplicateSourceId}
                            onClick={onDuplicateDefault}
                            className="rounded-lg border border-alloy-forge/15 bg-white px-3 py-1.5 text-xs font-medium text-alloy-midnight shadow-sm transition hover:bg-alloy-stone/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                            data-testid={`layout-gallery-duplicate-${entry.surface_key}`}
                        >
                            {busy === "duplicate" ? "Duplicating…" : "Duplicate default"}
                        </button>
                        {(summary?.orgVersions.length ?? 0) > 0 ?
                            <button
                                type="button"
                                disabled={!!busy}
                                onClick={onToggleVersions}
                                className="rounded-lg border border-alloy-forge/15 bg-white px-3 py-1.5 text-xs font-medium text-alloy-midnight/70 shadow-sm transition hover:bg-alloy-stone/[0.06]"
                                data-testid={`layout-gallery-versions-${entry.surface_key}`}
                            >
                                {showVersions ? "Hide versions" : "View versions"}
                            </button>
                        :   null}
                    </div>
                :   null}
            </div>

            {!isComingSoon && showVersions && summary ?
                <div
                    className="border-t border-alloy-forge/10 bg-alloy-stone/[0.02] px-5 py-3"
                    data-testid={`layout-gallery-versions-panel-${entry.surface_key}`}
                >
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Version history
                    </p>
                    {summary.orgVersions.length === 0 ?
                        <p className="text-xs text-alloy-midnight/50">No org layouts saved yet.</p>
                    :   (
                        <ul className="space-y-1.5">
                            {summary.orgVersions.map((row) => {
                                const canRollback =
                                    canMutate &&
                                    row.status === "published" &&
                                    rollbackCandidates.some((c) => c.id === row.id);
                                return (
                                    <li
                                        key={row.id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-alloy-forge/10 bg-white/80 px-2.5 py-1.5 text-xs"
                                    >
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            {statusBadge(row.status)}
                                            <span className="font-medium text-alloy-midnight">v{row.version}</span>
                                            <span className="truncate text-alloy-midnight/60">{row.name}</span>
                                            <span className="text-alloy-midnight/40">
                                                {row.status === "published" ?
                                                    formatWhen(row.publishedAt)
                                                :   formatWhen(row.updatedAt ?? row.createdAt)}
                                            </span>
                                        </div>
                                        {canRollback ?
                                            <button
                                                type="button"
                                                disabled={busy === `rollback-${row.id}`}
                                                onClick={() => onRollback(row.id)}
                                                className="shrink-0 rounded border border-alloy-forge/15 px-2 py-0.5 text-[11px] font-medium text-alloy-blue hover:bg-alloy-blue/[0.04] disabled:opacity-50"
                                            >
                                                {busy === `rollback-${row.id}` ? "Rolling back…" : "Rollback to this"}
                                            </button>
                                        :   null}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            :   null}
        </article>
    );
}

export default function LayoutGalleryClient({
    onOpenEditor,
}: {
    onOpenEditor: (layoutId: string) => void;
}) {
    const [registry, setRegistry] = useState<SurfaceRegistryApiResponse | null>(null);
    const [records, setRecords] = useState<EntityLayoutRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [versionsOpen, setVersionsOpen] = useState<Record<string, boolean>>({});

    const canMutate = !forbidden;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [regRes, listRes] = await Promise.all([
                fetch("/api/admin/surface-layouts/registry"),
                fetch("/api/admin/entity-layouts"),
            ]);
            if (regRes.status === 401 || regRes.status === 403 || listRes.status === 401 || listRes.status === 403) {
                setForbidden(true);
                setError("You need admin access to configure layouts.");
                return;
            }
            const regJson = (await regRes.json().catch(() => ({}))) as SurfaceRegistryApiResponse & { error?: string };
            if (!regRes.ok) throw new Error(regJson.error ?? "Failed to load surface registry");
            const listJson = (await listRes.json().catch(() => ({}))) as ListResponse & { error?: string };
            if (!listRes.ok) throw new Error(listJson.error ?? "Failed to load layouts");
            setRegistry(regJson);
            setRecords(listJson.records ?? []);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const orgId = useMemo(() => records.find((r) => r.orgId)?.orgId ?? "", [records]);

    const opportunityEntry = registry?.enabled.find((e) => e.surface_key === "opportunity_drawer") ?? null;
    const opportunitySummary = useMemo(() => {
        if (!opportunityEntry?.identity || !orgId) return null;
        return summarizeSurfaceLayoutRecords(records, orgId, opportunityEntry.identity);
    }, [opportunityEntry, orgId, records]);

    const createFromDefault = useCallback(async (identity: NonNullable<SurfaceRegistryApiEntry["identity"]>) => {
        const res = await fetch("/api/admin/entity-layouts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entity_type: identity.entityType,
                surface: identity.surface,
                layout_key: identity.layoutKey,
                from_registry: true,
                seed: "lead_default",
            }),
        });
        if (res.status === 401 || res.status === 403) {
            setForbidden(true);
            throw new Error("Admin access is required.");
        }
        const json = (await res.json().catch(() => ({}))) as EntityLayoutRecord & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Could not create layout");
        return json;
    }, []);

    const handleOpenOpportunity = useCallback(async () => {
        if (!canMutate || !opportunityEntry?.identity) return;
        setBusy("open");
        try {
            let targetId = opportunitySummary?.editTargetId ?? null;
            if (!targetId) {
                const created = await createFromDefault(opportunityEntry.identity);
                targetId = created.id;
                await load();
            }
            onOpenEditor(targetId);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, [canMutate, opportunityEntry, opportunitySummary, createFromDefault, load, onOpenEditor]);

    const handleDuplicateOpportunity = useCallback(async () => {
        if (!canMutate || !opportunityEntry?.identity) return;
        setBusy("duplicate");
        try {
            let sourceId = opportunitySummary?.duplicateSourceId ?? null;
            if (!sourceId) {
                const created = await createFromDefault(opportunityEntry.identity);
                onOpenEditor(created.id);
                await load();
                return;
            }
            const res = await fetch(`/api/admin/entity-layouts/${sourceId}/duplicate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const json = (await res.json().catch(() => ({}))) as EntityLayoutRecord & { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Duplicate failed");
            await load();
            onOpenEditor(json.id);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, [canMutate, opportunityEntry, opportunitySummary, createFromDefault, load, onOpenEditor]);

    const handleRollback = useCallback(
        async (versionId: string) => {
            if (!canMutate) return;
            setBusy(`rollback-${versionId}`);
            try {
                const res = await fetch(`/api/admin/entity-layouts/${versionId}/rollback`, { method: "POST" });
                const json = (await res.json().catch(() => ({}))) as { published?: EntityLayoutRecord; error?: string };
                if (!res.ok) throw new Error(json.error ?? "Rollback failed");
                await load();
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setBusy(null);
            }
        },
        [canMutate, load],
    );

    if (loading) {
        return (
            <div
                className="rounded-xl border border-alloy-forge/12 bg-white/90 px-5 py-8 text-sm text-alloy-midnight/55"
                data-testid="layout-gallery-loading"
            >
                Loading layout gallery…
            </div>
        );
    }

    return (
        <div className="space-y-6" data-testid="layout-gallery">
            {error ?
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                    <button type="button" className="ml-2 underline" onClick={() => setError(null)}>
                        Dismiss
                    </button>
                </div>
            :   null}

            <section className="space-y-3">
                <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                        Configurable surfaces
                    </h2>
                    <p className="mt-0.5 text-xs text-alloy-midnight/45">
                        Choose a product surface to tune sections, fields, and presentation — shaped like the live
                        workspace.
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {(registry?.enabled ?? []).map((entry) => (
                        <SurfaceGalleryCard
                            key={entry.surface_key}
                            entry={entry}
                            summary={entry.surface_key === "opportunity_drawer" ? opportunitySummary : null}
                            canMutate={canMutate}
                            busy={busy}
                            onOpenEdit={() => void handleOpenOpportunity()}
                            onDuplicateDefault={() => void handleDuplicateOpportunity()}
                            onRollback={(id) => void handleRollback(id)}
                            showVersions={versionsOpen[entry.surface_key] === true}
                            onToggleVersions={() =>
                                setVersionsOpen((prev) => ({
                                    ...prev,
                                    [entry.surface_key]: !prev[entry.surface_key],
                                }))
                            }
                        />
                    ))}
                </div>
            </section>

            {(registry?.coming_soon.length ?? 0) > 0 ?
                <section className="space-y-3 rounded-xl border border-alloy-forge/10 bg-white/50 px-4 py-3.5">
                    <div>
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                            Coming soon
                        </h2>
                        <p className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/45">
                            Same layout model — visual editor rolling out surface by surface.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {registry!.coming_soon.map((entry) => (
                            <SurfaceGalleryCard
                                key={entry.surface_key}
                                entry={entry}
                                summary={null}
                                canMutate={false}
                                busy={null}
                                onOpenEdit={() => {}}
                                onDuplicateDefault={() => {}}
                                onRollback={() => {}}
                                showVersions={false}
                                onToggleVersions={() => {}}
                            />
                        ))}
                    </div>
                </section>
            :   null}

            {!canMutate ?
                <p className="text-xs text-alloy-midnight/50">
                    Read-only view.{" "}
                    <Link href="/admin/settings/fields" className="text-alloy-pine underline">
                        Field definitions
                    </Link>{" "}
                    remain editable based on your role.
                </p>
            :   null}
        </div>
    );
}

"use client";

/**
 * Surface Library — the landing / command center for all Surface authoring.
 *
 * Lists every surface in the platform from the declarative registry; choosing one opens
 * the ONE SurfaceBuilder. A new surface type appears here automatically (registry entry)
 * with no new builder and no new landing. UX only — no persistence/runtime coupling.
 */

import { surfaceLibraryByCategory, authorableSurfaces, type SurfaceLibraryEntry } from "@/lib/platform/surfaceBuilder/surfaceLibrary";

const STATUS_BADGE: Record<SurfaceLibraryEntry["status"], { label: string; cls: string }> = {
    published: { label: "Published", cls: "bg-alloy-juniper/[0.10] text-alloy-juniper" },
    draft: { label: "Draft", cls: "bg-amber-500/[0.12] text-amber-700" },
    planned: { label: "Planned", cls: "bg-alloy-stone/[0.12] text-alloy-midnight/50" },
};

function SurfaceCard({ entry, onOpen }: { entry: SurfaceLibraryEntry; onOpen: (id: string) => void }) {
    const badge = STATUS_BADGE[entry.status];
    const openable = Boolean(entry.editor);
    return (
        <div
            className="flex flex-col rounded-xl border border-alloy-stone/15 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
            data-surface-library-card={entry.id}
        >
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-alloy-midnight">{entry.title}</p>
                    <p className="mt-0.5 text-xs text-alloy-midnight/55">{entry.subtitle}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
                {entry.appearsIn.map((where) => (
                    <span key={where} className="rounded-full bg-alloy-stone/[0.08] px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/55">
                        {where}
                    </span>
                ))}
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-alloy-stone/10 pt-3">
                <span className="text-[11px] text-alloy-midnight/40" title="Per-surface timestamps aren't surfaced in the library yet">
                    Last updated · —
                </span>
                {openable ? (
                    <button
                        type="button"
                        onClick={() => onOpen(entry.id)}
                        data-surface-library-open={entry.id}
                        className="ml-auto rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white hover:bg-alloy-pine/90"
                    >
                        Open builder →
                    </button>
                ) : (
                    <span className="ml-auto text-[11px] font-semibold text-alloy-midnight/35">Coming soon</span>
                )}
            </div>
        </div>
    );
}

export function SurfaceLibrary({ onOpen }: { onOpen: (id: string) => void }) {
    const primaryAuthorable = authorableSurfaces()[0]?.id ?? "operational-intelligence";
    return (
        <div className="space-y-6" data-surface-library>
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Surfaces</p>
                    <h2 className="text-xl font-semibold tracking-tight text-alloy-midnight">Surface Library</h2>
                    <p className="mt-1 text-sm text-alloy-midnight/55">
                        Create a surface from scratch or a template, or open an existing one to edit — the same builder powers them all.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => onOpen(primaryAuthorable)}
                    data-surface-create
                    className="shrink-0 rounded-lg bg-alloy-pine px-3.5 py-2 text-xs font-semibold text-white hover:bg-alloy-pine/90"
                >
                    + Create surface
                </button>
            </header>
            <p className="-mt-3 text-[11px] text-alloy-midnight/45">
                <span className="font-semibold text-alloy-juniper">Published</span> = live · <span className="font-semibold text-amber-600">Draft</span> = in progress · <span className="font-semibold text-alloy-midnight/50">Planned</span> = coming soon. Each card shows where it appears.
            </p>

            {surfaceLibraryByCategory().map((group) => (
                <section key={group.category} data-surface-library-group={group.category}>
                    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">{group.category}</h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {group.entries.map((entry) => (
                            <SurfaceCard key={entry.id} entry={entry} onOpen={onOpen} />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

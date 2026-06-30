"use client";

/**
 * Inline Add-Card flow — choose type → choose content → configure → done. Contextual
 * insertion (Notion-style), no wizard, no page change. Generic: every step is driven by
 * the SurfaceDefinition (card types, content source, renderers, runtime preview).
 */

import { useMemo, useState, type ReactElement } from "react";

import type { SurfaceDefinition } from "@/lib/platform/surfaceBuilder/surfaceDefinition";

export type AddCardResult = { cardTypeKey: string; contentId: string; config: Record<string, unknown> };

export function AddCardPopover({
    definition,
    sectionTitle,
    onCancel,
    onConfirm,
}: {
    definition: SurfaceDefinition;
    sectionTitle: string;
    onCancel: () => void;
    onConfirm: (result: AddCardResult) => void;
}): ReactElement {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [cardTypeKey, setCardTypeKey] = useState<string>("");
    const [contentId, setContentId] = useState<string>("");
    const [title, setTitle] = useState<string>("");
    const [rendererKey, setRendererKey] = useState<string>("");
    const [query, setQuery] = useState<string>("");

    const cardType = definition.cardTypes.find((c) => c.key === cardTypeKey) ?? null;

    const groupedContent = useMemo(() => {
        const q = query.trim().toLowerCase();
        const items = definition.contentSource.list().filter((c) =>
            !q || c.label.toLowerCase().includes(q) || (c.question ?? "").toLowerCase().includes(q) || c.group.toLowerCase().includes(q),
        );
        const groups = new Map<string, typeof items>();
        for (const i of items) groups.set(i.group, [...(groups.get(i.group) ?? []), i]);
        return [...groups.entries()];
    }, [definition, query]);

    const dot = (on: boolean) => `h-1.5 w-1.5 rounded-full ${on ? "bg-alloy-pine" : "bg-alloy-stone/30"}`;

    return (
        <div className="overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.12)]" data-add-card-popover>
            <div className="flex items-center gap-2 border-b border-alloy-stone/10 px-4 py-2.5">
                <span className="text-[13px] font-semibold text-alloy-midnight">
                    {step === 1 ? `Add to ${sectionTitle}` : step === 2 ? `${cardType?.label ?? "Card"} · choose content` : `${definition.contentSource.resolveLabel(contentId) || "Card"} · configure`}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                    <span className={dot(step === 1)} /><span className={dot(step === 2)} /><span className={dot(step === 3)} />
                </div>
            </div>

            {step === 1 ? (
                <div className="grid grid-cols-3 gap-2 p-4">
                    {definition.cardTypes.map((ct) => (
                        <button
                            key={ct.key}
                            type="button"
                            data-add-card-type={ct.key}
                            onClick={() => {
                                setCardTypeKey(ct.key);
                                setRendererKey(ct.rendererKey);
                                setStep(2);
                            }}
                            className="flex flex-col gap-1 rounded-lg border border-alloy-stone/20 p-3 text-left hover:border-alloy-pine/40 hover:bg-alloy-pine/[0.04]"
                        >
                            <span className="text-lg leading-none">{ct.icon}</span>
                            <span className="text-xs font-semibold text-alloy-midnight">{ct.label}</span>
                            {ct.group ? <span className="text-[10px] text-alloy-midnight/45">{ct.group}</span> : null}
                        </button>
                    ))}
                </div>
            ) : null}

            {step === 2 ? (
                <div>
                    <div className="m-3 flex items-center gap-2 rounded-lg border border-alloy-stone/20 px-3 py-2">
                        <span className="text-alloy-midnight/40">🔍</span>
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search metrics, calculations, questions…"
                            className="w-full text-xs text-alloy-midnight outline-none"
                        />
                    </div>
                    <div className="max-h-72 overflow-y-auto px-3 pb-2">
                        {groupedContent.map(([group, items]) => (
                            <div key={group}>
                                <div className="px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">{group}</div>
                                {items.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        data-add-card-content={c.id}
                                        onClick={() => {
                                            setContentId(c.id);
                                            setTitle(c.label);
                                            setStep(3);
                                        }}
                                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-alloy-pine/[0.06]"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[12.5px] font-semibold text-alloy-midnight">{c.label}</span>
                                            {c.question ? <span className="block truncate text-[11px] text-alloy-midnight/55">{c.question}</span> : null}
                                        </span>
                                        {c.availability === "live" ? (
                                            <span className="rounded-full bg-alloy-juniper/[0.10] px-2 py-0.5 text-[10px] font-semibold text-alloy-juniper">Live</span>
                                        ) : null}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center border-t border-alloy-stone/10 px-4 py-2.5">
                        <button type="button" onClick={() => setStep(1)} className="text-xs font-semibold text-alloy-midnight/50">← Back</button>
                    </div>
                </div>
            ) : null}

            {step === 3 ? (
                <div>
                    <div className="flex gap-4 p-4">
                        <div className="w-48 shrink-0">
                            {definition.runtimeRenderer.renderCard(
                                { instanceId: "__preview__", cardTypeKey, contentId, config: { rendererKey, title } },
                                { contentLabel: definition.contentSource.resolveLabel(contentId) },
                            )}
                            <p className="mt-2 text-center text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/40">Live preview</p>
                        </div>
                        <div className="min-w-0 flex-1 space-y-3">
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold text-alloy-midnight/70">Title</label>
                                <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-alloy-stone/20 px-2.5 py-1.5 text-xs text-alloy-midnight" />
                            </div>
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold text-alloy-midnight/70">Renderer</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {definition.renderers.map((r) => (
                                        <button
                                            key={r.key}
                                            type="button"
                                            onClick={() => setRendererKey(r.key)}
                                            className={`rounded-md border px-2 py-1 text-[11px] font-medium ${rendererKey === r.key ? "border-alloy-pine bg-alloy-pine/[0.08] text-alloy-pine" : "border-alloy-stone/20 text-alloy-midnight/70"}`}
                                        >
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 border-t border-alloy-stone/10 bg-alloy-stone/[0.03] px-4 py-2.5">
                        <button type="button" onClick={() => setStep(2)} className="text-xs font-semibold text-alloy-midnight/50">← Back</button>
                        <div className="ml-auto flex gap-2">
                            <button type="button" onClick={onCancel} className="rounded-lg border border-alloy-stone/20 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/65">Cancel</button>
                            <button
                                type="button"
                                data-add-card-confirm
                                onClick={() => onConfirm({ cardTypeKey, contentId, config: { rendererKey, title, visibility: "on" } })}
                                className="rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white"
                            >
                                Add to {sectionTitle}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

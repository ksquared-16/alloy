"use client";

/**
 * Platform Surface Builder — the one builder for every configurable surface in Alloy.
 *
 * Business-agnostic: everything comes from the injected `SurfaceDefinition`. No
 * `if (surfaceType === …)`. The experience — the canvas IS the preview, sections own the
 * editing context, inline Add Card, explicit Editing/Preview/Runtime modes, and a
 * confident publish lifecycle — belongs to the platform, not to any one surface.
 */

import { useCallback, useEffect, useMemo, useReducer, useState, type ReactElement } from "react";

import type {
    SurfaceDefinition,
    SurfaceCardInstance,
    SurfaceDoc,
    InspectorField,
} from "@/lib/platform/surfaceBuilder/surfaceDefinition";
import {
    emptyDoc,
    getCard,
    surfaceBuilderReducer,
    type BuilderState,
    type CardPatch,
} from "@/lib/platform/surfaceBuilder/surfaceBuilderModel";
import { AddCardPopover, type AddCardResult } from "@/components/platform/surfaceBuilder/AddCardPopover";

type Mode = "edit" | "preview" | "runtime";
type PublishState = "idle" | "saving" | "done" | "error";

function newInstanceId(): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `card_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export function SurfaceBuilder({ definition }: { definition: SurfaceDefinition }): ReactElement {
    const [state, dispatch] = useReducer(surfaceBuilderReducer, undefined, () => ({
        doc: emptyDoc(definition.sections),
        selectedInstanceId: null,
        dirty: false,
    }) satisfies BuilderState);

    const [mode, setMode] = useState<Mode>("edit");
    const [publishState, setPublishState] = useState<PublishState>("idle");
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    const [addCardFor, setAddCardFor] = useState<string | null>(null);
    const [toast, setToast] = useState(false);
    const [runtimeDoc, setRuntimeDoc] = useState<SurfaceDoc | null>(null);

    // Load the working doc once (dispatch only in the async callback).
    useEffect(() => {
        let cancelled = false;
        definition.persistence
            .load()
            .then((doc) => {
                if (cancelled) return;
                dispatch({ type: "load", doc });
                setActiveSectionId(doc.sections[0]?.sectionId ?? null);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [definition]);

    // Runtime mode shows the published surface, read-only.
    useEffect(() => {
        if (mode !== "runtime") return;
        let cancelled = false;
        definition.persistence.load().then((doc) => {
            if (!cancelled) setRuntimeDoc(doc);
        }).catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [mode, definition]);

    // Selecting a card scrolls it into view on the canvas.
    useEffect(() => {
        if (mode !== "edit" || !state.selectedInstanceId) return;
        document.querySelector(`[data-canvas-card="${state.selectedInstanceId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [state.selectedInstanceId, mode]);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(false), 4500);
        return () => clearTimeout(t);
    }, [toast]);

    const confirmAddCard = useCallback((sectionId: string, result: AddCardResult) => {
        const instance: SurfaceCardInstance = {
            instanceId: newInstanceId(),
            cardTypeKey: result.cardTypeKey,
            contentId: result.contentId || null,
            config: result.config,
        };
        dispatch({ type: "insertCard", sectionId, index: Number.MAX_SAFE_INTEGER, instance });
        setAddCardFor(null);
    }, []);

    const publish = useCallback(() => {
        setPublishState("saving");
        definition.persistence
            .persist(state.doc)
            .then(() => {
                dispatch({ type: "markSaved" });
                setPublishState("done");
                setToast(true);
            })
            .catch(() => setPublishState("error"));
    }, [definition, state.doc]);

    const selected = state.selectedInstanceId ? getCard(state.doc, state.selectedInstanceId) : null;
    const pill: "saving" | "error" | "draft" | "published" =
        publishState === "saving" ? "saving" : publishState === "error" ? "error" : state.dirty ? "draft" : "published";
    const liveDoc = mode === "runtime" ? (runtimeDoc ?? { sections: [] }) : state.doc;
    const chrome = mode === "edit";

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-surface-builder={definition.surfaceType} data-builder-mode={mode}>
            <BuilderToolbar
                definition={definition}
                mode={mode}
                onMode={setMode}
                pill={pill}
                canPublish={state.dirty && publishState !== "saving"}
                onPublish={publish}
            />
            <div className="flex min-h-0 flex-1">
                {chrome ? (
                    <SurfaceTree
                        definition={definition}
                        doc={state.doc}
                        selectedInstanceId={state.selectedInstanceId}
                        activeSectionId={activeSectionId}
                        onSelectSection={setActiveSectionId}
                        onSelectCard={(id) => dispatch({ type: "select", instanceId: id })}
                        onAddCard={(sectionId) => {
                            setActiveSectionId(sectionId);
                            setAddCardFor(sectionId);
                        }}
                    />
                ) : null}

                <SurfaceCanvas
                    definition={definition}
                    doc={liveDoc}
                    mode={mode}
                    chrome={chrome}
                    selectedInstanceId={state.selectedInstanceId}
                    addCardFor={addCardFor}
                    onSelectCard={(id) => dispatch({ type: "select", instanceId: id })}
                    onOpenAddCard={(sectionId) => {
                        setActiveSectionId(sectionId);
                        setAddCardFor(sectionId);
                    }}
                    onCancelAddCard={() => setAddCardFor(null)}
                    onConfirmAddCard={confirmAddCard}
                    onRemoveCard={(id) => dispatch({ type: "removeCard", instanceId: id })}
                    toast={toast}
                />

                {chrome ? (
                    <SurfaceInspector
                        definition={definition}
                        card={selected}
                        onUpdate={(patch) => state.selectedInstanceId && dispatch({ type: "updateCard", instanceId: state.selectedInstanceId, patch })}
                        onRemove={() => state.selectedInstanceId && dispatch({ type: "removeCard", instanceId: state.selectedInstanceId })}
                    />
                ) : null}
            </div>
        </div>
    );
}

/* ---- Top bar: context + mode + publish (never ambiguous) ---- */

function BuilderToolbar({
    definition,
    mode,
    onMode,
    pill,
    canPublish,
    onPublish,
}: {
    definition: SurfaceDefinition;
    mode: Mode;
    onMode: (m: Mode) => void;
    pill: "saving" | "error" | "draft" | "published";
    canPublish: boolean;
    onPublish: () => void;
}): ReactElement {
    const pillText = pill === "saving" ? "Saving…" : pill === "error" ? "Couldn't publish — retry" : pill === "draft" ? "Draft · unpublished changes" : "Published";
    const pillClass =
        pill === "saving" ? "bg-alloy-honey/[0.15] text-alloy-honey" :
        pill === "error" ? "bg-alloy-ember/[0.12] text-alloy-ember" :
        pill === "draft" ? "bg-alloy-stone/10 text-alloy-midnight/60" :
        "bg-alloy-juniper/[0.10] text-alloy-juniper";
    const modes: { key: Mode; label: string; icon: string }[] = [
        { key: "edit", label: "Editing", icon: "✎" },
        { key: "preview", label: "Preview", icon: "▷" },
        { key: "runtime", label: "Runtime", icon: "◎" },
    ];
    return (
        <div className="flex items-center gap-3 border-b border-alloy-stone/15 bg-white px-4 py-2">
            <div className="min-w-0">
                <div className="text-sm font-semibold text-alloy-midnight">{definition.title}</div>
                {definition.appearsIn ? <div className="text-[11px] text-alloy-midnight/50">Appears in · {definition.appearsIn}</div> : null}
            </div>
            <div className="ml-auto flex items-center gap-2">
                <div className="flex gap-0.5 rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.04] p-0.5" role="tablist" aria-label="Builder mode">
                    {modes.map((m) => (
                        <button
                            key={m.key}
                            type="button"
                            data-builder-mode-btn={m.key}
                            onClick={() => onMode(m.key)}
                            className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${mode === m.key ? "bg-white text-alloy-midnight shadow-[0_1px_2px_rgba(15,23,42,0.06)]" : "text-alloy-midnight/45"}`}
                        >
                            <span className="mr-1 opacity-70">{m.icon}</span>{m.label}
                        </button>
                    ))}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${pillClass}`} data-publish-state={pill}>{pillText}</span>
                {definition.runtimeHref ? (
                    <a href={definition.runtimeHref} className="rounded-lg border border-alloy-stone/20 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/65 hover:bg-alloy-stone/[0.06]">Open runtime →</a>
                ) : null}
                <button
                    type="button"
                    data-surface-publish
                    onClick={onPublish}
                    disabled={!canPublish}
                    className="rounded-lg bg-alloy-pine px-3.5 py-1.5 text-xs font-semibold text-white disabled:bg-alloy-stone/10 disabled:text-alloy-midnight/40"
                >
                    {pill === "saving" ? "Publishing…" : "Publish"}
                </button>
            </div>
        </div>
    );
}

/* ---- Left: section tree (sections own the editing context) ---- */

function SurfaceTree({
    definition,
    doc,
    selectedInstanceId,
    activeSectionId,
    onSelectSection,
    onSelectCard,
    onAddCard,
}: {
    definition: SurfaceDefinition;
    doc: SurfaceDoc;
    selectedInstanceId: string | null;
    activeSectionId: string | null;
    onSelectSection: (id: string) => void;
    onSelectCard: (id: string) => void;
    onAddCard: (sectionId: string) => void;
}): ReactElement {
    const sectioned = definition.sections !== "none";
    return (
        <aside className="flex w-60 shrink-0 flex-col border-r border-alloy-stone/15 bg-white" data-surface-tree>
            <div className="border-b border-alloy-stone/10 px-4 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">Surface</div>
                <div className="text-sm font-semibold text-alloy-midnight">{definition.title}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {doc.sections.map((section) => {
                    const active = section.sectionId === activeSectionId;
                    return (
                        <div key={section.sectionId} className="mb-1">
                            {sectioned ? (
                                <button
                                    type="button"
                                    onClick={() => onSelectSection(section.sectionId)}
                                    data-tree-section={section.sectionId}
                                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ${active ? "bg-alloy-pine/[0.08]" : "hover:bg-alloy-stone/[0.05]"}`}
                                >
                                    <span className={`text-[13px] font-semibold ${active ? "text-alloy-pine" : "text-alloy-midnight"}`}>{section.title || "Section"}</span>
                                    <span className="ml-auto rounded-full bg-alloy-stone/[0.08] px-1.5 text-[11px] font-semibold text-alloy-midnight/55">{section.cards.length}</span>
                                </button>
                            ) : null}
                            <div className={sectioned ? "pl-3" : ""}>
                                {section.cards.map((card) => (
                                    <button
                                        key={card.instanceId}
                                        type="button"
                                        onClick={() => onSelectCard(card.instanceId)}
                                        data-tree-card={card.instanceId}
                                        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs ${selectedInstanceId === card.instanceId ? "bg-alloy-pine/[0.08] font-semibold text-alloy-pine" : "text-alloy-midnight/70 hover:bg-alloy-stone/[0.05]"}`}
                                    >
                                        <span className="truncate">{definition.contentSource.resolveLabel(card.contentId ?? "") || card.cardTypeKey}</span>
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => onAddCard(section.sectionId)}
                                    data-tree-add-card={section.sectionId}
                                    className="mt-0.5 flex w-full items-center gap-1.5 rounded-md border border-dashed border-alloy-pine/30 px-2.5 py-1.5 text-[11px] font-semibold text-alloy-pine hover:bg-alloy-pine/[0.05]"
                                >
                                    <span className="text-sm leading-none">＋</span> Add card
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="border-t border-alloy-stone/10 px-4 py-2 text-[11px] text-alloy-midnight/45">One builder · every surface</div>
        </aside>
    );
}

/* ---- Center: live canvas = the preview ---- */

function SurfaceCanvas({
    definition,
    doc,
    mode,
    chrome,
    selectedInstanceId,
    addCardFor,
    onSelectCard,
    onOpenAddCard,
    onCancelAddCard,
    onConfirmAddCard,
    onRemoveCard,
    toast,
}: {
    definition: SurfaceDefinition;
    doc: SurfaceDoc;
    mode: Mode;
    chrome: boolean;
    selectedInstanceId: string | null;
    addCardFor: string | null;
    onSelectCard: (id: string) => void;
    onOpenAddCard: (sectionId: string) => void;
    onCancelAddCard: () => void;
    onConfirmAddCard: (sectionId: string, result: AddCardResult) => void;
    onRemoveCard: (id: string) => void;
    toast: boolean;
}): ReactElement {
    const banner =
        mode === "preview"
            ? { text: "Preview — exactly what operators will see", cls: "bg-alloy-blue/[0.06] text-alloy-blue border-alloy-blue/20" }
            : mode === "runtime"
                ? { text: "Runtime — the published, live surface", cls: "bg-alloy-juniper/[0.07] text-alloy-juniper border-alloy-juniper/25" }
                : { text: "Live preview — edits render here instantly", cls: "bg-alloy-pine/[0.06] text-alloy-pine border-alloy-pine/20" };

    return (
        <section className="relative flex min-w-0 flex-1 flex-col bg-alloy-stone/[0.04]" data-surface-canvas>
            <div className={`flex items-center gap-2 border-b px-5 py-1.5 text-[11px] font-semibold ${banner.cls}`}>
                <span>●</span> {banner.text}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {doc.sections.map((section) => (
                    <div key={section.sectionId} className="mb-7">
                        {definition.sections !== "none" ? (
                            <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-alloy-midnight/70">{section.title || "Section"}</h3>
                        ) : null}

                        {chrome && addCardFor === section.sectionId ? (
                            <div className="mb-3">
                                <AddCardPopover
                                    definition={definition}
                                    sectionTitle={section.title || "Section"}
                                    onCancel={onCancelAddCard}
                                    onConfirm={(r) => onConfirmAddCard(section.sectionId, r)}
                                />
                            </div>
                        ) : null}

                        {section.cards.length === 0 && !(chrome && addCardFor === section.sectionId) ? (
                            <EmptySection
                                title={section.title || "Section"}
                                chrome={chrome}
                                onAdd={() => onOpenAddCard(section.sectionId)}
                            />
                        ) : (
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                                {section.cards.map((card) => (
                                    <CanvasCard
                                        key={card.instanceId}
                                        definition={definition}
                                        card={card}
                                        chrome={chrome}
                                        selected={selectedInstanceId === card.instanceId}
                                        onSelect={() => onSelectCard(card.instanceId)}
                                        onRemove={() => onRemoveCard(card.instanceId)}
                                    />
                                ))}
                                {chrome ? (
                                    <button
                                        type="button"
                                        onClick={() => onOpenAddCard(section.sectionId)}
                                        data-add-card={section.sectionId}
                                        className="flex min-h-[128px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-alloy-pine/30 bg-alloy-pine/[0.04] text-sm font-semibold text-alloy-pine hover:bg-alloy-pine/[0.07]"
                                    >
                                        <span className="text-lg">＋</span> Add card
                                    </button>
                                ) : null}
                            </div>
                        )}
                    </div>
                ))}
                {doc.sections.length === 0 ? (
                    <p className="px-1 py-8 text-center text-sm text-alloy-midnight/45">This surface has no sections yet.</p>
                ) : null}
            </div>

            {toast ? (
                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-xl bg-alloy-midnight px-4 py-2.5 text-xs font-semibold text-white shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-alloy-pine text-[10px]">✓</span>
                    Published — runtime updated.
                    {definition.runtimeHref ? <a href={definition.runtimeHref} className="text-emerald-300 underline-offset-2 hover:underline">Open runtime →</a> : null}
                </div>
            ) : null}
        </section>
    );
}

function CanvasCard({
    definition,
    card,
    chrome,
    selected,
    onSelect,
    onRemove,
}: {
    definition: SurfaceDefinition;
    card: SurfaceCardInstance;
    chrome: boolean;
    selected: boolean;
    onSelect: () => void;
    onRemove: () => void;
}): ReactElement {
    const rendered = definition.runtimeRenderer.renderCard(card, {
        contentLabel: definition.contentSource.resolveLabel(card.contentId ?? ""),
    });
    if (!chrome) return <div data-canvas-card={card.instanceId}>{rendered}</div>;
    return (
        <div className="group relative" data-canvas-card={card.instanceId}>
            {selected ? (
                <span className="absolute -top-2 left-2 z-10 rounded bg-alloy-pine px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Selected</span>
            ) : null}
            <div className="absolute right-2 top-2 z-10 hidden gap-0.5 rounded-md border border-alloy-stone/15 bg-white p-0.5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] group-hover:flex">
                <button type="button" aria-label="Remove card" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="flex h-5 w-5 items-center justify-center rounded text-alloy-midnight/45 hover:bg-alloy-stone/[0.08] hover:text-alloy-ember">🗑</button>
            </div>
            <button
                type="button"
                onClick={onSelect}
                className={`block w-full rounded-xl text-left ${selected ? "outline outline-2 outline-alloy-pine" : "outline outline-2 outline-transparent hover:outline-alloy-pine/30"}`}
            >
                {rendered}
            </button>
        </div>
    );
}

function EmptySection({ title, chrome, onAdd }: { title: string; chrome: boolean; onAdd: () => void }): ReactElement {
    return (
        <div className="rounded-xl border border-dashed border-alloy-stone/20 bg-white px-6 py-8 text-center">
            <p className="text-sm font-semibold text-alloy-midnight">{title} is empty</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-alloy-midnight/55">Choose a metric, chart, narrative read, or an action panel — it renders live the moment you add it.</p>
            {chrome ? (
                <button type="button" onClick={onAdd} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-alloy-pine px-3.5 py-2 text-xs font-semibold text-white">
                    <span className="text-sm">＋</span> Add card
                </button>
            ) : null}
        </div>
    );
}

/* ---- Right: inspector (renders the definition schema as grouped tabs) ---- */

function SurfaceInspector({
    definition,
    card,
    onUpdate,
    onRemove,
}: {
    definition: SurfaceDefinition;
    card: SurfaceCardInstance | null;
    onUpdate: (patch: CardPatch) => void;
    onRemove: () => void;
}): ReactElement {
    const tabs = definition.inspectorSchema.tabs;
    const [activeTab, setActiveTab] = useState<string>(tabs[0]?.key ?? "");
    const tab = useMemo(() => tabs.find((t) => t.key === activeTab) ?? tabs[0], [tabs, activeTab]);

    if (!card) {
        return (
            <aside className="flex w-80 shrink-0 flex-col items-center justify-center border-l border-alloy-stone/15 bg-white p-6 text-center" data-surface-inspector>
                <p className="text-sm font-semibold text-alloy-midnight/70">Nothing selected</p>
                <p className="mt-1 text-xs text-alloy-midnight/45">Select a card on the canvas to configure it. The inspector edits; the canvas reacts.</p>
            </aside>
        );
    }

    return (
        <aside className="flex w-80 shrink-0 flex-col border-l border-alloy-stone/15 bg-white" data-surface-inspector>
            <div className="flex items-center gap-2 border-b border-alloy-stone/10 px-4 py-3">
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-alloy-midnight">{definition.contentSource.resolveLabel(card.contentId ?? "") || card.cardTypeKey}</div>
                    <div className="text-[11px] text-alloy-midnight/50">{card.cardTypeKey} card</div>
                </div>
            </div>
            <div className="flex gap-0.5 overflow-x-auto border-b border-alloy-stone/10 px-2">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveTab(t.key)}
                        className={`whitespace-nowrap border-b-2 px-2.5 py-2 text-[11.5px] font-semibold ${(tab?.key ?? "") === t.key ? "border-alloy-pine text-alloy-pine" : "border-transparent text-alloy-midnight/45"}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {tab?.fields.map((field) => (
                    <InspectorFieldView key={field.key} definition={definition} field={field} card={card} onUpdate={onUpdate} />
                ))}
            </div>
            <div className="border-t border-alloy-stone/10 p-3">
                <button type="button" onClick={onRemove} className="w-full rounded-lg border border-alloy-stone/20 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:border-alloy-ember/40 hover:text-alloy-ember">Remove card</button>
            </div>
        </aside>
    );
}

function InspectorFieldView({
    definition,
    field,
    card,
    onUpdate,
}: {
    definition: SurfaceDefinition;
    field: InspectorField;
    card: SurfaceCardInstance;
    onUpdate: (patch: CardPatch) => void;
}): ReactElement {
    const cfg = card.config as Record<string, string | undefined>;
    const wrap = (children: ReactElement) => (
        <div className="mb-4">
            <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-alloy-midnight/50">{field.label}</label>
            {children}
        </div>
    );
    const inputClass = "w-full rounded-lg border border-alloy-stone/20 px-2.5 py-1.5 text-xs text-alloy-midnight";

    switch (field.kind) {
        case "content":
            return wrap(
                <select className={inputClass} value={card.contentId ?? ""} onChange={(e) => onUpdate({ contentId: e.target.value || null })}>
                    <option value="">Choose content…</option>
                    {definition.contentSource.list().map((c) => (
                        <option key={c.id} value={c.id}>{c.group} · {c.label}</option>
                    ))}
                </select>,
            );
        case "renderer":
            return wrap(
                <div className="grid grid-cols-2 gap-1.5">
                    {definition.renderers.map((r) => (
                        <button
                            key={r.key}
                            type="button"
                            onClick={() => onUpdate({ config: { rendererKey: r.key } })}
                            className={`rounded-md border px-2 py-1.5 text-[11px] font-medium ${cfg.rendererKey === r.key ? "border-alloy-pine bg-alloy-pine/[0.08] text-alloy-pine" : "border-alloy-stone/20 text-alloy-midnight/70 hover:bg-alloy-stone/[0.04]"}`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>,
            );
        case "text":
            return wrap(<input className={inputClass} value={cfg[field.key] ?? ""} onChange={(e) => onUpdate({ config: { [field.key]: e.target.value } })} />);
        case "textarea":
            return wrap(<textarea className={inputClass} rows={2} value={cfg[field.key] ?? ""} onChange={(e) => onUpdate({ config: { [field.key]: e.target.value } })} />);
        case "select":
            return wrap(
                <select className={inputClass} value={cfg[field.key] ?? (field.options?.[0]?.value ?? "")} onChange={(e) => onUpdate({ config: { [field.key]: e.target.value } })}>
                    {(field.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>,
            );
        case "toggle": {
            const on = cfg[field.key] !== "off";
            return wrap(
                <button
                    type="button"
                    onClick={() => onUpdate({ config: { [field.key]: on ? "off" : "on" } })}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold ${on ? "border-alloy-pine/40 bg-alloy-pine/[0.06] text-alloy-pine" : "border-alloy-stone/20 text-alloy-midnight/60"}`}
                >
                    <span>{on ? "Visible" : "Hidden"}</span>
                    <span className={`relative h-5 w-9 rounded-full ${on ? "bg-alloy-pine" : "bg-alloy-stone/30"}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                    </span>
                </button>,
            );
        }
        case "promote":
            return wrap(
                <div className="flex flex-col gap-1.5">
                    {(field.options ?? []).map((o) => {
                        const on = (card.promotedTo ?? []).includes(o.value);
                        return (
                            <button
                                key={o.value}
                                type="button"
                                onClick={() => {
                                    const set = new Set(card.promotedTo ?? []);
                                    if (on) set.delete(o.value); else set.add(o.value);
                                    onUpdate({ promotedTo: [...set] });
                                }}
                                className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11.5px] font-semibold ${on ? "border-alloy-pine/40 bg-alloy-pine/[0.08] text-alloy-pine" : "border-alloy-stone/20 text-alloy-midnight/70"}`}
                            >
                                <span>{on ? "✓" : "○"}</span> {o.label}
                            </button>
                        );
                    })}
                </div>,
            );
        case "thresholds":
            return wrap(
                <div className="flex gap-1.5">
                    {[
                        { k: "thresholdHealthy", label: "Healthy ≥", cls: "border-alloy-juniper/30 text-alloy-juniper" },
                        { k: "thresholdWarn", label: "Watch ≥", cls: "border-alloy-honey/30 text-alloy-honey" },
                    ].map((t) => (
                        <div key={t.k} className={`flex-1 rounded-lg border px-2 py-1.5 ${t.cls}`}>
                            <div className="text-[9px] font-semibold uppercase">{t.label}</div>
                            <input
                                value={cfg[t.k] ?? ""}
                                onChange={(e) => onUpdate({ config: { [t.k]: e.target.value } })}
                                placeholder="—"
                                className="w-full bg-transparent text-xs font-semibold text-alloy-midnight outline-none"
                            />
                        </div>
                    ))}
                </div>,
            );
        default:
            return wrap(<span />);
    }
}

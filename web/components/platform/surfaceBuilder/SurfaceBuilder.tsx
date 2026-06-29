"use client";

/**
 * Platform Surface Builder — the one builder for every configurable surface in Alloy.
 *
 * It is unaware of business meaning. Everything comes from the injected `SurfaceDefinition`
 * (sections, card types, content sources, inspector schema, runtime renderer, persistence).
 * There is no `if (surfaceType === …)` anywhere in this file. Focus Panel, Operational
 * Intelligence, headers, and reports are all the same component with a different definition.
 */

import { useCallback, useEffect, useMemo, useReducer, useState, type ReactElement } from "react";

import type {
    SurfaceDefinition,
    SurfaceCardInstance,
    InspectorField,
    InspectorTab,
} from "@/lib/platform/surfaceBuilder/surfaceDefinition";
import {
    emptyDoc,
    getCard,
    surfaceBuilderReducer,
    type BuilderState,
} from "@/lib/platform/surfaceBuilder/surfaceBuilderModel";

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

    // Load the surface doc once (dispatch only in the async callback — never sync in the effect body).
    useEffect(() => {
        let cancelled = false;
        definition.persistence
            .load()
            .then((doc) => {
                if (!cancelled) dispatch({ type: "load", doc });
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [definition]);

    const addCard = useCallback(
        (sectionId: string, cardTypeKey: string) => {
            const instance: SurfaceCardInstance = {
                instanceId: newInstanceId(),
                cardTypeKey,
                contentId: null,
                config: {},
            };
            dispatch({ type: "insertCard", sectionId, index: Number.MAX_SAFE_INTEGER, instance });
        },
        [],
    );

    const save = useCallback(() => {
        definition.persistence.persist(state.doc).then(() => dispatch({ type: "markSaved" })).catch(() => undefined);
    }, [definition, state.doc]);

    const selected = state.selectedInstanceId ? getCard(state.doc, state.selectedInstanceId) : null;

    return (
        <div className="flex min-h-0 flex-1" data-surface-builder={definition.surfaceType}>
            <SurfaceTree
                definition={definition}
                state={state}
                onSelect={(id) => dispatch({ type: "select", instanceId: id })}
                onAddCard={addCard}
            />
            <SurfaceCanvas
                definition={definition}
                state={state}
                onSelect={(id) => dispatch({ type: "select", instanceId: id })}
                onAddCard={addCard}
                onSave={save}
            />
            <SurfaceInspector
                definition={definition}
                card={selected}
                onUpdate={(patch) =>
                    state.selectedInstanceId && dispatch({ type: "updateCard", instanceId: state.selectedInstanceId, patch })
                }
                onRemove={() =>
                    state.selectedInstanceId && dispatch({ type: "removeCard", instanceId: state.selectedInstanceId })
                }
            />
        </div>
    );
}

/* ---- Left: surface tree + component library ---- */

export function SurfaceTree({
    definition,
    state,
    onSelect,
    onAddCard,
}: {
    definition: SurfaceDefinition;
    state: BuilderState;
    onSelect: (id: string) => void;
    onAddCard: (sectionId: string, cardTypeKey: string) => void;
}): ReactElement {
    const firstSection = state.doc.sections[0]?.sectionId ?? "";
    return (
        <aside className="flex w-56 shrink-0 flex-col border-r border-alloy-stone/15 bg-white" data-surface-tree>
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Surface</div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                {state.doc.sections.map((section) => (
                    <div key={section.sectionId}>
                        {definition.sections !== "none" ? (
                            <div className="px-3 py-1.5 text-xs font-semibold text-alloy-midnight">{section.title || "Section"}</div>
                        ) : null}
                        {section.cards.map((card) => (
                            <button
                                key={card.instanceId}
                                type="button"
                                onClick={() => onSelect(card.instanceId)}
                                data-tree-card={card.instanceId}
                                className={`flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs ${
                                    state.selectedInstanceId === card.instanceId
                                        ? "bg-alloy-pine/[0.08] font-semibold text-alloy-pine"
                                        : "text-alloy-midnight/70"
                                }`}
                            >
                                {definition.contentSource.resolveLabel(card.contentId ?? "") || card.cardTypeKey}
                            </button>
                        ))}
                    </div>
                ))}
            </div>
            <div className="border-t border-alloy-stone/15 p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Components</div>
                <div className="flex flex-wrap gap-1.5">
                    {definition.cardTypes.map((ct) => (
                        <button
                            key={ct.key}
                            type="button"
                            onClick={() => onAddCard(firstSection, ct.key)}
                            data-component={ct.key}
                            className="rounded-md border border-alloy-stone/20 px-2 py-1 text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                        >
                            {ct.label}
                        </button>
                    ))}
                </div>
            </div>
        </aside>
    );
}

/* ---- Center: live canvas ---- */

export function SurfaceCanvas({
    definition,
    state,
    onSelect,
    onAddCard,
    onSave,
}: {
    definition: SurfaceDefinition;
    state: BuilderState;
    onSelect: (id: string) => void;
    onAddCard: (sectionId: string, cardTypeKey: string) => void;
    onSave: () => void;
}): ReactElement {
    const defaultCardType = definition.cardTypes[0]?.key ?? "kpi";
    return (
        <section className="flex min-w-0 flex-1 flex-col bg-alloy-stone/[0.04]" data-surface-canvas>
            <div className="flex items-center gap-3 border-b border-alloy-stone/15 bg-white px-4 py-2">
                <span className="text-sm font-semibold text-alloy-midnight">{definition.title}</span>
                <span className="text-[11px] text-alloy-midnight/45">Live preview</span>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={!state.dirty}
                    data-surface-publish
                    className="ml-auto rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                    {state.dirty ? "Publish changes" : "Published"}
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {state.doc.sections.map((section) => (
                    <div key={section.sectionId} className="mb-6">
                        {definition.sections !== "none" ? (
                            <h3 className="mb-3 text-base font-semibold text-alloy-midnight">{section.title || "Section"}</h3>
                        ) : null}
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                            {section.cards.map((card) => (
                                <button
                                    key={card.instanceId}
                                    type="button"
                                    onClick={() => onSelect(card.instanceId)}
                                    data-canvas-card={card.instanceId}
                                    className={`text-left ${
                                        state.selectedInstanceId === card.instanceId ? "outline outline-2 outline-alloy-pine" : ""
                                    } rounded-xl`}
                                >
                                    {definition.runtimeRenderer.renderCard(card, {
                                        contentLabel: definition.contentSource.resolveLabel(card.contentId ?? ""),
                                    })}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => onAddCard(section.sectionId, defaultCardType)}
                                data-add-card
                                className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-alloy-pine/30 bg-alloy-pine/[0.05] text-sm font-semibold text-alloy-pine"
                            >
                                <span className="text-lg">＋</span> Add card
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

/* ---- Right: contextual inspector (renders the definition's schema generically) ---- */

export function SurfaceInspector({
    definition,
    card,
    onUpdate,
    onRemove,
}: {
    definition: SurfaceDefinition;
    card: SurfaceCardInstance | null;
    onUpdate: (patch: import("@/lib/platform/surfaceBuilder/surfaceBuilderModel").CardPatch) => void;
    onRemove: () => void;
}): ReactElement {
    const tabs = definition.inspectorSchema.tabs;
    const [activeTab, setActiveTab] = useState<string>(tabs[0]?.key ?? "");
    const tab: InspectorTab | undefined = useMemo(() => tabs.find((t) => t.key === activeTab) ?? tabs[0], [tabs, activeTab]);

    if (!card) {
        return (
            <aside className="w-72 shrink-0 border-l border-alloy-stone/15 bg-white p-4 text-xs text-alloy-midnight/45" data-surface-inspector>
                Select a card to configure it.
            </aside>
        );
    }

    return (
        <aside className="flex w-72 shrink-0 flex-col border-l border-alloy-stone/15 bg-white" data-surface-inspector>
            <div className="flex items-center gap-2 border-b border-alloy-stone/10 px-4 py-3">
                <span className="text-sm font-semibold text-alloy-midnight">
                    {definition.contentSource.resolveLabel(card.contentId ?? "") || card.cardTypeKey}
                </span>
            </div>
            <div className="flex gap-1 border-b border-alloy-stone/10 px-3 pt-2">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveTab(t.key)}
                        className={`px-2.5 py-1.5 text-xs font-semibold ${
                            (tab?.key ?? "") === t.key ? "border-b-2 border-alloy-pine text-alloy-pine" : "text-alloy-midnight/45"
                        }`}
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
            <div className="flex gap-2 border-t border-alloy-stone/10 p-3">
                <button type="button" onClick={onRemove} className="rounded-lg border border-alloy-stone/20 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70">
                    Remove card
                </button>
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
    onUpdate: (patch: import("@/lib/platform/surfaceBuilder/surfaceBuilderModel").CardPatch) => void;
}): ReactElement {
    const cfg = card.config as Record<string, string | undefined>;
    const wrap = (children: ReactElement) => (
        <div className="mb-4">
            <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-alloy-midnight/45">{field.label}</label>
            {children}
        </div>
    );
    const inputClass = "w-full rounded-lg border border-alloy-stone/20 px-2.5 py-1.5 text-xs text-alloy-midnight";

    switch (field.kind) {
        case "content":
            return wrap(
                <select
                    className={inputClass}
                    value={card.contentId ?? ""}
                    onChange={(e) => onUpdate({ contentId: e.target.value || null })}
                >
                    <option value="">Choose content…</option>
                    {definition.contentSource.list().map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.group} · {c.label}
                        </option>
                    ))}
                </select>,
            );
        case "renderer":
            return wrap(
                <div className="flex flex-wrap gap-1.5">
                    {definition.renderers.map((r) => (
                        <button
                            key={r.key}
                            type="button"
                            onClick={() => onUpdate({ config: { rendererKey: r.key } })}
                            className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                                cfg.rendererKey === r.key ? "border-alloy-pine bg-alloy-pine/[0.08] text-alloy-pine" : "border-alloy-stone/20 text-alloy-midnight/70"
                            }`}
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
                <select className={inputClass} value={cfg[field.key] ?? ""} onChange={(e) => onUpdate({ config: { [field.key]: e.target.value } })}>
                    {(field.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>,
            );
        case "toggle":
            return wrap(
                <button
                    type="button"
                    onClick={() => onUpdate({ config: { [field.key]: cfg[field.key] === "on" ? "off" : "on" } })}
                    className="rounded-md border border-alloy-stone/20 px-2.5 py-1 text-[11px] font-semibold text-alloy-midnight/70"
                >
                    {cfg[field.key] === "on" ? "On" : "Off"}
                </button>,
            );
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
                                    if (on) set.delete(o.value);
                                    else set.add(o.value);
                                    onUpdate({ promotedTo: [...set] });
                                }}
                                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${
                                    on ? "border-alloy-pine/40 bg-alloy-pine/[0.08] text-alloy-pine" : "border-alloy-stone/20 text-alloy-midnight/70"
                                }`}
                            >
                                <span>{on ? "✓" : "○"}</span> {o.label}
                            </button>
                        );
                    })}
                </div>,
            );
        case "thresholds":
            return wrap(<p className="text-[11px] text-alloy-midnight/45">Tone thresholds — healthy / watch / critical.</p>);
        default:
            return wrap(<span />);
    }
}

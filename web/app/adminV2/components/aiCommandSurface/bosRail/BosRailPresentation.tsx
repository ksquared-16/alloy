"use client";

import { useState, useRef, type RefObject, type PointerEvent as ReactPointerEvent } from "react";
import { AlertTriangle, ChevronRight, Send } from "lucide-react";

import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
import { BosRailActionIcon } from "@/app/adminV2/components/bos/identity/BosRailActionIcon";
import type { BosRailAttentionPresentation } from "@/lib/bos/bosRailAttentionPresentation";
import { parseBosRailContextChips, type BosRailContextChip } from "@/lib/bos/bosRailContextChips";
import { useBosPresentationControllerOptional } from "@/contexts/BosPresentationControllerContext";
import { dispatchBosCloseRequest } from "@/contexts/BosCommandSessionContext";
import {
    readBosStartersExpanded,
    writeBosStartersExpanded,
} from "@/lib/bos/bosFloatingGeometry";
import type { CommandSurfaceRailStarterSuggestion } from "@/lib/adminV2/aiCommandSurface/commandSurfaceShellLayout";
import type { BosSlashCommandDescriptor } from "@/lib/bos/commandSession/types";
import { BosSlashCommandMenu } from "@/app/adminV2/components/aiCommandSurface/bosRail/BosSlashCommandMenu";
import { derived, neutral, palette } from "@/styles/tokens/colors";

const CMD = {
    textBody: "rgba(39, 63, 82, 0.92)",
    textSupporting: "rgba(39, 63, 82, 0.68)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

const chromeBtnClass =
    "rounded-md border border-white/35 bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white";

export function BosRailHeader(props: {
    contextDisplayLine: string | null;
    statusLabel?: string | null;
    /** Optional structured pills; when provided, replace parse-from-line chips. */
    contextPills?: BosRailContextChip[];
}) {
    const chips =
        props.contextPills && props.contextPills.length > 0
            ? props.contextPills
            : parseBosRailContextChips(props.contextDisplayLine);
    const bos = useBosPresentationControllerOptional();
    const effective = bos?.derivation.effective;
    const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
        null,
    );

    const onFloatDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (effective !== "floating" || !bos) return;
        if ((event.target as HTMLElement).closest("button")) return;
        event.preventDefault();
        dragRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            origX: bos.floatingGeometry.x,
            origY: bos.floatingGeometry.y,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const onFloatDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragRef.current || effective !== "floating" || !bos) return;
        bos.setFloatingGeometry(
            {
                ...bos.floatingGeometry,
                x: dragRef.current.origX + (event.clientX - dragRef.current.startX),
                y: dragRef.current.origY + (event.clientY - dragRef.current.startY),
            },
            { persist: false },
        );
    };

    const onFloatDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragRef.current || !bos) return;
        const final = {
            ...bos.floatingGeometry,
            x: dragRef.current.origX + (event.clientX - dragRef.current.startX),
            y: dragRef.current.origY + (event.clientY - dragRef.current.startY),
        };
        dragRef.current = null;
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            /* ignore */
        }
        bos.setFloatingGeometry(final, { persist: true });
    };

    return (
        <div
            className={`bos-rail-header px-2 pb-2.5 pt-2${
                effective === "floating" ? " cursor-grab active:cursor-grabbing" : ""
            }`}
            style={{ backgroundColor: palette.bendPine }}
            data-command-surface-rail-header="true"
            data-bos-rail-header-bend-pine="true"
            data-bos-float-drag-surface={effective === "floating" ? "true" : undefined}
            onPointerDown={onFloatDragStart}
            onPointerMove={onFloatDragMove}
            onPointerUp={onFloatDragEnd}
            onPointerCancel={onFloatDragEnd}
        >
            <div className="flex items-center justify-between gap-2">
                <BosHeader size="sm" onBendPine className="min-w-0 flex-1" />
                <div className="flex shrink-0 items-center gap-1">
                    {props.statusLabel ?
                        <span
                            className="mr-1 text-[10px] font-medium tabular-nums text-white/80"
                            data-command-surface-thread-status="true"
                            aria-live="polite"
                        >
                            {props.statusLabel}
                        </span>
                    :   null}
                    {bos && effective === "floating" ? (
                        <button
                            type="button"
                            data-bos-reset-float
                            title="Reset size and position"
                            onClick={() => bos.resetFloatingGeometry()}
                            className={chromeBtnClass}
                        >
                            Reset
                        </button>
                    ) : null}
                    {bos && effective === "floating" ? (
                        <button type="button" data-bos-pin onClick={() => bos.pin()} className={chromeBtnClass}>
                            Pin
                        </button>
                    ) : null}
                    {bos && effective === "pinned" ? (
                        <button
                            type="button"
                            data-bos-unpin
                            onClick={() => bos.unpinToFloating()}
                            className={chromeBtnClass}
                        >
                            Unpin
                        </button>
                    ) : null}
                    {bos && (effective === "floating" || effective === "pinned") ? (
                        <button
                            type="button"
                            data-bos-close
                            onClick={() => {
                                dispatchBosCloseRequest();
                                bos.closeToLauncher();
                            }}
                            className={chromeBtnClass}
                        >
                            Close
                        </button>
                    ) : null}
                </div>
            </div>
            {chips.length > 0 ?
                <div className="mt-2.5" data-command-surface-rail-context="true">
                    <p className="text-[11px] font-medium text-white/75">
                        Helping with
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {chips.map((chip, index) => {
                            const accent = index === chips.length - 1 && chips.length > 1;
                            return (
                                <span
                                    key={`${chip.label}-${index}`}
                                    className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-snug"
                                    style={{
                                        borderColor: accent ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.35)",
                                        backgroundColor: accent ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)",
                                        color: neutral.surface,
                                    }}
                                    data-command-surface-context-chip="true"
                                >
                                    {chip.label}
                                </span>
                            );
                        })}
                    </div>
                </div>
            :   null}
        </div>
    );
}

/** Quiet corner resize for floating BOS — not a general window manager. */
export function BosFloatingResizeHandle() {
    const bos = useBosPresentationControllerOptional();
    const dragRef = useRef<{
        startX: number;
        startY: number;
        origW: number;
        origH: number;
    } | null>(null);

    if (!bos || bos.derivation.effective !== "floating") return null;

    const onDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            origW: bos.floatingGeometry.width,
            origH: bos.floatingGeometry.height,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const onMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!dragRef.current) return;
        bos.setFloatingGeometry(
            {
                ...bos.floatingGeometry,
                width: dragRef.current.origW + (event.clientX - dragRef.current.startX),
                height: dragRef.current.origH + (event.clientY - dragRef.current.startY),
            },
            { persist: false },
        );
    };

    const onUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!dragRef.current) return;
        const final = {
            ...bos.floatingGeometry,
            width: dragRef.current.origW + (event.clientX - dragRef.current.startX),
            height: dragRef.current.origH + (event.clientY - dragRef.current.startY),
        };
        dragRef.current = null;
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            /* ignore */
        }
        bos.setFloatingGeometry(final, { persist: true });
    };

    return (
        <button
            type="button"
            data-bos-float-resize-handle
            aria-label="Resize BOS"
            title="Drag to resize"
            className="absolute bottom-1 right-1 z-[2] h-4 w-4 cursor-nwse-resize border-0 bg-transparent p-0"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
        >
            <span
                aria-hidden
                className="block h-full w-full rounded-sm opacity-40"
                style={{
                    background:
                        "linear-gradient(135deg, transparent 50%, rgba(39,63,82,0.45) 50%)",
                }}
            />
        </button>
    );
}

export function BosRailAttentionSection(props: {
    attention: BosRailAttentionPresentation | null;
    onCta: () => void;
}) {
    if (props.attention) {
        return (
            <div
                className="bos-rail-attention mx-2 mb-2.5 rounded-lg border px-2.5 py-2.5"
                style={{
                    borderColor: "rgba(188, 67, 0, 0.22)",
                    backgroundColor: "rgba(188, 67, 0, 0.06)",
                    borderLeftWidth: 3,
                    borderLeftColor: "rgba(188, 67, 0, 0.55)",
                }}
                data-command-surface-rail-attention="true"
            >
                <div className="flex items-start gap-2">
                    <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0"
                        stroke={palette.juniperEmber}
                        strokeWidth={1.75}
                        aria-hidden
                    />
                    <div className="min-w-0">
                        <p
                            className="text-[11px] font-semibold"
                            style={{ color: palette.juniperEmber }}
                        >
                            {props.attention.title}
                        </p>
                        <p className="mt-0.5 text-[12px] leading-snug" style={{ color: CMD.textBody }}>
                            {props.attention.summary}
                        </p>
                        <button
                            type="button"
                            className="mt-1.5 text-[11px] font-semibold underline-offset-2 hover:underline"
                            style={{ color: palette.bendPine }}
                            data-command-surface-rail-attention-cta="true"
                            onClick={props.onCta}
                        >
                            {props.attention.ctaLabel} →
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="bos-rail-attention bos-rail-attention--empty mx-2 mb-1.5 flex items-center gap-1.5 px-2.5 py-1"
            data-command-surface-rail-attention="true"
            data-command-surface-rail-attention-empty="true"
        >
            <span className="text-[11px] font-semibold" style={{ color: CMD.textLabel }}>
                Attention
            </span>
            <span className="text-[11px]" style={{ color: CMD.textSupporting }}>
                · No urgent issues
            </span>
        </div>
    );
}

/** Upper assistant cards stay bounded — show at most this many before "View all". */
const BOS_RAIL_MAX_VISIBLE_STARTERS = 3;

export function BosRailStarterCards(props: {
    suggestions: readonly CommandSurfaceRailStarterSuggestion[];
    onPick: (prompt: string) => void;
}) {
    const [sectionExpanded, setSectionExpanded] = useState(() => readBosStartersExpanded());
    const [showAll, setShowAll] = useState(false);
    const hasOverflow = props.suggestions.length > BOS_RAIL_MAX_VISIBLE_STARTERS;
    const visibleSuggestions =
        hasOverflow && !showAll ?
            props.suggestions.slice(0, BOS_RAIL_MAX_VISIBLE_STARTERS)
        :   props.suggestions;

    const toggleSection = () => {
        setSectionExpanded((prev) => {
            const next = !prev;
            writeBosStartersExpanded(next);
            return next;
        });
    };

    return (
        <div className="bos-rail-starters px-2 pb-2" data-command-surface-rail-starters="true">
            <div className="mb-2 flex items-center justify-between gap-2">
                <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    data-command-surface-rail-starters-collapse="true"
                    aria-expanded={sectionExpanded}
                    onClick={toggleSection}
                >
                    <span className="text-[11px] font-medium" style={{ color: CMD.textSupporting }}>
                        Here are some ways I can help
                    </span>
                    <span className="text-[10px]" style={{ color: CMD.textLabel }} aria-hidden>
                        {sectionExpanded ? "▾" : "▸"}
                    </span>
                </button>
                {sectionExpanded && hasOverflow ?
                    <button
                        type="button"
                        className="shrink-0 text-[10px] font-medium underline-offset-2 hover:underline"
                        style={{ color: palette.bendPine }}
                        data-command-surface-rail-starters-toggle="true"
                        onClick={() => setShowAll((prev) => !prev)}
                    >
                        {showAll ? "Show less" : `View all (${props.suggestions.length})`}
                    </button>
                :   null}
            </div>
            {sectionExpanded ?
                <div className="flex flex-col gap-1.5">
                    {visibleSuggestions.map((suggestion) => (
                        <button
                            key={suggestion.prompt}
                            type="button"
                            className="bos-rail-starter-card group flex items-center gap-2.5 rounded-lg border px-2.5 py-2.5 text-left transition-colors hover:border-[rgba(0,162,131,0.35)] hover:shadow-sm"
                            style={{
                                borderColor: derived.border,
                                backgroundColor: neutral.surface,
                            }}
                            onClick={() => props.onPick(suggestion.prompt)}
                        >
                            <span className="flex shrink-0 items-start pt-0.5">
                                <BosRailActionIcon icon={suggestion.icon} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span
                                    className="block text-[12px] font-semibold leading-snug"
                                    style={{ color: CMD.textBody }}
                                >
                                    {suggestion.title}
                                </span>
                                <span
                                    className="mt-0.5 block text-[11px] leading-snug"
                                    style={{ color: CMD.textSupporting }}
                                >
                                    {suggestion.description}
                                </span>
                            </span>
                            <ChevronRight
                                className="h-4 w-4 shrink-0 opacity-40 transition-opacity group-hover:opacity-70"
                                stroke={CMD.textLabel}
                                strokeWidth={1.75}
                                aria-hidden
                            />
                        </button>
                    ))}
                </div>
            :   null}
        </div>
    );
}

export function BosRailConversationPreview(props: {
    preview: string | null;
    onExpandThread?: () => void;
    hasThread: boolean;
}) {
    return (
        <div
            className="bos-rail-conversation px-2 py-2"
            data-command-surface-rail-conversation-preview="true"
        >
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium" style={{ color: CMD.textSupporting }}>
                    Recent conversation
                </p>
                {props.hasThread && props.onExpandThread ?
                    <button
                        type="button"
                        className="text-[10px] font-medium underline-offset-2 hover:underline"
                        style={{ color: palette.bendPine }}
                        onClick={props.onExpandThread}
                    >
                        View all
                    </button>
                :   null}
            </div>
            {props.preview ?
                <p className="mt-1 text-[12px] leading-snug" style={{ color: CMD.textBody }}>
                    <span style={{ color: CMD.textLabel }}>Last message: </span>
                    {props.preview.length > 80 ? `${props.preview.slice(0, 77)}…` : props.preview}
                </p>
            :   <p className="mt-1 text-[12px] leading-snug" style={{ color: CMD.textSupporting }}>
                    No conversation yet
                </p>
            }
        </div>
    );
}

export function BosRailConversationHeader(props: { onClear?: () => void }) {
    return (
        <div
            className="bos-rail-conversation-header shrink-0 flex items-center justify-between gap-2 px-2 pb-1 pt-1"
            data-command-surface-rail-conversation-header="true"
        >
            <p className="text-[11px] font-medium" style={{ color: CMD.textSupporting }}>
                Recent conversation
            </p>
            {props.onClear ?
                <button
                    type="button"
                    className="text-[10px] font-medium underline-offset-2 hover:underline"
                    style={{ color: CMD.textLabel }}
                    data-command-surface-rail-clear="true"
                    onClick={props.onClear}
                >
                    Clear
                </button>
            :   null}
        </div>
    );
}

export function BosRailComposer(props: {
    value: string;
    busy: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
    inputRef: RefObject<HTMLTextAreaElement | null>;
    slashItems?: BosSlashCommandDescriptor[];
    slashActiveIndex?: number;
    onSlashHighlight?: (index: number) => void;
    onSlashSelect?: (item: BosSlashCommandDescriptor) => void;
    onSlashKeyNavigate?: (direction: "up" | "down" | "enter" | "escape") => boolean;
}) {
    const showSlash = Boolean(props.slashItems && props.value.trimStart().startsWith("/"));
    return (
        <div className="bos-rail-composer shrink-0 px-2 pb-2 pt-1" data-command-surface-rail-composer="true">
            {showSlash && props.slashItems ? (
                <BosSlashCommandMenu
                    items={props.slashItems}
                    activeIndex={props.slashActiveIndex ?? 0}
                    onHighlight={props.onSlashHighlight ?? (() => undefined)}
                    onSelect={props.onSlashSelect ?? (() => undefined)}
                />
            ) : null}
            <div
                className="rounded-xl border px-2.5 py-2.5"
                style={{
                    borderColor: neutral.border,
                    backgroundColor: neutral.surface,
                }}
            >
                <textarea
                    ref={props.inputRef}
                    value={props.value}
                    onChange={(e) => props.onChange(e.target.value)}
                    placeholder="Ask BOS or type / for commands…"
                    className="w-full resize-none bg-transparent outline-none text-[13px] leading-relaxed min-h-[68px] max-h-[120px] py-0.5"
                    rows={3}
                    style={{ color: neutral.textPrimary }}
                    aria-label="AI assistant input"
                    data-command-surface-input="true"
                    onKeyDown={(e) => {
                        if (showSlash && props.onSlashKeyNavigate) {
                            if (e.key === "ArrowDown") {
                                e.preventDefault();
                                props.onSlashKeyNavigate("down");
                                return;
                            }
                            if (e.key === "ArrowUp") {
                                e.preventDefault();
                                props.onSlashKeyNavigate("up");
                                return;
                            }
                            if (e.key === "Escape") {
                                e.preventDefault();
                                props.onSlashKeyNavigate("escape");
                                return;
                            }
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (props.onSlashKeyNavigate("enter")) return;
                            }
                        }
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (!props.busy && props.value.trim()) props.onSubmit();
                        }
                    }}
                />
                <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[10px]" style={{ color: CMD.textLabel }}>
                        / commands · ↵ to send · ⇧↵ new line
                    </span>
                    <button
                        type="button"
                        data-command-surface-submit="true"
                        disabled={props.busy || !props.value.trim() || showSlash}
                        onClick={props.onSubmit}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                            backgroundColor: palette.bendPine,
                            color: neutral.surface,
                        }}
                        aria-label={props.busy ? "Processing" : "Send message"}
                    >
                        <Send className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </button>
                </div>
            </div>
            <p className="mt-2 text-center text-[10px]" style={{ color: CMD.textLabel }}>
                BOS uses AI. Review for accuracy.
            </p>
        </div>
    );
}

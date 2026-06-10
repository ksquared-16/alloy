"use client";

import type { RefObject } from "react";
import { AlertTriangle, ChevronRight, Send } from "lucide-react";

import { BosGenieLampIcon } from "@/app/adminV2/components/bos/BosGenieLampIcon";
import type { BosRailAttentionPresentation } from "@/lib/bos/bosRailAttentionPresentation";
import { parseBosRailContextChips } from "@/lib/bos/bosRailContextChips";
import type { CommandSurfaceRailStarterSuggestion } from "@/lib/adminV2/aiCommandSurface/commandSurfaceShellLayout";
import { derived, neutral, palette } from "@/styles/tokens/colors";

const CMD = {
    textBody: "rgba(39, 63, 82, 0.92)",
    textSupporting: "rgba(39, 63, 82, 0.68)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

export function BosRailHeader(props: { contextDisplayLine: string | null; statusLabel?: string | null }) {
    const chips = parseBosRailContextChips(props.contextDisplayLine);

    return (
        <div className="bos-rail-header px-2 pb-2.5 pt-2" data-command-surface-rail-header="true">
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <BosGenieLampIcon size="md" />
                    <div className="min-w-0">
                        <span
                            className="text-[15px] font-semibold tracking-tight"
                            style={{ color: CMD.textBody }}
                            data-command-surface-rail-title="true"
                        >
                            BOS
                        </span>
                        <span
                            className="block text-[10px] font-medium leading-tight"
                            style={{ color: CMD.textLabel }}
                        >
                            Command Center
                        </span>
                    </div>
                </div>
                {props.statusLabel ?
                    <span
                        className="shrink-0 text-[10px] font-medium tabular-nums"
                        style={{ color: CMD.textSupporting }}
                        data-command-surface-thread-status="true"
                        aria-live="polite"
                    >
                        {props.statusLabel}
                    </span>
                :   null}
            </div>
            {chips.length > 0 ?
                <div className="mt-2.5" data-command-surface-rail-context="true">
                    <p className="text-[11px] font-medium" style={{ color: CMD.textSupporting }}>
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
                                        borderColor:
                                            accent ? "rgba(0, 162, 131, 0.35)" : derived.border,
                                        backgroundColor:
                                            accent ? "rgba(0, 162, 131, 0.08)" : neutral.surface,
                                        color: accent ? palette.bendPine : CMD.textBody,
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
            className="bos-rail-attention mx-2 mb-2.5 rounded-lg border px-2.5 py-2"
            style={{
                borderColor: derived.border,
                backgroundColor: "rgba(246, 248, 252, 0.9)",
            }}
            data-command-surface-rail-attention="true"
            data-command-surface-rail-attention-empty="true"
        >
            <p className="text-[11px] font-semibold" style={{ color: CMD.textBody }}>
                Attention
            </p>
            <p className="mt-0.5 text-[12px] leading-snug" style={{ color: CMD.textSupporting }}>
                No urgent issues detected
            </p>
        </div>
    );
}

export function BosRailStarterCards(props: {
    suggestions: readonly CommandSurfaceRailStarterSuggestion[];
    onPick: (prompt: string) => void;
}) {
    return (
        <div className="bos-rail-starters px-2 pb-2" data-command-surface-rail-starters="true">
            <p className="mb-2 text-[11px] font-medium" style={{ color: CMD.textSupporting }}>
                Here are some ways I can help
            </p>
            <div className="flex flex-col gap-1.5">
                {props.suggestions.map((suggestion) => (
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
                        <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                            style={{ backgroundColor: "rgba(0, 162, 131, 0.08)" }}
                        >
                            <BosGenieLampIcon size="sm" />
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

export function BosRailComposer(props: {
    value: string;
    busy: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
    inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
    return (
        <div className="bos-rail-composer shrink-0 px-2 pb-2 pt-1" data-command-surface-rail-composer="true">
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
                    placeholder="Ask BOS anything..."
                    className="w-full resize-none bg-transparent outline-none text-[13px] leading-relaxed min-h-[68px] max-h-[120px] py-0.5"
                    rows={3}
                    style={{ color: neutral.textPrimary }}
                    aria-label="AI assistant input"
                    data-command-surface-input="true"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (!props.busy && props.value.trim()) props.onSubmit();
                        }
                    }}
                />
                <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[10px]" style={{ color: CMD.textLabel }}>
                        ↵ to send · ⇧↵ new line
                    </span>
                    <button
                        type="button"
                        data-command-surface-submit="true"
                        disabled={props.busy || !props.value.trim()}
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

"use client";

import { useBosCommandSessionOptional } from "@/contexts/BosCommandSessionContext";
import type { BosCommandMode } from "@/lib/bos/commandSession";

/**
 * BOS command-session host — ack + Conversation|Form toggle.
 * Gather bodies are filled by later work packages; this package locks the shell.
 */
export function BosCommandSessionHost() {
    const ctx = useBosCommandSessionOptional();
    const session = ctx?.session ?? null;
    if (!session || session.phase === "discarded") return null;

    const setMode = (mode: BosCommandMode) => {
        if (!ctx || mode === session.mode) return;
        ctx.dispatch({ type: "SET_MODE", mode });
    };

    return (
        <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-white/15 bg-white"
            data-bos-command-session-host="true"
            data-bos-command-session-phase={session.phase}
            data-bos-command-session-mode={session.mode}
        >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-alloy-stone/25 px-3 py-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-alloy-midnight">
                        {session.invocation.displayLabel}
                    </p>
                    <p className="text-[11px] text-alloy-midnight/55">Command session</p>
                </div>
                <div
                    className="flex shrink-0 rounded-md border border-alloy-stone/30 bg-alloy-stone/5 p-0.5"
                    role="tablist"
                    aria-label="Command input mode"
                >
                    <ModeTab
                        active={session.mode === "conversation"}
                        label="Conversation"
                        onClick={() => setMode("conversation")}
                    />
                    <ModeTab
                        active={session.mode === "form"}
                        label="Form"
                        onClick={() => setMode("form")}
                    />
                </div>
                <button
                    type="button"
                    className="shrink-0 rounded-md border border-alloy-stone/30 px-2 py-1 text-[11px] font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/10"
                    data-bos-command-session-discard
                    onClick={() => ctx?.discardSession()}
                >
                    Close
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" data-bos-command-session-body="true">
                <ul className="space-y-2" data-bos-command-session-messages="true">
                    {session.messages.map((message) => (
                        <li
                            key={message.id}
                            className={`rounded-lg px-3 py-2 text-[13px] leading-snug ${
                                message.role === "operator"
                                    ? "ml-6 bg-alloy-bend-pine/10 text-alloy-midnight"
                                    : "mr-4 bg-alloy-stone/10 text-alloy-midnight/90"
                            }`}
                            data-bos-command-session-message={message.kind}
                        >
                            {message.body}
                        </li>
                    ))}
                </ul>

                <div
                    className="mt-4 rounded-lg border border-dashed border-alloy-stone/40 bg-alloy-stone/[0.03] px-3 py-4 text-[12px] text-alloy-midnight/60"
                    data-bos-command-session-mode-body={session.mode}
                >
                    {session.mode === "conversation"
                        ? "Conversation gather will appear here."
                        : "Form gather will appear here."}
                </div>
            </div>
        </div>
    );
}

function ModeTab(props: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={props.active}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                props.active
                    ? "bg-white text-alloy-bend-pine shadow-sm"
                    : "text-alloy-midnight/60 hover:text-alloy-midnight"
            }`}
            data-bos-command-session-mode-tab={props.label.toLowerCase()}
            onClick={props.onClick}
        >
            {props.label}
        </button>
    );
}

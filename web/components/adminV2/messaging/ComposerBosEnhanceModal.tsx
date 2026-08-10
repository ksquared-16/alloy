"use client";

import { useEffect, useState } from "react";

import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
import { BosWorkspaceShell } from "@/app/adminV2/components/bos/identity/BosWorkspaceShell";
import {
    MESSAGING_BOS_ENHANCE_INTENTS,
    MESSAGING_BOS_ENHANCE_TECHNICAL_GAP,
    messagingBosEnhanceComingNextMessage,
} from "@/lib/adminV2/messaging/messagingComposerBosEnhance";
import {
    MESSAGING_MODAL_BODY_CLASS,
    MESSAGING_MODAL_HEADER_CLASS,
    MESSAGING_MODAL_SECONDARY_BUTTON_CLASS,
} from "@/lib/adminV2/messaging/messagingComposerModalChrome";

type ComposerBosEnhanceModalProps = {
    open: boolean;
    onClose: () => void;
    draft: string;
};

export default function ComposerBosEnhanceModal({ open, onClose, draft }: ComposerBosEnhanceModalProps) {
    const [selectedIntent, setSelectedIntent] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setSelectedIntent(null);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-alloy-midnight/40 px-3 py-6"
            data-adminv2-composer-bos-modal="true"
        >
            <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
            <BosWorkspaceShell
                showHeader={false}
                className="relative z-10 max-w-lg shadow-2xl"
                data-testid="composer-bos-enhance-shell"
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="composer-bos-title"
                    className="overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={MESSAGING_MODAL_HEADER_CLASS}>
                        <BosHeader
                            title="BOS"
                            subtitle="Review your draft and choose how BOS should refine it."
                            size="sm"
                            titleId="composer-bos-title"
                        />
                    </div>

                    <div className={MESSAGING_MODAL_BODY_CLASS}>
                        <div className="rounded-lg border border-[#00A283]/15 bg-[#E8F6F2]/35 px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#007a62]/75">
                                Current draft
                            </p>
                            <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-snug text-alloy-midnight/85">
                                {draft.trim() ? draft : "— (empty draft)"}
                            </p>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {MESSAGING_BOS_ENHANCE_INTENTS.map((intent) => (
                                <button
                                    key={intent.id}
                                    type="button"
                                    onClick={() => setSelectedIntent(intent.label)}
                                    className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                                        selectedIntent === intent.label
                                            ? "border-[#00A283]/35 bg-[#00A283]/15 text-alloy-midnight shadow-sm"
                                            : "border-alloy-stone/18 bg-white text-alloy-midnight/70 hover:border-[#00A283]/25 hover:bg-[#E8F6F2]/50"
                                    }`}
                                >
                                    {intent.label}
                                </button>
                            ))}
                        </div>

                        {selectedIntent ?
                            <div
                                className="mt-3 rounded-lg border border-[#00A283]/12 bg-white px-3 py-2 text-[11px] leading-snug text-alloy-midnight/75 shadow-sm"
                                data-adminv2-composer-bos-coming-next="true"
                            >
                                <p className="font-semibold text-[#007a62]">Coming next</p>
                                <p className="mt-1">{messagingBosEnhanceComingNextMessage(selectedIntent)}</p>
                            </div>
                        :   <p className="mt-3 text-[10px] leading-snug text-alloy-midnight/50">
                                {MESSAGING_BOS_ENHANCE_TECHNICAL_GAP}
                            </p>
                        }

                        <div className="mt-4 flex justify-end">
                            <button type="button" onClick={onClose} className={MESSAGING_MODAL_SECONDARY_BUTTON_CLASS}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            </BosWorkspaceShell>
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import { MessageSquare, X } from "lucide-react";

import InboxPanel from "@/app/adminV2/messages/InboxPanel";

export type InboxModalProps = {
    open: boolean;
    onClose: () => void;
};

export default function InboxModal({ open, onClose }: InboxModalProps) {
    const [composeOpen, setComposeOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (!open) setComposeOpen(false);
    }, [open]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-alloy-midnight/45 px-2 py-4 backdrop-blur-[2px] sm:px-4 sm:py-8"
            data-adminv2-inbox-modal="true"
        >
            <button type="button" className="absolute inset-0 cursor-default" aria-label="Close inbox" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="adminv2-inbox-modal-title"
                className="relative z-[1] flex max-h-[min(88vh,42rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-alloy-stone/18 bg-[#f7f6f3] shadow-2xl sm:max-w-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-alloy-stone/15 bg-white px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                        <MessageSquare className="h-4 w-4 shrink-0 text-alloy-midnight/65" aria-hidden strokeWidth={2} />
                        <h2 id="adminv2-inbox-modal-title" className="text-sm font-semibold text-alloy-midnight">
                            Inbox
                        </h2>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setComposeOpen(true)}
                            className="rounded-md bg-[#00A283] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#009276]"
                        >
                            Compose
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex items-center gap-1 rounded-md border border-alloy-stone/20 px-2 py-1 text-[11px] font-semibold text-alloy-forge hover:bg-alloy-stone/[0.06]"
                            aria-label="Close inbox"
                        >
                            <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                            Close
                        </button>
                    </div>
                </div>
                <div className="flex min-h-[min(22rem,65vh)] flex-1 flex-col overflow-hidden">
                    <InboxPanel
                        layout="modal"
                        onClose={onClose}
                        composeOpen={composeOpen}
                        onComposeOpenChange={setComposeOpen}
                    />
                </div>
            </div>
        </div>
    );
}

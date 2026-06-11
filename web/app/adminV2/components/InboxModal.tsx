"use client";

import { useEffect, useState } from "react";
import { MessageSquare, X } from "lucide-react";

import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import InboxPanel from "@/app/adminV2/messages/InboxPanel";

export type InboxModalProps = {
    open: boolean;
    onClose: () => void;
};

export default function InboxModal({ open, onClose }: InboxModalProps) {
    const [composeOpen, setComposeOpen] = useState(false);

    useEffect(() => {
        if (!open) setComposeOpen(false);
    }, [open]);

    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={onClose}
            dataModalAttr="adminv2-inbox-modal"
            ariaLabelledBy="adminv2-inbox-modal-title"
            panelClassName="max-h-[min(88vh,42rem)]"
        >
            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/18 bg-[#f7f6f3]"
                data-adminv2-inbox-modal="true"
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
                            Compose New
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
        </AdminV2WorkspaceBosModalShell>
    );
}

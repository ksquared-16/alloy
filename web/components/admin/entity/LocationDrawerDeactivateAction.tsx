"use client";

import { useState } from "react";
import { RecordDrawerHeaderActionButton } from "@/components/admin/drawer/record/RecordDrawerActionRail";

type Props = {
    canMutate: boolean;
    isActive: boolean;
    onDeactivate: () => Promise<void>;
    onDelete?: () => void;
    deleteBlockedReason?: string | null;
};

export default function LocationDrawerDeactivateAction({
    canMutate,
    isActive,
    onDeactivate,
    onDelete,
    deleteBlockedReason,
}: Props) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    if (!canMutate) return null;

    const runDeactivate = async () => {
        setBusy(true);
        try {
            await onDeactivate();
            setOpen(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="relative">
            <RecordDrawerHeaderActionButton
                label="More actions"
                inquiryWorkflow
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
            />
            {open ? (
                <div className="absolute right-0 top-full z-30 mt-1 min-w-[12rem] rounded-md border border-alloy-stone/30 bg-white py-1 shadow-lg">
                    {isActive ? (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runDeactivate()}
                            className="block w-full px-3 py-2 text-left text-sm text-alloy-midnight/85 hover:bg-alloy-stone/20 disabled:opacity-50"
                        >
                            {busy ? "Updating…" : "Set inactive"}
                        </button>
                    ) : null}
                    {onDelete ? (
                        <button
                            type="button"
                            onClick={() => {
                                setOpen(false);
                                onDelete();
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-alloy-ember hover:bg-alloy-ember/5"
                        >
                            Delete
                        </button>
                    ) : deleteBlockedReason ? (
                        <p className="px-3 py-2 text-xs text-alloy-midnight/55" title={deleteBlockedReason}>
                            {deleteBlockedReason}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

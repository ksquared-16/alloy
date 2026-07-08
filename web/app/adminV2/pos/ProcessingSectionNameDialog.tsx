"use client";

import { useEffect, useState } from "react";
import ProcessingAlloyDialog from "./ProcessingAlloyDialog";

export default function ProcessingSectionNameDialog({
    open,
    onClose,
    onContinue,
}: {
    open: boolean;
    onClose: () => void;
    onContinue: (title: string) => void;
}) {
    const [title, setTitle] = useState("");

    useEffect(() => {
        if (open) setTitle("");
    }, [open]);

    return (
        <ProcessingAlloyDialog
            open={open}
            onClose={onClose}
            title="Add section"
            subtitle="Sections group related questions families complete together."
            testId="processing-section-name-dialog"
            footer={
                <>
                    <button type="button" onClick={onClose} className="rounded-lg border border-alloy-stone/20 px-4 py-2 text-[12px] font-semibold text-alloy-midnight/70">
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!title.trim()}
                        onClick={() => onContinue(title.trim())}
                        className="rounded-lg bg-alloy-bend-pine px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
                        data-testid="section-name-continue"
                    >
                        Add section
                    </button>
                </>
            }
        >
            <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-alloy-midnight">Section title</span>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Child information"
                    autoFocus
                    className="w-full rounded-[10px] border border-alloy-stone/20 px-3 py-2.5 text-[13px] shadow-sm outline-none focus:border-alloy-bend-pine/40 focus:ring-2 focus:ring-alloy-bend-pine/15"
                    data-testid="section-name-input"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && title.trim()) onContinue(title.trim());
                    }}
                />
            </label>
        </ProcessingAlloyDialog>
    );
}

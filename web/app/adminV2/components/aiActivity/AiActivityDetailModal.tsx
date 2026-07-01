"use client";

import { useCallback, useEffect, useState } from "react";
import { neutral, derived } from "@/styles/tokens/colors";
import type { ActivityItem } from "@/lib/adminV2/aiActivity/activityTypes";
import AiActivityDetailPanel from "./AiActivityDetailPanel";

type Props = {
    item: ActivityItem | null;
    open: boolean;
  onClose: () => void;
};

export default function AiActivityDetailModal(props: Props) {
    const { item, open, onClose } = props;
    const [techOpen, setTechOpen] = useState(false);

    useEffect(() => {
        if (!open) setTechOpen(false);
    }, [open, item?.id]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const handleBackdrop = useCallback(
        (e: React.MouseEvent) => {
            if (e.target === e.currentTarget) onClose();
        },
        [onClose]
    );

    if (!open || !item) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
            style={{ backgroundColor: "rgba(39, 63, 82, 0.45)" }}
            onMouseDown={handleBackdrop}
            role="presentation"
        >
            <div
                className="flex max-h-[min(520px,85vh)] w-full max-w-lg flex-col rounded-t-2xl border shadow-xl sm:rounded-2xl"
                style={{
                    backgroundColor: neutral.surface,
                    borderColor: derived.border,
                    boxShadow: derived.cardShadow,
                }}
                onMouseDown={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="ai-activity-detail-title"
            >
                <div className="flex shrink-0 items-center justify-between border-b px-3 py-2" style={{ borderColor: derived.border }}>
                    <span id="ai-activity-detail-title" className="text-sm font-semibold" style={{ color: neutral.textPrimary }}>
                        Activity detail
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md px-2 py-1 text-xs font-medium"
                        style={{ color: derived.textSecondary }}
                    >
                        Close
                    </button>
                </div>
                <AiActivityDetailPanel
                    selected={item}
                    techOpen={techOpen}
                    onToggleTech={() => setTechOpen((o) => !o)}
                />
            </div>
        </div>
    );
}

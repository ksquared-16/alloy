"use client";

import { useEffect, useRef } from "react";

export type CurrentWorkActivityPreviewItem = {
    label: string;
    detail?: string | null;
    occurredAt?: string | null;
};

type Props = {
    open: boolean;
    items: CurrentWorkActivityPreviewItem[];
    onClose: () => void;
};

export default function CurrentWorkActivityPreview({ open, items, onClose }: Props) {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (panelRef.current && target && !panelRef.current.contains(target)) {
                onClose();
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            ref={panelRef}
            className="alloy-os-currentwork__activity-preview"
            data-work-activity-preview="true"
            role="dialog"
            aria-label="Recent activity"
        >
            <div className="alloy-os-currentwork__activity-preview-header">
                <p className="alloy-os-currentwork__activity-preview-title">Recent activity</p>
                <button
                    type="button"
                    className="alloy-os-currentwork__activity-preview-close"
                    onClick={onClose}
                    aria-label="Close activity preview"
                >
                    Close
                </button>
            </div>
            {items.length === 0 ?
                <p className="alloy-os-currentwork__activity-preview-empty">No recent activity yet.</p>
            :   <ul className="alloy-os-currentwork__activity-preview-list">
                    {items.map((item) => (
                        <li key={`${item.label}-${item.occurredAt ?? item.detail ?? "row"}`}>
                            <span className="alloy-os-currentwork__activity-preview-label">{item.label}</span>
                            {item.detail ?
                                <span className="alloy-os-currentwork__activity-preview-detail">{item.detail}</span>
                            :   null}
                            {item.occurredAt ?
                                <span className="alloy-os-currentwork__activity-preview-when">{item.occurredAt}</span>
                            :   null}
                        </li>
                    ))}
                </ul>
            }
        </div>
    );
}

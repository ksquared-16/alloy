"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import type { IdentityFieldRowVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import IdentityFieldGrid from "@/components/admin/focusPanel/identity/IdentityFieldGrid";

type Props = {
    rows: IdentityFieldRowVM[];
    className?: string;
    onEditField?: (fieldRef: string) => void;
};

export default function IdentityExpandedDetails({ rows, className, onEditField }: Props) {
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        const onPointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("mousedown", onPointerDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("mousedown", onPointerDown);
        };
    }, [open]);

    if (rows.length === 0) return null;

    return (
        <div ref={rootRef} className={clsx("identity-expanded-details", className)} data-identity-expanded-root="true">
            <button
                type="button"
                className="identity-expanded-details__toggle"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((value) => !value)}
            >
                {open ? "Hide details" : "View details"}
                <span aria-hidden>{open ? "▴" : "▾"}</span>
            </button>
            {open ? (
                <div id={panelId} className="identity-expanded-details__panel" role="region" aria-label="Expanded identity details">
                    <IdentityFieldGrid rows={rows} onEditField={onEditField} />
                </div>
            ) : null}
        </div>
    );
}

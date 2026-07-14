"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import type { IdentityFieldRowVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import IdentityFieldGrid, { type IdentityFieldSaveArgs } from "@/components/admin/focusPanel/identity/IdentityFieldGrid";

type Props = {
    rows: IdentityFieldRowVM[];
    className?: string;
    personId?: string;
    onSaveField?: (args: IdentityFieldSaveArgs) => Promise<{ ok: boolean } | void>;
    onEditField?: (fieldRef: string) => void;
    /** When true, details render open (Details / Evidence depth). */
    defaultOpen?: boolean;
};

/** Details layer — inspect one identity after selection. */
export default function IdentityRecordDetails({ rows, className, personId, onSaveField, onEditField, defaultOpen = false }: Props) {
    const [open, setOpen] = useState(defaultOpen);
    const panelId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const wasOpenRef = useRef(false);

    useEffect(() => {
        setOpen(defaultOpen);
    }, [defaultOpen]);

    useEffect(() => {
        if (!open) {
            if (wasOpenRef.current) triggerRef.current?.focus();
            wasOpenRef.current = false;
            return;
        }
        wasOpenRef.current = true;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
            }
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

    if (defaultOpen) {
        return (
            <div
                ref={rootRef}
                className={clsx("identity-record-details", className)}
                data-identity-details-root="true"
            >
                <IdentityFieldGrid rows={rows} personId={personId} onSaveField={onSaveField} onEditField={onEditField} />
            </div>
        );
    }

    return (
        <div ref={rootRef} className={clsx("identity-expanded-details", className)} data-identity-expanded-root="true">
            <button
                ref={triggerRef}
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
                <div id={panelId} className="identity-expanded-details__panel" role="region" aria-label="Identity details">
                    <IdentityFieldGrid rows={rows} personId={personId} onSaveField={onSaveField} onEditField={onEditField} />
                </div>
            ) : null}
        </div>
    );
}

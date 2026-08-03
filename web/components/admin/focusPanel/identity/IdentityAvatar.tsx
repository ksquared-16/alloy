"use client";

import { useEffect, useId, useState } from "react";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import type { IdentityAvatarSemanticRole } from "@/lib/adminV2/runtime/focusPanel/focusPanelIdentityAvatar";

type Props = {
    name: string;
    imageUrl?: string | null;
    size?: number;
    visible?: boolean;
    role?: IdentityAvatarSemanticRole;
    recordId?: string;
    /** When true (default) and a photo URL exists, click opens a zoom overlay. */
    allowZoom?: boolean;
};

/**
 * Shared identity avatar. When a profile photo is present, operators can zoom
 * the image without leaving the card. Initials-only avatars stay non-interactive.
 */
export default function IdentityAvatar({
    name,
    imageUrl,
    size = 30,
    visible = true,
    role,
    recordId,
    allowZoom = true,
}: Props) {
    const [zoomed, setZoomed] = useState(false);
    const titleId = useId();
    const url = imageUrl?.trim() || null;
    const canZoom = allowZoom && Boolean(url);

    useEffect(() => {
        if (!zoomed) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setZoomed(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [zoomed]);

    if (!visible) return null;

    const avatar = (
        <CardAvatar
            name={name}
            imageUrl={url}
            size={size}
            role={role}
            recordId={recordId}
        />
    );

    return (
        <>
            {canZoom ? (
                <button
                    type="button"
                    className="identity-avatar-zoom-trigger"
                    data-identity-avatar-zoom-trigger="true"
                    aria-label={`View ${name} photo`}
                    title={`View ${name} photo`}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setZoomed(true);
                    }}
                >
                    {avatar}
                </button>
            ) : (
                avatar
            )}
            {zoomed && url ? (
                <div
                    className="identity-avatar-zoom"
                    data-identity-avatar-zoom="true"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setZoomed(false);
                    }}
                >
                    <div
                        className="identity-avatar-zoom__panel"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <p id={titleId} className="identity-avatar-zoom__title">
                            {name}
                        </p>
                        <img
                            className="identity-avatar-zoom__image"
                            src={url}
                            alt={`${name} profile photo`}
                            data-identity-avatar-zoom-image="true"
                        />
                        <button
                            type="button"
                            className="identity-avatar-zoom__close"
                            data-identity-avatar-zoom-close="true"
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setZoomed(false);
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            ) : null}
        </>
    );
}

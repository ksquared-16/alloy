"use client";

import { useEffect, useState } from "react";
import {
    resolveIdentityAvatar,
    type IdentityAvatarSemanticRole,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelIdentityAvatar";

/**
 * Identity avatar for Focus Panel cards — profile image with an initials fallback.
 *
 * Driven by the evidence model (`resolveIdentityAvatar`), not hardcoded presentation.
 * Uses an `<img>` for the photo (not CSS background-image) so signed storage URLs
 * render reliably; a broken URL falls back to tone-tinted initials.
 *
 * Color conveys identity type/role via semantic tokens — never a sex attribute.
 */
export default function CardAvatar({
    name,
    imageUrl,
    size = 28,
    role,
    recordId,
}: {
    name: string;
    imageUrl?: string | null;
    /** Pixel diameter (default 28 — the compact identity-row size). */
    size?: number;
    role?: IdentityAvatarSemanticRole;
    recordId?: string;
}) {
    const avatar = resolveIdentityAvatar(name, imageUrl, { role, recordId });
    const [imageFailed, setImageFailed] = useState(false);
    useEffect(() => {
        setImageFailed(false);
    }, [avatar.imageUrl]);

    const showImage = Boolean(avatar.imageUrl) && !imageFailed;
    const dimension = `${size}px`;
    return (
        <span
            className="alloy-os-card-avatar"
            data-card-avatar={showImage ? "image" : "initials"}
            data-avatar-tone={avatar.tone}
            data-avatar-role={avatar.role}
            role="img"
            aria-label={avatar.name}
            title={avatar.name}
            style={{
                width: dimension,
                height: dimension,
                fontSize: `${Math.round(size * 0.4)}px`,
            }}
        >
            {showImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs; not static assets
                <img
                    className="alloy-os-card-avatar__img"
                    src={avatar.imageUrl!}
                    alt=""
                    draggable={false}
                    onError={() => setImageFailed(true)}
                />
            ) : (
                <span aria-hidden="true" data-avatar-initials="true">
                    {avatar.initials}
                </span>
            )}
        </span>
    );
}

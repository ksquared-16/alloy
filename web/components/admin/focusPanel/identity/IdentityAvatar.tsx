"use client";

import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import type { IdentityAvatarSemanticRole } from "@/lib/adminV2/runtime/focusPanel/focusPanelIdentityAvatar";

type Props = {
    name: string;
    imageUrl?: string | null;
    size?: number;
    visible?: boolean;
    role?: IdentityAvatarSemanticRole;
    recordId?: string;
};

export default function IdentityAvatar({
    name,
    imageUrl,
    size = 30,
    visible = true,
    role,
    recordId,
}: Props) {
    if (!visible) return null;
    return (
        <CardAvatar
            name={name}
            imageUrl={imageUrl ?? null}
            size={size}
            role={role}
            recordId={recordId}
        />
    );
}

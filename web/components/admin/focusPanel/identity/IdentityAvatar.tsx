"use client";

import CardAvatar from "@/components/admin/focusPanel/CardAvatar";

type Props = {
    name: string;
    imageUrl?: string | null;
    size?: number;
    visible?: boolean;
};

export default function IdentityAvatar({ name, imageUrl, size = 30, visible = true }: Props) {
    if (!visible) return null;
    return <CardAvatar name={name} imageUrl={imageUrl ?? null} size={size} />;
}

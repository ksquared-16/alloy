import {
    resolveIdentityAvatar,
    type IdentityAvatarSemanticRole,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelIdentityAvatar";

/**
 * Identity avatar for Focus Panel cards — profile image with an initials fallback.
 *
 * Driven by the evidence model (`resolveIdentityAvatar`), not hardcoded presentation.
 * Only cards that declare `supportsProfileImage` render it (Household contacts/members,
 * Child). Renders as a CSS background-image so a broken/empty URL degrades to the
 * tone-tinted initials with no layout shift.
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
    const dimension = `${size}px`;
    return (
        <span
            className="alloy-os-card-avatar"
            data-card-avatar={avatar.imageUrl ? "image" : "initials"}
            data-avatar-tone={avatar.tone}
            data-avatar-role={avatar.role}
            role="img"
            aria-label={avatar.name}
            title={avatar.name}
            style={{
                width: dimension,
                height: dimension,
                fontSize: `${Math.round(size * 0.4)}px`,
                ...(avatar.imageUrl ? { backgroundImage: `url(${JSON.stringify(avatar.imageUrl)})` } : {}),
            }}
        >
            {avatar.imageUrl ? null : <span aria-hidden="true">{avatar.initials}</span>}
        </span>
    );
}

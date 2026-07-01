"use client";

/** Initials / photo avatar — shared drawer relationship identity surface. */
export default function PersonDrawerIdentityAvatar({
    displayName,
    initials,
    photoUrl,
    imageUrl,
    size = "md",
}: {
    displayName: string;
    initials: string;
    /** Legacy / person record photo URL. */
    photoUrl?: string | null;
    /** Future profile upload source — same slot as photoUrl. */
    imageUrl?: string | null;
    size?: "sm" | "md" | "lg";
}) {
    const dim =
        size === "sm" ? "h-9 w-9 text-[11px]" : size === "lg" ? "h-14 w-14 text-[15px]" : "h-11 w-11 text-[13px]";
    const resolvedPhoto = String(photoUrl ?? imageUrl ?? "").trim();
    if (resolvedPhoto) {
        return (
            <img
                src={resolvedPhoto}
                alt=""
                className={`${dim} shrink-0 rounded-full border border-alloy-stone/20 object-cover shadow-sm`}
                data-person-drawer-avatar="photo"
            />
        );
    }

    return (
        <div
            className={`${dim} flex shrink-0 items-center justify-center rounded-full border border-alloy-stone/18 bg-alloy-juniper/[0.06] font-semibold tracking-wide text-alloy-midnight/75 shadow-sm`}
            aria-hidden
            data-person-drawer-avatar="initials"
            title={displayName}
        >
            {initials}
        </div>
    );
}

"use client";

/** Initials avatar — person identity only; future-ready for attendance/classroom surfaces. */
export default function PersonDrawerIdentityAvatar({
    displayName,
    initials,
    photoUrl,
    size = "md",
}: {
    displayName: string;
    initials: string;
    photoUrl?: string | null;
    size?: "sm" | "md" | "lg";
}) {
    const dim =
        size === "sm" ? "h-9 w-9 text-[11px]" : size === "lg" ? "h-14 w-14 text-[15px]" : "h-11 w-11 text-[13px]";
    if (photoUrl) {
        return (
            <img
                src={photoUrl}
                alt=""
                className={`${dim} shrink-0 rounded-full border border-alloy-stone/20 object-cover shadow-sm`}
                data-person-drawer-avatar="photo"
            />
        );
    }

    return (
        <div
            className={`${dim} flex shrink-0 items-center justify-center rounded-full border border-alloy-blue/20 bg-alloy-blue/[0.08] font-semibold tracking-wide text-alloy-midnight/75 shadow-sm`}
            aria-hidden
            data-person-drawer-avatar="initials"
            title={displayName}
        >
            {initials}
        </div>
    );
}

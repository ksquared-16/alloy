/** Best-effort operator display name from auth email when no person name is wired. */
export function operatorDisplayNameFromEmail(email: string | null | undefined): string | null {
    const raw = email?.trim();
    if (!raw || raw === "Unknown") return null;
    const local = raw.split("@")[0]?.trim();
    if (!local || local.length < 2) return null;
    const words = local
        .replace(/[._+-]+/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return words.length > 0 ? words.join(" ") : null;
}

// UI-5A — recipient contact normalization (self-contained; mirrors drawerEmailRecipients logic).
export function trimEmail(email?: string | null): string | null {
    const s = typeof email === "string" ? email.trim() : "";
    if (!s || !s.includes("@")) return null;
    return s.toLowerCase();
}

/** E.164-ish SMS destination when usable; null when fewer than 10 digits. */
export function smsToOrNull(raw?: string | null): string | null {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) return null;
    const digits = s.replace(/[^0-9]/g, "");
    if (digits.length < 10) return null;
    return s.startsWith("+") ? s : `+${digits.length === 10 ? "1" + digits : digits}`;
}

export function personLabel(p: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
} | null): string {
    if (!p) return "—";
    const fn = ((p.full_name ?? "") as string).trim();
    if (fn) return fn;
    const a = ([p.first_name, p.last_name].filter(Boolean) as string[]).join(" ").trim();
    return a || "—";
}

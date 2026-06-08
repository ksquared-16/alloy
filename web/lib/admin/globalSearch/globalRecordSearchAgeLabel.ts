/** Compact child age for global search secondary lines — e.g. 4y 2mo, 11mo. */
export function globalSearchAgeLabelFromDob(dobIso: string | null | undefined): string | null {
    const raw = String(dobIso ?? "").trim();
    if (!raw) return null;
    const d = new Date(raw.slice(0, 10));
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - d.getFullYear();
    let months = now.getMonth() - d.getMonth();
    if (now.getDate() - d.getDate() < 0) months -= 1;
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    if (years < 0) return null;
    if (years >= 1) {
        return months > 0 ? `${years}y ${months}mo` : `${years}y`;
    }
    const totalMonths = Math.max(0, years * 12 + months);
    return totalMonths > 0 ? `${totalMonths}mo` : null;
}

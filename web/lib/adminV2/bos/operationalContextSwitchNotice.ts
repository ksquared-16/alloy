/** One-line notice when active operational context changes (not on initial seed). */

export function operationalContextSwitchNoticeText(label: string): string {
    const t = label.trim();
    if (!t) return "Switched active record.";
    return `Switched active record to ${t}`;
}

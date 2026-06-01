function channelLabel(ch: string | null | undefined): string {
    const c = (ch ?? "").trim().toLowerCase();
    if (c === "email") return "Email";
    if (c === "sms") return "SMS";
    if (c === "in_app") return "Internal";
    return ch?.trim() || "";
}

/** Compact secondary line: Location · Status · Channel (no duplicate labels). */
export function formatMessagingThreadContextLine(params: {
    location?: string | null;
    status?: string | null;
    channel?: string | null;
}): string | null {
    const parts: string[] = [];
    if (params.location?.trim()) parts.push(params.location.trim());
    if (params.status?.trim()) parts.push(params.status.trim());
    const ch = channelLabel(params.channel);
    if (ch) parts.push(ch);
    return parts.length > 0 ? parts.join(" · ") : null;
}

/** Compact metadata: Children: … · Related contacts: … */
export function formatMessagingThreadMetadataLine(params: {
    children?: string | null;
    relatedContacts?: string | null;
}): string | null {
    const parts: string[] = [];
    if (params.children?.trim()) parts.push(`Children: ${params.children.trim()}`);
    if (params.relatedContacts?.trim()) parts.push(`Related contacts: ${params.relatedContacts.trim()}`);
    return parts.length > 0 ? parts.join(" · ") : null;
}

export function shouldShowMessagingHouseholdFallback(params: {
    contactDisplay?: string | null;
    householdDisplay?: string | null;
}): boolean {
    const household = params.householdDisplay?.trim() ?? "";
    const contact = params.contactDisplay?.trim() ?? "";
    if (!household) return false;
    if (!contact) return true;
    return household.toLowerCase() !== contact.toLowerCase();
}

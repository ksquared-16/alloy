import { splitPersonName } from "@/lib/intake/normalize/personName";

function cleanNameToken(raw: string): string {
    return raw.replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
}

function isFirstNameToken(token: string): boolean {
    return /^[A-Za-z][\w'\-]+$/.test(token.trim());
}

/**
 * Expand multi-person phrases where a shared surname appears once at the end.
 * Alex and Jason Lyons → Alex Lyons, Jason Lyons
 */
export function expandSharedSurnameNames(raw: string): string[] {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    const chunks = trimmed
        .split(/\s+and\s+|,/i)
        .map((c) => cleanNameToken(c))
        .filter(Boolean);
    if (chunks.length === 0) return [];
    if (chunks.length === 1) {
        const single = splitPersonName(chunks[0]!);
        if (single) return [`${single.first} ${single.last}`.trim()];
        if (isFirstNameToken(chunks[0]!)) return [chunks[0]!];
        return [];
    }

    const sharedSurname = splitPersonName(chunks[chunks.length - 1]!)?.last?.trim() ?? null;
    const out: string[] = [];

    for (const chunk of chunks) {
        const split = splitPersonName(chunk);
        if (split?.first && split.last) {
            out.push(`${split.first} ${split.last}`.trim());
            continue;
        }
        if (isFirstNameToken(chunk) && sharedSurname) {
            out.push(`${chunk} ${sharedSurname}`.trim());
            continue;
        }
        if (split?.first) {
            out.push(split.first);
            continue;
        }
    }

    return out.filter(Boolean);
}

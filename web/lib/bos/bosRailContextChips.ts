/** Parse operator-facing BOS context lines into header chips (presentation only). */

export type BosRailContextChip = {
    label: string;
};

export function parseBosRailContextChips(displayLine: string | null | undefined): BosRailContextChip[] {
    const line = displayLine?.trim();
    if (!line) return [];

    if (line.includes(" — ")) {
        const [kind, ...rest] = line.split(" — ");
        const name = rest.join(" — ").trim();
        const chips: BosRailContextChip[] = [];
        if (kind.trim()) chips.push({ label: kind.trim() });
        if (name) chips.push({ label: name });
        return chips;
    }

    return [{ label: line }];
}

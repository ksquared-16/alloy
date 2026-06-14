// UI-5C — pure helpers for composer recipient selection (no React, no I/O).
import type { RecipientVM, ComposerChannel } from "./types";

export function isRecipientSelected(selected: readonly string[], id: string): boolean {
    return selected.includes(id);
}

/** Toggle a recipient; ineligible recipients can never be selected (no-op). */
export function toggleRecipientSelection(selected: readonly string[], id: string, eligible: boolean): string[] {
    if (selected.includes(id)) return selected.filter((x) => x !== id);
    if (!eligible) return [...selected];
    return [...selected, id];
}

export function isRecipientEligible(r: RecipientVM, channel: ComposerChannel): boolean {
    return channel === "note" ? true : r.channels[channel].available;
}

/** "Sarah Rivera" | "Sarah Rivera +1" | "Select recipients" */
export function selectionSummary(selectedIds: readonly string[], recipients: readonly RecipientVM[]): string {
    if (selectedIds.length === 0) return "Select recipients";
    const byId = new Map(recipients.map((r) => [r.id, r]));
    const first = byId.get(selectedIds[0]);
    const firstName = first?.displayName ?? "1 recipient";
    return selectedIds.length === 1 ? firstName : `${firstName} +${selectedIds.length - 1}`;
}

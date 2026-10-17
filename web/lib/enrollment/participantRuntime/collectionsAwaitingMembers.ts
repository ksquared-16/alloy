/**
 * THE PEOPLE A FAMILY STILL HAS TO NAME — asked as a step of the journey, not found in a review.
 *
 * Relationship collections (Parents and guardians, Emergency contacts, Other children…) were only
 * reachable through the review's "Make a change": a parent pressed "Review paperwork", met a document
 * that could not be finished, and read "Emergency contacts needs 2 complete — use Make a change".
 * The compiled artifact already knows every SHOWN collection and how many COMPLETE members it has
 * against how many it needs — the Forms authority's own count (#1463). This reads exactly that, so
 * the journey can ask for the people first, in the same rows the review edits and the submit sends.
 *
 * Pure.
 */

import type { CompiledArtifact, CompiledArtifactControl } from "@/lib/enrollment/participantRuntime/compileParticipantArtifact";

export type CollectionAwaitingMembers = {
    readonly fieldId: string;
    readonly label: string;
    readonly complete: number;
    readonly needed: number;
};

function memberCount(control: CompiledArtifactControl): { complete: number; needed: number } | null {
    const v = control.value as { complete?: unknown; needed?: unknown } | null;
    if (!v || typeof v !== "object") return null;
    const complete = typeof v.complete === "number" ? v.complete : null;
    const needed = typeof v.needed === "number" ? v.needed : null;
    return complete == null || needed == null ? null : { complete, needed };
}

/** Shown, required collections with fewer complete members than they need, in document order. */
export function collectionsAwaitingMembers(artifact: CompiledArtifact | null): CollectionAwaitingMembers[] {
    if (!artifact) return [];
    const out: CollectionAwaitingMembers[] = [];
    const seen = new Set<string>();
    for (const section of artifact.sections) {
        for (const control of section.controls) {
            if (control.input_type !== "group" || !control.required || seen.has(control.field_id)) continue;
            const count = memberCount(control);
            if (!count || count.complete >= count.needed) continue;
            seen.add(control.field_id);
            out.push({ fieldId: control.field_id, label: control.participant_label ?? control.label, ...count });
        }
    }
    return out;
}

/** "Emergency contacts" → "emergency contact"; "Parents and guardians" → "parent or guardian". */
export function oneMemberOf(label: string): string {
    const words = label.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words
        .map((w) => (w === "and" ? "or" : w === "children" ? "child" : w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
        .join(" ");
}

/** The prompt for a collection still short of its minimum. */
export function collectionPrompt(c: CollectionAwaitingMembers): { title: string; detail: string } {
    const one = oneMemberOf(c.label);
    const article = /^[aeiou]/.test(one) ? "an" : "a";
    // "other child in your household" already says "another" — never "Add an other child".
    const title = one.startsWith("other ")
        ? `Add another ${one.slice("other ".length)}`
        : c.complete === 0
          ? `Add ${article} ${one}`
          : `Add another ${one}`;
    const detail =
        c.needed === 1
            ? `We need one ${one}.`
            : `We need ${c.needed} — ${c.complete} added so far.`;
    return { title, detail };
}

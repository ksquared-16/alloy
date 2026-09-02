/**
 * Who is an UNBOUND destination about? Read from the packet's own layout, never its words.
 *
 * ## The defect this closes
 *
 * 131 of the 173 destinations in the certified packet carry no `field_source` at all. A need with no
 * canonical entity has no subject, so the conversation fell back to emitting the authored label as
 * the whole question — a parent was asked, in its entirety, "Middle Name?". The runtime knew it was
 * talking about Malik and said none of it.
 *
 * ## The evidence, and why it is not label-sniffing
 *
 * The Oregon CIS lays its first page out like this:
 *
 * ```
 *   1  Childs Last Name              -> child
 *   2  First Name                    -> child
 *   3  Middle Name                   -> UNBOUND
 *   4  Birth Date                    -> customer_member (the child)
 *   5  Parents Or Guardians Names    -> guardian
 * ```
 *
 * Position 3 sits between child-bound destinations on both sides. That is the same thing a person
 * filling the form in reads: a box's subject is the block it sits in. Nothing here looks at the
 * word "Middle" — the rule works identically for a box labelled in Spanish, or labelled nothing at
 * all, and it stops dead at position 5 where the guardian block begins.
 *
 * ## Two-sided unanimity, or nothing
 *
 * Inference requires bound neighbours on BOTH sides, within a short window, agreeing on the entity.
 * One-sided evidence is refused deliberately: the vaccine dose rows at positions 7+ have
 * `person:phone` as their nearest preceding bound field and nothing bound after them, and a
 * one-sided rule would cheerfully attribute a diphtheria dose to the responding adult. Failing
 * closed costs a question its subject; guessing gives it the wrong one.
 *
 * Pure. No I/O.
 */

import type { FormSchemaV1 } from "@/lib/forms/schema";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";

/** How far from the box the layout is still evidence about it. */
const NEIGHBOUR_WINDOW = 2;

type BoundEntity = { readonly fieldId: string; readonly entity: string | null };

/**
 * The canonical entity an unbound destination sits among, or null.
 *
 * Null is the common and correct answer — most unbound destinations are their own subject (a
 * school's own question about the family), and claiming one would be worse than leaving the
 * question to stand on the words the school wrote.
 */
export function inferUnboundDestinationEntity(
    schema: FormSchemaV1,
    fieldId: string,
): string | null {
    const sections = (schema as { sections?: readonly { field_ids?: readonly string[] }[] }).sections ?? [];

    const entityByField = new Map<string, string | null>();
    walkScalarFormFields(schema, (field) => {
        const entity = field.field_source?.entity_type?.trim().toLowerCase() || null;
        entityByField.set(field.id, entity);
    });
    // Only a destination that HAS no entity can inherit one.
    if (!entityByField.has(fieldId) || entityByField.get(fieldId)) return null;

    for (const section of sections) {
        const ids = section.field_ids ?? [];
        const at = ids.indexOf(fieldId);
        if (at < 0) continue;

        const ordered: BoundEntity[] = ids.map((id) => ({ fieldId: id, entity: entityByField.get(id) ?? null }));

        // The nearest bound destination before and after, within the window.
        let before: string | null = null;
        for (let i = at - 1; i >= 0 && at - i <= NEIGHBOUR_WINDOW; i -= 1) {
            const entity = ordered[i]?.entity;
            if (entity) { before = entity; break; }
        }
        let after: string | null = null;
        for (let i = at + 1; i < ordered.length && i - at <= NEIGHBOUR_WINDOW; i += 1) {
            const entity = ordered[i]?.entity;
            if (entity) { after = entity; break; }
        }

        /*
         * BOTH sides, AGREEING. See the header: one-sided evidence is how a vaccine dose acquires
         * the responding adult as its subject.
         */
        if (before && after && sameSubject(before, after)) return before;
        return null;
    }
    return null;
}

/**
 * Do two entity spellings denote the same subject?
 *
 * `fieldScope.ts` already rules that `child` and `customer_member` are the same person, and the CIS
 * uses both within three boxes of each other — so an equality test on the raw string would refuse
 * the very case this exists for.
 */
const CHILD_ENTITIES = new Set(["customer_member", "child", "inquiry_child", "student"]);

function sameSubject(a: string, b: string): boolean {
    if (a === b) return true;
    return CHILD_ENTITIES.has(a) && CHILD_ENTITIES.has(b);
}

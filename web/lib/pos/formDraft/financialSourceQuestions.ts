/**
 * Questions on an imported form that are really money the school sets.
 *
 * Paper leaves a blank for the tuition ("Tuition Child 1 $____", "agree to pay $____ per month") and
 * the importer reads that blank as a question. Discovery already knows better — it routes the concept
 * to `FINANCIAL_PAYMENT` — but the form view kept asking the family to write the school's own amount
 * in, which is the one thing a form must never own: Financials owns the amount, the Enrollment
 * Packet's financial requirement charges it.
 *
 * This is a NOTICE, never a removal. The operator is told which questions these are and why, and
 * removes them in one click through the normal Studio save — or keeps them, if the paperwork means
 * something else by them.
 *
 * Pure. Reads only the draft's own discovery.
 */

import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";
import { draftFieldsForConcept } from "@/lib/pos/discovery/applyDiscovery";

export function financialQuestionsOnDraft(
    draft: Pick<StoredFormDraftPreview, "fields" | "configuration_discovery">,
): ReadonlyArray<{ readonly id: string; readonly label: string }> {
    const discovery = draft.configuration_discovery;
    if (!discovery?.proposals?.length) return [];
    const out = new Map<string, string>();
    for (const p of discovery.proposals) {
        if (p.disposition !== "financial_payment") continue;
        for (const f of draftFieldsForConcept(draft as StoredFormDraftPreview, discovery, p.candidate_id)) {
            if (!out.has(f.id)) out.set(f.id, f.label.trim());
        }
    }
    return [...out].map(([id, label]) => ({ id, label }));
}

/**
 * CANONICAL HEALTH READ MODEL → THE LOCKED HEALTH & SAFETY CARD'S INPUT.
 *
 * ── WHY AN ADAPTER AND NOT A SECOND CARD ──
 *
 * There were two implementations of one approved card. The production approximation rendered the
 * enrollment requirements as a CLOUD OF PILLS — "Physical / health assessment missing",
 * "Immunization record missing", and so on — which reads as four warnings. The approved specimen
 * renders them as ENROLLMENT HEALTH: a two-column list, name on the left, the date or the word
 * "Missing" on the right, as ONE checklist with four rows. It also dropped the section grammar
 * entirely (CRITICAL / HEALTH / ENROLLMENT HEALTH) and the emergency-contact line.
 *
 * There is now ONE presentation (`components/operationalCards/HealthSafetyCard.tsx`), rendered by
 * both the lab and the real Focus Panel. The lab supplies fixture evidence, production supplies the
 * canonical read model, and both arrive here in the same shape.
 *
 * The mapping is deliberately DUMB. Every health judgement — which facts are critical, what treats
 * what, whether a requirement is satisfied — was already made by `buildHealthSafetyCardVM` from
 * canonical truth. This renames, formats and NESTS; it decides nothing.
 *
 * ── THE ONE STRUCTURAL MOVE ──
 *
 * Medications nest under the need they support, because that is how an operator reads them:
 * "asthma, and here is the inhaler for it", not two lists to cross-reference. The read model
 * already resolved the join (`relatedFactId`, `treatsLabel`), so this only groups by it. A
 * medication whose related fact is absent from the care list stays on its own rather than being
 * silently attached to whichever need happens to precede it.
 */

import type {
    HealthSafetyCardVM,
    HealthSafetyFact,
    HealthSafetyMedication,
} from "@/lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM";
import type {
    HealthCritical,
    HealthEvidence,
    HealthMedication,
    HealthNeed,
    HealthRequirement,
} from "@/lib/cardLab/cardLabTypes";

const SEVERITY_LABELS: Record<string, string> = {
    life_threatening: "Life-threatening",
    severe: "Severe",
    moderate: "Moderate",
    mild: "Mild",
};

/** "2026-07-14" → "Jul 14". Null when there is no date to show — never a placeholder. */
function shortDate(ymd: string | null | undefined): string | null {
    if (!ymd) return null;
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Dosage · frequency · where it is kept — the line staff act on, assembled from what exists. */
function medicationDetail(m: HealthSafetyMedication): string | null {
    const parts = [
        m.dosage,
        m.asNeeded ? "As needed" : m.frequency,
        m.storageLocation,
    ].filter((p): p is string => Boolean(p && p.trim()));
    return parts.length ? parts.join(" · ") : m.instruction;
}

function toMedication(m: HealthSafetyMedication): HealthMedication {
    return { name: m.label, detail: medicationDetail(m) };
}

function toCritical(f: HealthSafetyFact): HealthCritical {
    return {
        name: f.label,
        severity: f.severity ? SEVERITY_LABELS[f.severity] ?? f.severity : "",
        reaction: f.effect,
        response: f.instruction,
    };
}

export function adaptHealthVmToHealthCard(vm: HealthSafetyCardVM): HealthEvidence {
    /*
     * Group medications by the fact they treat. `relatedFactId` is the canonical join and is
     * preferred; `treatsLabel` is only a fallback for a medication whose target is not in the care
     * list this card received.
     */
    const byRelatedFact = new Map<string, HealthSafetyMedication[]>();
    const unattached: HealthSafetyMedication[] = [];
    const careFactIds = new Set(vm.careFacts.map((f) => f.factId));
    const criticalFactIds = new Set(vm.criticalFacts.map((f) => f.factId));

    for (const m of vm.medications) {
        const related = m.relatedFactId;
        if (related && (careFactIds.has(related) || criticalFactIds.has(related))) {
            byRelatedFact.set(related, [...(byRelatedFact.get(related) ?? []), m]);
        } else {
            unattached.push(m);
        }
    }

    const needs: HealthNeed[] = vm.careFacts.map((f) => ({
        name: f.label,
        detail: f.effect ?? f.instruction,
        medications: (byRelatedFact.get(f.factId) ?? []).map(toMedication),
    }));

    /*
     * Dietary and accommodation notes are configured child fields, not health facts, but they
     * belong to the same operator question — "what shapes this child's daily care". They render as
     * needs with no medication rather than as a fourth section.
     */
    const profileNeeds: HealthNeed[] = vm.profileFacts.map((p) => ({
        name: p.label,
        detail: p.value,
        medications: [],
    }));

    const requirements: HealthRequirement[] = vm.requirements.map((r) => {
        const doc =
            r.satisfiedByDocumentId ?
                vm.documents.find((d) => d.documentId === r.satisfiedByDocumentId) ?? null
            :   null;
        const when = shortDate(doc?.uploadedAt ? doc.uploadedAt.slice(0, 10) : null);
        return {
            name: r.label,
            // "Missing" is a VALUE in this column, which is what keeps the section a checklist
            // rather than a row of warnings.
            value: r.satisfied ? when ?? "On file" : "Missing",
            missing: !r.satisfied,
        };
    });

    const contacts = [...vm.emergencyContacts].sort(
        (a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER),
    );

    return {
        // Lab-only specimen label; never rendered inside the card.
        caseLabel: "",
        critical: vm.criticalFacts.map(toCritical),
        needs: [...needs, ...profileNeeds],
        unattachedMedications: unattached.map(toMedication),
        requirements,
        emergencyCount: contacts.length,
        emergencyPrimary: contacts[0]?.name ?? null,
    };
}

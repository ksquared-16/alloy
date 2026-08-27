/**
 * CANONICAL HEALTH READ MODEL → THE LOCKED HEALTH DETAIL CARD'S INPUT.
 *
 * The detail PROJECTS the existing owners; it does not copy them into a second health model. Every
 * field below is already resolved by `buildHealthSafetyCardVM` from `person_health_facts`,
 * documents, evaluated requirements and relationships — this renames and groups, and decides
 * nothing.
 *
 * ── THE BOUNDARIES THE DETAIL MUST NOT BLUR ──
 *
 * MEDICATION AUTHORIZATION IS A REQUIREMENT, not a property of the medication. A medication fact
 * says what is given; the authorization says whether the paperwork permitting it is on file. They
 * have different owners and different lifecycles, and collapsing them would let a missing form read
 * as a missing medicine. So `authorization` is looked up in the REQUIREMENTS, never invented from
 * the medication row.
 *
 * DOCUMENTS ARE EVIDENCE, not booleans. A requirement is satisfied BY a document; the document has
 * its own received date, status and version, and those stay visible rather than collapsing into a
 * tick. "Satisfied" with no evidence behind it is exactly the claim this card exists to avoid.
 *
 * EMERGENCY CONTACTS REMAIN RELATIONSHIP-OWNED. They are projected here because an operator caring
 * for a child needs them in one place, and they are never written from here.
 *
 * PHYSICIAN AND DENTIST ARE ABSENT. Their canonical relationship roles do not exist yet, and adding
 * flat fields for them would be inventing medical truth to make a card look complete.
 */

import type {
    HealthSafetyCardVM,
    HealthSafetyDocument,
    HealthSafetyFact,
    HealthSafetyMedication,
} from "@/lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM";
import type {
    HealthAllergyDetail,
    HealthConditionDetail,
    HealthDetailEvidence,
    HealthDocumentRow,
    HealthEmergencyContact,
    HealthMedicationDetail,
    HealthProvenance,
    HealthRequirementRow,
} from "@/lib/cardLab/cardLabTypes";

const SEVERITY_LABELS: Record<string, string> = {
    life_threatening: "Life-threatening",
    severe: "Severe",
    moderate: "Moderate",
    mild: "Mild",
};

const SOURCE_LABELS: Record<string, string> = {
    parent_reported: "Parent reported",
    document_extraction: "Document extraction",
    operator_confirmed: "Operator confirmed",
    operator_entered: "Operator entered",
};

function shortDate(value: string | null | undefined): string | null {
    if (!value) return null;
    const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Where a fact came from, and whether anyone confirmed it — reused provenance, not a new audit
 * system. `confirmedAt` is the difference between "a parent said this" and "we checked".
 */
function provenanceOf(fact: HealthSafetyFact): HealthProvenance {
    const kind = fact.provenance.sourceKind;
    return {
        source: SOURCE_LABELS[kind] ?? kind ?? "Recorded",
        detail: fact.provenance.confirmedAt ? `Confirmed ${shortDate(fact.provenance.confirmedAt)}` : null,
        // CONFIRMED is the difference between "a parent said this" and "we checked", and it is a
        // timestamp on the fact — never an assumption from the source kind.
        confirmed: Boolean(fact.provenance.confirmedAt),
    };
}

function effectiveOf(fact: HealthSafetyFact): string {
    return shortDate(fact.effectiveFrom) ?? "Effective date not recorded";
}

export function adaptHealthVmToHealthDetail(
    vm: HealthSafetyCardVM,
    /**
     * The panel's own name for the subject. `vm.participant.displayName` is populated only when the
     * health read resolved a name of its own, and "This child" on a card about one specific child
     * is a worse answer than the name the operator is already looking at.
     */
    subjectLabel?: string | null,
): HealthDetailEvidence {
    const allFacts = [...vm.criticalFacts, ...vm.careFacts];
    const labelByFactId = new Map(allFacts.map((f) => [f.factId, f.label]));

    const allergies: HealthAllergyDetail[] = allFacts
        .filter((f) => f.kind === "allergy")
        .map((f) => {
            const rescue = vm.medications.find((m) => m.relatedFactId === f.factId);
            return {
                allergen: f.label,
                severity: f.severity ? SEVERITY_LABELS[f.severity] ?? f.severity : "Not graded",
                reaction: f.effect ?? "Reaction not recorded",
                careInstruction: f.instruction ?? "No care instruction recorded",
                treatment: rescue?.label ?? null,
                emergencyMedication: rescue?.storageLocation ?? null,
                effective: effectiveOf(f),
                provenance: provenanceOf(f),
            };
        });

    const conditions: HealthConditionDetail[] = allFacts
        .filter((f) => f.kind === "condition")
        .map((f) => ({
            condition: f.label,
            symptoms: f.effect,
            careInstruction: f.instruction ?? "No care instruction recorded",
            restrictions: null,
            relatedMedications: vm.medications
                .filter((m) => m.relatedFactId === f.factId)
                .map((m) => m.label),
            effective: effectiveOf(f),
            provenance: provenanceOf(f),
        }));

    /*
     * Authorization comes from the REQUIREMENTS, by requirement key — never from the medication
     * row. A medication with no matching requirement reports the authorization as unmet rather than
     * as absent, because "nobody has asked for it" and "it is on file" are not the same state.
     */
    const authRequirement = vm.requirements.find((r) => r.key === "medication_authorization");
    const medications: HealthMedicationDetail[] = vm.medications.map(
        (m: HealthSafetyMedication): HealthMedicationDetail => ({
            medication: m.label,
            dosage: m.dosage ?? "Dosage not recorded",
            frequency: m.asNeeded ? "As needed" : (m.frequency ?? "Frequency not recorded"),
            administration: m.instruction ?? "No administration instruction recorded",
            storage: m.storageLocation ?? "Storage location not recorded",
            expires: null,
            authorization: {
                label: authRequirement?.label ?? "Medication authorization",
                satisfied: Boolean(authRequirement?.satisfied),
            },
            relatedTo: m.relatedFactId ? (labelByFactId.get(m.relatedFactId) ?? m.treatsLabel) : m.treatsLabel,
            provenance: provenanceOf(m),
        }),
    );

    const documents: HealthDocumentRow[] = vm.documents.map(
        (d: HealthSafetyDocument): HealthDocumentRow => ({
            docType: d.title ?? d.docType ?? "Document",
            received: shortDate(d.uploadedAt) ?? "—",
            expires: null,
            status: d.status ?? "On file",
            // Versioning is the document store's, and it does not project one here. Stating "—"
            // is honest; stating "v1" would be a fact this card made up.
            version: "—",
            source: d.docType ?? "Upload",
        }),
    );

    const requirements: HealthRequirementRow[] = vm.requirements.map((r): HealthRequirementRow => {
        const doc = r.satisfiedByDocumentId
            ? vm.documents.find((d) => d.documentId === r.satisfiedByDocumentId)
            : null;
        return {
            requirement: r.label,
            state: r.satisfied ? "satisfied" : "missing",
            stateLabel: r.satisfied ? "Satisfied" : "Missing",
            // The EVIDENCE, not a tick: which document satisfied it and when it arrived.
            evidence: doc ? `${doc.title ?? doc.docType ?? "Document"} · ${shortDate(doc.uploadedAt) ?? "received"}` : null,
            due: null,
            // Requirements are Business Process-owned; Health only projects their evidence state.
            appliesBecause: "Required by the configured process",
        };
    });

    const emergencyContacts: HealthEmergencyContact[] = [...vm.emergencyContacts]
        .sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER))
        .map((c, i) => ({
            name: c.name ?? "Contact",
            relationship: c.relationship ?? "Relationship not recorded",
            phone: c.phone ?? "No phone on file",
            order: i === 0 ? "First" : `#${i + 1}`,
        }));

    const newestFact = allFacts
        .map((f) => f.effectiveFrom)
        .filter((v): v is string => Boolean(v))
        .sort()
        .pop();

    return {
        childLabel: subjectLabel ?? vm.participant?.displayName ?? "This child",
        critical: vm.criticalFacts.map((f) => ({
            name: f.label,
            severity: f.severity ? SEVERITY_LABELS[f.severity] ?? f.severity : "",
            reaction: f.effect,
            response: f.instruction,
        })),
        allergies,
        conditions,
        medications,
        profile: vm.profileFacts.map((p) => ({ label: p.label, value: p.value })),
        documents,
        requirements,
        emergencyContacts,
        lastUpdated: shortDate(newestFact) ?? "Not recorded",
    };
}

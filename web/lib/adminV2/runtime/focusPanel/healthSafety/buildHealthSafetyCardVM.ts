/**
 * THE HEALTH & SAFETY READ MODEL — one server composition, summary and detail.
 *
 * It PROJECTS five owners and owns nothing:
 *
 *   person_health_facts   approved durable health truth        (H1/H3)
 *   configured fields     dietary / notes profile facts        (child grain, post-M1)
 *   documents            the evidence artifact itself
 *   Business Process      whether an artifact is REQUIRED, and whether it is satisfied
 *   Relationships         emergency contacts
 *
 * React computes no health semantics: severity, criticality, current-truth and requirement
 * satisfaction are all decided here, because a card that re-derived any of them would be a second
 * answer to a question an owner already answers.
 *
 * ── PERMISSION IS NOT OPTIONAL ──
 *
 * D-H6. `access` is required, and the resolver refuses without `health.view`, so this module cannot
 * return health data to a caller who lacks the grant even by mistake. A caller without the grant gets
 * a VM that says so — not an empty one, which would read as "this child has no allergies".
 *
 * ── WHO CARES FOR THE CHILD ──
 *
 * Physician and dentist are canonical child relationship ROLES (`relationshipDefinitions`:
 * `child_physicians`, `child_dentists`), projected here from `person_child_relationship_roles` —
 * never flat child fields. Emergency contacts are the people holding the `emergency_contact` role;
 * a relationship is not an emergency contact merely because it exists.
 */

import { disclosableDocumentIds, type DocumentDisclosureActor } from "@/lib/documents/documentMetadataDisclosure";
import { isDocumentUnavailable } from "@/lib/documents/documentAvailability";
import type { SupabaseClient } from "@supabase/supabase-js";
import { healthClock, recordHealthSpans } from "@/lib/perf/routeTimingDiagnostic";

import {
    evaluateHealthAccess,
    HEALTH_VIEW_PERMISSION,
    type HealthAccessSubject,
} from "@/lib/health/healthAccess";
import { resolveActiveHealthFacts } from "@/lib/health/healthFactCollectionResolver";
import { readMedicalConsents } from "@/lib/health/medicalConsentService";
import { loadPersonChildRelationshipOptionSetItems } from "@/lib/fields/personChildRelationship/personChildRelationshipRepository";
import {
    CRITICAL_SEVERITIES,
    healthFactLabel,
    readAllergyPayload,
    readConditionPayload,
    readMedicationPayload,
    readImmunizationPayload,
    readInsurancePayload,
    type HealthSeverity,
    type PersonHealthFactRow,
} from "@/lib/health/healthFactModel";

export type HealthSafetyFact = {
    factId: string;
    kind: "allergy" | "condition" | "medication" | "immunization" | "insurance";
    label: string;
    severity: HealthSeverity | null;
    /** What happens — the reaction, or what the condition does. */
    effect: string | null;
    /** What to DO — the line an operator acts on. */
    instruction: string | null;
    /** A medication points at the allergy/condition it treats. */
    relatedFactId: string | null;
    effectiveFrom: string | null;
    provenance: { sourceKind: string; sourceRef: string | null; confirmedAt: string | null };
};

export type HealthSafetyMedication = HealthSafetyFact & {
    dosage: string | null;
    frequency: string | null;
    asNeeded: boolean;
    storageLocation: string | null;
    /** Resolved label of what it treats, so the card never has to join facts itself. */
    treatsLabel: string | null;
};

export type HealthSafetyDocument = {
    documentId: string;
    docType: string | null;
    title: string | null;
    status: string | null;
    uploadedAt: string | null;
};

export type HealthSafetyRequirement = {
    key: string;
    label: string;
    /** Evaluated from evidence at READ TIME — never stored as health truth. */
    satisfied: boolean;
    satisfiedByDocumentId: string | null;
};

export type HealthSafetyContact = {
    personId: string;
    name: string | null;
    relationship: string | null;
    phone: string | null;
    priority: number | null;
};

/** A child's physician or dentist — a relationship role, projected; Health never owns it. */
export type HealthSafetyCareProvider = {
    personId: string;
    name: string | null;
    phone: string | null;
    role: "physician" | "dentist";
    roleLabel: string;
};

/** How sure Alloy is of a medical record — never implied beyond what the evidence supports. */
export type HealthSafetyAssurance = "reported" | "verified";

export type HealthSafetyInsurance = {
    factId: string;
    provider: string | null;
    planName: string | null;
    policyNumber: string | null;
    groupNumber: string | null;
    memberId: string | null;
    subscriberName: string | null;
    subscriberRelationship: string | null;
    phone: string | null;
    /** Coverage as reported. Alloy does not verify eligibility. */
    assurance: HealthSafetyAssurance;
    effectiveFrom: string | null;
    sourceKind: string;
};

export type HealthSafetyImmunization = {
    factId: string;
    vaccineKey: string | null;
    label: string;
    doses: Array<{ doseNumber: number | null; administeredOn: string | null }>;
    historyState: string | null;
    /** `reported` until an operator verifies it against evidence (a Documents dependency). */
    assurance: HealthSafetyAssurance;
    sourceKind: string;
};

export type HealthSafetyConsent = {
    consentId: string;
    kind: string;
    label: string;
    status: "active" | "withdrawn" | "superseded";
    grantedByName: string | null;
    grantedAt: string;
    withdrawnAt: string | null;
    withdrawalReason: string | null;
    evidenceDocumentId: string | null;
};

export type HealthSafetyCardVM = {
    participant: { customerMemberId: string; displayName: string | null } | null;
    /** Life-threatening and severe facts, most severe first. The card's top region. */
    criticalFacts: HealthSafetyFact[];
    /** Everything else that shapes daily care. */
    careFacts: HealthSafetyFact[];
    medications: HealthSafetyMedication[];
    /** Dietary and accommodation notes from configured child fields. */
    profileFacts: Array<{ key: string; label: string; value: string }>;
    documents: HealthSafetyDocument[];
    requirements: HealthSafetyRequirement[];
    emergencyContacts: HealthSafetyContact[];
    /** Physician and dentist, from the child's relationship roles. */
    careProviders: HealthSafetyCareProvider[];
    /** Health insurance, as reported. */
    insurance: HealthSafetyInsurance[];
    /** Immunizations by vaccine, with their assurance. */
    immunizations: HealthSafetyImmunization[];
    /** Medical authorizations: the current state per kind, then history. */
    consents: HealthSafetyConsent[];
    /** Owners this VM deliberately does not project, and why. */
    gaps: Array<{ concept: string; reason: string }>;
    /** Set when the caller may not see health information, or health is unavailable. */
    unavailableReason: string | null;
    /** True only when the refusal is a PERMISSION refusal — the card says so differently. */
    permissionDenied: boolean;
};

/** Requirement keys whose evidence is a document of the matching `doc_type`. */
/**
 * The requirement set, and the document type that satisfies each one.
 *
 * EXPORTED so there is ONE owner of this rule. The A′ first-order composer answers "how many of
 * this child's requirements are satisfied?" without building the whole card, and a second copy of
 * this list would let the two surfaces disagree about what a requirement IS — the card saying three
 * of four while the first-order face said two of three, with both honest about their own list.
 */
export const DOCUMENT_BACKED_REQUIREMENTS: ReadonlyArray<{ key: string; label: string; docType: string }> = [
    { key: "physical", label: "Physical / health assessment", docType: "physical" },
    { key: "immunization", label: "Immunization record", docType: "immunization_record" },
    { key: "health_care_plan", label: "Health care plan", docType: "health_care_plan" },
    { key: "medication_authorization", label: "Medication authorization", docType: "medication_authorization" },
];

const PROFILE_FACT_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
    { key: "allergies", label: "Allergy notes" },
    { key: "medical_notes", label: "Medical notes" },
    { key: "special_instructions", label: "Special instructions" },
];

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function severityRank(s: HealthSeverity | null): number {
    if (!s) return 99;
    const order: HealthSeverity[] = ["life_threatening", "severe", "moderate", "mild"];
    const i = order.indexOf(s);
    return i === -1 ? 99 : i;
}

function baseFact(row: PersonHealthFactRow): Omit<HealthSafetyFact, "severity" | "effect" | "instruction"> {
    return {
        factId: row.id,
        kind: row.fact_kind,
        label: healthFactLabel(row),
        relatedFactId: row.related_fact_id,
        effectiveFrom: row.effective_from,
        provenance: {
            sourceKind: row.source_kind,
            sourceRef: row.source_ref,
            confirmedAt: row.confirmed_at,
        },
    };
}

function emptyVm(): HealthSafetyCardVM {
    return {
        participant: null,
        criticalFacts: [],
        careFacts: [],
        medications: [],
        profileFacts: [],
        documents: [],
        requirements: [],
        emergencyContacts: [],
        careProviders: [],
        insurance: [],
        immunizations: [],
        consents: [],
        gaps: [],
        unavailableReason: null,
        permissionDenied: false,
    };
}

export async function buildHealthSafetyCardVM(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        customerMemberId: string;
        displayName?: string | null;
        access: HealthAccessSubject;
        /**
         * The reader of the card's DOCUMENT list (EN-FI-01). health.view admits the card; each listed document must also
         * pass the Documents read gates (admission, subject scope, clearance). `null` lists no documents.
         */
        documentActor: DocumentDisclosureActor | null;
    },
): Promise<HealthSafetyCardVM> {
    const vm = emptyVm();
    const memberId = t(args.customerMemberId);
    if (!memberId) {
        return { ...vm, unavailableReason: "No child in scope." };
    }
    vm.participant = { customerMemberId: memberId, displayName: args.displayName ?? null };

    /*
     * REFUSE FIRST, AND SAY IT IS A REFUSAL.
     *
     * An unauthorized caller must not receive an EMPTY health card — empty reads as "this child has
     * no allergies", which is the most dangerous sentence this surface could imply.
     */
    // The key is named HERE, on the line that enforces it, so the declared route capability is bound
    // to its source rather than merely asserted — a declaration naming a helper that never mentions
    // the key is exactly the false claim the W-14 lock exists to convict.
    if (!evaluateHealthAccess(args.access, "health.view").allowed) {
        return {
            ...vm,
            permissionDenied: true,
            unavailableReason: "You do not have permission to view health information.",
        };
    }

    const hClock = healthClock();
    const [factsResult, profileResult, documentsResult, contactsResult, consentsResult] = await Promise.allSettled([
        hClock.time("health_facts_ms", () => resolveActiveHealthFacts(supabase, {
            orgId: args.orgId,
            subjectEntityId: memberId,
            subjectEntityType: "customer_member",
            access: args.access,
        })),
        hClock.time("health_profile_ms", () =>
            import("@/lib/completion/loadCustomerMemberProfileFields").then((m) =>
                m.loadCustomerMemberProfileFieldsByMemberId(supabase, args.orgId, [memberId], args.access),
            ),
        ),
        hClock.time("health_documents_ms", () =>
            supabase
                .from("documents")
                .select("id, doc_type, title, status, created_at")
                .eq("org_id", args.orgId)
                .eq("entity_type", "customer_member")
                .eq("entity_id", memberId),
        ),
        hClock.time("health_contacts_ms", () =>
            supabase
                .from("person_child_relationships")
                .select("id, person_id, relationship_type, priority, status")
                .eq("org_id", args.orgId)
                .eq("customer_member_id", memberId)
                .eq("status", "active"),
        ),
        hClock.time("health_consents_ms", () =>
            readMedicalConsents(supabase, { orgId: args.orgId, access: args.access, customerMemberId: memberId }),
        ),
    ]);
    recordHealthSpans(hClock.spans());

    if (factsResult.status === "rejected") {
        /*
         * A failed health read is NOT "no health facts".
         *
         * The table may not exist in this environment, or the read may have failed. Either way the
         * card must say health is unavailable rather than render an empty, reassuring surface.
         */
        return {
            ...vm,
            unavailableReason: `Health information is unavailable: ${
                factsResult.reason instanceof Error ? factsResult.reason.message : String(factsResult.reason)
            }`,
        };
    }

    // ── STRUCTURED FACTS ────────────────────────────────────────────────────────────────────────
    const facts = factsResult.value;
    const labelByFactId = new Map(facts.map((f) => [f.id, healthFactLabel(f)]));

    for (const row of facts) {
        if (row.fact_kind === "medication") {
            const p = readMedicationPayload(row.payload);
            vm.medications.push({
                ...baseFact(row),
                severity: null,
                effect: null,
                instruction: p.administrationInstructions,
                dosage: p.dosage,
                frequency: p.frequency,
                asNeeded: p.asNeeded,
                storageLocation: p.storageLocation,
                treatsLabel: row.related_fact_id ? labelByFactId.get(row.related_fact_id) ?? null : null,
            });
            continue;
        }
        if (row.fact_kind === "allergy") {
            const p = readAllergyPayload(row.payload);
            const fact: HealthSafetyFact = {
                ...baseFact(row),
                severity: p.severity,
                effect: p.reaction,
                // Both stay attached to the allergy: what to give, and what staff should do.
                instruction: [p.treatment, p.careInstructions].filter(Boolean).join(" · ") || null,
            };
            (p.severity && CRITICAL_SEVERITIES.includes(p.severity) ? vm.criticalFacts : vm.careFacts).push(fact);
            continue;
        }
        if (row.fact_kind === "condition") {
            const p = readConditionPayload(row.payload);
            const fact: HealthSafetyFact = {
                ...baseFact(row),
                severity: p.severity,
                effect: p.restrictions,
                instruction: p.careInstructions,
            };
            (p.severity && CRITICAL_SEVERITIES.includes(p.severity) ? vm.criticalFacts : vm.careFacts).push(fact);
            continue;
        }
        // Immunization is compliance evidence rather than a care instruction, so it never competes
        // for the critical region; the requirement below is where it matters.
        if (row.fact_kind === "insurance") {
            const p = readInsurancePayload(row.payload);
            vm.insurance.push({
                factId: row.id,
                provider: p.provider,
                planName: p.planName,
                policyNumber: p.policyNumber,
                groupNumber: p.groupNumber,
                memberId: p.memberId,
                subscriberName: p.subscriberName,
                subscriberRelationship: p.subscriberRelationship,
                phone: p.phone,
                assurance: row.confirmed_at ? "verified" : "reported",
                effectiveFrom: row.effective_from,
                sourceKind: row.source_kind,
            });
            continue;
        }
        if (row.fact_kind === "immunization") {
            const p = readImmunizationPayload(row.payload);
            vm.immunizations.push({
                factId: row.id,
                vaccineKey: p.vaccineKey,
                label: healthFactLabel(row),
                doses: p.doses.map((d) => ({ doseNumber: d.doseNumber, administeredOn: d.administeredOn })),
                historyState: p.historyState,
                // A typed date is a report. Only an operator's verification against evidence may say
                // otherwise — never inferred from the answer itself.
                assurance: row.confirmed_at ? "verified" : "reported",
                sourceKind: row.source_kind,
            });
            continue;
        }
        vm.careFacts.push({ ...baseFact(row), severity: null, effect: null, instruction: null });
    }

    vm.criticalFacts.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
    vm.immunizations.sort((a, b) => a.label.localeCompare(b.label));

    // ── MEDICAL AUTHORIZATIONS (consent STATE; the signed artifact is evidence, owned elsewhere) ─
    if (consentsResult.status === "fulfilled") {
        vm.consents = consentsResult.value.map((c) => ({
            consentId: c.id,
            kind: c.consent_kind,
            label: c.consent_kind === "medical_records_release" ? "Medical records release" : "Emergency medical treatment",
            status: c.status,
            grantedByName: c.granted_by_name,
            grantedAt: c.granted_at,
            withdrawnAt: c.withdrawn_at,
            withdrawalReason: c.withdrawal_reason,
            evidenceDocumentId: c.evidence_document_id,
        }));
    }

    // ── PROFILE FACTS (child grain, post-M1) ────────────────────────────────────────────────────
    if (profileResult.status === "fulfilled") {
        const profile = (profileResult.value.get(memberId) ?? {}) as Record<string, unknown>;
        for (const field of PROFILE_FACT_FIELDS) {
            const value = t(profile[field.key]);
            if (value) vm.profileFacts.push({ key: field.key, label: field.label, value });
        }
    }

    // ── DOCUMENTS, and the requirements they satisfy ────────────────────────────────────────────
    if (documentsResult.status === "fulfilled" && !documentsResult.value.error) {
        // EN-FI-01: health.view is the Medical gate; the Documents gates still apply to each document, and a quarantined
        // or deleted document is never listed (the same rule as the library).
        const rows = (documentsResult.value.data ?? []) as unknown as Array<Record<string, unknown>>;
        const disclosable = await disclosableDocumentIds(supabase, args.orgId, args.documentActor, rows.map((d) => t(d.id)));
        vm.documents = rows.filter((d) => disclosable.has(t(d.id)) && !isDocumentUnavailable(t(d.status) || null)).map(
            (d) => ({
                documentId: t(d.id),
                docType: t(d.doc_type) || null,
                title: t(d.title) || null,
                status: t(d.status) || null,
                uploadedAt: t(d.created_at) || null,
            }),
        );
    }

    /*
     * REQUIREMENT SATISFACTION IS EVALUATED, NEVER STORED.
     *
     * Storing `immunization_document_present = true` would be a second answer that drifts from the
     * documents justifying it — the moment one is removed, the stored flag still says yes.
     */
    vm.requirements = DOCUMENT_BACKED_REQUIREMENTS.map((req) => {
        const evidence = vm.documents.find((d) => d.docType === req.docType) ?? null;
        return {
            key: req.key,
            label: req.label,
            satisfied: Boolean(evidence),
            satisfiedByDocumentId: evidence?.documentId ?? null,
        };
    });

    // ── EMERGENCY CONTACTS, projected from Relationships ────────────────────────────────────────
    if (contactsResult.status === "fulfilled" && !contactsResult.value.error) {
        const rows = (contactsResult.value.data ?? []) as unknown as Array<Record<string, unknown>>;
        const personIds = [...new Set(rows.map((r) => t(r.person_id)).filter(Boolean))];
        const nameById = new Map<string, { name: string; phone: string | null }>();
        const rolesByRelationship = new Map<string, Set<string>>();
        if (personIds.length > 0) {
            const [{ data: people }, { data: roleRows }] = await Promise.all([
                supabase
                    .from("persons")
                    .select("id, first_name, last_name, full_name, phone")
                    .eq("org_id", args.orgId)
                    .in("id", personIds),
                supabase
                    .from("person_child_relationship_roles")
                    .select("relationship_id, role_key, is_active")
                    .eq("org_id", args.orgId)
                    .in("relationship_id", rows.map((r) => t(r.id)).filter(Boolean)),
            ]);
            for (const r of (roleRows ?? []) as unknown as Array<Record<string, unknown>>) {
                if (r.is_active === false) continue;
                const set = rolesByRelationship.get(t(r.relationship_id)) ?? new Set<string>();
                set.add(t(r.role_key));
                rolesByRelationship.set(t(r.relationship_id), set);
            }
            for (const p of (people ?? []) as unknown as Array<Record<string, unknown>>) {
                nameById.set(t(p.id), {
                    name: t(p.full_name) || [t(p.first_name), t(p.last_name)].filter(Boolean).join(" "),
                    phone: t(p.phone) || null,
                });
            }
        }
        // The organization's own word for the relationship ("Grandparent"), never its stored key.
        const kinshipLabels = new Map(
            (await loadPersonChildRelationshipOptionSetItems(supabase, args.orgId).catch(() => [])).map((o) => [o.item_key, o.label || o.item_key]),
        );
        const holds = (r: Record<string, unknown>, role: string) => rolesByRelationship.get(t(r.id))?.has(role) ?? false;
        for (const role of ["physician", "dentist"] as const) {
            for (const r of rows.filter((row) => holds(row, role))) {
                const person = nameById.get(t(r.person_id));
                vm.careProviders.push({
                    personId: t(r.person_id),
                    name: person?.name || null,
                    phone: person?.phone ?? null,
                    role,
                    roleLabel: role === "physician" ? "Physician" : "Dentist",
                });
            }
        }
        vm.emergencyContacts = rows
            .filter((r) => holds(r, "emergency_contact"))
            .map((r) => {
                const person = nameById.get(t(r.person_id));
                const priorityRaw = Number(r.priority);
                return {
                    personId: t(r.person_id),
                    name: person?.name || null,
                    relationship: t(r.relationship_type) ? kinshipLabels.get(t(r.relationship_type)) ?? t(r.relationship_type) : null,
                    // The phone belongs to the CANONICAL person, never copied onto the child.
                    phone: person?.phone ?? null,
                    priority: Number.isFinite(priorityRaw) ? priorityRaw : null,
                };
            })
            .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    }

    return vm;
}

/** Re-exported so a caller can name the permission without importing the access module. */
export { HEALTH_VIEW_PERMISSION };

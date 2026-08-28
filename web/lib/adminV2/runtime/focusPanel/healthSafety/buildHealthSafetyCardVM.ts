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
 * ── WHAT IT REFUSES TO SHOW ──
 *
 * Physician and dentist are absent. The Relationship platform has no canonical role key for either
 * (only `emergency_contact`), and inventing `physician_name` / `physician_phone` child fields to fill
 * the card would create exactly the duplicate owner this whole vertical exists to prevent. Recorded
 * as a relationship gap, not a health blocker.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    evaluateHealthAccess,
    HEALTH_VIEW_PERMISSION,
    type HealthAccessSubject,
} from "@/lib/health/healthAccess";
import { resolveActiveHealthFacts } from "@/lib/health/healthFactCollectionResolver";
import {
    CRITICAL_SEVERITIES,
    healthFactLabel,
    readAllergyPayload,
    readConditionPayload,
    readMedicationPayload,
    type HealthSeverity,
    type PersonHealthFactRow,
} from "@/lib/health/healthFactModel";

export type HealthSafetyFact = {
    factId: string;
    kind: "allergy" | "condition" | "medication" | "immunization";
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
    /** Owners this VM deliberately does not project, and why. */
    gaps: Array<{ concept: string; reason: string }>;
    /** Set when the caller may not see health information, or health is unavailable. */
    unavailableReason: string | null;
    /** True only when the refusal is a PERMISSION refusal — the card says so differently. */
    permissionDenied: boolean;
};

/** Requirement keys whose evidence is a document of the matching `doc_type`. */
const DOCUMENT_BACKED_REQUIREMENTS: ReadonlyArray<{ key: string; label: string; docType: string }> = [
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

    // Physician/dentist have no canonical role key yet — stated, never faked.
    vm.gaps = [
        {
            concept: "physician_dentist",
            reason:
                "The Relationship platform has no canonical physician or dentist role key yet. Flat "
                + "child fields would create a duplicate owner, so these are omitted until it does.",
        },
    ];

    const [factsResult, profileResult, documentsResult, contactsResult] = await Promise.allSettled([
        resolveActiveHealthFacts(supabase, {
            orgId: args.orgId,
            subjectEntityId: memberId,
            subjectEntityType: "customer_member",
            access: args.access,
        }),
        import("@/lib/completion/loadCustomerMemberProfileFields").then((m) =>
            m.loadCustomerMemberProfileFieldsByMemberId(supabase, args.orgId, [memberId]),
        ),
        supabase
            .from("documents")
            .select("id, doc_type, title, status, created_at")
            .eq("org_id", args.orgId)
            .eq("entity_type", "customer_member")
            .eq("entity_id", memberId),
        supabase
            .from("person_child_relationships")
            .select("person_id, relationship_type, priority, status")
            .eq("org_id", args.orgId)
            .eq("customer_member_id", memberId)
            .eq("status", "active"),
    ]);

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
                instruction: p.treatment ?? p.careInstructions,
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
        vm.careFacts.push({ ...baseFact(row), severity: null, effect: null, instruction: null });
    }

    vm.criticalFacts.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

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
        vm.documents = ((documentsResult.value.data ?? []) as unknown as Array<Record<string, unknown>>).map(
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
        if (personIds.length > 0) {
            const { data: people } = await supabase
                .from("persons")
                .select("id, first_name, last_name, phone")
                .eq("org_id", args.orgId)
                .in("id", personIds);
            for (const p of (people ?? []) as unknown as Array<Record<string, unknown>>) {
                nameById.set(t(p.id), {
                    name: [t(p.first_name), t(p.last_name)].filter(Boolean).join(" "),
                    phone: t(p.phone) || null,
                });
            }
        }
        vm.emergencyContacts = rows
            .map((r) => {
                const person = nameById.get(t(r.person_id));
                const priorityRaw = Number(r.priority);
                return {
                    personId: t(r.person_id),
                    name: person?.name || null,
                    relationship: t(r.relationship_type) || null,
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

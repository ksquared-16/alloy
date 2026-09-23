/**
 * The canonical Participant Enrollment Objective — one runtime read model (Phase 3).
 *
 * A COMPOSITION of the deterministic projections from Slices 2.1-2.4, not a new authority and not a
 * new table. Every fact in it is already owned somewhere:
 *
 * ```
 *   process instance + pinned revision + stage + requirement progress   Slice 2.3
 *   unique information needs + D-99 confirmations                       Slice 2.4
 *   next deterministic turn                                             selectNextParticipantTurn
 * ```
 *
 * No durable objective entity is created. The repository gives no evidence one is needed: every
 * component is derivable from the process instance and its anchored session, and a table would
 * immediately become a second thing to keep in step with the projections that already answer.
 *
 * Suitable for three consumers without change: the participant UI, deterministic turn selection, and
 * the construction of a Trust Information Package for provider assistance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PacketSessionRow } from "@/lib/forms/packets/formPacketService";
import { resolvePacketParticipantProgress } from "@/lib/enrollment/participantProgress/resolvePacketParticipantProgress";

import {
    resolveEnrollmentParticipantProgress,
    type EnrollmentProgressLoaded,
} from "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress";
import {
    assembleEnrollmentInformationNeeds,
    resolveEnrollmentInformationNeeds,
    type EnrollmentInformationNeedsRefusal,
    type EnrollmentNeedsContext,
} from "@/lib/enrollment/informationNeeds/resolveEnrollmentInformationNeeds";
import { enrollmentConfirmationPolicy } from "@/lib/enrollment/participantRuntime/enrollmentConfirmationPolicy";
import { selectNextParticipantTurn } from "@/lib/enrollment/participantRuntime/selectNextParticipantTurn";
import {
    outstandingRequiredEvidence,
    type ParticipantEvidenceObligation,
} from "@/lib/enrollment/participantRuntime/participantEvidenceObligations";
import {
    artifactPartySlots,
    artifactSlotsForProjection,
    type PartySlotDestination,
} from "@/lib/enrollment/participantRuntime/artifactPartySlots";
import { nextPartyOffer, readPartyOfferDeclines, type PartyOffer } from "@/lib/enrollment/participantRuntime/partyOfferPlan";
import { declaredPartyCollectionsForForms } from "@/lib/enrollment/participantRuntime/declaredPartyCollections";
import { knownPartyEntriesFromParties } from "@/lib/enrollment/informationNeeds/participantPartyCollection";
// One owner for "who does Alloy already know here" — the submit seam and the document renderer
// read the SAME resolution, which is what keeps the card and the completed artifact in agreement.
import { resolveHouseholdSiblings } from "@/lib/enrollment/informationNeeds/sessionKnownPartyEntries";
import { resolveChildParties, resolveHouseholdCandidates, type ChildParty } from "@/lib/enrollment/participantRuntime/childPartyRuntime";
import type { EnrollmentParticipantProgress } from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";
import type {
    EnrollmentInformationNeed,
    EnrollmentInformationNeeds,
} from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";
import type { ParticipantTurn } from "@/lib/enrollment/participantRuntime/participantTurnTypes";

export type ParticipantEnrollmentObjective = {
    /** Null when this participant's work is anchored on the packet session rather than a
     * Business Process journey. Everything else on this shape is identical either way. */
    readonly process_instance_id: string | null;
    readonly session_id: string | null;
    readonly business_process_revision_id: string | null;
    readonly stage_key: string | null;
    readonly progress: EnrollmentParticipantProgress;
    readonly needs: EnrollmentInformationNeeds;
    /** Needs the participant must still confirm. */
    readonly known_requiring_confirmation: readonly EnrollmentInformationNeed[];
    /** Needs with no usable value. */
    readonly missing: readonly EnrollmentInformationNeed[];
    /** Occurrences that cannot collapse into a shared fact — signatures and the like. */
    readonly artifact_specific: readonly EnrollmentInformationNeed[];
    /** The one deterministic answer to "what next?". Never provider-influenced. */
    readonly next_turn: ParticipantTurn;
    /** Required attachments still owed. Empty once evidence is complete. */
    readonly outstanding_evidence: readonly ParticipantEvidenceObligation[];
    /** Everyone canonically related to this child, with their roles. */
    readonly parties: readonly ChildParty[];
    /** Household people not yet related to this child — the reuse offer. */
    readonly party_candidates: readonly ChildParty[];
    /**
     * Every numbered person destination the pinned artifacts print, with its attribute.
     *
     * Carried so presentation can say WHO a block is about rather than which box it is. Destinations,
     * never people: the people are `parties`, and the projection between them is the owner's.
     */
    readonly party_slots: readonly PartySlotDestination[];
};

export type ParticipantEnrollmentObjectiveResult =
    | { readonly ok: true; readonly value: ParticipantEnrollmentObjective }
    | { readonly ok: false; readonly refusal: { readonly code: string; readonly detail: string } };

/** Build the objective from its two projections — PURE, shared by resolve and recompute. */
function buildParticipantObjective(
    progress: EnrollmentParticipantProgress,
    needs: EnrollmentInformationNeeds,
    context?: {
        readonly forms: EnrollmentNeedsContext["forms"];
        readonly evidenceOnFile: ReadonlySet<string>;
        readonly requiresConfirmation?: ReadonlySet<string>;
        readonly parties?: readonly ChildParty[];
        readonly candidates?: readonly ChildParty[];
        readonly partyDeclines?: Readonly<Record<string, { declined_at: string }>>;
    },
): ParticipantEnrollmentObjective {
    /*
     * Evidence is resolved BEFORE the turn is selected, because it is one of the things the turn
     * chooses between. Absent a context the list is empty, which selects exactly as it always did.
     */
    const outstanding_evidence = context
        ? outstandingRequiredEvidence(context.forms, context.evidenceOnFile)
        : [];

    /*
     * The next person to offer, from canonical parties and what the artifacts can print.
     *
     * Resolved here so the selector receives an answer rather than a capability — the same shape as
     * evidence. No configured requirements exist today, so every offer is optional and declinable.
     */
    const parties = context?.parties ?? [];
    const partySlots = (context?.forms ?? []).flatMap((f) => artifactSlotsForProjection(f.schema, []));
    // The same destinations at ATTRIBUTE grain — which box holds the name, the phone, the address.
    const partySlotDestinations = (context?.forms ?? []).flatMap((f) => artifactPartySlots(f.schema, []));
    /*
     * WHAT THE FORM SAID, BEFORE WHAT THE PAPER PRINTED.
     *
     * A normalized Form declares its collections of people outright — the role, the minimum, the
     * ceiling, whether the family may add another. That statement drives the offer for the roles it
     * names; artifact slot capacity remains the fallback for imported paperwork that never said.
     */
    const declaredCollections = declaredPartyCollectionsForForms(context?.forms ?? []);
    const partyOffer: PartyOffer | null = context
        ? nextPartyOffer({ parties, slots: partySlots, declines: context.partyDeclines ?? {}, declaredCollections })
        : null;

    return {
        outstanding_evidence,
        parties,
        party_candidates: context?.candidates ?? [],
        party_slots: partySlotDestinations,
        process_instance_id: progress.process_instance_id,
        session_id: needs.session_id,
        business_process_revision_id: progress.business_process_revision_id,
        stage_key: progress.stage_key,
        progress,
        needs,
        known_requiring_confirmation: needs.needs.filter(
            (n) => n.state === "known_requires_confirmation",
        ),
        missing: needs.needs.filter((n) => n.state === "missing"),
        artifact_specific: needs.needs.filter((n) => n.state === "artifact_specific"),
        next_turn: selectNextParticipantTurn({
            needs,
            progress,
            outstandingEvidence: outstanding_evidence,
            requiresConfirmation: context?.requiresConfirmation,
            partyOffer,
        }),
    };
}

/**
 * Everything a turn's post-write recompute derives from.
 *
 * A participant turn writes ONE thing: the session's shared values / D-99 evidence. The pinned
 * revision, the requirement set, the pinned schemas, the subject and the realized items are all
 * immutable within the request — so the recompute after the write is pure computation over this
 * context plus the post-write session row the writer already holds. The turn used to resolve the
 * full objective three times (~8 serial query waves each); with the context it resolves once.
 */
export type ParticipantObjectiveContext = {
    readonly progress: EnrollmentParticipantProgress;
    readonly needsContext: EnrollmentNeedsContext;
    readonly requiresConfirmation: ReadonlySet<string>;
    readonly canonicalValues?: Readonly<Record<string, unknown>>;
    /**
     * Field ids whose required attachment is already on file for this session.
     *
     * Read from canonical `documents`, NOT from a submission payload — the obligation has to be
     * answerable before any artifact has been prepared, which is the whole point of moving the step
     * ahead of preparation. Immutable within a request, so the post-write recompute reuses it.
     */
    readonly evidenceOnFile?: ReadonlySet<string>;
    /** Canonical parties for this child, and the roles the parent has declined to add. */
    readonly parties?: readonly ChildParty[];
    readonly partyCandidates?: readonly ChildParty[];
    readonly customerId?: string | null;
    /** The household's other children — the known entries of a collection of children. */
    readonly householdChildren?: readonly { readonly id: string; readonly display_name: string }[];
};

/** Recompute the objective from known post-write state — zero queries, same result shape. */
export function recomputeParticipantObjectiveFromContext(
    context: ParticipantObjectiveContext,
    postWriteSession: EnrollmentNeedsContext["session"],
): ParticipantEnrollmentObjective {
    const needs = assembleEnrollmentInformationNeeds(
        { ...context.needsContext, session: postWriteSession },
        {
            requiresConfirmation: context.requiresConfirmation,
            canonicalValues: context.canonicalValues,
            /*
             * The people already related to this child, as entries of the collections that ask for
             * them. Read from `person_child_relationships` by `resolveChildParties` — the canonical
             * graph — so the conversation shows what Alloy knows instead of asking for it again.
             */
            knownPartyEntries: knownPartyEntriesForForms(context.needsContext.forms, context.parties ?? [], context.householdChildren ?? []),
        },
    );
    return buildParticipantObjective(context.progress, needs, {
        forms: context.needsContext.forms,
        evidenceOnFile: context.evidenceOnFile ?? new Set<string>(),
        requiresConfirmation: context.requiresConfirmation,
        parties: context.parties,
        candidates: context.partyCandidates,
        partyDeclines: readPartyOfferDeclines(postWriteSession?.metadata),
    });
}

export type ParticipantEnrollmentObjectiveWithContextResult =
    | {
          readonly ok: true;
          readonly value: ParticipantEnrollmentObjective;
          readonly context: ParticipantObjectiveContext;
      }
    | { readonly ok: false; readonly refusal: EnrollmentInformationNeedsRefusal };

/** The resolver, also handing back the loaded context for a pure post-write recompute. */
export async function resolveParticipantEnrollmentObjectiveWithContext(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        /**
         * The Business Process journey, when there is one.
         *
         * `null` means the participant's work is anchored on the packet session itself. Both anchors
         * produce the same progress shape, so everything below this line is identical — see
         * `resolvePacketParticipantProgress` for why the seam sits exactly here.
         */
        processInstanceId: string | null;
        canonicalValues?: Readonly<Record<string, unknown>>;
        /**
         * The session row the token resolver already read.
         *
         * The participant read path used to load this row twice per request — once to prove the
         * link, once to answer "which session is current" — and the second read was a whole serial
         * round trip in front of everything that depends on the session. Handing it forward removes
         * that wave without moving the decision: `resolveCurrentEnrollmentSession` still applies
         * its own predicate and falls back to the query when the row does not satisfy it.
         */
        preloadedSession?: PacketSessionRow | null;
    },
): Promise<ParticipantEnrollmentObjectiveWithContextResult> {
    const requiresConfirmation = enrollmentConfirmationPolicy();
    let loaded: EnrollmentProgressLoaded | undefined;
    const captureLoaded = (rows: EnrollmentProgressLoaded) => {
        loaded = rows;
    };
    /*
     * Where the requirements come from is the ONLY thing that differs between a journey-backed
     * participant and one working a packet an operator launched by hand. A process instance supplies
     * them from its pinned revision's stage; a packet supplies them from its own ordered steps.
     * Everything after this — needs, evidence, parties, the objective, the conversation — reads the
     * same shape and never learns which it was.
     */
    const progressResult = input.processInstanceId
        ? await resolveEnrollmentParticipantProgress(supabase, {
              orgId: input.orgId,
              processInstanceId: input.processInstanceId,
              preloadedSession: input.preloadedSession ?? null,
              captureLoaded,
          })
        : input.preloadedSession
          ? await resolvePacketParticipantProgress(supabase, {
                orgId: input.orgId,
                session: input.preloadedSession,
                captureLoaded,
            })
          : ({
                ok: false,
                refusal: {
                    code: "read_failed",
                    detail: "A packet-anchored objective needs its session.",
                },
            } as const);
    let captured: EnrollmentNeedsContext | null = null;
    const needsResult = await resolveEnrollmentInformationNeeds(supabase, {
        orgId: input.orgId,
        processInstanceId: input.processInstanceId,
        requiresConfirmation,
        canonicalValues: input.canonicalValues,
        progress: progressResult,
        // The rows progress just loaded — needs re-reads none of them.
        preloaded: loaded,
        captureContext: (ctx) => {
            captured = ctx;
        },
    });
    if (!progressResult.ok) return { ok: false, refusal: progressResult.refusal };
    if (!needsResult.ok) return { ok: false, refusal: needsResult.refusal };
    if (!captured) {
        return { ok: false, refusal: { code: "read_failed", detail: "Needs context was not captured." } };
    }

    const subjectId = (captured as EnrollmentNeedsContext).subjectId;
    const [evidenceOnFile, partyRoles, partyContext] = await Promise.all([
        resolveEvidenceOnFile(supabase, {
            orgId: input.orgId,
            sessionId: (captured as EnrollmentNeedsContext).session?.id ?? null,
        }),
        resolveTenantPartyRoles(supabase, input.orgId),
        resolveChildPartyContext(supabase, { orgId: input.orgId, customerMemberId: subjectId }),
    ]);
    const contextWithRoles = { ...(captured as EnrollmentNeedsContext), partyRoles };

    return {
        ok: true,
        value: buildParticipantObjective(
            progressResult.value,
            // Re-assembled with the vocabulary in hand: the first pass could not know which
            // destinations are party slots, so it counted six people's phone boxes as one question.
            assembleEnrollmentInformationNeeds(contextWithRoles, {
                requiresConfirmation,
                canonicalValues: input.canonicalValues,
                /*
                 * KNOWN PEOPLE BELONG TO EVERY READING OF THE OBJECTIVE, NOT JUST THE RECOMPUTE.
                 *
                 * MEASURED in the mounted conversation against a real family: the known sibling was
                 * visible on load and DISAPPEARED the moment the parent added someone — because this
                 * resolver assembled the needs without them while the post-write recompute passed
                 * them. Two readings of the same objective disagreeing about who exists is worse
                 * than neither having them: a parent watched Alloy forget their daughter.
                 */
                knownPartyEntries: knownPartyEntriesForForms(
                    contextWithRoles.forms,
                    partyContext.parties,
                    partyContext.siblings,
                ),
            }),
            {
                forms: contextWithRoles.forms,
                evidenceOnFile,
                requiresConfirmation,
                parties: partyContext.parties,
                candidates: partyContext.candidates,
                partyDeclines: readPartyOfferDeclines(contextWithRoles.session?.metadata),
            },
        ),
        context: {
            progress: progressResult.value,
            needsContext: contextWithRoles,
            requiresConfirmation,
            canonicalValues: input.canonicalValues,
            evidenceOnFile,
            parties: partyContext.parties,
            partyCandidates: partyContext.candidates,
            customerId: partyContext.customerId,
            householdChildren: partyContext.siblings,
        },
    };
}

export async function resolveParticipantEnrollmentObjective(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        /** The journey, when there is one. Null for a packet-anchored participant. */
        processInstanceId: string | null;
        /** Canonical record prefill by shared key, when the caller already holds it. */
        canonicalValues?: Readonly<Record<string, unknown>>;
        /** The session row the caller already read — see the context variant. */
        preloadedSession?: PacketSessionRow | null;
    },
): Promise<ParticipantEnrollmentObjectiveResult> {
    // One implementation: the context variant IS the resolver; this signature just drops the
    // context for callers that have no write to recompute after.
    const result = await resolveParticipantEnrollmentObjectiveWithContext(supabase, input);
    return result.ok ? { ok: true, value: result.value } : result;
}

/**
 * Which upload obligations already have a canonical Document.
 *
 * Reads `documents` by the association the upload route writes — `metadata.packet_session_id` and
 * `metadata.field_id` — rather than a form submission, because a required attachment must be
 * answerable before any artifact exists to submit. Never throws: a failed read yields an empty set,
 * which asks for the document again. Asking twice is recoverable; preparing paperwork that is
 * waiting on evidence is not.
 */
async function resolveEvidenceOnFile(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly sessionId: string | null },
): Promise<ReadonlySet<string>> {
    if (!input.sessionId) return new Set<string>();
    try {
        const { data } = await supabase
            .from("documents")
            .select("metadata")
            .eq("org_id", input.orgId)
            .contains("metadata", { packet_session_id: input.sessionId });
        const out = new Set<string>();
        for (const row of (data ?? []) as { metadata?: unknown }[]) {
            const meta = row.metadata;
            if (meta == null || typeof meta !== "object" || Array.isArray(meta)) continue;
            const fieldId = String((meta as Record<string, unknown>).field_id ?? "").trim();
            if (fieldId) out.add(fieldId);
        }
        return out;
    } catch {
        return new Set<string>();
    }
}

/**
 * The tenant's canonical person-role vocabulary.
 *
 * `customer_person_role_types` is Alloy's own seeded list — parent, guardian, emergency_contact,
 * authorized_pickup, primary_contact, payer — and it is what makes party-slot recognition a
 * property of the TENANT rather than of this packet. A read failure yields an empty vocabulary,
 * which recognises no slots and leaves the historical behaviour: worse, and not broken.
 */
async function resolveTenantPartyRoles(
    supabase: SupabaseClient,
    orgId: string,
): Promise<readonly string[]> {
    try {
        const { data } = await supabase
            .from("customer_person_role_types")
            .select("key")
            .eq("org_id", orgId)
            .eq("is_active", true);
        return ((data ?? []) as { key?: string }[])
            .map((r) => String(r.key ?? "").trim().toLowerCase())
            .filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * The canonical people around this child, and the household they belong to.
 *
 * Read once per request beside the evidence read. Never throws: with no parties the conversation
 * simply offers to add the first one.
 */
async function resolveChildPartyContext(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly customerMemberId: string | null },
): Promise<{ parties: readonly ChildParty[]; candidates: readonly ChildParty[]; customerId: string | null; siblings: Array<{ id: string; display_name: string }> }> {
    const childId = (input.customerMemberId ?? "").trim();
    if (!childId) return { parties: [], candidates: [], customerId: null, siblings: [] };
    try {
        const [parties, { data: child }] = await Promise.all([
            resolveChildParties(supabase, { orgId: input.orgId, customerMemberId: childId }),
            supabase
                .from("customer_members")
                .select("customer_id")
                .eq("org_id", input.orgId)
                .eq("id", childId)
                .maybeSingle(),
        ]);
        const customerId = String((child as { customer_id?: string } | null)?.customer_id ?? "") || null;
        const candidates = customerId
            ? await resolveHouseholdCandidates(supabase, {
                  orgId: input.orgId,
                  customerId,
                  excludePersonIds: new Set(parties.map((p) => p.person_id)),
              })
            : [];
        const siblings = customerId
            ? await resolveHouseholdSiblings(supabase, { orgId: input.orgId, customerId, excludeMemberId: childId })
            : [];
        return { parties, candidates, customerId, siblings };
    } catch {
        return { parties: [], candidates: [], customerId: null, siblings: [] };
    }
}

/**
 * Known entries across every Form in the packet, keyed by collection group id.
 *
 * One packet can carry the same collection on more than one Form; the family is one family, so the
 * entries are resolved per group and a later Form cannot contradict an earlier one about who
 * exists.
 */
function knownPartyEntriesForForms(
    forms: readonly { readonly schema: import("@/lib/forms/schema").FormSchemaV1 }[],
    parties: readonly ChildParty[],
    householdChildren: readonly { readonly id: string; readonly display_name: string }[],
): Record<string, readonly import("@/lib/enrollment/informationNeeds/participantPartyCollection").ParticipantPartyEntry[]> {
    const out: Record<string, readonly import("@/lib/enrollment/informationNeeds/participantPartyCollection").ParticipantPartyEntry[]> = {};
    for (const form of forms) {
        for (const [groupId, entries] of Object.entries(knownPartyEntriesFromParties(form.schema, parties, householdChildren))) {
            if (!out[groupId]) out[groupId] = entries;
        }
    }
    return out;
}

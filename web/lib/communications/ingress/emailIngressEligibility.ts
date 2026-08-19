/**
 * MAY Alloy ingest this email? — decided before any body or attachment is fetched.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS SEPARATELY FROM EVERYTHING ELSE IN COMMUNICATIONS
 * ---------------------------------------------------------------------------
 *
 * The certified inbound runtime answers a different question. `resolveInboundEmailOwnership`
 * answers **which tenant owns this message**, and the honest consequence of the way it
 * is built is that ownership is also, today, ADMISSION: an address matched a binding,
 * therefore the message is ingested, retrieved, stored and attributed. That is exactly
 * right while the only mail reaching Alloy is mail somebody deliberately addressed to an
 * Alloy identity — which is the posture recorded in `INBOUND-EMAIL-PRIVACY-POSTURE.md`.
 *
 * It stops being right the moment a real operational mailbox is pointed at Alloy. A
 * Director's `kelly@school.com` receives parents, banks, payroll, licensing, newsletters
 * and personal mail in one stream. Ownership resolves for all of it — the mail really was
 * addressed to a configured identity — so ownership alone would admit all of it.
 *
 * So admission gets its own authority, and it runs BEFORE retrieval:
 *
 *     envelope metadata  ->  eligibility  ->  [reject | retrieve]  ->  ownership/correlation
 *
 * ---------------------------------------------------------------------------
 * THE ONE PRINCIPLE
 * ---------------------------------------------------------------------------
 *
 * **AUTHORIZATION and INTERPRETATION are different questions, and only the first one
 * belongs here.** This module decides whether Alloy may look at the message. What the
 * message MEANS — which record, which process, which work — is decided later, by the
 * canonical ingestion path, with the body in hand. AI is never the privacy gate: by the
 * time any model sees anything, admission has already happened deterministically.
 *
 * That is why every input below is metadata a mail provider will disclose without
 * granting body access, and why nothing here reads `text`, `html`, or an attachment.
 * The function is not merely written not to; it is not GIVEN them.
 *
 * ---------------------------------------------------------------------------
 * ADMISSION EVIDENCE IS NOT IDENTITY EVIDENCE
 * ---------------------------------------------------------------------------
 *
 * The distinction that keeps this safe under spoofing. A `References` header naming
 * `alloy.{uuid}` is unguessable, so it is strong evidence that this message belongs to a
 * conversation Alloy started — but it says nothing about WHO sent it. A `From` address
 * matching a known parent is the opposite: it names somebody, and it is trivially
 * forgeable.
 *
 * So the decision carries both, separately: a `lane` (why admission is allowed) and a
 * `senderAssertion` (what may be believed about who wrote it). A message can be admitted
 * on unforgeable conversation evidence while its sender remains unverified, and the
 * downstream attribution is told so rather than inferring a Person from a display name.
 *
 * ---------------------------------------------------------------------------
 * LANE AND PURPOSE ARE ORTHOGONAL — this is a deliberate change to the proposed model
 * ---------------------------------------------------------------------------
 *
 * The sprint brief proposed one precedence list producing one answer: thread, then
 * purpose, then acquisition, then relationship. Run against real cases that collapses
 * information we need. A parent replying to an Alloy billing thread AT `invoices@`
 * matches lane A and identity purpose C at once; returning only "conversation continuity"
 * discards the purpose the recipient address supplied, and returning only "purpose intake"
 * discards the thread.
 *
 * Therefore: **precedence decides the LANE (why we are allowed in). Purpose and intake
 * role are properties of the RECIPIENT IDENTITY and are always reported alongside it.**
 * Nothing is lost, and the acquisition case stops misfiring — a reply on an existing
 * thread that happens to arrive at `enrollment@` is continuity that carries an acquisition
 * intake context, not a second Lead candidate.
 *
 * Pure. Every decision is made from values the caller supplies; loading relationships and
 * identities is the caller's job, so the precedence itself is testable without a database
 * and without a provider.
 */

import { normalizeEmailAddress } from "@/lib/communications/email/inboundEmailRouting";
import { correlationCandidates } from "@/lib/communications/email/emailMessageId";

/* ---------------------------------------------------------------------------
 * WHAT A RECIPIENT ADDRESS IS FOR
 * ------------------------------------------------------------------------- */

/**
 * What the organization dedicated this receiving address to.
 *
 * This is the property that makes Lane C and Lane D possible at all: for a dedicated
 * address the RECIPIENT is the authorization. Nobody has to be recognised, because the
 * organization already decided that everything sent here is Alloy's business.
 *
 *   conversation — a general operational address. Mail here is admitted only on other
 *                  evidence (a thread, a known relationship, an explicit allow). This is
 *                  the mixed human inbox, and the reason the whole gate exists.
 *   purpose      — dedicated to one kind of operational work: `subsidy@`, `invoices@`,
 *                  `licensing@`. Unknown senders are EXPECTED and admitted.
 *   acquisition  — dedicated to inbound demand: `enrollment@`, `admissions@`. Unknown
 *                  senders are the point. Admitted as a candidate — never as a Lead;
 *                  creating records from unauthenticated mail is a separate decision with
 *                  a separate boundary, and it is not this one.
 */
export type IngressIdentityRole = "conversation" | "purpose" | "acquisition";

export type IngressIdentity = {
    /** Visible identity address, or a routed ingress destination. Compared normalized. */
    address: string;
    role: IngressIdentityRole;
    /**
     * Domain vocabulary for a `purpose` identity — `subsidy_intake`, `invoice_intake`.
     *
     * Deliberately NOT the outbound `purpose` registry key from
     * `lib/communications/purpose/purposeRegistry.ts`. That vocabulary governs what a
     * capability may EMIT and is compliance-inert by design; this one describes why a
     * message was ACCEPTED. Same word, opposite direction, and conflating them would let
     * an intake configuration widen what Alloy is permitted to send.
     */
    intakePurposeKey?: string | null;
};

/* ---------------------------------------------------------------------------
 * WHAT MAY BE KNOWN ABOUT A SENDER
 * ------------------------------------------------------------------------- */

/**
 * The relationship kinds admission can be keyed on.
 *
 * Enumerated rather than free-form because Lane B's whole risk is a rule that reads
 * "this address exists somewhere in Alloy". An emergency contact's address exists. A
 * former family's address exists. A staff member's personal address exists. None of
 * those are the same permission, and a `string` here would let them become one.
 */
export type IngressRelationshipKind =
    | "guardian"
    | "prospective_guardian"
    | "staff"
    | "vendor"
    | "agency"
    | "emergency_contact"
    | "former_guardian";

export type IngressRelationshipStatus = "active" | "inactive";

export type SenderRelationship = {
    kind: IngressRelationshipKind;
    status: IngressRelationshipStatus;
    /**
     * Persons holding this address in this organization.
     *
     * More than one is a shared household endpoint. It does NOT block admission — the
     * relationship is real — but it must not produce a Person, which is the rule the
     * certified SMS and email runtimes already hold.
     */
    personIds: string[];
};

/* ---------------------------------------------------------------------------
 * THE ENVELOPE — metadata only, by construction
 * ------------------------------------------------------------------------- */

/**
 * How much a transport could prove about where this message came from.
 *
 * `pass` means SPF/DKIM/DMARC alignment was asserted by the receiving transport.
 * `unknown` is the honest value when the transport did not report it, and is treated
 * exactly like `fail` wherever authentication is load-bearing — an unreported check is
 * not a passed check.
 */
export type SenderAuthentication = "pass" | "fail" | "unknown";

/**
 * Everything the gate is allowed to see.
 *
 * Every field here is obtainable from at least one provider without body access:
 * Gmail `messages.get?format=METADATA`, Graph `$select` under `Mail.ReadBasic`, or the
 * Resend `email.received` webhook. `subject` is included because providers disclose it in
 * metadata and an operator will ask why a message was refused — but NOTHING in this
 * module keys admission on it. Subject is display, never authority: it is trivially
 * forged and it is the one metadata field that routinely carries content.
 */
export type EmailIngressEnvelope = {
    /** Every address that could name an Alloy identity: To, Cc, and envelope/received-for. */
    recipients: string[];
    /** The `From` header address. Forgeable — see `senderAssertion`. */
    sender: string;
    /** SMTP `MAIL FROM`, when the transport reports it. Differs from `sender` on forwards. */
    envelopeSender?: string | null;
    /** The sender's own RFC Message-ID. Never Alloy's, and never ownership evidence. */
    messageId?: string | null;
    inReplyTo?: string | null;
    references?: string | null;
    /**
     * The provider's own thread key (Gmail `threadId`, Graph `conversationId`).
     *
     * Reported so a connector can carry it, and deliberately NOT admission evidence: it
     * is the provider's opinion about grouping in the CUSTOMER's mailbox, formed from
     * subject and participants, and it groups mail Alloy has no claim to.
     */
    providerThreadId?: string | null;
    subject?: string | null;
    hasAttachments?: boolean;
    authentication?: SenderAuthentication;
};

/* ---------------------------------------------------------------------------
 * POLICY
 * ------------------------------------------------------------------------- */

export type EmailIngressPolicy = {
    orgId: string;
    /** Receiving identities configured for this organization. */
    identities: IngressIdentity[];
    /**
     * Which relationships the administrator turned ON for Lane B, per address role.
     *
     * Empty means Lane B is off, which is the correct default: connecting a mailbox must
     * not silently mean "and also ingest everything from anyone we recognise". The
     * administrator opts in per relationship kind, and the UI in
     * `EMAIL-INGRESS-V2-CAPABILITY-AUDIT.md` renders exactly this set.
     */
    watchedRelationshipKinds: IngressRelationshipKind[];
    /**
     * Addresses the organization named explicitly. Lowest-precedence admission, and the
     * escape hatch for a real relationship Alloy's data model does not hold yet.
     */
    explicitAllowAddresses?: string[];
    /**
     * Refuse Lane B when sender authentication did not pass.
     *
     * Defaults to true and should stay true. Lane B admits on `From`, and `From` is a
     * claim, not a fact. Without this a spoofed display-name attack is admitted, attributed
     * to a real parent, and lands in that family's hub — the exact case the pressure test
     * calls out. Lanes A, C and D are unaffected: their evidence is the unguessable
     * `alloy.` token or the recipient address, neither of which the sender controls.
     */
    requireAuthenticatedSenderForRelationshipWatch?: boolean;
};

export type EmailIngressContext = {
    envelope: EmailIngressEnvelope;
    policy: EmailIngressPolicy;
    /** The sender's relationships in this organization. Empty = unknown sender. */
    senderRelationships: SenderRelationship[];
    /**
     * True when at least one `alloy.{uuid}` id in In-Reply-To/References resolves to a
     * message in THIS organization.
     *
     * A boolean, not the ids — because the caller must have done the org-scoped lookup
     * to know it. Handing this module raw ids would invite it to treat "the header is
     * well-formed" as "the thread is ours", which is precisely how a valid id naming
     * another tenant's message would pull mail across the boundary.
     */
    hasResolvableAlloyThread: boolean;
};

/* ---------------------------------------------------------------------------
 * THE DECISION
 * ------------------------------------------------------------------------- */

export type EmailIngressLane =
    /** A — a reply to something Alloy sent. Unforgeable, and needs no AI. */
    | "conversation_continuity"
    /** C — the recipient address is dedicated to a kind of work. Sender need not be known. */
    | "purpose_intake"
    /** D — the recipient address is dedicated to inbound demand. Unknown senders expected. */
    | "acquisition"
    /** B — the sender holds a relationship the administrator opted into watching. */
    | "relationship_watch"
    /** The organization named this address explicitly. */
    | "explicit_allow";

export type EmailIngressRefusal =
    /** No configured identity appears among the recipients. Not Alloy's mail at all. */
    | "not_addressed_to_alloy"
    /** Addressed to a general operational identity, and nothing else admitted it. */
    | "no_admitting_evidence"
    /** A watched relationship exists, but the sender could not be authenticated. */
    | "relationship_unauthenticated"
    /** The relationship exists and is not one the administrator watches. */
    | "relationship_not_watched"
    /** The relationship is watched but no longer active. */
    | "relationship_inactive";

/**
 * What the caller is authorized to fetch as a result of this decision.
 *
 * `none` is the load-bearing value and the reason this type exists: it is what lets an
 * ingress receipt record that a message arrived and its body was never requested. A
 * connector treats this as its retrieval budget, not as advice.
 */
export type IngressRetrievalGrant = "none" | "full";

/** What may be believed about who wrote this, kept apart from why it was admitted. */
export type SenderAssertion =
    /** Relationship held AND authentication passed. A Person may be asserted. */
    | { kind: "verified_relationship"; relationship: SenderRelationship; personId: string }
    /** Relationship held on an address several Persons share. Real, but names nobody. */
    | { kind: "shared_endpoint"; relationship: SenderRelationship }
    /** Relationship held, authentication did not pass. Admitted on other evidence only. */
    | { kind: "unverified_relationship"; relationship: SenderRelationship }
    /** Nothing is known about this sender, and nothing should be inferred. */
    | { kind: "unknown" };

export type EmailIngressDecision =
    | {
          admitted: true;
          lane: EmailIngressLane;
          retrieval: IngressRetrievalGrant;
          /** The matched identity, and therefore the intake context the address supplies. */
          identity: IngressIdentity;
          intakePurposeKey: string | null;
          senderAssertion: SenderAssertion;
          /** Human-auditable statement of what actually proved admission. */
          evidence: string;
      }
    | {
          admitted: false;
          refusal: EmailIngressRefusal;
          retrieval: "none";
          /** The identity that was addressed, when one was — null for `not_addressed_to_alloy`. */
          identity: IngressIdentity | null;
          evidence: string;
      };

/* ---------------------------------------------------------------------------
 * RESOLUTION
 * ------------------------------------------------------------------------- */

function normalizedSet(values: readonly (string | null | undefined)[]): string[] {
    const out: string[] = [];
    for (const raw of values) {
        const address = normalizeEmailAddress(raw);
        if (address && !out.includes(address)) out.push(address);
    }
    return out;
}

/**
 * The identity this message was addressed to, and there may be several.
 *
 * Ordered so the MOST SPECIFIC dedication wins: a message sent to both `enrollment@` and
 * `kelly@` was sent to the acquisition address, and treating it as general mail to a human
 * would refuse mail the organization dedicated to Alloy. `purpose` outranks `acquisition`
 * for the same reason — a purpose address names a narrower commitment.
 */
const ROLE_SPECIFICITY: Record<IngressIdentityRole, number> = {
    purpose: 3,
    acquisition: 2,
    conversation: 1,
};

export function resolveAddressedIdentity(
    envelope: EmailIngressEnvelope,
    identities: readonly IngressIdentity[]
): IngressIdentity | null {
    const recipients = normalizedSet(envelope.recipients);
    if (recipients.length === 0) return null;

    let best: IngressIdentity | null = null;
    for (const identity of identities) {
        const address = normalizeEmailAddress(identity.address);
        if (!address || !recipients.includes(address)) continue;
        if (!best || ROLE_SPECIFICITY[identity.role] > ROLE_SPECIFICITY[best.role]) best = identity;
    }
    return best;
}

/**
 * Does this message carry an Alloy conversation token at all?
 *
 * Shape only. Whether the token names a message in THIS organization is
 * `hasResolvableAlloyThread`, which the caller establishes with an org-scoped lookup —
 * see the note on that field.
 */
export function carriesAlloyThreadToken(envelope: EmailIngressEnvelope): boolean {
    return (
        correlationCandidates({
            inReplyTo: envelope.inReplyTo ?? null,
            references: envelope.references ?? null,
        }).length > 0
    );
}

function authenticationPassed(envelope: EmailIngressEnvelope): boolean {
    return (envelope.authentication ?? "unknown") === "pass";
}

/**
 * The strongest relationship the sender holds that the administrator opted into.
 *
 * Strongest by watch order, not by an invented ranking: the administrator's list IS the
 * precedence, so a policy that watches guardians and not vendors cannot be talked into a
 * vendor admission by a Person who happens to be both.
 */
function watchedRelationship(
    relationships: readonly SenderRelationship[],
    watched: readonly IngressRelationshipKind[]
): SenderRelationship | null {
    for (const kind of watched) {
        const match = relationships.find((r) => r.kind === kind && r.status === "active");
        if (match) return match;
    }
    return null;
}

function assertSender(
    relationships: readonly SenderRelationship[],
    policy: EmailIngressPolicy,
    envelope: EmailIngressEnvelope
): SenderAssertion {
    const watched = watchedRelationship(relationships, policy.watchedRelationshipKinds);
    const relationship = watched ?? relationships.find((r) => r.status === "active") ?? relationships[0];
    if (!relationship) return { kind: "unknown" };

    // A shared household endpoint is checked BEFORE authentication, because it is a
    // property of the data and not of the message: even a perfectly authenticated email
    // from an address two Persons hold names neither of them.
    if (relationship.personIds.length !== 1) return { kind: "shared_endpoint", relationship };
    if (!authenticationPassed(envelope)) return { kind: "unverified_relationship", relationship };
    return { kind: "verified_relationship", relationship, personId: relationship.personIds[0]! };
}

/**
 * Decide whether Alloy may ingest this message.
 *
 * PRECEDENCE, and why it is this order:
 *
 *   0. addressed to a configured identity — not precedence, a precondition. Mail naming
 *      no Alloy identity is not refused, it is simply not ours, and saying so with its own
 *      refusal keeps "we declined this" distinct from "this was never offered".
 *
 *   1. conversation continuity — the only evidence the sender cannot manufacture. It
 *      outranks everything, including a purpose address, because a reply to a conversation
 *      Alloy started is unambiguously Alloy's business whatever door it came through.
 *
 *   2. purpose intake, 3. acquisition — the recipient is the authorization. These sit
 *      above relationship because they depend on nothing that can go stale: an address the
 *      organization dedicated to subsidy work is dedicated whether or not the subsidy
 *      worker is in our database.
 *
 *   4. relationship watch — real, and the weakest of the admitting lanes, because it is
 *      the only one whose evidence the sender supplies.
 *
 *   5. explicit allow — last, so it can never quietly pre-empt a lane that would have
 *      recorded better evidence for the same admission.
 *
 *   6. refuse, with `retrieval: "none"`.
 */
export function evaluateEmailIngressEligibility(ctx: EmailIngressContext): EmailIngressDecision {
    const { envelope, policy } = ctx;

    const identity = resolveAddressedIdentity(envelope, policy.identities);
    if (!identity) {
        return {
            admitted: false,
            refusal: "not_addressed_to_alloy",
            retrieval: "none",
            identity: null,
            evidence: "No configured receiving identity appears among the recipients.",
        };
    }

    const intakePurposeKey = identity.role === "purpose" ? (identity.intakePurposeKey ?? null) : null;
    const senderAssertion = assertSender(ctx.senderRelationships, policy, envelope);
    const admit = (lane: EmailIngressLane, evidence: string): EmailIngressDecision => ({
        admitted: true,
        lane,
        retrieval: "full",
        identity,
        intakePurposeKey,
        senderAssertion,
        evidence,
    });

    // 1 — Lane A.
    if (ctx.hasResolvableAlloyThread) {
        return admit(
            "conversation_continuity",
            "In-Reply-To/References names an Alloy-minted Message-ID resolving to a conversation in this organization."
        );
    }

    // 2 — Lane C.
    if (identity.role === "purpose") {
        return admit(
            "purpose_intake",
            `Addressed to the dedicated purpose identity ${identity.address}${
                intakePurposeKey ? ` (${intakePurposeKey})` : ""
            }; the recipient supplies the authorization.`
        );
    }

    // 3 — Lane D.
    if (identity.role === "acquisition") {
        return admit(
            "acquisition",
            `Addressed to the dedicated acquisition identity ${identity.address}; unknown senders are expected here.`
        );
    }

    // 4 — Lane B. Only reachable for a general operational identity.
    const watched = watchedRelationship(ctx.senderRelationships, policy.watchedRelationshipKinds);
    if (watched) {
        const requireAuth = policy.requireAuthenticatedSenderForRelationshipWatch !== false;
        if (requireAuth && !authenticationPassed(envelope)) {
            return {
                admitted: false,
                refusal: "relationship_unauthenticated",
                retrieval: "none",
                identity,
                evidence: `Sender claims an address holding a watched ${watched.kind} relationship, but sender authentication reported "${
                    envelope.authentication ?? "unknown"
                }". Admission on an unauthenticated From would admit a spoof.`,
            };
        }
        return admit(
            "relationship_watch",
            `Sender holds an active watched ${watched.kind} relationship and sender authentication passed.`
        );
    }

    // 5 — explicit allow.
    const sender = normalizeEmailAddress(envelope.sender);
    const allowed = normalizedSet(policy.explicitAllowAddresses ?? []);
    if (sender && allowed.includes(sender)) {
        return admit("explicit_allow", `Sender ${sender} is on the organization's explicit allow list.`);
    }

    // 6 — refuse, as narrowly as the facts allow. The distinction between these matters
    // to an administrator: "we do not watch vendors" is a setting they can change, and
    // "this person is no longer enrolled" is not.
    const anyRelationship = ctx.senderRelationships[0] ?? null;
    if (anyRelationship) {
        const watchedKinds = policy.watchedRelationshipKinds;
        const kindIsWatched = ctx.senderRelationships.some((r) => watchedKinds.includes(r.kind));
        if (kindIsWatched) {
            return {
                admitted: false,
                refusal: "relationship_inactive",
                retrieval: "none",
                identity,
                evidence: `Sender holds a watched ${anyRelationship.kind} relationship, but it is not active.`,
            };
        }
        return {
            admitted: false,
            refusal: "relationship_not_watched",
            retrieval: "none",
            identity,
            evidence: `Sender holds a ${anyRelationship.kind} relationship, which this organization does not watch.`,
        };
    }

    return {
        admitted: false,
        refusal: "no_admitting_evidence",
        retrieval: "none",
        identity,
        evidence:
            "Addressed to a general operational identity with no Alloy conversation, no watched relationship and no explicit allow. Body and attachments were never requested.",
    };
}

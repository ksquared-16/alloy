/**
 * Authority → Standing resolution (P1 · Wave C · Slice C1).
 *
 * A PURE function that resolves the effective Standing of an authoring act from its
 * Authority facet + author class + modality + the actor's HELD authority. No IO, no
 * ledger write, no ratification side effect — it only computes meaning (Standing is
 * meaning, Law 6). Wave C Slice C2 wires this into the intake and adds the
 * ratification act; C1 establishes and proves the resolution logic ALONE, so no
 * expectation is made binding by this slice.
 *
 * Frozen rules (System Design §5 author-class table + §12 Security; Engineering
 * Realization X0):
 *   - Standing = proposed (AI / low-trust external / any deontic awaiting
 *     ratification) · binding (authorized human/policy/process holding the
 *     Authority — "self-ratifying within authority") · model (a `predicted`
 *     expectation imposes no obligation, so it may stand at model unratified).
 *   - Authority is a tuple facet: an author may assert only expectations whose
 *     Authority they hold; a deontic/commissive act NOT backed by held authority
 *     lands `proposed` and REQUIRES a ratification act (Wave C · C2) to bind.
 *   - AI never self-ratifies → AI never resolves to binding.
 *   - Possession of service-role credentials is NOT authority (the caller supplies
 *     no authority here — `heldAuthorities` comes from the trusted access context).
 *
 * This slice makes NOTHING binding in the ledger: it is a pure resolver + tests.
 */

import type {
    ExpectationAuthorClass,
    ExpectationStanding,
    OperationalModality,
} from "@/lib/operationalExpectations/expectationLedgerContract";

/** The mapped trust level of an external authoring source (§5 External row). */
export type ExternalTrustLevel = "high" | "low";

/**
 * Inputs to Authority→Standing resolution. Every field is server-trusted: the
 * actor's held authorities come from the resolved access context (Wave B), never
 * from client input. `claimedAuthorityKey` is the tuple's declared Authority facet.
 */
export interface AuthorityResolutionInput {
    authorClass: ExpectationAuthorClass;
    modality: OperationalModality;
    /** The Authority the tuple is asserted under (the tuple's authority_key). */
    claimedAuthorityKey: string;
    /** Authority keys the ACTOR actually holds (server-resolved). */
    heldAuthorities: readonly string[];
    /**
     * For `policy` / `process` acts: whether the definition's configured authority
     * ratifies at authoring time (§5 — policy ratified at policy-authoring time;
     * process ratified by the process definition's configured authority).
     */
    definitionRatifies?: boolean;
    /** For `external` acts: the source's mapped trust level (§5 External row). */
    externalTrust?: ExternalTrustLevel;
}

/** The resolved Standing plus the audit reason + whether a ratification act is still owed. */
export interface StandingResolution {
    standing: ExpectationStanding;
    /**
     * True when a deontic/commissive act landed `proposed` and can only bind via a
     * later ratification act (Wave C · C2). `binding` and `model` never require it.
     */
    requiresRatification: boolean;
    reason: string;
}

/** The deontic/commissive modalities — the only ones that can be "violated" and that bind. */
const DEONTIC_MODALITIES: ReadonlySet<OperationalModality> = new Set([
    "required",
    "prohibited",
    "intended",
    "committed",
]);

function holdsClaimedAuthority(input: AuthorityResolutionInput): boolean {
    return input.claimedAuthorityKey.trim().length > 0
        && input.heldAuthorities.includes(input.claimedAuthorityKey);
}

function proposed(reason: string, modality: OperationalModality): StandingResolution {
    return { standing: "proposed", requiresRatification: DEONTIC_MODALITIES.has(modality), reason };
}

/**
 * Resolve the effective Standing. PURE. Never returns binding for AI; returns
 * `model` for `predicted`; returns `binding` only for a human/policy/process whose
 * held authority self-ratifies; everything else (incl. low-trust external and
 * unbacked deontic) lands `proposed` pending a ratification act.
 */
export function resolveAuthorityToStanding(input: AuthorityResolutionInput): StandingResolution {
    // A `predicted` expectation imposes no obligation → model standing (§12),
    // regardless of author class. It never binds and never needs ratification.
    if (input.modality === "predicted") {
        return { standing: "model", requiresRatification: false, reason: "predicted imposes no obligation → model standing" };
    }

    switch (input.authorClass) {
        case "ai":
            // AI only proposes; it never self-ratifies (§12). Non-predicted → proposed.
            return proposed("AI authors only proposed expectations; ratification required to bind", input.modality);

        case "human":
            // Self-ratifying within authority: binding iff the actor holds the claimed Authority.
            return holdsClaimedAuthority(input)
                ? { standing: "binding", requiresRatification: false, reason: "human holds the claimed authority → self-ratifying (binding)" }
                : proposed("human does not hold the claimed authority → proposed pending ratification", input.modality);

        case "policy":
            // Ratified at policy-authoring time by the definition's configured authority.
            return input.definitionRatifies === true && holdsClaimedAuthority(input)
                ? { standing: "binding", requiresRatification: false, reason: "policy ratified at authoring time by its configured authority → binding" }
                : proposed("policy not ratified by its configured authority → proposed", input.modality);

        case "process":
            // Ratified by the process definition's configured authority.
            return input.definitionRatifies === true && holdsClaimedAuthority(input)
                ? { standing: "binding", requiresRatification: false, reason: "process step ratified by the definition's configured authority → binding" }
                : proposed("process step not ratified by its configured authority → proposed", input.modality);

        case "external":
            // Standing = the source's mapped trust level; low-trust lands proposed.
            return input.externalTrust === "high" && holdsClaimedAuthority(input)
                ? { standing: "binding", requiresRatification: false, reason: "high-trust external source holding the authority → binding" }
                : proposed("external source is low-trust or lacks the authority → proposed pending ratification", input.modality);

        default: {
            // Exhaustiveness guard — an unknown author class never binds.
            const _never: never = input.authorClass;
            return proposed(`unknown author class '${String(_never)}' → proposed (fail-closed)`, input.modality);
        }
    }
}

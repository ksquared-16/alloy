/**
 * Which conversation does this message belong to, now that conversations have a
 * location?
 *
 * ONE RULE, used by every path — outbound enqueue, inbound email, inbound SMS —
 * so the same family cannot be filed one way when they are written to and another
 * way when they write back.
 *
 * The rule:
 *
 *   1. A thread already at the SAME location is the conversation. Exact match wins.
 *   2. Otherwise, a thread with NO location is ADOPTED: it is stamped with the
 *      location and continues. It is not abandoned and a second thread is not
 *      created.
 *   3. Otherwise, a new thread is created at this location.
 *
 * **Why adoption, and why it is not a fudge.** A thread with `location_id IS NULL`
 * means location was never established — every thread in the system was in that
 * state before this slice, and every conversation that starts from a context
 * without a location still is. When location later becomes known, the honest
 * outcome is that we now know where the existing conversation belongs, not that a
 * second conversation has begun. Creating one would split a family's history at
 * the arbitrary moment Alloy learned something, which is the "do not split a
 * conversation unnecessarily" requirement stated exactly.
 *
 * **What adoption must never do — and this is the sharp edge.** Adoption only ever
 * moves NULL → a location. It never moves one location to another, and it never
 * moves a location back to NULL:
 *
 *   - Riverside thread + Lakeside message → NEW Lakeside thread. The same parent
 *     talking to two locations gets two conversations, never cross-filed. This is
 *     the whole point of the feature.
 *   - Riverside thread + location-less message → the Riverside thread is NOT
 *     matched and NOT downgraded. A message that simply lacks location evidence
 *     must not erase location evidence that was already established.
 *
 * That last case deserves care: it means a location-less send can create an
 * organization-level thread alongside an existing Riverside one. That is correct.
 * The alternative — letting an unlocated message join a located conversation —
 * would make the located thread's location a lie, and the reply would go out from
 * the wrong identity.
 *
 * Pure: candidates in, decision out. The I/O lives with each caller.
 */

/** The subset of a thread row this decision needs. */
export type ThreadLocationCandidate = {
    id: string;
    location_id: string | null;
};

export type ThreadLocationDecision =
    /** Use this thread as-is — same location, or both unlocated. */
    | { kind: "use"; threadId: string }
    /** Use this thread and stamp it with the location it turns out to belong to. */
    | { kind: "adopt"; threadId: string; locationId: string }
    /** Nothing here belongs to this location. Create one. */
    | { kind: "create"; locationId: string | null };

function normalize(value: string | null | undefined): string | null {
    const v = (value ?? "").trim();
    return v ? v : null;
}

/**
 * Decide which of the candidate threads (all sharing org + entity + channel +
 * recipient) this message belongs to.
 *
 * Candidates are expected to be few — the identity constraint permits at most one
 * per distinct location — so the scan is linear and order-independent.
 */
export function decideThreadForLocation(params: {
    candidates: ThreadLocationCandidate[];
    /** The location this message belongs to, or null when none is established. */
    locationId: string | null | undefined;
    /**
     * Whether an unlocated conversation may be adopted into this location.
     *
     * TRUE for OUTBOUND. The conversation has no location because none was ever
     * established, and the sending context now supplies one. Nothing competes.
     *
     * FALSE for INBOUND, and the distinction is not fussiness — it is a defect
     * found in certification. A family wrote to `riverside@`, which adopted their
     * existing organization-level conversation into Riverside; their next message
     * to the general address was then filed at Riverside too. An unlocated thread
     * that has been receiving organization-addressed mail is not "location
     * unknown", it is organization-level, and inbound must not overwrite that.
     * The receiving address states where THIS message belongs, not where the
     * whole history did.
     */
    adopt?: boolean;
}): ThreadLocationDecision {
    const wanted = normalize(params.locationId);
    const candidates = params.candidates ?? [];
    const mayAdopt = params.adopt !== false;

    // 1. Exact match — including "both unlocated", which is the organization-level
    //    conversation and the behaviour every existing thread already has.
    const exact = candidates.find((c) => normalize(c.location_id) === wanted);
    if (exact) return { kind: "use", threadId: exact.id };

    // 2. Adoption, and ONLY upward from unlocated. When this message has no
    //    location there is nothing to adopt with, so this branch cannot run —
    //    which is precisely what stops a located thread being downgraded.
    if (wanted !== null && mayAdopt) {
        const unlocated = candidates.find((c) => normalize(c.location_id) === null);
        if (unlocated) return { kind: "adopt", threadId: unlocated.id, locationId: wanted };
    }

    // 3. A conversation with this location does not exist yet.
    return { kind: "create", locationId: wanted };
}

/**
 * The location a message belongs to, given what each source claims.
 *
 * Inbound is deliberately NOT a vote among signals. The receiving identity — the
 * address or number the family actually wrote to — is the only inbound evidence
 * this platform will act on. Sender identity and household membership are
 * explicitly excluded: a parent's phone number says who they are, never which
 * campus they meant, and inferring a location from the household would silently
 * file a Lakeside message under Riverside because that is where a sibling is
 * enrolled.
 */
export function resolveInboundThreadLocation(params: {
    /** location_id of the binding that owns the receiving address/number. */
    receivingBindingLocationId: string | null | undefined;
}): string | null {
    return normalize(params.receivingBindingLocationId);
}

/**
 * The location an outbound message belongs to, from the operational context that
 * originated it (record, process, or conversation).
 *
 * A thin function on purpose: it exists so callers name the rule rather than each
 * deciding what "the location" means, and so the outbound rule has somewhere to
 * grow if context ever supplies more than one candidate.
 */
export function resolveOutboundThreadLocation(params: {
    contextLocationId: string | null | undefined;
}): string | null {
    return normalize(params.contextLocationId);
}


/**
 * May a conversation found by CORRELATION be used for this message?
 *
 * Correlation (In-Reply-To, References, endpoint provenance) answers "which
 * conversation is this a reply to". It does not answer "which location", and it
 * runs before location is considered — so without this check it silently
 * overrides the location rule.
 *
 * That is not hypothetical: in certification, a message addressed to the
 * organization's general address was filed into a Riverside conversation because
 * correlation matched the same sender first. Threading evidence must never move a
 * message across locations, exactly as it must never move one across tenants.
 *
 * An unlocated correlated thread is acceptable for an unlocated message only.
 */
export function correlationUsableForLocation(params: {
    correlatedThreadLocationId: string | null | undefined;
    messageLocationId: string | null | undefined;
}): boolean {
    return normalize(params.correlatedThreadLocationId) === normalize(params.messageLocationId);
}

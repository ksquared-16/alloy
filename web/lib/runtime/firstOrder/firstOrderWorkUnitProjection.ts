/**
 * THE FIRST-ORDER WORK UNIT PROJECTION (P0-7.6 · A′ Slice 1 item A).
 *
 * The minimum AUTHORITATIVE state required to render the operator's initial Work Unit frame.
 *
 * This is a contract, not a container. The thing it exists to prevent is the current shape: one
 * ~85.6 KB answer carrying everything any surface might want, which couples the first frame to the
 * cost of the whole composition. A projection that simply renamed that payload would remove
 * nothing, so the rule is that a field belongs here only if the operator SEES it on the first
 * frame — proven by tracing the consumer to a rendered face, not by its name.
 *
 * MEMBERSHIP IS CONFIGURATION-DRIVEN. Cards, KPI slots and Work Views come from published
 * configuration, so nothing here may assume today's six cards. `configurationIdentity` exists so
 * that a projection built under one configuration cannot satisfy a request under another.
 *
 * STAGE 2 MAY ADD DETAIL; IT MAY NOT CORRECT STAGE 1. Anything Stage 2 can supply — nested
 * surfaces, Recent activity, payment applications, rails, expanded contacts, avatars, drawer
 * content — is deliberately absent. See firstOrderStageTwoMonotonicity.test.ts.
 *
 * NOTHING HERE IS MAINTAINED. Every field is read at request time from its canonical owner, and
 * authorization is evaluated at request time. No permission verdict is transported.
 */

/**
 * THE STATE MODEL — the reason this is not a bag of nullable primitives.
 *
 * A nullable number cannot distinguish "this account has no prepaid money" from "the prepaid read
 * failed", and a renderer handed `null` will choose one, usually zero. That is the specific defect
 * the product contract forbids: UNKNOWN is not ZERO, UNAVAILABLE is not EMPTY, FORBIDDEN is not
 * EMPTY. Making the state explicit is what stops a renderer collapsing them by accident, because
 * there is no primitive to collapse — the caller must handle the case to reach the value.
 */
export type FirstOrderField<T> =
    /** The owner answered, and this is the answer. `value` may legitimately be empty or zero. */
    | { readonly state: "known"; readonly value: T }
    /**
     * The owner answered and there is genuinely nothing. Distinct from `known` with an empty value
     * only where the domain needs "we looked and there are none" to read differently from a count
     * of zero; most callers treat them alike, and the distinction is available when they must not.
     */
    | { readonly state: "known_empty" }
    /** Not yet resolved, and Stage 2 may fill it. The ONLY state Stage 2 is permitted to replace. */
    | { readonly state: "unknown" }
    /** The owner was asked and could not answer. Never renders as empty or zero. */
    | { readonly state: "unavailable"; readonly reason: string }
    /** The caller may not see this. Never renders as empty, and never silently omitted. */
    | { readonly state: "forbidden" };

export const known = <T,>(value: T): FirstOrderField<T> => ({ state: "known", value });
export const knownEmpty = <T,>(): FirstOrderField<T> => ({ state: "known_empty" });
export const unknown = <T,>(): FirstOrderField<T> => ({ state: "unknown" });
export const unavailable = <T,>(reason: string): FirstOrderField<T> => ({ state: "unavailable", reason });
export const forbidden = <T,>(): FirstOrderField<T> => ({ state: "forbidden" });

/**
 * Read a field for display without collapsing its state.
 *
 * Deliberately requires a handler per state rather than offering a `valueOr(default)` helper: a
 * default is exactly how UNKNOWN becomes ZERO, and a convenience that makes the wrong thing easy
 * would undo the type.
 */
export function foldField<T, R>(
    field: FirstOrderField<T>,
    handlers: {
        known: (value: T) => R;
        knownEmpty: () => R;
        unknown: () => R;
        unavailable: (reason: string) => R;
        forbidden: () => R;
    },
): R {
    switch (field.state) {
        case "known": return handlers.known(field.value);
        case "known_empty": return handlers.knownEmpty();
        case "unknown": return handlers.unknown();
        case "unavailable": return handlers.unavailable(field.reason);
        case "forbidden": return handlers.forbidden();
    }
}

/**
 * CONFIGURATION IDENTITY — so configuration N cannot satisfy configuration N+1.
 *
 * Published configuration decides which cards, KPI slots and Work Views exist and in what order.
 * A projection cached, compared or reused across a configuration change would render a stale
 * surface that looks correct. Card ORDER is included because geometry depends on it: a reorder
 * changes the frame even though every card's semantic identity is unchanged.
 */
export type FirstOrderConfigurationIdentity = {
    /** Configured card keys, IN ORDER. Order is part of identity because geometry depends on it. */
    readonly cardKeys: readonly string[];
    /** Configured KPI slot keys, in order. */
    readonly kpiKeys: readonly string[];
    /** Configured Work View ids, in order. */
    readonly workViewIds: readonly string[];
    /**
     * Each configured card's first-order semantic keys, IN CONFIGURED ORDER.
     *
     * Card membership alone cannot identify a frame. Two frames can agree on six cards and
     * disagree about what those cards say, and a projection answering for the wrong field set is
     * as stale as one answering for the wrong cards — it just fails less visibly, as a region
     * that renders the previous tenant's choice. Order is carried because field order is
     * configured presentation and a reorder is a different frame.
     */
    readonly cardFields: Readonly<Record<string, readonly string[]>>;
    /** The scope the frame was composed under; a site change is a different frame. */
    readonly siteScopeId: string | null;
};

/**
 * GEOMETRY — enough for the first frame to render its FINAL structure immediately.
 *
 * Stage 2 must not insert, remove or relocate a Stage-1 element. The frame reserves its regions
 * from configuration up front, so a later arrival fills a space that was already there.
 */
export type FirstOrderGeometry = {
    readonly cardOrder: readonly string[];
    /**
     * Reserved field slots per card, in configured order.
     *
     * Geometry has to include this or a card cannot reserve its regions: knowing a Financials
     * card is second tells the frame nothing about how many lines it will occupy. It is derived
     * from CONFIGURATION, never from which providers happened to resolve — a slow read must
     * change when a value arrives, never whether its space exists.
     */
    readonly cardFieldSlots: Readonly<Record<string, readonly string[]>>;
    readonly kpiSlotCount: number;
    readonly workViewCount: number;
};

/** A configured card's first-order summary: whatever its collapsed face actually renders. */
export type FirstOrderCardSummary = {
    readonly cardKey: string;
    /** The collapsed insight line, when the card publishes one. */
    readonly insight: FirstOrderField<string>;
    /** Named scalars the collapsed face shows. Each carries its own state. */
    readonly facts: Readonly<Record<string, FirstOrderField<string | number>>>;
};

export type FirstOrderQueueRow = {
    readonly id: string;
    readonly title: FirstOrderField<string>;
    readonly stageKey: FirstOrderField<string>;
    /** Viewer-scoped and request-time; never maintained. */
    readonly personalSeen: FirstOrderField<boolean>;
};

/**
 * The projection itself.
 *
 * Card summaries are keyed by configured card key rather than named as fields, so adding or
 * removing a card is a configuration change and not a type change. That is what keeps the six-card
 * specimen from becoming an assumption.
 */
export type FirstOrderWorkUnitProjection = {
    readonly workUnitId: string;
    readonly subjectId: FirstOrderField<string>;
    readonly configurationIdentity: FirstOrderConfigurationIdentity;
    readonly geometry: FirstOrderGeometry;
    readonly queueRows: FirstOrderField<readonly FirstOrderQueueRow[]>;
    readonly kpiValues: Readonly<Record<string, FirstOrderField<number>>>;
    readonly workViewTotals: Readonly<Record<string, FirstOrderField<number>>>;
    readonly cards: Readonly<Record<string, FirstOrderCardSummary>>;
};

/**
 * Does this projection answer for the configuration the caller is rendering?
 *
 * Compared field by field rather than by a hash, so a mismatch says WHICH dimension moved. A hash
 * would answer "no" and leave the caller to guess whether a card was added or a site changed.
 */
export function projectionMatchesConfiguration(
    projection: FirstOrderWorkUnitProjection,
    current: FirstOrderConfigurationIdentity,
): { matches: true } | { matches: false; reason: string } {
    const a = projection.configurationIdentity;
    const same = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
    if (!same(a.cardKeys, current.cardKeys)) return { matches: false, reason: "card membership or order changed" };
    if (!same(a.kpiKeys, current.kpiKeys)) return { matches: false, reason: "KPI membership or order changed" };
    if (!same(a.workViewIds, current.workViewIds)) return { matches: false, reason: "Work View membership or order changed" };
    for (const cardKey of current.cardKeys) {
        if (!same(a.cardFields[cardKey] ?? [], current.cardFields[cardKey] ?? [])) {
            return { matches: false, reason: `field membership or order changed on card "${cardKey}"` };
        }
    }
    if (a.siteScopeId !== current.siteScopeId) return { matches: false, reason: "site scope changed" };
    return { matches: true };
}

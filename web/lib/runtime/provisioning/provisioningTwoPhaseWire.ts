/**
 * THE TWO-PHASE HTTP WIRE CONTRACT — shared by the route and the browser.
 *
 * It lives beside `provisioningSettlement.ts` and for the same reason: the composer carries
 * `import "server-only"` and the browser needs these names. CONTRACTS may cross to the browser,
 * SERVER IMPLEMENTATIONS may not. Nothing here reads a database, a gate or a request; it decides no
 * facts and owns no truth. It names a query key, a JSON key and a media type, so the two ends of one
 * request cannot drift apart by literal.
 *
 * WHY A SECOND DELIVERY AT ALL. Measured on deployed f302b98b, the provisioning round trip was P50
 * 1,838ms, of which roughly 600-680ms was the seam awaiting `runSettlement` -- the card producers --
 * after the frame was already composed. Action eligibility resolved at ~443ms of an ~883ms compose,
 * so the operator waited about 1.4s past the moment the authority to act existed. The RSC route has
 * always avoided that wait by passing `deferSettlement` and streaming the rest; the HTTP seam, which
 * is the one the queue-row switch actually uses, did not.
 *
 * WHY OPT-IN. A consumer that cannot read a second delivery must keep receiving ONE fully settled
 * answer. A frame whose capability cards never arrive is a worse answer than a slow one, so the
 * client states its capability per request instead of the server assuming a flag day.
 */

/** `?phased=1` — the client states it can consume a second delivery. */
export const PHASED_QUERY_KEY = "phased";

/** The JSON key carrying phase 2 on its own NDJSON line. */
export const SETTLEMENT_LINE_KEY = "__settlement";

/** The media type the phased response is written as: one JSON document per line. */
export const PHASED_CONTENT_TYPE = "application/x-ndjson";

/**
 * Phase 2's envelope.
 *
 * `null` is a real answer, not a missing one: it means the settlement resolved to nothing to apply
 * (it failed, or carried only what the frame already knew). The frame stands as composed and its
 * unresolved regions stay UNKNOWN rather than becoming a fabricated empty.
 */
export type PhasedSettlementLine<TPatch> = { [SETTLEMENT_LINE_KEY]: TPatch | null };

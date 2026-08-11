/**
 * The conversation anchor for an email whose sender Alloy has not identified.
 *
 * SMS already answers this question: when no single Person matches, the thread
 * anchors to a `communications_unknown` surrogate derived deterministically from
 * (org, normalized endpoint). Email uses the SAME namespace and the SAME shape, so
 * the two channels agree on what "unattributed" means rather than each inventing
 * an anchor — and so the surrogate for one sender is stable across redeliveries,
 * retries and restarts.
 *
 * `uuid5` is reimplemented here because `web` has no uuid dependency and adding
 * one to match a five-line algorithm is worse than the five lines. It is checked
 * against Python's `uuid.uuid5` by an executable parity test, the same arrangement
 * used for the Message-ID reader.
 */

import { createHash } from "node:crypto";

/** Must equal `INBOUND_SURROGATE_NS` in backend/app/services/communication_inbound.py. */
export const INBOUND_SURROGATE_NAMESPACE = "a3f7c89e-b1aa-52d0-9e61-000000010001";

/** Anchor type the inbound seam uses when no single Person owns the conversation. */
export const UNKNOWN_SENDER_ENTITY_TYPE = "communications_unknown";

function uuidToBytes(uuid: string): Buffer {
    return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function bytesToUuid(buf: Buffer): string {
    const hex = buf.toString("hex");
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join("-");
}

/** RFC 4122 name-based UUID (SHA-1). Byte-for-byte identical to Python's uuid.uuid5. */
export function uuid5(namespace: string, name: string): string {
    const hash = createHash("sha1")
        .update(uuidToBytes(namespace))
        .update(Buffer.from(name, "utf-8"))
        .digest();
    const bytes = Buffer.from(hash.subarray(0, 16));
    // Version 5 and the RFC 4122 variant, exactly as the spec (and Python) set them.
    bytes[6] = (bytes[6]! & 0x0f) | 0x50;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    return bytesToUuid(bytes);
}

/**
 * Deterministic anchor for an unidentified email sender.
 *
 * Keyed on the normalized sender address so every message from that address in
 * that organization lands on one conversation — which is what makes a
 * thread-bound reply possible without ever asserting a Person.
 */
export function surrogateEmailSenderAnchor(params: { orgId: string; senderAddress: string }): string {
    return uuid5(INBOUND_SURROGATE_NAMESPACE, `${params.orgId}|${params.senderAddress.trim().toLowerCase()}`);
}

import crypto from "crypto";

/**
 * Validates Twilio webhook `X-Twilio-Signature` (SHA1 HMAC of URL + sorted form params).
 * @see https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioRequestSignature(
    authToken: string,
    signatureHeader: string | null,
    fullUrl: string,
    bodyParams: Record<string, string>,
): boolean {
    if (!signatureHeader || !authToken) return false;
    const sortedKeys = Object.keys(bodyParams).sort();
    let acc = "";
    for (const k of sortedKeys) {
        acc += k + (bodyParams[k] ?? "");
    }
    const data = fullUrl + acc;
    const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
    try {
        return crypto.timingSafeEqual(Buffer.from(expected, "utf-8"), Buffer.from(signatureHeader, "utf-8"));
    } catch {
        return false;
    }
}

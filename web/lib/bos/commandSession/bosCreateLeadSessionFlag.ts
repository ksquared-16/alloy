/**
 * Compatibility flag — BOS command session is the primary Create Lead host.
 * Set `NEXT_PUBLIC_BOS_CREATE_LEAD_SESSION=0` to fall back to the modal surface.
 */
export function isBosCreateLeadSessionEnabled(): boolean {
    const raw = process.env.NEXT_PUBLIC_BOS_CREATE_LEAD_SESSION;
    if (raw == null || raw === "") return true;
    return raw !== "0" && raw.toLowerCase() !== "false";
}

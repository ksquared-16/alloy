/**
 * Can a value legitimately live in a field of this type?
 *
 * Two places copy one settled answer onto many fields: the client's canonical mirror (collect once,
 * write everywhere within a form) and the server's shared-value projection (carry an answer forward
 * across the forms of a packet). Both matched fields by MEANING and wrote without asking about
 * SHAPE.
 *
 * That is fine until two forms bind the same canonical fact differently — a free-text answer on one,
 * a boolean acknowledgement on another, which is ordinary in real paperwork. Then a string lands in
 * a boolean field the parent was never shown, on a form they had not reached, and the submission is
 * refused for an answer nobody gave. Live QA hit it twice: Health & Medical's "Medical Authorization
 * Ack", then Immunization's "Immunization Ack" and "Immunization Record Upload Ack".
 *
 * Deliberately permissive: this answers "is this obviously the wrong shape", not "is this valid".
 * Validation belongs to the submission validator, and a second opinion about the same field here
 * would eventually disagree with it. Only shapes that cannot be coerced are refused.
 */
export function valueFitsFieldType(value: unknown, type: string | undefined): boolean {
    // Absence has no shape, so it always fits — this is how a cleared answer still propagates.
    if (value === undefined || value === null || value === "") return true;
    switch (type) {
        case "boolean":
            return typeof value === "boolean";
        case "multiselect":
            return Array.isArray(value);
        case "number":
            return (
                typeof value === "number"
                || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)))
            );
        default:
            return true;
    }
}

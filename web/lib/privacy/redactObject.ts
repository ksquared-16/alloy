/**
 * Deterministic, conservative redaction of a JSON-safe object.
 *
 * Platform privacy primitive. It is NOT AI-specific: the Processing commit audit
 * uses it to keep identity out of audit payloads, and the Trust Runtime Privacy
 * Engine uses it to build a Reasoning Context. Behaviour is unchanged from its
 * previous home under `lib/ai/` — this module is the doctrine-correct owner.
 *
 * Pure functions — does not mutate inputs.
 * @see docs/platform/trust/privacy-runtime.md
 */

/** How aggressively identity-shaped values are minimized. */
export type PiiMode = "strict" | "standard" | "none";

export type RedactionKind =
    | "email"
    | "phone"
    | "address"
    | "dob"
    | "financial"
    | "freeform_note"
    | "person_name"
    | "child_name"
    | "other_pii";

export type RedactionStep = {
    path: string;
    kind: RedactionKind;
};

export type RedactObjectForAiResult = {
    redacted: Record<string, unknown>;
    steps: RedactionStep[];
};

const EMAIL_KEY = /(email|e_mail|mail)$/i;
const PHONE_KEY = /(phone|tel|mobile|e164|sms)$/i;
const ADDRESS_KEY = /(address|street|line1|line_1|postal|zipcode|zip)$/i;
const DOB_KEY = /(dob|date_of_birth|birthdate|birth_date)$/i;
const FINANCE_KEY = /(amount|total|price|quote|payment|balance|subtotal|tax|cents)$/i;
const NOTE_KEY = /(note|notes|body|message|comment|transcript)$/i;
const CHILD_NAME_KEY = /^(child|student)_?(name|display)/i;
const PARENT_NAME_KEY = /(parent|guardian|contact|customer|primary)_?(name|display)/i;
const GENERIC_NAME_KEY = /^(first|last|full|display)_?name$/i;

const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

function push(steps: RedactionStep[], path: string, kind: RedactionKind) {
    steps.push({ path, kind });
}

function redactEmailString(s: string, path: string, steps: RedactionStep[]): string {
    if (!EMAIL_LIKE.test(s)) return s;
    push(steps, path, "email");
    const [u, d] = s.split("@");
    const user = (u ?? "").slice(0, 2);
    const domain = (d ?? "").split(".")[0] ?? "";
    return `${user}…@${domain.length ? domain[0] + "…" : "…"}.redacted`;
}

function redactPhoneString(s: string, path: string, steps: RedactionStep[]): string {
    const digits = s.replace(/\D/g, "");
    if (digits.length < 7) return s;
    push(steps, path, "phone");
    const tail = digits.slice(-4);
    return `***-***-${tail}`;
}

function redactFinancialScalar(v: unknown, path: string, steps: RedactionStep[]): unknown {
    push(steps, path, "financial");
    if (typeof v === "number" && Number.isFinite(v)) return "[financial]";
    if (typeof v === "string" && v.trim()) return "[financial]";
    return "[financial]";
}

function redactFreeform(s: string, path: string, steps: RedactionStep[]): string {
    push(steps, path, "freeform_note");
    if (s.length <= 24) return "[note:redacted]";
    return `[note:redacted:${s.length}chars]`;
}

function redactPersonName(s: string, path: string, kind: RedactionKind, steps: RedactionStep[]): string {
    push(steps, path, kind);
    const t = s.trim();
    if (!t) return "[name]";
    const parts = t.split(/\s+/);
    if (parts.length === 1) return `${parts[0]!.slice(0, 1)}…`;
    return `${parts[0]!.slice(0, 1)}. ${parts[parts.length - 1]!.slice(0, 1)}…`;
}

function shouldRedactNameKey(key: string, piiMode: PiiMode): boolean {
    if (piiMode === "none") return false;
    if (CHILD_NAME_KEY.test(key) || PARENT_NAME_KEY.test(key)) return true;
    if (piiMode === "strict" && GENERIC_NAME_KEY.test(key)) return true;
    return false;
}

function redactLeaf(key: string, value: unknown, path: string, piiMode: PiiMode, steps: RedactionStep[]): unknown {
    if (value == null) return value;
    if (piiMode === "none") {
        if (typeof value === "string" && NOTE_KEY.test(key)) {
            return redactFreeform(value, path, steps);
        }
        if (FINANCE_KEY.test(key)) {
            return redactFinancialScalar(value, path, steps);
        }
        return value;
    }
    if (typeof value === "boolean" || typeof value === "number") {
        if (FINANCE_KEY.test(key)) {
            return redactFinancialScalar(value, path, steps);
        }
        return value;
    }
    if (typeof value !== "string") return value;

    const s = value;

    if (NOTE_KEY.test(key)) {
        return redactFreeform(s, path, steps);
    }
    if (EMAIL_KEY.test(key) || (piiMode === "strict" && EMAIL_LIKE.test(s))) {
        return redactEmailString(s, path, steps);
    }
    if (PHONE_KEY.test(key) || (piiMode === "strict" && /\d{7,}/.test(s.replace(/\D/g, "")) && s.replace(/\D/g, "").length >= 10)) {
        return redactPhoneString(s, path, steps);
    }
    if (ADDRESS_KEY.test(key)) {
        push(steps, path, "address");
        return "[address:redacted]";
    }
    if (DOB_KEY.test(key) || (piiMode === "strict" && /^\d{4}-\d{2}-\d{2}/.test(s.trim()))) {
        push(steps, path, "dob");
        return "[dob:redacted]";
    }
    if (FINANCE_KEY.test(key)) {
        return redactFinancialScalar(s, path, steps);
    }
    if (shouldRedactNameKey(key, piiMode)) {
        const kind = CHILD_NAME_KEY.test(key) ? "child_name" : "person_name";
        return redactPersonName(s, path, kind, steps);
    }
    return s;
}

function cloneWalk(
    input: Record<string, unknown>,
    basePath: string,
    piiMode: PiiMode,
    steps: RedactionStep[],
    depth: number,
    maxDepth: number,
): Record<string, unknown> {
    if (depth > maxDepth) {
        push(steps, basePath || ".", "other_pii");
        return { _truncated: "[max_depth]" };
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
        const path = basePath ? `${basePath}.${key}` : key;
        if (value != null && typeof value === "object" && !Array.isArray(value)) {
            out[key] = cloneWalk(value as Record<string, unknown>, path, piiMode, steps, depth + 1, maxDepth);
        } else if (Array.isArray(value)) {
            out[key] = value.map((item, i) => {
                const p = `${path}[${i}]`;
                if (item != null && typeof item === "object" && !Array.isArray(item)) {
                    return cloneWalk(item as Record<string, unknown>, p, piiMode, steps, depth + 1, maxDepth);
                }
                if (typeof item === "string") {
                    return redactLeaf(key, item, p, piiMode, steps);
                }
                return item;
            });
        } else {
            out[key] = redactLeaf(key, value, path, piiMode, steps);
        }
    }
    return out;
}

export type RedactObjectForAiOptions = {
    pii_mode?: PiiMode;
    max_depth?: number;
};

/**
 * Returns a deep-cloned, redacted plain object for safe prompt assembly.
 * Conservative: when in doubt, redacts rather than leaks.
 */
export function redactObjectForAi(input: Record<string, unknown>, options?: RedactObjectForAiOptions): RedactObjectForAiResult {
    const piiMode = options?.pii_mode ?? "strict";
    const maxDepth = options?.max_depth ?? 8;
    const steps: RedactionStep[] = [];
    const redacted = cloneWalk(input, "", piiMode, steps, 0, maxDepth);
    return { redacted, steps };
}

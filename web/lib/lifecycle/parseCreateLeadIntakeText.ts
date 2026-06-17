import type { ActionIntakeFieldSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type {
    ActionIntakePasteConfidence,
    ActionIntakePasteExtractionResult,
    ActionIntakePasteExtractedField,
    ActionIntakePasteParser,
} from "@/lib/lifecycle/actionIntakePasteParserTypes";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import {
    isValidCreateLeadEmail,
    isValidCreateLeadPhone,
    normalizeCreateLeadPhoneDigits,
} from "@/lib/admin/actions/createLeadIntakeValidation";

const EMAIL_EXTRACT_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
/** Finds email-shaped tokens including invalid TLDs — validated separately. */
const LOOSE_EMAIL_EXTRACT_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+/i;
const PHONE_BARE_RE = /\b\d{10}\b/;
const PHONE_FORMATTED_RE =
    /(?:\+?1[-.\s]?)?\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/;
const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;
const US_DATE_RE = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/;

const PARENT_LABEL_RE =
    /^(?:parent|guardian|mother|mom|father|dad|contact|primary(?:\s+contact)?)\s*[:\-]\s*(.+)$/i;
const CHILD_LABEL_RE = /^(?:child|kid|son|daughter|student|enrollee?)\s*[:\-]\s*(.+)$/i;
const SOURCE_LABEL_RE = /^(?:source|referral|heard\s+(?:about\s+us\s+)?from|referred\s+by)\s*[:\-]\s*(.+)$/i;
const PROGRAM_LABEL_RE =
    /^(?:program|location|campus|site|center|classroom|room|cohort)\s*[:\-]\s*(.+)$/i;
const NOTES_LABEL_RE = /^(?:notes?|comments?|additional\s+info(?:rmation)?)\s*[:\-]\s*(.+)$/i;
const START_DATE_LABEL_RE =
    /^(?:desired\s+start(?:\s+date)?|start\s+date|enrollment\s+date)\s*[:\-]\s*(.+)$/i;
const DOB_LABEL_RE = /^(?:dob|date\s+of\s+birth|birth\s*date)\s*[:\-]\s*(.+)$/i;
const AGE_LABEL_RE = /^age\s*[:\-]\s*(\d{1,2})\b/i;
const LOOKING_FOR_RE = /^(?:looking\s+for|interested\s+in)\s+(.+)$/i;
const EMAIL_LABEL_RE = /^e(?:\-?mail)?\s*[:\-]\s*(.+)$/i;
const PHONE_LABEL_RE = /^phone\s*[:\-]\s*(.+)$/i;

function trim(v: string): string {
    return v.trim();
}

function parseDateValue(raw: string): string | null {
    const iso = raw.match(ISO_DATE_RE);
    if (iso) return iso[1] ?? null;
    const us = raw.match(US_DATE_RE);
    if (!us) return null;
    const month = Number(us[1]);
    const day = Number(us[2]);
    let year = Number(us[3]);
    if (year < 100) year += 2000;
    if (!month || !day || !year) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function splitPersonName(raw: string): { first: string; last: string } | null {
    const cleaned = raw.replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.includes("@")) return null;
    if (/^[\d\s\-+().]+$/.test(cleaned)) return null;
    const parts = cleaned.split(" ").filter(Boolean);
    if (parts.length < 2) return null;
    return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

function emailConfidence(raw: string): { value: string; confidence: ActionIntakePasteConfidence } {
    const value = trim(raw);
    return {
        value,
        confidence: isValidCreateLeadEmail(value) ? "high" : "invalid",
    };
}

function phoneConfidence(raw: string): { value: string; confidence: ActionIntakePasteConfidence } {
    const digits = normalizeCreateLeadPhoneDigits(raw);
    return {
        value: digits,
        confidence: isValidCreateLeadPhone(digits) ? "high" : "invalid",
    };
}

const NAME_STOP_WORDS = new Set([
    "called",
    "emailed",
    "texted",
    "reached",
    "contacted",
    "inquiry",
    "inquired",
    "today",
    "yesterday",
    "about",
    "regarding",
]);

function findPhoneCandidate(text: string): string | null {
    const lines = text.split(/\r?\n/).map((l) => trim(l)).filter(Boolean);
    for (const line of lines) {
        const digitsOnly = line.replace(/\D/g, "");
        if (/^[\d\s\-+().]+$/.test(line) && digitsOnly.length >= 7) {
            return line;
        }
        const bare = line.match(PHONE_BARE_RE);
        if (bare) return bare[0];
        const formatted = line.match(PHONE_FORMATTED_RE);
        if (formatted) return formatted[0];
    }
    const bare = text.match(PHONE_BARE_RE);
    if (bare) return bare[0];
    const formatted = text.match(PHONE_FORMATTED_RE);
    if (formatted) return formatted[0];
    return null;
}

function findEmailCandidate(text: string): string | null {
    const valid = text.match(EMAIL_EXTRACT_RE);
    if (valid?.[0]) return valid[0];
    const loose = text.match(LOOSE_EMAIL_EXTRACT_RE);
    if (loose?.[0]) return loose[0];
    return null;
}
function looksLikeNameLine(line: string): boolean {
    const t = trim(line);
    if (!t || t.includes("@")) return false;
    if (findPhoneCandidate(t) && normalizeCreateLeadPhoneDigits(t).length >= 7) return false;
    if (EMAIL_EXTRACT_RE.test(t) || LOOSE_EMAIL_EXTRACT_RE.test(t)) return false;
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length < 2 || parts.length > 4 || !/^[A-Za-z]/.test(parts[0] ?? "")) return false;
    if (parts.some((p) => NAME_STOP_WORDS.has(p.toLowerCase()))) return false;
    return true;
}

function isContactOnlyLine(line: string): boolean {
    const t = trim(line);
    if (!t) return false;
    if (EMAIL_EXTRACT_RE.test(t) || LOOSE_EMAIL_EXTRACT_RE.test(t)) return true;
    const digits = normalizeCreateLeadPhoneDigits(t);
    if (/^[\d\s\-+().]+$/.test(t) && digits.length >= 7) return true;
    return false;
}

function fieldByPayloadKey(
    spec: ActionIntakeSpec,
    payloadKey: string,
): ActionIntakeFieldSpec | undefined {
    return [...spec.required, ...spec.recommended, ...spec.optional].find(
        (f) => f.payload_key === payloadKey,
    );
}

function pushField(
    out: ActionIntakePasteExtractedField[],
    seen: Set<string>,
    input: {
        payload_key: string;
        rule_id: string | null;
        value: string;
        confidence: ActionIntakePasteConfidence;
    },
): void {
    const value = trim(input.value);
    if (!value || seen.has(input.payload_key)) return;
    seen.add(input.payload_key);
    out.push({
        payload_key: input.payload_key,
        rule_id: input.rule_id,
        value,
        confidence: input.confidence,
    });
}

function extractLabeledLines(lines: string[], spec: ActionIntakeSpec): ActionIntakePasteExtractedField[] {
    const out: ActionIntakePasteExtractedField[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
        const emailLabel = line.match(EMAIL_LABEL_RE);
        if (emailLabel?.[1]) {
            const parsed = emailConfidence(emailLabel[1]);
            pushField(out, seen, {
                payload_key: "email",
                rule_id: fieldByPayloadKey(spec, "email")?.rule_id ?? "person:email",
                value: parsed.value,
                confidence: parsed.confidence,
            });
            continue;
        }

        const phoneLabel = line.match(PHONE_LABEL_RE);
        if (phoneLabel?.[1]) {
            const parsed = phoneConfidence(phoneLabel[1]);
            pushField(out, seen, {
                payload_key: "phone",
                rule_id: fieldByPayloadKey(spec, "phone")?.rule_id ?? "person:phone",
                value: parsed.value,
                confidence: parsed.confidence,
            });
            continue;
        }

        const parent = line.match(PARENT_LABEL_RE);
        if (parent?.[1]) {
            const split = splitPersonName(parent[1]);
            if (split) {
                pushField(out, seen, {
                    payload_key: "first_name",
                    rule_id: fieldByPayloadKey(spec, "first_name")?.rule_id ?? "person:first_name",
                    value: split.first,
                    confidence: "high",
                });
                pushField(out, seen, {
                    payload_key: "last_name",
                    rule_id: fieldByPayloadKey(spec, "last_name")?.rule_id ?? "person:last_name",
                    value: split.last,
                    confidence: "high",
                });
            }
            continue;
        }

        const child = line.match(CHILD_LABEL_RE);
        if (child?.[1]) {
            const split = splitPersonName(child[1]);
            if (split) {
                pushField(out, seen, {
                    payload_key: "child_first_name",
                    rule_id: fieldByPayloadKey(spec, "child_first_name")?.rule_id ?? "child:first_name",
                    value: split.first,
                    confidence: "high",
                });
                if (split.last) {
                    pushField(out, seen, {
                        payload_key: "child_last_name",
                        rule_id: fieldByPayloadKey(spec, "child_last_name")?.rule_id ?? "child:last_name",
                        value: split.last,
                        confidence: "high",
                    });
                }
            } else {
                pushField(out, seen, {
                    payload_key: "child_first_name",
                    rule_id: fieldByPayloadKey(spec, "child_first_name")?.rule_id ?? "child:first_name",
                    value: child[1],
                    confidence: "medium",
                });
            }
            continue;
        }

        const age = line.match(AGE_LABEL_RE);
        if (age?.[1]) {
            pushField(out, seen, {
                payload_key: "child_age",
                rule_id: null,
                value: age[1],
                confidence: "high",
            });
            continue;
        }

        const lookingFor = line.match(LOOKING_FOR_RE);
        if (lookingFor?.[1]) {
            pushField(out, seen, {
                payload_key: "child_program",
                rule_id: fieldByPayloadKey(spec, "child_program")?.rule_id ?? "child:program_interest",
                value: lookingFor[1],
                confidence: "medium",
            });
            continue;
        }

        const source = line.match(SOURCE_LABEL_RE);
        if (source?.[1]) {
            pushField(out, seen, {
                payload_key: "source",
                rule_id: null,
                value: source[1],
                confidence: "high",
            });
            continue;
        }

        const program = line.match(PROGRAM_LABEL_RE);
        if (program?.[1]) {
            const key = fieldByPayloadKey(spec, "child_program") ? "child_program" : "location_id";
            pushField(out, seen, {
                payload_key: key,
                rule_id: fieldByPayloadKey(spec, key)?.rule_id ?? null,
                value: program[1],
                confidence: "medium",
            });
            continue;
        }

        const startDate = line.match(START_DATE_LABEL_RE);
        if (startDate?.[1]) {
            const parsed = parseDateValue(startDate[1]);
            if (parsed) {
                pushField(out, seen, {
                    payload_key: "child_desired_start_date",
                    rule_id:
                        fieldByPayloadKey(spec, "child_desired_start_date")?.rule_id ??
                        "child:desired_start_date",
                    value: parsed,
                    confidence: "high",
                });
            } else {
                pushField(out, seen, {
                    payload_key: "child_desired_start_date",
                    rule_id:
                        fieldByPayloadKey(spec, "child_desired_start_date")?.rule_id ??
                        "child:desired_start_date",
                    value: startDate[1],
                    confidence: "medium",
                });
            }
            continue;
        }

        const dob = line.match(DOB_LABEL_RE);
        if (dob?.[1]) {
            const parsed = parseDateValue(dob[1]);
            if (parsed) {
                pushField(out, seen, {
                    payload_key: "child_date_of_birth",
                    rule_id: fieldByPayloadKey(spec, "child_date_of_birth")?.rule_id ?? "child:date_of_birth",
                    value: parsed,
                    confidence: "high",
                });
            }
            continue;
        }

        const notes = line.match(NOTES_LABEL_RE);
        if (notes?.[1]) {
            pushField(out, seen, {
                payload_key: "intake_notes",
                rule_id: null,
                value: notes[1],
                confidence: "high",
            });
        }
    }

    return out;
}

function extractContactSignals(text: string, spec: ActionIntakeSpec): ActionIntakePasteExtractedField[] {
    const out: ActionIntakePasteExtractedField[] = [];
    const seen = new Set<string>();

    const emailRaw = findEmailCandidate(text);
    if (emailRaw) {
        const parsed = emailConfidence(emailRaw);
        pushField(out, seen, {
            payload_key: "email",
            rule_id: fieldByPayloadKey(spec, "email")?.rule_id ?? "person:email",
            value: parsed.value,
            confidence: parsed.confidence,
        });
    }

    const phoneRaw = findPhoneCandidate(text);
    if (phoneRaw) {
        const parsed = phoneConfidence(phoneRaw);
        pushField(out, seen, {
            payload_key: "phone",
            rule_id: fieldByPayloadKey(spec, "phone")?.rule_id ?? "person:phone",
            value: parsed.value,
            confidence: parsed.confidence,
        });
    }

    return out;
}

function extractNameFromContactBlob(text: string, spec: ActionIntakeSpec): ActionIntakePasteExtractedField[] {
    const lines = text.split(/\r?\n/).map((l) => trim(l)).filter(Boolean);
    if (lines.length !== 1) return [];
    const line = lines[0]!;
    if (!findEmailCandidate(line) && !findPhoneCandidate(line)) return [];
    if (PARENT_LABEL_RE.test(line) || CHILD_LABEL_RE.test(line)) return [];

    let remainder = line;
    const emailRaw = findEmailCandidate(line);
    if (emailRaw) remainder = remainder.replace(emailRaw, " ");
    const phoneRaw = findPhoneCandidate(line);
    if (phoneRaw) remainder = remainder.replace(phoneRaw, " ");
    remainder = remainder.replace(/\s+/g, " ").trim();
    if (!remainder || remainder.includes(":")) return [];
    const split = splitPersonName(remainder);
    if (!split) return [];

    const out: ActionIntakePasteExtractedField[] = [];
    const seen = new Set<string>();
    pushField(out, seen, {
        payload_key: "first_name",
        rule_id: fieldByPayloadKey(spec, "first_name")?.rule_id ?? "person:first_name",
        value: split.first,
        confidence: "high",
    });
    pushField(out, seen, {
        payload_key: "last_name",
        rule_id: fieldByPayloadKey(spec, "last_name")?.rule_id ?? "person:last_name",
        value: split.last,
        confidence: "high",
    });
    return out;
}

function extractHeuristicNames(lines: string[], spec: ActionIntakeSpec): ActionIntakePasteExtractedField[] {
    const out: ActionIntakePasteExtractedField[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
        if (isContactOnlyLine(line)) continue;
        if (!looksLikeNameLine(line)) continue;
        const split = splitPersonName(line);
        if (!split) continue;
        pushField(out, seen, {
            payload_key: "first_name",
            rule_id: fieldByPayloadKey(spec, "first_name")?.rule_id ?? "person:first_name",
            value: split.first,
            confidence: "high",
        });
        pushField(out, seen, {
            payload_key: "last_name",
            rule_id: fieldByPayloadKey(spec, "last_name")?.rule_id ?? "person:last_name",
            value: split.last,
            confidence: "high",
        });
        break;
    }

    return out;
}

export function parseCreateLeadIntakeText(input: {
    text: string;
    spec: ActionIntakeSpec;
}): ActionIntakePasteExtractionResult {
    const raw_text = input.text.trim();
    if (!raw_text) {
        return { fields: [], unmapped_text: "", raw_text: "" };
    }

    const lines = raw_text
        .split(/\r?\n/)
        .map((l) => trim(l))
        .filter(Boolean);

    const fields: ActionIntakePasteExtractedField[] = [];
    const seen = new Set<string>();

    for (const f of [
        ...extractContactSignals(raw_text, input.spec),
        ...extractNameFromContactBlob(raw_text, input.spec),
        ...extractLabeledLines(lines, input.spec),
        ...extractHeuristicNames(lines, input.spec),
    ]) {
        if (seen.has(f.payload_key)) continue;
        seen.add(f.payload_key);
        fields.push(f);
    }

    if (!fields.some((f) => f.payload_key === "intake_notes")) {
        const leftover = lines
            .filter((line) => {
                if (EMAIL_EXTRACT_RE.test(line) || isContactOnlyLine(line)) return false;
                if (PARENT_LABEL_RE.test(line) || CHILD_LABEL_RE.test(line)) return false;
                if (SOURCE_LABEL_RE.test(line) || PROGRAM_LABEL_RE.test(line)) return false;
                if (NOTES_LABEL_RE.test(line) || START_DATE_LABEL_RE.test(line) || DOB_LABEL_RE.test(line)) {
                    return false;
                }
                if (AGE_LABEL_RE.test(line) || LOOKING_FOR_RE.test(line)) return false;
                if (looksLikeNameLine(line)) return false;
                return true;
            })
            .join("\n")
            .trim();
        if (leftover.length > 20) {
            fields.push({
                payload_key: "intake_notes",
                rule_id: null,
                value: leftover,
                confidence: "low",
            });
        }
    }

    const mappedFragments = new Set(
        fields.flatMap((f) => f.value.split(/\s+/).filter((w) => w.length > 2)),
    );
    const unmapped_text = lines
        .filter((line) => !Array.from(mappedFragments).some((frag) => line.includes(frag)))
        .join("\n")
        .trim();

    return { fields, unmapped_text, raw_text };
}

/** Default V1 parser — deterministic heuristics; swap for AI-backed parser later. */
export const createLeadIntakePasteParser: ActionIntakePasteParser = {
    parse: parseCreateLeadIntakeText,
};

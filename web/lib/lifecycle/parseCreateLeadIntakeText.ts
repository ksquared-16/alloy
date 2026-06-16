import type { ActionIntakeFieldSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type {
    ActionIntakePasteConfidence,
    ActionIntakePasteExtractionResult,
    ActionIntakePasteExtractedField,
    ActionIntakePasteParser,
} from "@/lib/lifecycle/actionIntakePasteParserTypes";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/;
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

function trim(v: string): string {
    return v.trim();
}

function normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return digits.length >= 10 ? digits.slice(-10) : digits;
}

function formatPhoneDisplay(digits: string): string {
    if (digits.length !== 10) return digits;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
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

function looksLikeNameLine(line: string): boolean {
    const t = trim(line);
    if (!t || t.includes("@")) return false;
    if (PHONE_RE.test(t)) return false;
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length < 2 || parts.length > 4 || !/^[A-Za-z]/.test(parts[0] ?? "")) return false;
    if (parts.some((p) => NAME_STOP_WORDS.has(p.toLowerCase()))) return false;
    return true;
}

function fieldByPayloadKey(
    spec: ActionIntakeSpec,
    payloadKey: string
): ActionIntakeFieldSpec | undefined {
    return [...spec.required, ...spec.recommended, ...spec.optional].find(
        (f) => f.payload_key === payloadKey
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
    }
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

    const email = text.match(EMAIL_RE);
    if (email?.[0]) {
        pushField(out, seen, {
            payload_key: "email",
            rule_id: fieldByPayloadKey(spec, "email")?.rule_id ?? "person:email",
            value: email[0],
            confidence: "high",
        });
    }

    const phone = text.match(PHONE_RE);
    if (phone?.[0]) {
        const digits = normalizePhone(phone[0]);
        pushField(out, seen, {
            payload_key: "phone",
            rule_id: fieldByPayloadKey(spec, "phone")?.rule_id ?? "person:phone",
            value: formatPhoneDisplay(digits),
            confidence: "high",
        });
    }

    return out;
}

function extractNameFromContactBlob(text: string, spec: ActionIntakeSpec): ActionIntakePasteExtractedField[] {
    const lines = text.split(/\r?\n/).map((l) => trim(l)).filter(Boolean);
    if (lines.length !== 1) return [];
    const line = lines[0]!;
    if (!EMAIL_RE.test(line) && !PHONE_RE.test(line)) return [];
    if (PARENT_LABEL_RE.test(line) || CHILD_LABEL_RE.test(line)) return [];

    let remainder = line;
    const email = line.match(EMAIL_RE);
    if (email?.[0]) remainder = remainder.replace(email[0], " ");
    const phone = line.match(PHONE_RE);
    if (phone?.[0]) remainder = remainder.replace(phone[0], " ");
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
        if (!looksLikeNameLine(line)) continue;
        const split = splitPersonName(line);
        if (!split) continue;
        pushField(out, seen, {
            payload_key: "first_name",
            rule_id: fieldByPayloadKey(spec, "first_name")?.rule_id ?? "person:first_name",
            value: split.first,
            confidence: "medium",
        });
        pushField(out, seen, {
            payload_key: "last_name",
            rule_id: fieldByPayloadKey(spec, "last_name")?.rule_id ?? "person:last_name",
            value: split.last,
            confidence: "medium",
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
                if (EMAIL_RE.test(line) || PHONE_RE.test(line)) return false;
                if (PARENT_LABEL_RE.test(line) || CHILD_LABEL_RE.test(line)) return false;
                if (SOURCE_LABEL_RE.test(line) || PROGRAM_LABEL_RE.test(line)) return false;
                if (NOTES_LABEL_RE.test(line) || START_DATE_LABEL_RE.test(line) || DOB_LABEL_RE.test(line)) {
                    return false;
                }
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
        fields.flatMap((f) => f.value.split(/\s+/).filter((w) => w.length > 2))
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

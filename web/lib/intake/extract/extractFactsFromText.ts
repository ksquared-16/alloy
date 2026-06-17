import type { IntakeFact, IntakeFactExtractionResult, IntakeSourceEnvelope } from "@/lib/intake/types";
import { extractAgeFromText, extractLabeledAge } from "@/lib/intake/normalize/age";
import { classifyEmail, findEmailCandidate } from "@/lib/intake/normalize/email";
import { findDobInParens, findDateInText, parseFlexibleDate } from "@/lib/intake/normalize/date";
import { classifyPhone, findPhoneCandidate } from "@/lib/intake/normalize/phone";
import {
    extractNameFromContactBlobLine,
    isChildContextLine,
    isContactOnlyLine,
    looksLikeNameLine,
    splitPersonName,
} from "@/lib/intake/normalize/personName";

const PARENT_LABEL_RE =
    /^(?:parent|guardian|mother|mom|father|dad|contact|primary(?:\s+contact)?)\s*[:\-]\s*(.+)$/i;
const CHILD_LABEL_RE = /^(?:child|kid|son|daughter|student|enrollee?)\s*[:\-]\s*(.+)$/i;
const SOURCE_LABEL_RE = /^(?:source|referral|heard\s+(?:about\s+us\s+)?from|referred\s+by)\s*[:\-]\s*(.+)$/i;
const PROGRAM_LABEL_RE =
    /^(?:program|location|campus|site|center|school|classroom|room|cohort)\s*[:\-]\s*(.+)$/i;
const NOTES_LABEL_RE = /^(?:notes?|comments?|additional\s+info(?:rmation)?)\s*[:\-]\s*(.+)$/i;
const START_DATE_LABEL_RE =
    /^(?:desired\s+start(?:\s+date)?|start\s+date|enrollment\s+date)\s*[:\-]\s*(.+)$/i;
const DOB_LABEL_RE = /^(?:dob|date\s+of\s+birth|birth\s*date)\s*[:\-]\s*(.+)$/i;
const LOOKING_FOR_RE = /^(?:looking\s+for|interested\s+in)\s+(.+)$/i;
const EMAIL_LABEL_RE = /^e(?:\-?mail)?\s*[:\-]\s*(.+)$/i;
const PHONE_LABEL_RE = /^phone\s*[:\-]\s*(.+)$/i;

const CHILD_NARRATIVE_IS_RE =
    /\b(?:child|kid)\s+is\s+([A-Za-z][\w'\-]+(?:\s+[A-Za-z][\w'\-]+)*)/i;
const CHILD_RELATION_IS_RE =
    /\b(?:daughter|son)\s+is\s+([A-Za-z][\w'\-]+(?:\s+[A-Za-z][\w'\-]+)*)/i;
const CHILD_RELATION_BARE_RE =
    /^(?:daughter|son)\s+([A-Za-z][\w'\-]+(?:\s+[A-Za-z][\w'\-]+)*)\s*$/i;
const CHILD_NAME_AGE_COMMA_RE =
    /^([A-Za-z][\w'\-]+(?:\s+[A-Za-z][\w'\-]+)*)\s*,\s*age\s+(\d{1,2})\b/i;

const LOCATION_KEYWORD_RE = /\b(campus|center|centre|school|site|location|academy|preschool|daycare)\b/i;

let factCounter = 0;

function nextFactId(prefix: string): string {
    factCounter += 1;
    return `${prefix}-${factCounter}`;
}

function resetFactCounter(): void {
    factCounter = 0;
}

function pushFact(
    out: IntakeFact[],
    seen: Set<string>,
    input: Omit<IntakeFact, "fact_id"> & { dedupe_key?: string },
): void {
    const dedupeKey = input.dedupe_key ?? `${input.fact_type}:${input.role_hint ?? ""}:${input.raw_value}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const { dedupe_key: _d, ...rest } = input;
    out.push({ fact_id: nextFactId(input.fact_type), ...rest });
}

function pushPersonNameFact(
    out: IntakeFact[],
    seen: Set<string>,
    input: {
        raw: string;
        role_hint: "parent" | "child";
        confidence: IntakeFact["confidence"];
        source_line?: number;
        evidence: string;
    },
): void {
    const split = splitPersonName(input.raw);
    if (split) {
        pushFact(out, seen, {
            fact_type: "person_name",
            raw_value: input.raw,
            normalized_value: `${split.first} ${split.last}`.trim(),
            confidence: input.confidence,
            validation_state: "valid",
            source_line: input.source_line,
            evidence: input.evidence,
            role_hint: input.role_hint,
            dedupe_key: `person_name:${input.role_hint}:${split.first}:${split.last}`,
        });
        return;
    }
    if (input.role_hint === "child") {
        pushFact(out, seen, {
            fact_type: "person_name",
            raw_value: input.raw,
            normalized_value: input.raw.trim(),
            confidence: "medium",
            validation_state: "ambiguous",
            source_line: input.source_line,
            evidence: input.evidence,
            role_hint: "child",
            dedupe_key: `person_name:child:single:${input.raw}`,
        });
    }
}

function extractChildNameFromLine(line: string): string | null {
    const labeled = line.match(CHILD_LABEL_RE);
    if (labeled?.[1]) return labeled[1].trim();

    const narrativeIs = line.match(CHILD_NARRATIVE_IS_RE);
    if (narrativeIs?.[1]) return narrativeIs[1].trim();

    const relationIs = line.match(CHILD_RELATION_IS_RE);
    if (relationIs?.[1]) return relationIs[1].trim();

    const relationBare = line.match(CHILD_RELATION_BARE_RE);
    if (relationBare?.[1]) return relationBare[1].trim();

    const nameAge = line.match(CHILD_NAME_AGE_COMMA_RE);
    if (nameAge?.[1]) return nameAge[1].trim();

    return null;
}

function looksLikeLocationLine(line: string): boolean {
    const t = line.trim();
    if (!t || isContactOnlyLine(t) || isChildContextLine(t)) return false;
    if (PARENT_LABEL_RE.test(t) || CHILD_LABEL_RE.test(t) || PROGRAM_LABEL_RE.test(t)) return false;
    if (LOCATION_KEYWORD_RE.test(t)) return true;
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && parts.length <= 4) {
        const last = parts[parts.length - 1]?.toLowerCase() ?? "";
        if (["campus", "center", "centre", "school", "site", "academy"].includes(last)) return true;
    }
    return false;
}

function buildSourceEnvelope(text: string, sourceId?: string): IntakeSourceEnvelope {
    return {
        source_id: sourceId ?? `paste-${Date.now()}`,
        source_kind: "paste_text",
        captured_at: new Date().toISOString(),
        raw_material: text,
    };
}

export function extractFactsFromText(input: {
    text: string;
    source_id?: string;
}): IntakeFactExtractionResult {
    resetFactCounter();
    const raw_text = input.text.trim();
    const source = buildSourceEnvelope(raw_text, input.source_id);

    if (!raw_text) {
        return { source, facts: [], unmapped_text: "" };
    }

    const lines = raw_text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const facts: IntakeFact[] = [];
    const seen = new Set<string>();
    let adultNameClaimed = false;
    let notesClaimed = false;

    const emailRaw = findEmailCandidate(raw_text);
    if (emailRaw) {
        const classified = classifyEmail(emailRaw);
        pushFact(facts, seen, {
            fact_type: "email",
            raw_value: emailRaw,
            normalized_value: classified.value,
            confidence: classified.validation_state === "valid" ? "high" : "low",
            validation_state: classified.validation_state,
            evidence: "Email token detected in paste",
        });
    }

    const phoneRaw = findPhoneCandidate(raw_text);
    if (phoneRaw) {
        const classified = classifyPhone(phoneRaw);
        pushFact(facts, seen, {
            fact_type: "phone",
            raw_value: phoneRaw,
            normalized_value: classified.value,
            confidence: classified.validation_state === "valid" ? "high" : "low",
            validation_state: classified.validation_state,
            evidence: "Phone token detected in paste",
        });
    }

    if (lines.length === 1) {
        const blobName = extractNameFromContactBlobLine(lines[0]!);
        if (blobName) {
            pushPersonNameFact(facts, seen, {
                raw: `${blobName.first} ${blobName.last}`,
                role_hint: "parent",
                confidence: "high",
                source_line: 1,
                evidence: "Name extracted from single-line contact blob",
            });
            adultNameClaimed = true;
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const lineNum = i + 1;

        const emailLabel = line.match(EMAIL_LABEL_RE);
        if (emailLabel?.[1]) {
            const classified = classifyEmail(emailLabel[1]);
            pushFact(facts, seen, {
                fact_type: "email",
                raw_value: emailLabel[1],
                normalized_value: classified.value,
                confidence: classified.validation_state === "valid" ? "high" : "low",
                validation_state: classified.validation_state,
                source_line: lineNum,
                evidence: "Labeled email line",
            });
            continue;
        }

        const phoneLabel = line.match(PHONE_LABEL_RE);
        if (phoneLabel?.[1]) {
            const classified = classifyPhone(phoneLabel[1]);
            pushFact(facts, seen, {
                fact_type: "phone",
                raw_value: phoneLabel[1],
                normalized_value: classified.value,
                confidence: classified.validation_state === "valid" ? "high" : "low",
                validation_state: classified.validation_state,
                source_line: lineNum,
                evidence: "Labeled phone line",
            });
            continue;
        }

        const parent = line.match(PARENT_LABEL_RE);
        if (parent?.[1]) {
            pushPersonNameFact(facts, seen, {
                raw: parent[1],
                role_hint: "parent",
                confidence: "high",
                source_line: lineNum,
                evidence: "Labeled parent/guardian line",
            });
            adultNameClaimed = true;
            continue;
        }

        const childName = extractChildNameFromLine(line);
        if (childName) {
            pushPersonNameFact(facts, seen, {
                raw: childName,
                role_hint: "child",
                confidence: line.match(CHILD_LABEL_RE) ? "high" : "medium",
                source_line: lineNum,
                evidence: "Child name from labeled or narrative pattern",
            });
        }

        const labeledAge = extractLabeledAge(line);
        if (labeledAge) {
            pushFact(facts, seen, {
                fact_type: "age_years",
                raw_value: labeledAge.raw,
                normalized_value: labeledAge.years,
                confidence: "high",
                validation_state: "valid",
                source_line: lineNum,
                evidence: "Labeled age line",
                role_hint: "child",
            });
        } else {
            const inlineAge = extractAgeFromText(line);
            if (inlineAge && (childName || isChildContextLine(line))) {
                pushFact(facts, seen, {
                    fact_type: "age_years",
                    raw_value: inlineAge.raw,
                    normalized_value: inlineAge.years,
                    confidence: "high",
                    validation_state: "valid",
                    source_line: lineNum,
                    evidence: "Age phrase in child context",
                    role_hint: "child",
                });
            }
        }

        const nameAgeComma = line.match(CHILD_NAME_AGE_COMMA_RE);
        if (nameAgeComma?.[2]) {
            pushFact(facts, seen, {
                fact_type: "age_years",
                raw_value: nameAgeComma[0],
                normalized_value: Number(nameAgeComma[2]),
                confidence: "high",
                validation_state: "valid",
                source_line: lineNum,
                evidence: "Name, age comma pattern",
                role_hint: "child",
            });
        }

        const dobLabel = line.match(DOB_LABEL_RE);
        if (dobLabel?.[1]) {
            const normalized = parseFlexibleDate(dobLabel[1]);
            if (normalized) {
                pushFact(facts, seen, {
                    fact_type: "dob",
                    raw_value: dobLabel[1],
                    normalized_value: normalized,
                    confidence: "high",
                    validation_state: "valid",
                    source_line: lineNum,
                    evidence: "Labeled DOB line",
                    role_hint: "child",
                });
            }
        }

        const dobParens = findDobInParens(line);
        if (dobParens?.normalized) {
            pushFact(facts, seen, {
                fact_type: "dob",
                raw_value: dobParens.raw,
                normalized_value: dobParens.normalized,
                confidence: "high",
                validation_state: "valid",
                source_line: lineNum,
                evidence: "DOB in parentheses",
                role_hint: "child",
            });
        } else if (isChildContextLine(line)) {
            const inlineDate = findDateInText(line);
            if (inlineDate?.normalized) {
                pushFact(facts, seen, {
                    fact_type: "dob",
                    raw_value: inlineDate.raw,
                    normalized_value: inlineDate.normalized,
                    confidence: "high",
                    validation_state: "valid",
                    source_line: lineNum,
                    evidence: "Date in child context line",
                    role_hint: "child",
                });
            }
        }

        const lookingFor = line.match(LOOKING_FOR_RE);
        if (lookingFor?.[1]) {
            pushFact(facts, seen, {
                fact_type: "program_interest",
                raw_value: lookingFor[1],
                normalized_value: lookingFor[1].trim(),
                confidence: "medium",
                validation_state: "unknown",
                source_line: lineNum,
                evidence: "Looking for / interested in line",
            });
            continue;
        }

        const sourceMatch = line.match(SOURCE_LABEL_RE);
        if (sourceMatch?.[1]) {
            pushFact(facts, seen, {
                fact_type: "source",
                raw_value: sourceMatch[1],
                normalized_value: sourceMatch[1].trim(),
                confidence: "high",
                validation_state: "valid",
                source_line: lineNum,
                evidence: "Labeled source line",
            });
            continue;
        }

        const program = line.match(PROGRAM_LABEL_RE);
        if (program?.[1]) {
            const label = program[1].trim();
            const isLocationLabel = /^(?:location|campus|site|school|center|centre)\s*[:\-]/i.test(line);
            pushFact(facts, seen, {
                fact_type: isLocationLabel ? "location_label" : "program_interest",
                raw_value: label,
                normalized_value: label,
                confidence: "medium",
                validation_state: isLocationLabel ? "unknown" : "unknown",
                source_line: lineNum,
                evidence: isLocationLabel ? "Labeled location line" : "Labeled program line",
            });
            continue;
        }

        const startDate = line.match(START_DATE_LABEL_RE);
        if (startDate?.[1]) {
            const normalized = parseFlexibleDate(startDate[1]);
            pushFact(facts, seen, {
                fact_type: "date",
                raw_value: startDate[1],
                normalized_value: normalized ?? startDate[1].trim(),
                confidence: normalized ? "high" : "medium",
                validation_state: normalized ? "valid" : "unknown",
                source_line: lineNum,
                evidence: "Desired start date line",
            });
            continue;
        }

        const notes = line.match(NOTES_LABEL_RE);
        if (notes?.[1]) {
            pushFact(facts, seen, {
                fact_type: "notes",
                raw_value: notes[1],
                normalized_value: notes[1].trim(),
                confidence: "high",
                validation_state: "valid",
                source_line: lineNum,
                evidence: "Labeled notes line",
            });
            notesClaimed = true;
        }
    }

    if (!adultNameClaimed) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;
            if (isContactOnlyLine(line)) continue;
            if (isChildContextLine(line)) continue;
            if (CHILD_NAME_AGE_COMMA_RE.test(line)) continue;
            if (PARENT_LABEL_RE.test(line) || DOB_LABEL_RE.test(line) || EMAIL_LABEL_RE.test(line)) continue;
            if (line.includes(":")) continue;
            if (!looksLikeNameLine(line)) continue;
            const split = splitPersonName(line);
            if (!split) continue;
            pushPersonNameFact(facts, seen, {
                raw: line,
                role_hint: "parent",
                confidence: "high",
                source_line: i + 1,
                evidence: "First heuristic adult name line",
            });
            adultNameClaimed = true;
            break;
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (!looksLikeLocationLine(line)) continue;
        if (adultNameClaimed && looksLikeNameLine(line) && !LOCATION_KEYWORD_RE.test(line)) continue;
        pushFact(facts, seen, {
            fact_type: "location_label",
            raw_value: line,
            normalized_value: line.trim(),
            confidence: "medium",
            validation_state: "unknown",
            source_line: i + 1,
            evidence: "Location-like unmatched line",
        });
    }

    if (!notesClaimed) {
        const leftover = lines
            .filter((line) => {
                if (findEmailCandidate(line) || isContactOnlyLine(line)) return false;
                if (PARENT_LABEL_RE.test(line) || CHILD_LABEL_RE.test(line)) return false;
                if (SOURCE_LABEL_RE.test(line) || PROGRAM_LABEL_RE.test(line)) return false;
                if (NOTES_LABEL_RE.test(line) || START_DATE_LABEL_RE.test(line) || DOB_LABEL_RE.test(line)) {
                    return false;
                }
                if (extractLabeledAge(line) || LOOKING_FOR_RE.test(line)) return false;
                if (isChildContextLine(line) || extractChildNameFromLine(line)) return false;
                if (looksLikeNameLine(line) && adultNameClaimed) return false;
                if (looksLikeLocationLine(line)) return false;
                return true;
            })
            .join("\n")
            .trim();
        if (leftover.length > 20) {
            pushFact(facts, seen, {
                fact_type: "notes",
                raw_value: leftover,
                normalized_value: leftover,
                confidence: "low",
                validation_state: "unknown",
                evidence: "Unmapped narrative text",
            });
            notesClaimed = true;
        }
    }

    const mappedFragments = new Set(
        facts.flatMap((f) => String(f.raw_value).split(/\s+/).filter((w) => w.length > 2)),
    );
    const unmapped_text = lines
        .filter((line) => !Array.from(mappedFragments).some((frag) => line.includes(frag)))
        .join("\n")
        .trim();

    return { source, facts, unmapped_text };
}

/** @internal test helper */
export function __resetExtractFactCounterForTests(): void {
    resetFactCounter();
}

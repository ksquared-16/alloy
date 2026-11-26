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
import { normalizeIntakeText } from "@/lib/intake/normalize/text";
import { expandSharedSurnameNames } from "@/lib/intake/normalize/sharedSurnameNames";
import { isChildBlockLine, parseChildBlockEntries } from "@/lib/intake/extract/parseChildBlockEntries";
import { looksLikeContactBlockLine, parseContactBlock } from "@/lib/intake/extract/parseContactBlock";

const PARENTS_MULTI_RE = /^parents?\s*[:\-]\s*(.+)$/i;
const GUARDIANS_MULTI_RE = /^guardians?\s*[:\-]\s*(.+)$/i;
const PARENT_NUMBERED_RE = /^parent\s+(\d+)\s*[:\-]\s*(.+)$/i;
const CHILDREN_HEADER_RE = /^(?:child|children|kid|kids|dependent|dependents|student|students)\s*:?\s*$/i;
const CHILD_NAME_AGE_SPACE_RE =
    /^([A-Za-z][\w'\-]+(?:\s+[A-Za-z][\w'\-]+)*)\s+age\s+(\d{1,2})\b/i;
const CHILD_NAME_DOB_INLINE_RE =
    /^([A-Za-z][\w'\-]+(?:\s+[A-Za-z][\w'\-]+)*)\s+DOB\s+(.+)$/i;
const STREET_ADDRESS_RE =
    /^\d+\s+[A-Za-z0-9][\w\s.'#-]*\b(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|way|blvd|boulevard|court|ct)\.?$/i;
const CITY_STATE_ZIP_RE = /^([A-Za-z\s.'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i;
const CITY_STATE_ZIP_SPACE_RE = /^([A-Za-z\s.'-]+)\s+([A-Za-z]{2,})\s+(\d{5}(?:-\d{4})?)$/i;

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
// Bare program phrases without a label prefix, e.g. "toddler program", "infant room", "pre-k class".
const PROGRAM_PHRASE_RE =
    /\b(infants?|toddlers?|twos?|threes?|fours?|pre-?k|pre-?kindergarten|kindergarten|preschool|school-?age|after-?school)\s+(?:program|class|classroom|room|group|cohort)\b/i;
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
    if (labeled?.[1]) {
        const raw = labeled[1].trim();
        const inlineDob = raw.match(CHILD_NAME_DOB_INLINE_RE);
        if (inlineDob?.[1]) return inlineDob[1].trim();
        const inlineAge = raw.match(CHILD_NAME_AGE_SPACE_RE);
        if (inlineAge?.[1]) return inlineAge[1].trim();
        return raw;
    }

    const narrativeIs = line.match(CHILD_NARRATIVE_IS_RE);
    if (narrativeIs?.[1]) return narrativeIs[1].trim();

    const relationIs = line.match(CHILD_RELATION_IS_RE);
    if (relationIs?.[1]) return relationIs[1].trim();

    const relationBare = line.match(CHILD_RELATION_BARE_RE);
    if (relationBare?.[1]) return relationBare[1].trim();

    const nameAge = line.match(CHILD_NAME_AGE_COMMA_RE);
    if (nameAge?.[1]) return nameAge[1].trim();

    const nameAgeSpace = line.match(CHILD_NAME_AGE_SPACE_RE);
    if (nameAgeSpace?.[1]) return nameAgeSpace[1].trim();

    const nameDob = line.match(CHILD_NAME_DOB_INLINE_RE);
    if (nameDob?.[1]) return nameDob[1].trim();

    return null;
}

function childNameConfidence(line: string, rawName: string): IntakeFact["confidence"] {
    if (line.match(CHILD_LABEL_RE)) return "high";
    if (splitPersonName(rawName)) return "high";
    return "medium";
}

function pushMultiParentNames(
    out: IntakeFact[],
    seen: Set<string>,
    raw: string,
    sourceLine: number,
    evidence: string,
): boolean {
    const names = expandSharedSurnameNames(raw);
    if (names.length === 0) {
        const chunks = raw
            .split(/\s+and\s+|\s*&\s+|,/i)
            .map((c) => c.trim())
            .filter(Boolean);
        for (const chunk of chunks) {
            if (!splitPersonName(chunk)) continue;
            pushPersonNameFact(out, seen, {
                raw: chunk,
                role_hint: "parent",
                confidence: "high",
                source_line: sourceLine,
                evidence,
            });
        }
        return chunks.some((chunk) => splitPersonName(chunk));
    }

    for (const name of names) {
        pushPersonNameFact(out, seen, {
            raw: name,
            role_hint: "parent",
            confidence: "high",
            source_line: sourceLine,
            evidence,
        });
    }
    return names.length > 0;
}

function extractMultiAdultNamesFromLine(line: string): string[] {
    const t = line.trim();
    if (!t || isContactOnlyLine(t) || isChildContextLine(t) || isChildBlockLine(t)) return [];
    if (looksLikeContactBlockLine(t)) return [];
    if (looksLikeAddressLine(t)) return [];
    if (/^(?:child|children|kid|kids|dependent|dependents|student|students)\s*[:\-]/i.test(t)) return [];
    if (/\(\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s*DOB\s*\)/i.test(t)) return [];
    if (CHILD_NAME_DOB_INLINE_RE.test(t) || CHILD_NAME_AGE_SPACE_RE.test(t) || CHILD_NAME_AGE_COMMA_RE.test(t)) {
        return [];
    }
    if (PARENT_LABEL_RE.test(t) || PARENTS_MULTI_RE.test(t) || GUARDIANS_MULTI_RE.test(t)) return [];
    if (!/\band\b|&|,|\//.test(t)) return [];

    const sharedSurnameNames = expandSharedSurnameNames(t);
    if (sharedSurnameNames.length >= 2) return sharedSurnameNames;

    const chunks = t.split(/\s+and\s+|,/i).map((c) => c.trim()).filter(Boolean);
    if (chunks.length < 2) return [];
    const names = chunks.filter(
        (c) =>
            splitPersonName(c) &&
            !/^age\s+\d/i.test(c) &&
            !/^\d{1,2}$/.test(c) &&
            !isChildContextLine(c) &&
            !/\bdob\b/i.test(c) &&
            !/\(\d{1,2}[\/\-]\d{1,2}/.test(c),
    );
    if (names.length < 2 || names.length !== chunks.length) return [];
    return names;
}

function pushChildBlockEntries(
    out: IntakeFact[],
    seen: Set<string>,
    line: string,
    lineNum: number,
): boolean {
    const entries = parseChildBlockEntries(line);
    if (entries.length === 0) return false;

    for (const entry of entries) {
        const rawName = entry.last_name ? `${entry.first_name} ${entry.last_name}` : entry.first_name;
        pushPersonNameFact(out, seen, {
            raw: rawName,
            role_hint: "child",
            confidence: entry.last_name ? "high" : "medium",
            source_line: lineNum,
            evidence: "Child block entry",
        });
        if (entry.dob) {
            pushFact(out, seen, {
                fact_type: "dob",
                raw_value: entry.dob,
                normalized_value: entry.dob,
                confidence: "high",
                validation_state: "valid",
                source_line: lineNum,
                evidence: `Child DOB for ${entry.first_name}`,
                role_hint: "child",
                dedupe_key: `dob:child:${lineNum}:${entry.first_name}:${entry.dob}`,
            });
        }
        if (entry.gender) {
            pushFact(out, seen, {
                fact_type: "gender",
                raw_value: entry.gender,
                normalized_value: entry.gender,
                confidence: "high",
                validation_state: "valid",
                source_line: lineNum,
                evidence: `Child gender for ${entry.first_name}`,
                role_hint: "child",
                dedupe_key: `gender:child:${lineNum}:${entry.first_name}:${entry.gender}`,
            });
        }
    }
    return true;
}

function normalizeAddressLine(line: string): string {
    const t = line.trim();
    const spaceMatch = t.match(CITY_STATE_ZIP_SPACE_RE);
    if (spaceMatch) {
        return `${spaceMatch[1]!.trim()}, ${spaceMatch[2]!.trim()} ${spaceMatch[3]!}`;
    }
    return t;
}

function looksLikeAddressLine(line: string): boolean {
    const t = line.trim();
    if (!t || isContactOnlyLine(t)) return false;
    if (STREET_ADDRESS_RE.test(t)) return true;
    if (CITY_STATE_ZIP_RE.test(t)) return true;
    if (CITY_STATE_ZIP_SPACE_RE.test(t)) return true;
    return false;
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
    const raw_text = normalizeIntakeText(input.text.trim());
    const source = buildSourceEnvelope(raw_text, input.source_id);

    if (!raw_text) {
        return { source, facts: [], unmapped_text: "" };
    }

    const lines = raw_text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const facts: IntakeFact[] = [];
    const seen = new Set<string>();
    let adultNameClaimed = false;
    let notesClaimed = false;
    let inChildSection = false;

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

    // Capture EVERY email in the paste (comma-separated lists, or multiple parents on separate lines),
    // each tagged with its source line. pushFact dedupes by value, so already-captured emails are not
    // repeated. Required so a second parent's email is preserved (grouping distributes per parent).
    const multiEmailScanRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    for (let li = 0; li < lines.length; li++) {
        const lineMatches = lines[li]!.match(multiEmailScanRe);
        if (!lineMatches) continue;
        for (const match of lineMatches) {
            const classified = classifyEmail(match);
            pushFact(facts, seen, {
                fact_type: "email",
                raw_value: match,
                normalized_value: classified.value,
                confidence: classified.validation_state === "valid" ? "high" : "low",
                validation_state: classified.validation_state,
                source_line: li + 1,
                evidence: "Email token detected in paste (multi-email scan)",
            });
        }
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

        if (isChildBlockLine(line) && pushChildBlockEntries(facts, seen, line, lineNum)) {
            inChildSection = true;
            continue;
        }

        const contactBlock = parseContactBlock(line);
        if (contactBlock && contactBlock.adult_names.length > 0) {
            for (const emailRaw of contactBlock.emails) {
                const classified = classifyEmail(emailRaw);
                pushFact(facts, seen, {
                    fact_type: "email",
                    raw_value: emailRaw,
                    normalized_value: classified.value,
                    confidence: classified.validation_state === "valid" ? "high" : "low",
                    validation_state: classified.validation_state,
                    source_line: lineNum,
                    evidence: "Email from compact contact block",
                });
            }
            for (const phoneRaw of contactBlock.phones) {
                const classified = classifyPhone(phoneRaw);
                pushFact(facts, seen, {
                    fact_type: "phone",
                    raw_value: phoneRaw,
                    normalized_value: classified.value,
                    confidence: classified.validation_state === "valid" ? "high" : "low",
                    validation_state: classified.validation_state,
                    source_line: lineNum,
                    evidence: "Phone from compact contact block",
                });
            }
            for (const name of contactBlock.adult_names) {
                pushPersonNameFact(facts, seen, {
                    raw: name,
                    role_hint: "parent",
                    confidence: "high",
                    source_line: lineNum,
                    evidence: "Adult name from compact contact block",
                });
            }
            adultNameClaimed = true;
            inChildSection = false;
            continue;
        }

        const multiAdults = extractMultiAdultNamesFromLine(line);
        if (multiAdults.length >= 2) {
            for (const name of multiAdults) {
                pushPersonNameFact(facts, seen, {
                    raw: name,
                    role_hint: "parent",
                    confidence: "high",
                    source_line: lineNum,
                    evidence: "Multi-adult name line",
                });
            }
            adultNameClaimed = true;
            inChildSection = false;
            continue;
        }

        const parent = line.match(PARENT_LABEL_RE);
        if (parent?.[1]) {
            const expanded = expandSharedSurnameNames(parent[1]);
            if (expanded.length > 0) {
                for (const name of expanded) {
                    pushPersonNameFact(facts, seen, {
                        raw: name,
                        role_hint: "parent",
                        confidence: "high",
                        source_line: lineNum,
                        evidence: "Labeled parent/guardian line",
                    });
                }
            } else {
                pushPersonNameFact(facts, seen, {
                    raw: parent[1],
                    role_hint: "parent",
                    confidence: "high",
                    source_line: lineNum,
                    evidence: "Labeled parent/guardian line",
                });
            }
            adultNameClaimed = true;
            continue;
        }

        const guardiansMulti = line.match(GUARDIANS_MULTI_RE);
        if (guardiansMulti?.[1]) {
            if (pushMultiParentNames(facts, seen, guardiansMulti[1], lineNum, "Multi-guardian labeled line")) {
                adultNameClaimed = true;
            }
            continue;
        }

        const parentsMulti = line.match(PARENTS_MULTI_RE);
        if (parentsMulti?.[1]) {
            if (pushMultiParentNames(facts, seen, parentsMulti[1], lineNum, "Multi-parent labeled line")) {
                adultNameClaimed = true;
            }
            continue;
        }

        const parentNumbered = line.match(PARENT_NUMBERED_RE);
        if (parentNumbered?.[2]) {
            pushPersonNameFact(facts, seen, {
                raw: parentNumbered[2].trim(),
                role_hint: "parent",
                confidence: "high",
                source_line: lineNum,
                evidence: "Numbered parent line",
            });
            adultNameClaimed = true;
            continue;
        }

        if (CHILDREN_HEADER_RE.test(line)) {
            inChildSection = true;
            continue;
        }

        if (looksLikeAddressLine(line)) {
            const normalized = normalizeAddressLine(line);
            pushFact(facts, seen, {
                fact_type: "address",
                raw_value: line,
                normalized_value: normalized,
                confidence: "medium",
                validation_state: "unknown",
                source_line: lineNum,
                evidence: "Address-like line",
            });
            continue;
        }

        const programPhrase = line.match(PROGRAM_PHRASE_RE);
        if (programPhrase?.[1]) {
            pushFact(facts, seen, {
                fact_type: "program_interest",
                raw_value: programPhrase[0],
                normalized_value: programPhrase[1].trim(),
                confidence: "medium",
                validation_state: "unknown",
                source_line: lineNum,
                evidence: "Program phrase (e.g. 'toddler program')",
            });
            continue;
        }

        const childName = extractChildNameFromLine(line);
        if (childName) {
            pushPersonNameFact(facts, seen, {
                raw: childName,
                role_hint: "child",
                confidence: childNameConfidence(line, childName),
                source_line: lineNum,
                evidence: inChildSection ? "Child section line" : "Child name from labeled or narrative pattern",
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

        const nameAgeSpace = line.match(CHILD_NAME_AGE_SPACE_RE);
        if (nameAgeSpace?.[2]) {
            pushFact(facts, seen, {
                fact_type: "age_years",
                raw_value: nameAgeSpace[0],
                normalized_value: Number(nameAgeSpace[2]),
                confidence: "high",
                validation_state: "valid",
                source_line: lineNum,
                evidence: "Name age space pattern",
                role_hint: "child",
            });
        }

        const nameDobInline = line.match(CHILD_NAME_DOB_INLINE_RE);
        if (nameDobInline?.[2]) {
            const normalized = parseFlexibleDate(nameDobInline[2].trim());
            if (normalized) {
                pushFact(facts, seen, {
                    fact_type: "dob",
                    raw_value: nameDobInline[2],
                    normalized_value: normalized,
                    confidence: "high",
                    validation_state: "valid",
                    source_line: lineNum,
                    evidence: "Inline name DOB pattern",
                    role_hint: "child",
                });
            }
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
            // A location phrase ("North campus") is not a fallback adult name — it is captured as a
            // location_label below. Without this, "North campus" was mis-added as an Additional person.
            if (looksLikeLocationLine(line)) continue;
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
                if (looksLikeAddressLine(line)) return false;
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

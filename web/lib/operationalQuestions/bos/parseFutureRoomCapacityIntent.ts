/**
 * BOS NL intent parser for Future Room Capacity (Question interface).
 * Resolves to question_key + optional room/date — never computes capacity.
 */

import { FUTURE_ROOM_CAPACITY_QUESTION_KEY } from "@/lib/operationalQuestions/catalog";
import type { OrgCalcProductTypeId } from "@/lib/organizationCalculations/productCatalog";

export type FutureRoomCapacityBosIntent =
    | {
          kind: "answer";
          question_key: typeof FUTURE_ROOM_CAPACITY_QUESTION_KEY;
          room_hint: string | null;
          effective_at: string | null;
          relative_month: boolean;
      }
    | {
          kind: "configure";
          question_key: typeof FUTURE_ROOM_CAPACITY_QUESTION_KEY;
          product_type_id: OrgCalcProductTypeId | null;
          target_min_seats: number | null;
          name: string | null;
      }
    | {
          kind: "explain_unavailable";
          question_key: typeof FUTURE_ROOM_CAPACITY_QUESTION_KEY;
          room_hint: string | null;
      }
    | {
          kind: "change_goal";
          question_key: typeof FUTURE_ROOM_CAPACITY_QUESTION_KEY;
          goal_seats: number | null;
      }
    | {
          kind: "review_history";
          question_key: typeof FUTURE_ROOM_CAPACITY_QUESTION_KEY;
      }
    | {
          kind: "use_newer_source_version";
          question_key: typeof FUTURE_ROOM_CAPACITY_QUESTION_KEY;
      }
    | { kind: "none" };

function parseIsoOrMonthDay(raw: string): string | null {
    const iso = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso?.[1]) return iso[1];
    const md = raw.match(
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i,
    );
    if (md) {
        const months: Record<string, string> = {
            january: "01",
            february: "02",
            march: "03",
            april: "04",
            may: "05",
            june: "06",
            july: "07",
            august: "08",
            september: "09",
            october: "10",
            november: "11",
            december: "12",
        };
        const month = months[md[1]!.toLowerCase()];
        const day = String(Number(md[2])).padStart(2, "0");
        const year = new Date().getUTCFullYear();
        return `${year}-${month}-${day}`;
    }
    return null;
}

function extractRoomHint(input: string): string | null {
    const forMatch = input.match(
        /\b(?:for|in)\s+([A-Za-z][A-Za-z0-9 '\-]{1,40}?)(?:\s+on|\s+next|\s+room|\?|$)/i,
    );
    if (forMatch?.[1]) return forMatch[1].trim();
    const will = input.match(/\bwill\s+([A-Za-z][A-Za-z0-9 '\-]{1,40}?)\s+have\b/i);
    if (will?.[1]) return will[1].trim();
    return null;
}

export function parseCapacityMeaningChoice(input: string): OrgCalcProductTypeId | null {
    const lower = input.toLowerCase();
    if (
        /lowest of (?:physical and licensed|licensed and physical)|physical and licensed|licensed and physical/.test(
            lower,
        )
    ) {
        return "capacity_lowest_physical_licensed";
    }
    if (/operational seats(?: when available)?|operational capacity|operational when available/.test(lower)) {
        return "capacity_operational_with_fallback";
    }
    return null;
}

function extractGoalSeats(lower: string): number | null {
    const goalMatch = lower.match(
        /(?:minimum|goal|warn).*?(\d{1,3})\s*seats?|change.*?goal.*?(\d{1,3})|goal of (\d{1,3})/,
    );
    const n = goalMatch?.[1] ?? goalMatch?.[2] ?? goalMatch?.[3] ?? null;
    return n != null ? Number(n) : null;
}

export function parseFutureRoomCapacityBosIntent(input: string): FutureRoomCapacityBosIntent {
    const text = input.trim();
    const lower = text.toLowerCase();
    if (!lower) return { kind: "none" };

    const capacityLike =
        /future\s+room\s+capacity|future\s+capacity|how many seats|seats (?:will|available)|capacity for|minimum goal|warn.*seats|goal to \d+\s*seats|how should alloy determine capacity|start measuring|review (?:recent )?history|use the newer definition|newer definition/.test(
            lower,
        );
    const meaningChoice = parseCapacityMeaningChoice(text);
    if (!capacityLike && !/change.*(?:minimum|goal)/.test(lower) && !meaningChoice) {
        return { kind: "none" };
    }

    if (/(?:review|see|show)(?:\s+me)?(?:\s+recent)?\s+history/.test(lower)) {
        return { kind: "review_history", question_key: FUTURE_ROOM_CAPACITY_QUESTION_KEY };
    }

    if (/use the newer definition|use newer (?:definition|version)|newer definition/.test(lower)) {
        return { kind: "use_newer_source_version", question_key: FUTURE_ROOM_CAPACITY_QUESTION_KEY };
    }

    if (
        /start measuring|set up|help me (?:start|set up|measure)|not being measured|how should alloy determine capacity/.test(
            lower,
        )
        || meaningChoice
    ) {
        return {
            kind: "configure",
            question_key: FUTURE_ROOM_CAPACITY_QUESTION_KEY,
            product_type_id: meaningChoice,
            target_min_seats: extractGoalSeats(lower),
            name: null,
        };
    }

    if (/why.*(?:unavailable|not available)|not available/.test(lower) && /capacity|seats/.test(lower)) {
        return {
            kind: "explain_unavailable",
            question_key: FUTURE_ROOM_CAPACITY_QUESTION_KEY,
            room_hint: extractRoomHint(text),
        };
    }

    if (/change.*goal|set.*(?:minimum|goal)|minimum goal|goal to \d+/.test(lower)) {
        return {
            kind: "change_goal",
            question_key: FUTURE_ROOM_CAPACITY_QUESTION_KEY,
            goal_seats: extractGoalSeats(lower),
        };
    }

    const effective = parseIsoOrMonthDay(text);
    const relativeMonth = /next month/.test(lower);
    return {
        kind: "answer",
        question_key: FUTURE_ROOM_CAPACITY_QUESTION_KEY,
        room_hint: extractRoomHint(text),
        effective_at: effective,
        relative_month: relativeMonth,
    };
}

/** Default effective date for “next month” ≈ +30 days UTC date. */
export function defaultEffectiveDateForRelativeMonth(now = new Date()): string {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString().slice(0, 10);
}

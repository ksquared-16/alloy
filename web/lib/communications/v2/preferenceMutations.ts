/**
 * Communications V2 — preference mutation builders (PKG-08). PURE shape builders.
 *
 * Pairs each preference change with its immutable audit event so the service layer can persist
 * both in one transaction (guaranteeing "audit always written"). No DB execution here.
 */
import type { PreferenceCategory, PreferenceState } from "@/lib/communications/v2/preferences";
import { SMS_KEYWORD_CATEGORIES, keywordTargetState, type SmsKeyword } from "@/lib/communications/v2/smsKeywords";

export type PreferenceChangeRequest = {
    orgId: string;
    personId: string;
    category: PreferenceCategory;
    fromState?: PreferenceState | null;
    toState: PreferenceState;
    source?: string | null;
    method?: string | null;
    actorUserId?: string | null;
};

export type PreferenceUpsertRow = {
    org_id: string;
    person_id: string;
    category: PreferenceCategory;
    state: PreferenceState;
    source: string | null;
    method: string | null;
    updated_by_user_id: string | null;
};

export type PreferenceEventRow = {
    org_id: string;
    person_id: string;
    category: PreferenceCategory;
    from_state: PreferenceState | null;
    to_state: PreferenceState;
    source: string | null;
    method: string | null;
    actor_user_id: string | null;
};

/** Build the paired upsert + audit event for a single preference change. */
export function buildPreferenceChange(req: PreferenceChangeRequest): {
    upsert: PreferenceUpsertRow;
    event: PreferenceEventRow;
} {
    return {
        upsert: {
            org_id: req.orgId,
            person_id: req.personId,
            category: req.category,
            state: req.toState,
            source: req.source ?? null,
            method: req.method ?? null,
            updated_by_user_id: req.actorUserId ?? null,
        },
        event: {
            org_id: req.orgId,
            person_id: req.personId,
            category: req.category,
            from_state: req.fromState ?? null,
            to_state: req.toState,
            source: req.source ?? null,
            method: req.method ?? null,
            actor_user_id: req.actorUserId ?? null,
        },
    };
}

/** Expand an SMS keyword into the set of preference changes it implies (STOP/START → both SMS categories). */
export function expandSmsKeywordChanges(
    keyword: SmsKeyword,
    ctx: { orgId: string; personId: string; source?: string | null; method?: string | null; actorUserId?: string | null }
): ReturnType<typeof buildPreferenceChange>[] {
    const toState = keywordTargetState(keyword);
    if (!toState) return [];
    return SMS_KEYWORD_CATEGORIES.map((category) =>
        buildPreferenceChange({
            orgId: ctx.orgId,
            personId: ctx.personId,
            category,
            toState,
            source: ctx.source ?? "sms_keyword",
            method: ctx.method ?? keyword,
            actorUserId: ctx.actorUserId ?? null,
        })
    );
}

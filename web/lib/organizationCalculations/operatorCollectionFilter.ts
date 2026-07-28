/**
 * Operator vs developer collection filtering for Calculation Library / OI.
 * QA and try-it drafts must never appear as normal operator definitions.
 */

import { OI_QA_FIXTURE_PREFIX, isOiQaFixtureLabel } from "@/lib/operationalQuestions/oiQaFixtures";

const QA_NAME_PATTERNS = [
    /^qa\s+/i,
    /\bapi qa\b/i,
    /—\s*preview$/i,
    /\s+preview$/i,
    /temporary try-it/i,
    /proving slice/i,
];

const QA_DESCRIPTION_PATTERNS = [/temporary try-it/i, /\bapi qa\b/i, /proving slice/i];

export function isDeveloperCollectionMode(searchParams?: URLSearchParams | null): boolean {
    if (typeof window !== "undefined") {
        try {
            if (window.localStorage.getItem("alloy-oi-developer-mode") === "1") return true;
        } catch {
            /* ignore */
        }
    }
    if (searchParams?.get("developer") === "1") return true;
    if (searchParams?.get("dev") === "1") return true;
    return false;
}

export function markAsDeveloperTryDraftName(baseName: string): string {
    const trimmed = baseName.trim() || "Definition";
    if (trimmed.startsWith(`${OI_QA_FIXTURE_PREFIX} `)) return `${trimmed} — preview`;
    return `${OI_QA_FIXTURE_PREFIX} ${trimmed} — preview`;
}

export function isOperatorHiddenCalculation(item: {
    name?: string | null;
    description?: string | null;
    key?: string | null;
}): boolean {
    const name = String(item.name ?? "").trim();
    const description = String(item.description ?? "").trim();
    const key = String(item.key ?? "").trim();
    if (isOiQaFixtureLabel(name)) return true;
    if (name.startsWith(`${OI_QA_FIXTURE_PREFIX} `)) return true;
    if (QA_NAME_PATTERNS.some((re) => re.test(name))) return true;
    if (QA_DESCRIPTION_PATTERNS.some((re) => re.test(description))) return true;
    if (/^qa[_-]/i.test(key)) return true;
    return false;
}

export function filterOperatorCalculations<T extends { name?: string | null; description?: string | null; key?: string | null }>(
    items: T[],
    opts?: { developerMode?: boolean },
): T[] {
    if (opts?.developerMode) return items;
    return items.filter((item) => !isOperatorHiddenCalculation(item));
}

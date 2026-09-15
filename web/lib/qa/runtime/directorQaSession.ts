/**
 * THE DIRECTOR'S PLACE IN A WALKTHROUGH, AND THE TESTIMONY THEY HAVE NOT SUBMITTED YET.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────
 *
 * A human acceptance pass is long, and it necessarily runs BESIDE a product that is being repaired.
 * The QA reader held the Director's position and their half-written observation in React state and
 * nothing else, so every document reload — and on a development server there are many, because Fast
 * Refresh fully reloads a server-component route whenever anything in its module graph changes —
 * returned the Director to Scenario 01 with an empty notes field. Twenty minutes of a walkthrough
 * can be lost to somebody else's save.
 *
 * That is a defect in the QA runtime, not a workaround for one. The reload has an owner and it is
 * not this module (see the doctrine document): what this module fixes is that the runtime's
 * correctness depended on the document staying alive, which is not a property a QA tool may assume.
 *
 * ── WHAT IS PERSISTED HERE, AND WHAT IS NOT ────────────────────────────────────────────────────
 *
 * Here: the Director's POSITION, and DRAFT testimony they are still typing. Both are per-browser
 * conveniences — they never leave the machine and nothing reads them back as evidence.
 *
 * Not here: the acceptance RESULT. PASS / FAIL / BLOCKED / NOT RUN belongs to the acceptance
 * authority, bound to the tested build and the scenario-definition version, and it is written only
 * when the Director submits. A draft is not testimony; writing one into the record would make the
 * QA tool assert something nobody said.
 *
 * ── KEYING, AND THE ONE SUBTLETY ───────────────────────────────────────────────────────────────
 *
 * POSITION is keyed by suite and environment ONLY. A new build or a re-versioned catalog must not
 * throw the Director back to the beginning — the scenario KEY is stable across renumbering, so
 * position survives both.
 *
 * DRAFTS are keyed by suite, environment, scenario, catalog version AND tested baseline, because a
 * half-written observation is about the build in front of you. But a baseline change must not
 * DESTROY notes either, and those two rules pull against each other. So a draft written against an
 * earlier build is never adopted silently and never deleted: it is offered back, labelled with the
 * build and catalog it was written against, and the Director decides. Silence in either direction
 * would be the tool making a claim of its own.
 */

export type QaScope = {
    /** The acceptance suite, e.g. `core_financials_director_qa`. */
    suiteKey: string;
    /** Which data environment the reader is pointed at. Position is per-environment on purpose. */
    environment: string;
    /** The scenario-definition version the drafts were written against. */
    catalogVersion: string;
    /** The product build under test. `unknown` is a legitimate value and is keyed as itself. */
    deployedRevision: string;
};

export type QaDraft = {
    observation: string;
    expected: string;
    classification: string;
};

export type StoredDraft = QaDraft & {
    savedAt: string;
    catalogVersion: string;
    deployedRevision: string;
};

export type QaPosition = {
    /** The scenario the Director was on. A KEY, never an index — indices move when order does. */
    scenarioKey: string;
    /** Whether the walkthrough was open, as opposed to sitting on the landing surface. */
    started: boolean;
    savedAt: string;
};

export const EMPTY_DRAFT: QaDraft = Object.freeze({ observation: "", expected: "", classification: "" });

/** A draft with nothing in it is not a draft. Storing one would resurrect an empty form forever. */
export function isEmptyDraft(draft: QaDraft): boolean {
    return !draft.observation.trim() && !draft.expected.trim() && !draft.classification.trim();
}

const ROOT = "alloy.qa";

function positionKey(scope: QaScope): string {
    return `${ROOT}.${scope.suiteKey}.${scope.environment}.position`;
}

/** The prefix every draft for one scenario shares, so earlier builds' drafts remain findable. */
function draftPrefix(scope: QaScope, scenarioKey: string): string {
    return `${ROOT}.${scope.suiteKey}.${scope.environment}.draft.${scenarioKey}.`;
}

function draftKey(scope: QaScope, scenarioKey: string): string {
    return `${draftPrefix(scope, scenarioKey)}${scope.catalogVersion}.${scope.deployedRevision}`;
}

/*
 * EVERY ACCESS IS GUARDED.
 *
 * `localStorage` is not merely absent on the server: reading it THROWS in a private window, with
 * site data blocked, and inside some embedded viewers. A QA tool that white-screens because the
 * Director opened it in a private tab has replaced one reload defect with a worse one, so every
 * path here degrades to "no stored state" rather than to an exception.
 */
function store(): Storage | null {
    try {
        if (typeof window === "undefined" || !window.localStorage) return null;
        return window.localStorage;
    } catch {
        return null;
    }
}

function readJson<T>(key: string): T | null {
    const s = store();
    if (!s) return null;
    try {
        const raw = s.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

function writeJson(key: string, value: unknown): void {
    const s = store();
    if (!s) return;
    try {
        s.setItem(key, JSON.stringify(value));
    } catch {
        /* Quota, or a browser refusing to store. The walkthrough still works; it just forgets. */
    }
}

function removeKey(key: string): void {
    const s = store();
    if (!s) return;
    try {
        s.removeItem(key);
    } catch {
        /* nothing to do, and nothing worth telling the Director about */
    }
}

// ── POSITION ────────────────────────────────────────────────────────────────────────────────────

export function readPosition(scope: QaScope): QaPosition | null {
    const stored = readJson<Partial<QaPosition>>(positionKey(scope));
    if (!stored || typeof stored.scenarioKey !== "string" || !stored.scenarioKey) return null;
    return {
        scenarioKey: stored.scenarioKey,
        started: stored.started === true,
        savedAt: typeof stored.savedAt === "string" ? stored.savedAt : "",
    };
}

export function writePosition(scope: QaScope, scenarioKey: string, started: boolean): void {
    if (!scenarioKey) return;
    writeJson(positionKey(scope), { scenarioKey, started, savedAt: new Date().toISOString() });
}

export function clearPosition(scope: QaScope): void {
    removeKey(positionKey(scope));
}

/**
 * WHERE THE WALKTHROUGH SHOULD OPEN.
 *
 * Two different questions, deliberately answered by one function so the reader cannot implement one
 * of them and forget the other:
 *
 *   · A RELOAD must land exactly where the Director was, including mid-scenario on one they have
 *     already passed — they may be re-reading it. The stored position wins whenever it still names
 *     a scenario in the catalog.
 *
 *   · A FRESH OPEN — no stored position, or one naming a scenario this catalog no longer has —
 *     resumes at the first scenario that is not yet accepted, which is the work remaining. Only a
 *     fully accepted suite falls back to the first scenario, because there is no remaining work to
 *     point at.
 */
export function resolveResumeIndex(args: {
    scenarioKeys: readonly string[];
    resultOf: (scenarioKey: string) => string;
    stored: QaPosition | null;
}): { index: number; started: boolean; source: "stored" | "first_unaccepted" | "start" } {
    const { scenarioKeys, resultOf, stored } = args;
    if (scenarioKeys.length === 0) return { index: 0, started: false, source: "start" };

    if (stored) {
        const at = scenarioKeys.indexOf(stored.scenarioKey);
        if (at >= 0) return { index: at, started: stored.started, source: "stored" };
    }

    const firstUnaccepted = scenarioKeys.findIndex((key) => resultOf(key) !== "pass");
    if (firstUnaccepted >= 0) return { index: firstUnaccepted, started: false, source: "first_unaccepted" };
    return { index: 0, started: false, source: "start" };
}

// ── DRAFT TESTIMONY ─────────────────────────────────────────────────────────────────────────────

export type DraftRead = {
    draft: QaDraft;
    /**
     * Set when the only draft found was written against a DIFFERENT build or catalog version. The
     * text is offered, never adopted: the reader shows where it came from and the Director keeps or
     * clears it. Null when the draft belongs to the build in front of them.
     */
    carriedFrom: { deployedRevision: string; catalogVersion: string; savedAt: string } | null;
};

export function readDraft(scope: QaScope, scenarioKey: string): DraftRead {
    const exact = readJson<StoredDraft>(draftKey(scope, scenarioKey));
    if (exact) {
        return {
            draft: {
                observation: typeof exact.observation === "string" ? exact.observation : "",
                expected: typeof exact.expected === "string" ? exact.expected : "",
                classification: typeof exact.classification === "string" ? exact.classification : "",
            },
            carriedFrom: null,
        };
    }

    /* No draft for this build. An earlier one is evidence the Director wrote and may still want. */
    const prior = newestPriorDraft(scope, scenarioKey);
    if (!prior) return { draft: { ...EMPTY_DRAFT }, carriedFrom: null };
    return {
        draft: {
            observation: prior.observation ?? "",
            expected: prior.expected ?? "",
            classification: prior.classification ?? "",
        },
        carriedFrom: {
            deployedRevision: prior.deployedRevision ?? "unknown",
            catalogVersion: prior.catalogVersion ?? "unknown",
            savedAt: prior.savedAt ?? "",
        },
    };
}

function newestPriorDraft(scope: QaScope, scenarioKey: string): StoredDraft | null {
    const s = store();
    if (!s) return null;
    const prefix = draftPrefix(scope, scenarioKey);
    let best: StoredDraft | null = null;
    try {
        for (let i = 0; i < s.length; i += 1) {
            const key = s.key(i);
            if (!key || !key.startsWith(prefix)) continue;
            const value = readJson<StoredDraft>(key);
            if (!value) continue;
            if (!best || String(value.savedAt ?? "") > String(best.savedAt ?? "")) best = value;
        }
    } catch {
        return null;
    }
    return best;
}

export function writeDraft(scope: QaScope, scenarioKey: string, draft: QaDraft): void {
    const key = draftKey(scope, scenarioKey);
    if (isEmptyDraft(draft)) {
        /* Clearing the field clears the draft. An empty record would shadow a carried-over one. */
        removeKey(key);
        return;
    }
    const record: StoredDraft = {
        ...draft,
        savedAt: new Date().toISOString(),
        catalogVersion: scope.catalogVersion,
        deployedRevision: scope.deployedRevision,
    };
    writeJson(key, record);
}

/**
 * Forget every draft for one scenario, across builds.
 *
 * Called ONLY after the Director submits a result: the testimony is in the acceptance record now,
 * and leaving the draft behind would put the same words back in the form the next time the scenario
 * is opened, where they would read as unsubmitted.
 */
export function clearDrafts(scope: QaScope, scenarioKey: string): void {
    const s = store();
    if (!s) return;
    const prefix = draftPrefix(scope, scenarioKey);
    try {
        const doomed: string[] = [];
        for (let i = 0; i < s.length; i += 1) {
            const key = s.key(i);
            if (key && key.startsWith(prefix)) doomed.push(key);
        }
        for (const key of doomed) removeKey(key);
    } catch {
        /* nothing stored, nothing to clear */
    }
}

// ── THE SHELL, SO A RELOAD IS NOT A BLANK SCREEN ────────────────────────────────────────────────

/**
 * Enough to draw the walkthrough before the network answers.
 *
 * A reload used to show "Reading the environment…" for as long as the readiness read took — around
 * a second and a half — and on a development server, where Fast Refresh reloads this route whenever
 * anything in its module graph changes, the Director sees that flash constantly. Position was being
 * restored correctly the whole time and it did not matter: a screen that goes blank and comes back
 * reads as having been reset, whatever it does afterwards.
 *
 * DELIBERATELY NO MONEY. The cache holds the scenario catalog and the environment labels — the
 * shape of the page — and nothing about a family's balance. Figures are re-read every time and show
 * as pending until they arrive, because a cached balance is a stale balance, and a QA tool that
 * showed one would be testifying about a number nobody just looked up. `sessionStorage`, so it dies
 * with the tab.
 */
export type ShellCache<TScenario> = {
    scenarios: TScenario[];
    catalogVersion: string;
    environment: string;
    savedAt: string;
};

function shellKey(suiteKey: string, environment: string): string {
    return `${ROOT}.${suiteKey}.${environment}.shell`;
}

function sessionStore(): Storage | null {
    try {
        if (typeof window === "undefined" || !window.sessionStorage) return null;
        return window.sessionStorage;
    } catch {
        return null;
    }
}

export function writeShellCache<TScenario>(
    suiteKey: string,
    environment: string,
    value: Omit<ShellCache<TScenario>, "savedAt">,
): void {
    const s = sessionStore();
    if (!s) return;
    try {
        s.setItem(shellKey(suiteKey, environment), JSON.stringify({ ...value, savedAt: new Date().toISOString() }));
    } catch {
        /* Quota or a refusing browser. The reader simply waits for the network, as it used to. */
    }
}

export function readShellCache<TScenario>(suiteKey: string, environment: string): ShellCache<TScenario> | null {
    const s = sessionStore();
    if (!s) return null;
    try {
        const raw = s.getItem(shellKey(suiteKey, environment));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as ShellCache<TScenario>;
        return Array.isArray(parsed?.scenarios) && parsed.scenarios.length ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Where the Director had scrolled to. Restored with the scenario, for the same reason.
 *
 * Coming back to the right scenario at the top of a long page is still losing your place.
 */
export function writeScroll(scope: QaScope, scenarioKey: string, y: number): void {
    const s = sessionStore();
    if (!s || !scenarioKey) return;
    try {
        s.setItem(`${ROOT}.${scope.suiteKey}.${scope.environment}.scroll.${scenarioKey}`, String(Math.round(y)));
    } catch {
        /* nothing to restore next time; the scenario still comes back */
    }
}

export function readScroll(scope: QaScope, scenarioKey: string): number {
    const s = sessionStore();
    if (!s || !scenarioKey) return 0;
    try {
        const raw = s.getItem(`${ROOT}.${scope.suiteKey}.${scope.environment}.scroll.${scenarioKey}`);
        const n = raw ? Number(raw) : 0;
        return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
        return 0;
    }
}

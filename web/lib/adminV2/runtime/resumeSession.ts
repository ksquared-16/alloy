/**
 * Alloy OS — "Resume where you left off" session state.
 *
 * Lightweight, session-only continuity: records the last work-unit surface the operator
 * was working in (work unit + lane/perspective + operational subject + Focus Panel mode +
 * queue scroll) so a subtle resume affordance can offer to return them there.
 *
 * Doctrine:
 * - sessionStorage only — never a durable DB write.
 * - Scoped by user + org + access-scope fingerprint (mirrors `adminV2WorkspaceSessionCache`).
 * - URL always wins; this never auto-navigates. The affordance is opt-in.
 * - Cleared on logout / org switch / idle logout.
 */

const RESUME_KEY_PREFIX = "alloy:v1:os:resume:";
/** Transient one-shot intent set when the operator clicks Resume — consumed once on arrival. */
const RESUME_INTENT_KEY = "alloy:v1:os:resume-intent";
const RESUME_SNAPSHOT_VERSION = 1;

export type ResumeSubjectEntityType = "opportunity" | "job" | "schedule";

export type ResumeSessionScope = {
    orgId: string | null;
    principalUserId: string | null;
    accessScopeFingerprint: string;
};

export type ResumeSessionSnapshot = {
    version: number;
    savedAtMs: number;
    workUnitSlug: string | null;
    workUnitName: string | null;
    departmentId: string | null;
    workUnitId: string | null;
    /** Active lane / queue key (selection authority is still the URL on arrival). */
    laneKey: string | null;
    laneLabel: string | null;
    /** Active runtime perspective key, when known. */
    perspectiveKey: string | null;
    subjectEntityId: string | null;
    subjectEntityType: ResumeSubjectEntityType | null;
    subjectLabel: string | null;
    focusPanelMode: string | null;
    queueScrollTop: number | null;
};

export type ResumeIntent = {
    workUnitId: string | null;
    laneKey: string | null;
    queueScrollTop: number | null;
};

function storage(): Storage | null {
    try {
        if (typeof sessionStorage === "undefined") return null;
        return sessionStorage;
    } catch {
        return null;
    }
}

function isCompleteScope(scope: ResumeSessionScope): boolean {
    return Boolean(
        scope.orgId &&
            scope.principalUserId &&
            scope.accessScopeFingerprint &&
            scope.accessScopeFingerprint !== "scope:unknown",
    );
}

export function resumeSessionKey(scope: ResumeSessionScope): string {
    return `${RESUME_KEY_PREFIX}${scope.orgId}:${scope.principalUserId}:${scope.accessScopeFingerprint}`;
}

/** A snapshot is only offerable when it points at a real work unit + slug we can navigate to. */
export function isResumeSnapshotNavigable(snapshot: ResumeSessionSnapshot | null): snapshot is ResumeSessionSnapshot {
    return Boolean(
        snapshot &&
            snapshot.version === RESUME_SNAPSHOT_VERSION &&
            snapshot.workUnitSlug &&
            snapshot.workUnitId,
    );
}

export function readResumeSession(scope: ResumeSessionScope): ResumeSessionSnapshot | null {
    if (!isCompleteScope(scope)) return null;
    const store = storage();
    if (!store) return null;
    try {
        const raw = store.getItem(resumeSessionKey(scope));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as ResumeSessionSnapshot;
        if (!parsed || parsed.version !== RESUME_SNAPSHOT_VERSION) return null;
        return parsed;
    } catch {
        return null;
    }
}

export function writeResumeSession(
    scope: ResumeSessionScope,
    snapshot: Omit<ResumeSessionSnapshot, "version" | "savedAtMs">,
): void {
    if (!isCompleteScope(scope)) return;
    if (!snapshot.workUnitSlug || !snapshot.workUnitId) return;
    const store = storage();
    if (!store) return;
    try {
        const full: ResumeSessionSnapshot = {
            ...snapshot,
            version: RESUME_SNAPSHOT_VERSION,
            savedAtMs: Date.now(),
        };
        store.setItem(resumeSessionKey(scope), JSON.stringify(full));
    } catch {
        /* non-fatal */
    }
}

export function clearResumeSession(scope: ResumeSessionScope): void {
    const store = storage();
    if (!store) return;
    try {
        store.removeItem(resumeSessionKey(scope));
    } catch {
        /* non-fatal */
    }
}

/** Remove every resume snapshot + intent regardless of scope (logout / org switch / idle logout). */
export function clearAllResumeSessions(): void {
    const store = storage();
    if (!store) return;
    try {
        const keys: string[] = [];
        for (let i = 0; i < store.length; i += 1) {
            const key = store.key(i);
            if (key && (key.startsWith(RESUME_KEY_PREFIX) || key === RESUME_INTENT_KEY)) {
                keys.push(key);
            }
        }
        keys.forEach((key) => store.removeItem(key));
    } catch {
        /* non-fatal */
    }
}

/** Canonical operator URL for the resume target. Subject (record id) and lane ride on the URL so URL wins on arrival. */
export function buildResumeHref(snapshot: ResumeSessionSnapshot): string | null {
    if (!snapshot.workUnitSlug) return null;
    const base = `/workspace/work-unit/${encodeURIComponent(snapshot.workUnitSlug)}`;
    const path = snapshot.subjectEntityId
        ? `${base}/${encodeURIComponent(snapshot.subjectEntityId)}`
        : base;
    const lane = snapshot.laneKey?.trim();
    return lane ? `${path}?queue=${encodeURIComponent(lane)}` : path;
}

/** Human label, gracefully degrading: "Resume Enrollment · New Leads · Wright Family". */
export function buildResumeLabel(snapshot: ResumeSessionSnapshot): string {
    const parts = [snapshot.workUnitName, snapshot.laneLabel, snapshot.subjectLabel]
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter((p) => p.length > 0);
    return parts.length ? `Resume ${parts.join(" \u00b7 ")}` : "Resume where you left off";
}

export function writeResumeIntent(intent: ResumeIntent): void {
    const store = storage();
    if (!store) return;
    try {
        store.setItem(RESUME_INTENT_KEY, JSON.stringify(intent));
    } catch {
        /* non-fatal */
    }
}

/** Read + consume the one-shot resume intent (returns null after first read). */
export function consumeResumeIntent(): ResumeIntent | null {
    const store = storage();
    if (!store) return null;
    try {
        const raw = store.getItem(RESUME_INTENT_KEY);
        if (!raw) return null;
        store.removeItem(RESUME_INTENT_KEY);
        return JSON.parse(raw) as ResumeIntent;
    } catch {
        return null;
    }
}

/** Selector for the operator scroll surface — best-effort queue scroll capture/restore. */
export const RESUME_SCROLL_SURFACE_SELECTOR = ".adminv2-workspace-scroll-surface";

export function readOperatorScrollTop(): number | null {
    if (typeof document === "undefined") return null;
    const el = document.querySelector<HTMLElement>(RESUME_SCROLL_SURFACE_SELECTOR);
    return el ? el.scrollTop : null;
}

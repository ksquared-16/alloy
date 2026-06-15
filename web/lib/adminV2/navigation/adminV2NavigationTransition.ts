import { markWorkUnitNavigationStart } from "@/lib/perf/markWorkUnitNavigationStart";
import { markWorkspaceTileClickIntent } from "@/lib/perf/workspaceContinuityPerf";
import {
    adminV2RouteLoadingVocabulary,
    type AdminV2RouteLoadingVariant,
} from "@/lib/adminV2/navigation/adminV2RouteLoadingVocabulary";

/** Conservative default — commit route even if prefetch has not finished. */
export const DEFAULT_ADMIN_V2_NAVIGATION_TRANSITION_TIMEOUT_MS = 1500;

export type AdminV2NavigationTransitionCommitReason =
    | "no_prepare"
    | "prepare_ok"
    | "commit_first"
    | "timeout"
    | "prepare_failed";

export type AdminV2NavigationTransitionIdleSnapshot = {
    phase: "idle";
    isTransitioning: false;
    href: null;
    clickedKey: null;
    variant: null;
    message: null;
    ribbonLabel: null;
    startedAtMs: null;
};

export type AdminV2NavigationTransitionActiveSnapshot = {
    phase: "preparing" | "committing";
    isTransitioning: true;
    href: string;
    clickedKey: string;
    variant: AdminV2RouteLoadingVariant;
    message: string;
    ribbonLabel: string;
    startedAtMs: number;
};

export type AdminV2NavigationTransitionSnapshot =
    | AdminV2NavigationTransitionIdleSnapshot
    | AdminV2NavigationTransitionActiveSnapshot;

const IDLE_SNAPSHOT: AdminV2NavigationTransitionIdleSnapshot = {
    phase: "idle",
    isTransitioning: false,
    href: null,
    clickedKey: null,
    variant: null,
    message: null,
    ribbonLabel: null,
    startedAtMs: null,
};

let snapshot: AdminV2NavigationTransitionSnapshot = IDLE_SNAPSHOT;
let activeRunId: number | null = null;
let runSeq = 0;
const listeners = new Set<() => void>();

function emit(): void {
    for (const listener of listeners) {
        listener();
    }
}

function setSnapshot(next: AdminV2NavigationTransitionSnapshot): void {
    snapshot = next;
    emit();
}

export function getAdminV2NavigationTransitionSnapshot(): AdminV2NavigationTransitionSnapshot {
    return snapshot;
}

export function subscribeAdminV2NavigationTransition(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function isAdminV2NavigationItemPending(clickedKey: string | null | undefined): boolean {
    if (!clickedKey || !snapshot.isTransitioning) return false;
    return snapshot.clickedKey === clickedKey;
}

/** Props for the clicked control while its transition is in flight. */
export function adminV2NavigationClickedItemProps(clickedKey: string | null | undefined): {
    "aria-busy"?: true;
    "data-adminv2-nav-pending"?: "true";
} {
    if (!isAdminV2NavigationItemPending(clickedKey)) return {};
    return { "aria-busy": true, "data-adminv2-nav-pending": "true" };
}

export type RunAdminV2NavigationTransitionOpts = {
    href: string;
    /** Stable id for the clicked tile/card/row (dedupe + aria-busy targeting). */
    clickedKey: string;
    variant: AdminV2RouteLoadingVariant;
    /** Route commit — e.g. `router.push`, `adminV2CommitNavigation`, or `window.location.assign`. */
    commit: () => void;
    /** Optional prefetch / bootstrap warm-up before commit. */
    prepare?: () => void | Promise<void>;
    timeoutMs?: number;
    /**
     * When `false`, a rejected `prepare` aborts without calling `commit`.
     * Default: commit on prepare failure (timeout doctrine still applies).
     */
    commitOnPrepareFailure?: boolean;
    message?: string;
    ribbonLabel?: string;
    /** Perf marker — default true. */
    markNavigationStart?: boolean;
    /**
     * Commit route immediately; run `prepare` in background (instant tile click).
     * Default false — department tiles still wait for prepare/timeout.
     */
    commitFirst?: boolean;
};

function resolveLabels(
    variant: AdminV2RouteLoadingVariant,
    overrides?: { message?: string; ribbonLabel?: string }
): { message: string; ribbonLabel: string } {
    const vocab = adminV2RouteLoadingVocabulary(variant);
    return {
        message: overrides?.message ?? vocab.title,
        ribbonLabel: overrides?.ribbonLabel ?? vocab.ribbon,
    };
}

/**
 * Orchestrates click acknowledgement → optional prepare → route commit with timeout fallback.
 *
 * ```text
 * click → pending state → prepare (optional) → commit on success OR timeout OR prepare failure*
 * → clear state
 * *prepare failure: commit unless commitOnPrepareFailure === false
 * ```
 */
export async function runAdminV2NavigationTransition(
    opts: RunAdminV2NavigationTransitionOpts
): Promise<AdminV2NavigationTransitionCommitReason | "superseded" | "aborted"> {
    const href = opts.href.trim();
    const clickedKey = opts.clickedKey.trim();
    if (!href || !clickedKey) return "aborted";

    if (activeRunId != null) {
        return "superseded";
    }

    const runId = ++runSeq;
    activeRunId = runId;

    const { message, ribbonLabel } = resolveLabels(opts.variant, {
        message: opts.message,
        ribbonLabel: opts.ribbonLabel,
    });
    const startedAtMs = Date.now();

    if (opts.markNavigationStart !== false) {
        markWorkUnitNavigationStart();
    }
    if (opts.variant === "work_unit") {
        markWorkspaceTileClickIntent({ href, clicked_key: clickedKey });
    }

    setSnapshot({
        phase: "preparing",
        isTransitioning: true,
        href,
        clickedKey,
        variant: opts.variant,
        message,
        ribbonLabel,
        startedAtMs,
    });

    let committed = false;

    const finishCommit = (reason: AdminV2NavigationTransitionCommitReason): AdminV2NavigationTransitionCommitReason => {
        if (committed || activeRunId !== runId) return reason;
        committed = true;
        setSnapshot({
            phase: "committing",
            isTransitioning: true,
            href,
            clickedKey,
            variant: opts.variant,
            message,
            ribbonLabel,
            startedAtMs,
        });
        try {
            opts.commit();
        } finally {
            activeRunId = null;
            // Defer idle reset one microtask so pending tile CSS can paint before route commit.
            void Promise.resolve().then(() => {
                const snap = getAdminV2NavigationTransitionSnapshot();
                if (
                    snap.isTransitioning &&
                    snap.href === href &&
                    snap.clickedKey === clickedKey
                ) {
                    setSnapshot(IDLE_SNAPSHOT);
                }
            });
        }
        return reason;
    };

    const abortWithoutCommit = (): "aborted" => {
        if (committed || activeRunId !== runId) return "aborted";
        activeRunId = null;
        setSnapshot(IDLE_SNAPSHOT);
        return "aborted";
    };

    if (!opts.prepare) {
        return finishCommit("no_prepare");
    }

    if (opts.commitFirst) {
        const reason = finishCommit("commit_first");
        void Promise.resolve()
            .then(() => opts.prepare!())
            .catch(() => {
                /* background warm — navigation already committed */
            });
        return reason;
    }

    const timeoutMs = opts.timeoutMs ?? DEFAULT_ADMIN_V2_NAVIGATION_TRANSITION_TIMEOUT_MS;
    const commitOnPrepareFailure = opts.commitOnPrepareFailure !== false;

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<"timeout">((resolve) => {
        timeoutHandle = setTimeout(() => resolve("timeout"), timeoutMs);
    });

    const preparePromise = Promise.resolve()
        .then(() => opts.prepare!())
        .then(() => "prepare_ok" as const);

    try {
        const raced = await Promise.race([preparePromise, timeoutPromise]);
        if (timeoutHandle) clearTimeout(timeoutHandle);

        if (raced === "timeout") {
            return finishCommit("timeout");
        }
        return finishCommit("prepare_ok");
    } catch {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (!commitOnPrepareFailure) {
            return abortWithoutCommit();
        }
        return finishCommit("prepare_failed");
    }
}

/** Test-only reset — not for production navigation paths. */
export function resetAdminV2NavigationTransitionForTests(): void {
    activeRunId = null;
    runSeq = 0;
    setSnapshot(IDLE_SNAPSHOT);
}

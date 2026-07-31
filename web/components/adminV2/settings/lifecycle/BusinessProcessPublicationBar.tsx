"use client";

/**
 * Draft / published / runtime, said out loud (Law 4, editor slice 2).
 *
 * Before this bar the editor had one indicator — "Saved" — covering three different claims:
 * your edit is stored, your edit is published, and runtime is using your edit. Saving now writes a
 * draft and leaves runtime alone, so a single "Saved" would be an outright lie. Each state here is
 * something an operator can act on, and the action set changes with it.
 *
 * Deliberately minimal. This is the truthful publication workflow, not the Process Builder
 * redesign; it should be replaced wholesale when that lands, not extended.
 */

import { AlertCircle, AlertTriangle, CheckCircle2, RefreshCw, Upload } from "lucide-react";

import type { BusinessProcessPublicationSummary } from "@/lib/businessProcesses/configuration/businessProcessEditorState";

type Props = {
    state: BusinessProcessPublicationSummary | null;
    /** A publish/validate request is in flight. */
    busy?: boolean;
    /** Transient result of the last publish/validate, shown inline. */
    notice?: string | null;
    onValidate: () => void | Promise<void>;
    onPublish: () => void | Promise<void>;
    onReload: () => void | Promise<void>;
};

const STATUS_CHIP: Record<
    BusinessProcessPublicationSummary["status"],
    { label: string; className: string; icon: React.ReactNode }
> = {
    published: {
        label: "Published",
        className: "bg-alloy-juniper/10 text-alloy-juniper",
        icon: <CheckCircle2 size={11} strokeWidth={2.5} />,
    },
    never_published: {
        label: "Not published",
        className: "bg-alloy-forge/10 text-alloy-forge",
        icon: <AlertCircle size={11} strokeWidth={2.5} />,
    },
    unpublished_changes: {
        label: "Unpublished changes",
        className: "bg-alloy-ember/10 text-alloy-ember",
        icon: <AlertCircle size={11} strokeWidth={2.5} />,
    },
    publication_blocked: {
        label: "Publication blocked",
        className: "bg-alloy-ember/15 text-alloy-ember",
        icon: <AlertTriangle size={11} strokeWidth={2.5} />,
    },
    draft_conflict: {
        label: "Draft conflict",
        className: "bg-alloy-ember/15 text-alloy-ember",
        icon: <AlertTriangle size={11} strokeWidth={2.5} />,
    },
};

export default function BusinessProcessPublicationBar({
    state,
    busy = false,
    notice,
    onValidate,
    onPublish,
    onReload,
}: Props) {
    if (!state) return null;

    const chip = STATUS_CHIP[state.status];
    // A stale draft must not publish over the newer revision, and a blocked one has nothing valid
    // to publish. Both cases point the operator at the recovery instead.
    // `never_published` has no unpublished CHANGES but still has nothing recorded — publishing it
    // is exactly how a pre-publication tenant gets its first immutable revision.
    const canPublish =
        (state.unpublished_changes || state.status === "never_published") &&
        !state.draft_is_stale &&
        state.blocking_errors.length === 0;

    return (
        <div
            className="flex flex-col gap-2 border-b border-alloy-forge/10 bg-alloy-parchment/40 px-5 py-2.5"
            data-testid="bp-publication-bar"
            data-status={state.status}
            data-draft-revision={state.draft_revision}
            data-published-revision={state.published_revision_number ?? ""}
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip.className}`}
                        data-testid="bp-publication-status"
                    >
                        {chip.icon}
                        {chip.label}
                    </span>
                    <span
                        className="min-w-0 text-[11px] leading-snug text-alloy-midnight/60"
                        data-testid="bp-publication-message"
                    >
                        {state.status_message}
                    </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {state.draft_is_stale ? (
                        <button
                            type="button"
                            onClick={() => void onReload()}
                            disabled={busy}
                            className="config-secondary-btn config-secondary-btn--sm inline-flex items-center gap-1"
                            data-testid="bp-publication-reload"
                        >
                            <RefreshCw size={11} />
                            Reload latest
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void onValidate()}
                            disabled={busy || (!state.unpublished_changes && state.status === "published")}
                            className="config-secondary-btn config-secondary-btn--sm"
                            data-testid="bp-publication-validate"
                        >
                            Validate
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => void onPublish()}
                        disabled={busy || !canPublish}
                        className="config-primary-btn config-primary-btn--sm inline-flex items-center gap-1"
                        data-testid="bp-publication-publish"
                    >
                        <Upload size={11} />
                        {busy ? "Publishing…" : "Publish"}
                    </button>
                </div>
            </div>

            {/* Revision provenance: which revision is live, and which one this draft was based on. */}
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-alloy-midnight/45">
                <span data-testid="bp-publication-published-revision">
                    {state.published_revision_number
                        ? `Runtime: revision ${state.published_revision_number}`
                        : "Runtime: never published"}
                </span>
                <span data-testid="bp-publication-draft-revision">Draft edit #{state.draft_revision}</span>
            </div>

            {state.blocking_errors.length ? (
                <ul className="space-y-0.5" data-testid="bp-publication-errors">
                    {state.blocking_errors.map((e, i) => (
                        <li
                            key={`${e.code}-${e.path ?? i}`}
                            className="flex items-start gap-1 text-[11px] text-alloy-ember"
                        >
                            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                            <span>
                                {e.message}
                                {e.path ? (
                                    <span className="ml-1 font-mono text-[10px] opacity-60">{e.path}</span>
                                ) : null}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}

            {state.warnings.length ? (
                <ul className="space-y-0.5" data-testid="bp-publication-warnings">
                    {state.warnings.map((w, i) => (
                        <li
                            key={`${w.code}-${w.path ?? i}`}
                            className="flex items-start gap-1 text-[11px] text-alloy-midnight/50"
                        >
                            <AlertCircle size={11} className="mt-0.5 shrink-0" />
                            <span>{w.message}</span>
                        </li>
                    ))}
                </ul>
            ) : null}

            {notice ? (
                <p className="text-[11px] text-alloy-juniper" data-testid="bp-publication-notice" role="status">
                    {notice}
                </p>
            ) : null}
        </div>
    );
}

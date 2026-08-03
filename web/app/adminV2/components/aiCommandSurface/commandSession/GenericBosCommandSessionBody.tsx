"use client";

import { useBosCommandSessionOptional } from "@/contexts/BosCommandSessionContext";
import type { BosCommandSession } from "@/lib/bos/commandSession";
import { useGenericBosCommandSessionController } from "@/app/adminV2/components/aiCommandSurface/commandSession/useGenericBosCommandSessionController";
import {
    WS_ACTION_PRIMARY,
    WS_ACTION_SECONDARY,
    WS_EYEBROW,
    WS_FIELD,
} from "@/components/workspace/workspaceTokens";
import WorkspaceCard from "@/components/workspace/WorkspaceCard";

/**
 * Thin preparation UI for mutation / relationship / confirmation Commands.
 * Does not own mutation — Confirm always runs through the registered BosCommandAdapter
 * → executePlatformCommandViaActionsApi.
 */
export function GenericBosCommandSessionBody({ session }: { session: BosCommandSession }) {
    const ctx = useBosCommandSessionOptional();
    const controller = useGenericBosCommandSessionController(session);
    const label = controller.registration?.label ?? session.invocation.displayLabel;
    const actionKey = session.invocation.actionKey;

    const gatherPhase =
        session.phase === "acknowledged" ||
        session.phase === "gathering" ||
        session.phase === "failed" ||
        session.phase === "resolving";
    const reviewPhase = session.phase === "preview" || session.phase === "confirming";
    const completed = session.phase === "completed";
    const executing = session.phase === "executing";

    const missing = session.resolution.missingRequired;
    const blockers = session.resolution.blockers;

    return (
        <div className="flex flex-col gap-3 p-3" data-bos-command-session-host="true" data-bos-generic-command={actionKey}>
            <div className={WS_EYEBROW}>{label}</div>

            {controller.loadError ? (
                <p className="text-sm text-red-700">{controller.loadError}</p>
            ) : null}

            {session.recovery?.operatorMessage && session.phase === "failed" ? (
                <p className="text-sm text-red-700">{session.recovery.operatorMessage}</p>
            ) : null}

            {gatherPhase ? (
                <WorkspaceCard title="Prepare">
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-alloy-midnight/70">
                            Subject:{" "}
                            <span className="font-medium text-alloy-midnight">
                                {controller.draftField("entity_label") ||
                                    controller.draftField("entity_id") ||
                                    "Open a lead record first"}
                            </span>
                        </p>

                        {actionKey === "update_lead_status" ? (
                            <label className="flex flex-col gap-1 text-sm">
                                <span>Target status</span>
                                <select
                                    className={WS_FIELD}
                                    value={controller.draftField("target_state")}
                                    onChange={(e) => controller.setField("target_state", e.target.value)}
                                >
                                    <option value="">Select status…</option>
                                    {controller.statusOptions.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : null}

                        {actionKey === "add_parent_guardian" ? (
                            <>
                                <label className="flex flex-col gap-1 text-sm">
                                    <span>First name</span>
                                    <input
                                        className={WS_FIELD}
                                        value={controller.draftField("first_name")}
                                        onChange={(e) => controller.setField("first_name", e.target.value)}
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    <span>Last name</span>
                                    <input
                                        className={WS_FIELD}
                                        value={controller.draftField("last_name")}
                                        onChange={(e) => controller.setField("last_name", e.target.value)}
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    <span>Email (optional)</span>
                                    <input
                                        className={WS_FIELD}
                                        value={controller.draftField("email")}
                                        onChange={(e) => controller.setField("email", e.target.value)}
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    <span>Phone (optional)</span>
                                    <input
                                        className={WS_FIELD}
                                        value={controller.draftField("phone")}
                                        onChange={(e) => controller.setField("phone", e.target.value)}
                                    />
                                </label>
                                {!controller.draftField("source_customer_id") ? (
                                    <p className="text-xs text-amber-800">
                                        Waiting for household customer on this lead…
                                    </p>
                                ) : null}
                            </>
                        ) : null}

                        {actionKey === "cancel_tour" ? (
                            <>
                                <p className="text-sm text-alloy-midnight/70">
                                    Booking:{" "}
                                    <span className="font-medium">
                                        {controller.draftField("booking_id") || "No active booking found"}
                                    </span>
                                </p>
                                <label className="flex flex-col gap-1 text-sm">
                                    <span>Cancel reason (optional)</span>
                                    <input
                                        className={WS_FIELD}
                                        value={controller.draftField("cancel_reason")}
                                        onChange={(e) => controller.setField("cancel_reason", e.target.value)}
                                    />
                                </label>
                            </>
                        ) : null}

                        {missing.length > 0 ? (
                            <p className="text-xs text-amber-800">Still needed: {missing.join(", ")}</p>
                        ) : null}
                        {blockers.map((b) => (
                            <p key={b.code} className="text-xs text-amber-800">
                                {b.message}
                            </p>
                        ))}

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={WS_ACTION_PRIMARY}
                                disabled={controller.busy || !session.resolution.readyForPreview}
                                onClick={() => void controller.goReview()}
                            >
                                Review
                            </button>
                            <button
                                type="button"
                                className={WS_ACTION_SECONDARY}
                                onClick={() => ctx?.discardSession()}
                            >
                                Discard
                            </button>
                        </div>
                    </div>
                </WorkspaceCard>
            ) : null}

            {reviewPhase && session.preview ? (
                <WorkspaceCard title="Confirm">
                    <div className="flex flex-col gap-2">
                        <ul className="list-disc pl-5 text-sm text-alloy-midnight">
                            {session.preview.summaryLines.map((line) => (
                                <li key={line}>{line}</li>
                            ))}
                        </ul>
                        {session.preview.warnings.map((w) => (
                            <p key={w} className="text-xs text-amber-800">
                                {w}
                            </p>
                        ))}
                        <div className="flex flex-wrap gap-2 pt-2">
                            {session.phase === "preview" ? (
                                <button
                                    type="button"
                                    className={WS_ACTION_PRIMARY}
                                    onClick={() => controller.goConfirm()}
                                >
                                    Continue
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className={WS_ACTION_PRIMARY}
                                    disabled={controller.busy || executing}
                                    onClick={() => void controller.goExecute()}
                                >
                                    {actionKey === "cancel_tour" ? "Confirm cancel" : "Confirm"}
                                </button>
                            )}
                            <button
                                type="button"
                                className={WS_ACTION_SECONDARY}
                                onClick={() => ctx?.dispatch({ type: "SET_PHASE", phase: "gathering" })}
                            >
                                Back
                            </button>
                        </div>
                    </div>
                </WorkspaceCard>
            ) : null}

            {(executing || completed) && (
                <WorkspaceCard title={completed ? "Done" : "Running"}>
                    {executing ? <p className="text-sm">Running through Command Runtime…</p> : null}
                    {completed ? (
                        <div className="flex flex-col gap-2">
                            <p className="text-sm text-alloy-midnight">
                                {label} completed via Command Runtime.
                            </p>
                            <button
                                type="button"
                                className={WS_ACTION_SECONDARY}
                                onClick={() => ctx?.discardSession()}
                            >
                                Return to Workspace
                            </button>
                        </div>
                    ) : null}
                </WorkspaceCard>
            )}
        </div>
    );
}

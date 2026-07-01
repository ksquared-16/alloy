"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, X } from "lucide-react";

import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";
import {
    buildResumeHref,
    buildResumeLabel,
    clearResumeSession,
    isResumeSnapshotNavigable,
    readResumeSession,
    writeResumeIntent,
    type ResumeSessionSnapshot,
} from "@/lib/adminV2/runtime/resumeSession";
import { brand, neutral, palette } from "@/styles/tokens/colors";

/**
 * Subtle "Resume where you left off" affordance on bare /workspace.
 * Opt-in only — never auto-navigates. Clicking restores the last work-unit + lane + subject
 * via the canonical URL (so URL selection authority wins on arrival); Focus Panel mode and queue
 * scroll restore in-surface from session state.
 */
export function ResumeWhereYouLeftOffChip() {
    const router = useRouter();
    const { orgId, principalUserId, accessScopeFingerprint } = useWorkspaceOrg();
    const [snapshot, setSnapshot] = useState<ResumeSessionSnapshot | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const next = readResumeSession({ orgId, principalUserId, accessScopeFingerprint });
        setSnapshot(isResumeSnapshotNavigable(next) ? next : null);
    }, [orgId, principalUserId, accessScopeFingerprint]);

    if (dismissed || !snapshot || !isResumeSnapshotNavigable(snapshot)) return null;

    const href = buildResumeHref(snapshot);
    if (!href) return null;

    const onResume = () => {
        writeResumeIntent({
            workUnitId: snapshot.workUnitId,
            laneKey: snapshot.laneKey,
            queueScrollTop: snapshot.queueScrollTop,
        });
        router.push(href);
    };

    const onDismiss = () => {
        setDismissed(true);
        clearResumeSession({ orgId, principalUserId, accessScopeFingerprint });
    };

    return (
        <div
            data-adminv2-resume-affordance="true"
            className="mb-3 flex items-center gap-2"
            {...alloySectionDomAttrs("WS-01")}
        >
            <button
                type="button"
                onClick={onResume}
                data-adminv2-resume-action="true"
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-90"
                style={{
                    backgroundColor: neutral.surface,
                    borderColor: neutral.border,
                    color: brand.primary,
                }}
            >
                <RotateCcw size={14} strokeWidth={2} aria-hidden className="shrink-0" />
                <span className="truncate">{buildResumeLabel(snapshot)}</span>
            </button>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss resume"
                title="Dismiss"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-alloy-stone/10"
                style={{ color: palette.midnightForge }}
            >
                <X size={13} strokeWidth={2} aria-hidden />
            </button>
        </div>
    );
}

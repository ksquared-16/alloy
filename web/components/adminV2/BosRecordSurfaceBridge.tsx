"use client";

import { useEffect } from "react";

import { useBosPresentationControllerOptional } from "@/contexts/BosPresentationControllerContext";
import { useCommittedFocus } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { WORKSPACE_ATTENTION_TARGET } from "@/lib/runtime/kernel/attention";

/**
 * Tells the BOS presentation controller whether a Work Unit surface is the committed destination
 * (BP V2 D9).
 *
 * The controller mounts in the shell, ABOVE the runtime kernel, so it cannot read Focus itself; this
 * sits inside the kernel and reports one fact. It reads committed Focus — the kernel's single authority
 * on where the operator is — and the same Workspace exclusion the Surface Host applies, never the
 * pathname (record selection moves the address with `history.pushState/replaceState`).
 *
 * It decides nothing about presentation: the controller owns what an unrequested assistant does there.
 */
export function BosRecordSurfaceBridge() {
    const bos = useBosPresentationControllerOptional();
    const focus = useCommittedFocus();
    const committed = focus.current;
    const onWorkUnit =
        committed != null
        && committed.ref.target !== WORKSPACE_ATTENTION_TARGET
        && focus.desired?.target !== WORKSPACE_ATTENTION_TARGET;
    const setRecordSurfaceActive = bos?.setRecordSurfaceActive;

    useEffect(() => {
        if (!setRecordSurfaceActive) return;
        setRecordSurfaceActive(onWorkUnit);
    }, [setRecordSurfaceActive, onWorkUnit]);

    useEffect(() => {
        if (!setRecordSurfaceActive) return;
        return () => setRecordSurfaceActive(false);
    }, [setRecordSurfaceActive]);

    return null;
}

"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useRuntimeKernelOptional } from "./RuntimeKernelContext";
import { parseCardFocusAspect, type AttentionCardFocus } from "./attentionCardFocus";

const NO_SUBSCRIBE = () => () => {};
const NO_REF = () => null;

/**
 * The card + row the operator is currently attending, from the ONE attention owner.
 *
 * This is the read side of {@link attentionCardFocus}. It reads K1 directly rather than committed
 * Focus because an ASPECT movement is not a surface exchange — it deliberately does not cause a
 * commit, so waiting for one would mean a requested card never elevates.
 *
 * Returns null outside the kernel. That is not a degraded mode: the modal drawer product renders
 * above `RuntimeKernelProvider`, and it has no attention to read — its own selection state is the
 * right source there. Only the inline Focus Panel, which lives inside the kernel, gets an answer.
 *
 * `subject` is returned alongside so consumers can key a focus request on the Record of Attention.
 * Keying on the subject is what makes a rapid subject switch re-apply the card, while an unrelated
 * re-render does not fight an operator who has since focused something else themselves.
 */
export function useAttentionCardFocus(): { focus: AttentionCardFocus | null; subject: string | null } {
    const kernel = useRuntimeKernelOptional();

    const subscribe = useMemo(
        () => (kernel ? (fn: () => void) => kernel.attention.subscribe(fn) : NO_SUBSCRIBE),
        [kernel],
    );
    // `AttentionOwner.get()` returns the same object identity between movements, so this is a stable
    // snapshot — `useSyncExternalStore` would loop on a fresh object.
    const getSnapshot = useCallback(() => (kernel ? kernel.attention.get() : null), [kernel]);

    const ref = useSyncExternalStore(subscribe, getSnapshot, kernel ? getSnapshot : NO_REF);

    return useMemo(
        () => ({ focus: parseCardFocusAspect(ref?.aspect ?? null), subject: ref?.subject ?? null }),
        [ref?.aspect, ref?.subject],
    );
}

/**
 * The subject attention is CURRENTLY on — K1, updated the moment `attention.move` runs, not when
 * the provisioning answer commits.
 *
 * The Focus Panel's identity seed was keyed on the COMMITTED operational subject, so the
 * "instant-identity" seed was only instant on cold open. On a row -> row switch the committed
 * subject does not move until the provisioning answer lands, which measured 11.9s — the operator
 * read the PREVIOUS child's name for eleven seconds while their click was already acknowledged.
 * Keying the seed on live attention makes the identity available at the click, from canonical
 * queue-row context that the client already holds.
 */
export function useAttentionSubject(): string | null {
    const kernel = useRuntimeKernelOptional();
    const subscribe = useMemo(
        () => (kernel ? (fn: () => void) => kernel.attention.subscribe(fn) : NO_SUBSCRIBE),
        [kernel],
    );
    const getSnapshot = useCallback(() => (kernel ? kernel.attention.get() : null), [kernel]);
    const ref = useSyncExternalStore(subscribe, getSnapshot, kernel ? getSnapshot : NO_REF);
    return ref?.subject ?? null;
}

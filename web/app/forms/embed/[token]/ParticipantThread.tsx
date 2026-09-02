"use client";

/**
 * The participant conversation as a THREAD.
 *
 * The surface this replaces rendered question, answer, question, answer, buttons and an input at
 * roughly one weight, so a parent had to parse the page to find what was being asked. The mental
 * model here is a conversation: history grows upward and recedes, the current exchange owns the eye,
 * and the composer is anchored at the bottom of the conversation viewport where a reply belongs.
 *
 * Deliberately NOT consumer chat bubbles. A parent at an office table is being helped through
 * paperwork, not messaging an app — so the distinction is carried by alignment, weight and a quiet
 * speaker label, in Alloy's own juniper/midnight language rather than a second design system.
 *
 * LAYOUT AND TYPOGRAPHY ONLY. Nothing here submits, validates, interprets or names a field.
 */

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import clsx from "clsx";

/**
 * The height the conversation may actually use, as a CSS variable.
 *
 * `100dvh` accounts for browser chrome but NOT for the software keyboard, which is exactly the case
 * that matters: a parent typing an answer must still be able to see the question. `visualViewport`
 * is the only thing that reports the keyboard, so the thread is sized from it where it exists and
 * falls back to `dvh` where it does not.
 */
function useConversationViewport(ref: React.RefObject<HTMLDivElement | null>) {
    useLayoutEffect(() => {
        const vv = typeof window !== "undefined" ? window.visualViewport : null;
        if (!vv) return;
        const apply = () => {
            const node = ref.current;
            if (!node) return;
            // The visible height, minus whatever of the page sits above the thread.
            const top = node.getBoundingClientRect().top;
            // A CEILING, not a height. Clamped so a long conversation never runs past the fold
            // and never grows into an unreadable column on a large display.
            const available = Math.min(860, Math.max(280, vv.height - Math.max(0, top) - 12));
            node.style.setProperty("--participant-conversation-height", `${Math.round(available)}px`);
        };
        apply();
        vv.addEventListener("resize", apply);
        vv.addEventListener("scroll", apply);
        window.addEventListener("orientationchange", apply);
        return () => {
            vv.removeEventListener("resize", apply);
            vv.removeEventListener("scroll", apply);
            window.removeEventListener("orientationchange", apply);
        };
    }, [ref]);
}

/**
 * Follow the newest exchange — but only when the parent was already there.
 *
 * Yanking someone back down while they are re-reading what they agreed to is the single most
 * disliked behaviour a thread can have, so "at the bottom" is measured before the content changes
 * and honoured after it.
 */
function useFollowNewest(
    scrollRef: React.RefObject<HTMLDivElement | null>,
    signal: unknown,
): { atBottom: boolean; jumpToNewest: () => void } {
    const [atBottom, setAtBottom] = useState(true);
    const atBottomRef = useRef(true);

    const measure = useCallback(() => {
        const node = scrollRef.current;
        if (!node) return;
        // A tolerance, not an equality: sub-pixel layout and momentum scrolling never land exactly.
        const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
        const next = distance <= 72;
        atBottomRef.current = next;
        setAtBottom(next);
    }, [scrollRef]);

    useEffect(() => {
        const node = scrollRef.current;
        if (!node) return;
        node.addEventListener("scroll", measure, { passive: true });
        measure();
        return () => node.removeEventListener("scroll", measure);
    }, [measure, scrollRef]);

    useEffect(() => {
        const node = scrollRef.current;
        if (!node || !atBottomRef.current) return;
        node.scrollTop = node.scrollHeight;
    }, [signal, scrollRef]);

    const jumpToNewest = useCallback(() => {
        const node = scrollRef.current;
        if (!node) return;
        node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    }, [scrollRef]);

    return { atBottom, jumpToNewest };
}

export function ConversationViewport({
    progress,
    thread,
    dock,
    followSignal,
}: {
    /** The quiet orientation rail. Renders nothing when there is no honest number to show. */
    progress?: ReactNode;
    thread: ReactNode;
    /** Suggested replies and the composer — anchored, never scrolled away from. */
    dock: ReactNode;
    /** Changes whenever the newest exchange changes, so the thread can follow it. */
    followSignal: unknown;
}) {
    const frameRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    useConversationViewport(frameRef);
    const { atBottom, jumpToNewest } = useFollowNewest(scrollRef, followSignal);

    return (
        <div
            ref={frameRef}
            data-participant-conversation="true"
            className={clsx(
                "flex flex-col overflow-hidden rounded-2xl border border-alloy-midnight/[0.08] bg-white shadow-[0_2px_22px_rgba(24,39,58,0.06)]",
                /**
                 * A CEILING, not a fixed height.
                 *
                 * Claiming the full viewport left a short conversation stranded at the bottom of
                 * several hundred pixels of white — the composer was anchored, and to nothing. The
                 * card now grows with the conversation up to the space actually available, so two
                 * turns read as two turns and a long thread scrolls inside its own region with the
                 * composer still at the bottom of it.
                 */
                "max-h-[var(--participant-conversation-height,calc(100dvh-9.5rem))]",
            )}
        >
            {progress ? (
                <div className="shrink-0 border-b border-alloy-midnight/[0.06] px-5 py-3 sm:px-7">
                    {progress}
                </div>
            ) : null}

            <div
                ref={scrollRef}
                data-participant-thread="true"
                // `overscroll-contain` keeps a flick inside the thread from scrolling the page behind it.
                className="relative flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7"
            >
                {/* History grows upward: the column is bottom-aligned, so once the thread is taller
                    than the region the newest exchange sits against the composer. */}
                <div className="flex min-h-full flex-col justify-end gap-5">{thread}</div>
            </div>

            {!atBottom ? (
                <div className="pointer-events-none relative">
                    <button
                        type="button"
                        onClick={jumpToNewest}
                        data-participant-jump-newest="true"
                        className="pointer-events-auto absolute -top-11 right-5 rounded-full border border-alloy-midnight/10 bg-white px-3 py-1.5 text-[12px] font-medium text-alloy-midnight/70 shadow-[0_2px_10px_rgba(24,39,58,0.10)] sm:right-7"
                    >
                        Jump to latest
                    </button>
                </div>
            ) : null}

            <div className="shrink-0 border-t border-alloy-midnight/[0.06] bg-white px-5 pb-4 pt-3 sm:px-7">
                {dock}
            </div>
        </div>
    );
}

/**
 * The quiet progress rail.
 *
 * Orientation, not a stepper and not a score. One phrase, one percentage, one hairline track — all
 * subordinate to the conversation below it.
 */
export function ConversationProgress({ label, percent }: { label: string; percent: number }) {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    return (
        <div data-participant-progress="true">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-medium text-alloy-midnight/50">{label}</span>
                <span className="text-[12px] font-semibold tabular-nums text-alloy-midnight/40">
                    {clamped}%
                </span>
            </div>
            <div
                className="h-1 overflow-hidden rounded-full bg-alloy-midnight/[0.07]"
                role="progressbar"
                aria-valuenow={clamped}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Enrollment progress"
            >
                <span
                    className="block h-full rounded-full bg-alloy-juniper transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{ width: `${clamped}%` }}
                />
            </div>
        </div>
    );
}

/** How far into the past an exchange is — the further back, the more it recedes. */
export type ThreadDepth = "current" | "recent" | "history";

/**
 * One turn in the thread.
 *
 * Alloy speaks on the left in the primary voice; the parent's reply sits on the right, quieter and
 * shorter. Speaker labels are tiny and muted — enough to make the alternation unambiguous without
 * competing with what was actually said.
 */
export function ThreadTurn({
    who,
    depth,
    showSpeaker = true,
    children,
}: {
    who: "alloy" | "parent";
    depth: ThreadDepth;
    /**
     * False when the previous turn had the same speaker.
     *
     * Two "ALLOY" eyebrows stacked one above the other label nothing — the alternation is what the
     * label is for, so a repeat is noise competing with what was actually said.
     */
    showSpeaker?: boolean;
    children: ReactNode;
}) {
    const isParent = who === "parent";
    return (
        <div
            className={clsx("flex flex-col gap-1", isParent && "items-end")}
            data-said={who}
            data-depth={depth}
        >
            {showSpeaker ? (
            <span
                className={clsx(
                    "text-[10.5px] font-semibold uppercase tracking-[0.13em]",
                    depth === "current"
                        ? isParent
                            ? "text-alloy-bend-pine/55"
                            : "text-alloy-juniper"
                        : "text-alloy-midnight/25",
                )}
            >
                {isParent ? "You" : "Alloy"}
            </span>
            ) : null}
            <div className={clsx("max-w-[36ch] sm:max-w-[46ch]", isParent && "text-right")}>
                {children}
            </div>
        </div>
    );
}

/**
 * What was said, at the weight its depth deserves.
 *
 * Six weights across three depths and two speakers is the whole hierarchy: the current Alloy line is
 * the largest thing on screen, the parent's live reply sits just under it, and everything settled
 * drops to supporting text. No borders, no cards, no per-turn chrome — whitespace and type do it.
 */
export function ThreadSaid({
    who,
    depth,
    children,
}: {
    who: "alloy" | "parent";
    depth: ThreadDepth;
    children: ReactNode;
}) {
    if (who === "parent") {
        return (
            <p
                className={clsx(
                    "leading-snug",
                    depth === "current"
                        ? "text-[15px] font-medium text-alloy-bend-pine"
                        : depth === "recent"
                          ? "text-[14px] font-medium text-alloy-bend-pine/70"
                          : "text-[13.5px] font-medium text-alloy-bend-pine/45",
                )}
            >
                {children}
            </p>
        );
    }
    return (
        <p
            className={clsx(
                /*
                 * THE ACTIVE QUESTION IS NOT A HEADLINE.
                 *
                 * It was 18/19px semi-bold, which made every ordinary question read as a page title
                 * and left the answer, the settled record and the controls looking like footnotes to
                 * it. Hierarchy here comes from PLACEMENT (the current turn sits at the foot of the
                 * thread, next to the composer), from spacing, from the Bend Pine eyebrow above it,
                 * and from contrast — the current question is the only full-strength midnight text
                 * on the surface. Weight is not needed to say "this one", and spending it here cost
                 * the page its evenness.
                 *
                 * Same family, same tokens. Only the scale and weight move.
                 */
                depth === "current"
                    ? "text-[15.5px] font-normal leading-[1.45] text-alloy-midnight sm:text-[16px]"
                    : depth === "recent"
                      ? "text-[14px] leading-relaxed text-alloy-midnight/50"
                      : "text-[13.5px] leading-relaxed text-alloy-midnight/35",
            )}
        >
            {children}
        </p>
    );
}

/** Supporting text beneath a message — the ask-once promise, a clarification, a notice. */
export function ThreadSupporting({
    children,
    tone = "muted",
}: {
    children: ReactNode;
    tone?: "muted" | "speaking";
}) {
    return (
        <p
            className={clsx(
                "pt-1.5 leading-snug",
                tone === "speaking"
                    ? "text-[15px] text-alloy-midnight/80"
                    : "text-[12.5px] text-alloy-midnight/45",
            )}
        >
            {children}
        </p>
    );
}

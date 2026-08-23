"use client";

import { resolveFloatingExposure } from "@/lib/bos/resolveFloatingExposure";
import {
    isWorkUnitRevealTerminal,
    subscribeWorkUnitRevealLifecycle,
    workUnitRevealEpoch,
} from "@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
    type RefObject,
} from "react";

import {
    clampBosPinnedWidthPx,
    defaultBosPinnedWidthPx,
    readBosPinnedWidthPx,
    readBosPresentationPreference,
    writeBosPinnedWidthPx,
    writeBosPresentationPreference,
    type BosPresentationState,
} from "@/lib/bos/bosPresentationPreference";
import {
    chooseBosParkingGeometry,
    clampBosFloatingGeometry,
    hasStoredBosFloatingGeometry,
    type ObstacleRect,
    defaultBosFloatingGeometry,
    geometriesEqual,
    readBosFloatingGeometry,
    writeBosFloatingGeometry,
    type BosFloatingGeometry,
} from "@/lib/bos/bosFloatingGeometry";
import {
    BOS_PRESENTATION_ATTR,
    BOS_PRESENTATION_PREFERRED_ATTR,
    BOS_RAIL_WIDTH_CSS_VAR,
    deriveBosPresentation,
    recommendBosPresentation,
    type BosPresentationDerivation,
} from "@/lib/bos/bosPresentationState";
import {
    WORKSPACE_PRESENTATION_ATTR,
    deriveAdaptiveWorkspacePresentation,
    type AdaptiveWorkspacePresentation,
} from "@/lib/presentation/adaptiveWorkspacePresentation";

type BosPresentationControllerValue = {
    canvas: AdaptiveWorkspacePresentation;
    derivation: BosPresentationDerivation;
    floatingGeometry: BosFloatingGeometry;
    /**
     * Whether the CURRENT floating placement may be shown to the operator.
     *
     * False while an automatic park is still provisional — i.e. a Work Unit reveal is outstanding
     * and no park has committed against the settled page for this epoch. Always true when the mode
     * is not floating, and always true when the operator positioned the window themselves, because
     * neither of those placements is a guess about page content.
     */
    floatingPlacementTrustworthy: boolean;
    /** Preferred geometry (may differ from displayed when viewport temporarily clamps). */
    preferredFloatingGeometry: BosFloatingGeometry;
    setPreferred: (state: BosPresentationState) => void;
    setPinnedWidthPx: (px: number) => void;
    /** @deprecated Use setPinnedWidthPx */
    setDockedWidthPx: (px: number) => void;
    restoreDefaultWidth: () => void;
    setFloatingGeometry: (geo: BosFloatingGeometry, opts?: { persist?: boolean }) => void;
    resetFloatingGeometry: () => void;
    openFloating: () => void;
    closeToLauncher: () => void;
    pin: () => void;
    unpinToFloating: () => void;
};

const BosPresentationControllerContext = createContext<BosPresentationControllerValue | null>(null);

function viewportBounds() {
    if (typeof window === "undefined") return { width: 1440, height: 900 };
    return { width: window.innerWidth, height: window.innerHeight };
}

/** SSR-stable preferred — sessionStorage is applied after mount to avoid hydration mismatch. */
const SSR_PREFERRED: BosPresentationState = "floating";

export function BosPresentationControllerProvider({
    ambientRef,
    children,
}: {
    ambientRef: RefObject<HTMLElement | null>;
    children: ReactNode;
}) {
    const [canvas, setCanvas] = useState<AdaptiveWorkspacePresentation>("expanded");
    const [ambientWidthPx, setAmbientWidthPx] = useState(1600);
    const [ambientEl, setAmbientEl] = useState<HTMLElement | null>(null);
    const [preferred, setPreferredState] = useState<BosPresentationState>(SSR_PREFERRED);
    const [pinnedWidthPx, setPinnedWidthState] = useState(() => defaultBosPinnedWidthPx());
    const [preferredFloatingGeometry, setPreferredFloatingGeometry] = useState<BosFloatingGeometry>(
        () => defaultBosFloatingGeometry({ width: 1440, height: 900 }),
    );
    const [floatingGeometry, setFloatingGeometryState] = useState<BosFloatingGeometry>(
        () => defaultBosFloatingGeometry({ width: 1440, height: 900 }),
    );
    const [sessionHydrated, setSessionHydrated] = useState(false);
    /**
     * The reveal epoch whose collision geometry has been COMMITTED by the automatic park.
     *
     * Readiness alone does not make a placement trustworthy — the park has to have actually run
     * against the settled page and committed its result. `null` means no trustworthy automatic park
     * exists yet for the current epoch, and a consumer must not expose provisional geometry.
     */
    const [parkedRevealEpoch, setParkedRevealEpoch] = useState<number | null>(null);
    /**
     * Whether the ambient measurement has clamped the floating geometry to a real viewport at least
     * once. The park chooses WHERE within the canvas; this settles the canvas itself. Revealing
     * after the park but before the clamp still shows a placement that then moves — measured at 430
     * as a 184 px vertical jump that the desktop-only gate did not prevent.
     */
    const [ambientMeasured, setAmbientMeasured] = useState(false);

    // Session preference / geometry — client-only. Reading in useState initializers made SSR HTML
    // (no launcher) diverge from the first client render (launcher when preferred=closed).
    useEffect(() => {
        const storedPreferred = readBosPresentationPreference();
        if (storedPreferred) setPreferredState(storedPreferred);
        setPinnedWidthState(readBosPinnedWidthPx());
        const bounds = viewportBounds();
        const storedGeo = readBosFloatingGeometry(bounds);
        setPreferredFloatingGeometry(storedGeo);
        setFloatingGeometryState(clampBosFloatingGeometry(storedGeo, bounds));
        setSessionHydrated(true);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const bind = () => {
            if (cancelled) return;
            const el = ambientRef.current;
            if (el) {
                setAmbientEl(el);
                return;
            }
            requestAnimationFrame(bind);
        };
        bind();
        return () => {
            cancelled = true;
        };
    }, [ambientRef]);

    useEffect(() => {
        const el = ambientEl;
        if (!el) return;

        const measure = () => {
            const width = el.getBoundingClientRect().width;
            const nextCanvas = deriveAdaptiveWorkspacePresentation(width);
            setAmbientWidthPx(width);
            setCanvas((prev) => (prev === nextCanvas ? prev : nextCanvas));
            el.setAttribute(WORKSPACE_PRESENTATION_ATTR, nextCanvas);
            const bounds = viewportBounds();
            setFloatingGeometryState((prev) => {
                const next = clampBosFloatingGeometry(preferredFloatingGeometry, bounds);
                return geometriesEqual(prev, next) ? prev : next;
            });
            setAmbientMeasured((prev) => prev || true);
        };

        measure();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        ro?.observe(el);
        window.addEventListener("resize", measure);
        return () => {
            ro?.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [ambientEl, preferredFloatingGeometry]);

    useEffect(() => {
        if (!sessionHydrated) return;
        if (readBosPresentationPreference() != null) return;
        setPreferredState(recommendBosPresentation(canvas));
    }, [canvas, sessionHydrated]);

    const derivation = useMemo(
        () =>
            deriveBosPresentation({
                preferred,
                canvas,
                ambientWidthPx,
                preferredPinnedWidthPx: pinnedWidthPx,
            }),
        [preferred, canvas, ambientWidthPx, pinnedWidthPx],
    );

    useEffect(() => {
        const el = ambientEl;
        if (!el) return;
        el.setAttribute(BOS_PRESENTATION_ATTR, derivation.effective);
        el.setAttribute(BOS_PRESENTATION_PREFERRED_ATTR, derivation.preferred);
        el.style.setProperty(
            BOS_RAIL_WIDTH_CSS_VAR,
            derivation.reservedWidthPx > 0 ? `${derivation.reservedWidthPx}px` : "0px",
        );
        document.documentElement.setAttribute(BOS_PRESENTATION_ATTR, derivation.effective);
        document.documentElement.setAttribute(BOS_PRESENTATION_PREFERRED_ATTR, derivation.preferred);
        document.documentElement.style.setProperty(
            BOS_RAIL_WIDTH_CSS_VAR,
            derivation.reservedWidthPx > 0 ? `${derivation.reservedWidthPx}px` : "0px",
        );

        // NOTE: floating publishes NO layout reserve. Insetting the workspace by
        // the panel width made floating behave like pinned — the page narrowed and
        // the assistant read as a docked side panel, collapsing the distinction
        // the two modes exist to express. Reachability belongs to overlay z-order
        // (ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z), not to layout.
        return () => {
            document.documentElement.removeAttribute(BOS_PRESENTATION_ATTR);
            document.documentElement.removeAttribute(BOS_PRESENTATION_PREFERRED_ATTR);
        };
    }, [ambientEl, derivation]);

    /**
     * COLLISION-AWARE PARKING — the narrow fix for "the assistant settles on top
     * of the buttons".
     *
     * Layout is untouched: this only chooses WHERE the overlay rests, so floating
     * stays floating and the page keeps its full width. It runs solely for
     * AUTOMATIC placement — if the operator has positioned the window themselves,
     * `hasStoredBosFloatingGeometry()` is true and their choice is never
     * overridden.
     *
     * Obstacles are measured from the live DOM here rather than declared by any
     * page, so no surface contributes an offset and nothing is
     * Communications-specific.
     */
    useEffect(() => {
        if (derivation.effective !== "floating") return;
        if (hasStoredBosFloatingGeometry()) return;
        if (typeof document === "undefined") return;

        let frame = 0;
        const park = () => {
            const canvas = viewportBounds();
            const panel = document.querySelector('[data-adminv2-bos-rail-overlay="true"]');

            const obstacles: ObstacleRect[] = [];
            for (const el of Array.from(
                document.querySelectorAll<HTMLElement>("button, a[href], select, input, [role='button']"),
            )) {
                // The assistant's own controls — resize handle, launcher, command
                // rail — are not page actions and must not steer its parking.
                if (panel?.contains(el)) continue;
                if (
                    el.closest(
                        "[data-adminv2-bos-rail-overlay],[data-adminv2-command-surface-layer],[data-adminv2-persistent-command-rail]",
                    )
                ) {
                    continue;
                }
                const r = el.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) continue;
                if (r.bottom < 0 || r.top > canvas.height) continue;
                const cs = getComputedStyle(el);
                if (cs.visibility === "hidden" || cs.display === "none") continue;
                obstacles.push({ x: r.x, y: r.y, width: r.width, height: r.height });
            }

            /**
             * Primary surface navigation the rail may never cover. The Focus Panel mode switch is
             * the operator's way between Summary and Activity; a parked rail over it silently
             * swallows the click.
             */
            const forbidden: ObstacleRect[] = [];
            for (const el of Array.from(
                document.querySelectorAll<HTMLElement>(
                    ".alloy-os-focus-panel-mode-switch,[data-inline-focus-panel-header]",
                ),
            )) {
                if (panel?.contains(el)) continue;
                const r = el.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) continue;
                forbidden.push({ x: r.x, y: r.y, width: r.width, height: r.height });
            }

            const { geometry } = chooseBosParkingGeometry({
                size: { width: floatingGeometry.width, height: floatingGeometry.height },
                canvas,
                obstacles,
                forbidden,
            });

            setFloatingGeometryState((prev) =>
                prev.x === geometry.x && prev.y === geometry.y ? prev : { ...prev, x: geometry.x, y: geometry.y },
            );

            /*
             * ACKNOWLEDGE THE COMMIT, BOUND TO ITS EPOCH.
             *
             * A park that ran while a Work Unit reveal was still outstanding measured a page whose
             * obstacles do not exist yet — on a cold direct boot that produced a placement 495 px
             * away from the settled one. Such a park still runs (the observer keeps the rail
             * roughly right), it simply does not make the placement trustworthy.
             *
             * Binding to the epoch is what stops a superseded navigation's park from releasing the
             * current rail.
             */
            if (isWorkUnitRevealTerminal()) {
                const epoch = workUnitRevealEpoch();
                setParkedRevealEpoch((prev) => (prev === epoch ? prev : epoch));
            }
        };

        // After paint, so measurements see the rendered page.
        frame = window.requestAnimationFrame(() => window.requestAnimationFrame(park));
        window.addEventListener("resize", park);

        /*
         * OBSERVE THE LIFECYCLE; DO NOT DRIVE PARKING FROM IT.
         *
         * Calling `park()` here re-parked on every transition at EVERY breakpoint, which added
         * placement activity rather than only withholding exposure — measured as constrained-canvas
         * rail CLS doubling from 0.179 to 0.358. The existing debounced observer already re-parks
         * when the page changes; this only needs to know whether the placement it produced can be
         * trusted, and to drop trust when a new epoch supersedes the old one.
         */
        const unsubscribeReveal = subscribeWorkUnitRevealLifecycle(() => {
            if (isWorkUnitRevealTerminal()) return;
            const epoch = workUnitRevealEpoch();
            setParkedRevealEpoch((prev) => (prev === null || prev === epoch ? prev : null));
        });

        // Organization pages load their content asynchronously, so the first
        // measurement can happen before the page's buttons exist — parking then
        // "sees" an empty page and stays put. Re-park, debounced, as content
        // arrives. Debouncing matters: an un-debounced observer re-parks on its
        // own style writes and thrashes.
        let debounce = 0;
        const observer = new MutationObserver(() => {
            window.clearTimeout(debounce);
            debounce = window.setTimeout(park, 150);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(debounce);
            observer.disconnect();
            unsubscribeReveal();
            window.removeEventListener("resize", park);
        };
        // Width/height only: re-parking on every x/y change would fight itself.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [derivation.effective, floatingGeometry.width, floatingGeometry.height]);

    const setPreferred = useCallback((state: BosPresentationState) => {
        writeBosPresentationPreference(state);
        setPreferredState(state);
    }, []);

    const setPinnedWidthPx = useCallback((px: number) => {
        const clamped = clampBosPinnedWidthPx(px);
        writeBosPinnedWidthPx(clamped);
        setPinnedWidthState(clamped);
    }, []);

    const restoreDefaultWidth = useCallback(() => {
        const def = defaultBosPinnedWidthPx();
        writeBosPinnedWidthPx(def);
        setPinnedWidthState(def);
        if (preferred !== "pinned") {
            writeBosPresentationPreference("pinned");
            setPreferredState("pinned");
        }
    }, [preferred]);

    /*
     * Automatic parking is the only placement that can be provisional. A stored operator geometry is
     * the operator's own decision and is trustworthy the moment it is read; a non-floating mode is
     * laid out by the shell, not by collision measurement. Treating either as "pending" would hide
     * the rail forever on surfaces that never park.
     */
    const floatingPlacementTrustworthy = useMemo(
        () =>
            resolveFloatingExposure({
                effective: derivation.effective,
                canvas,
                operatorPositioned: hasStoredBosFloatingGeometry(),
                ambientMeasured,
                parkedRevealEpoch,
            }),
        [canvas, derivation.effective, ambientMeasured, parkedRevealEpoch],
    );

    const setFloatingGeometry = useCallback(
        (geo: BosFloatingGeometry, opts?: { persist?: boolean }) => {
            const bounds = viewportBounds();
            const clamped = clampBosFloatingGeometry(geo, bounds);
            setFloatingGeometryState(clamped);
            if (opts?.persist !== false) {
                setPreferredFloatingGeometry(clamped);
                writeBosFloatingGeometry(clamped);
            }
        },
        [],
    );

    const resetFloatingGeometry = useCallback(() => {
        const next = defaultBosFloatingGeometry(viewportBounds());
        setPreferredFloatingGeometry(next);
        setFloatingGeometryState(next);
        writeBosFloatingGeometry(next);
    }, []);

    const openFloating = useCallback(() => {
        const restored = clampBosFloatingGeometry(preferredFloatingGeometry, viewportBounds());
        setFloatingGeometryState(restored);
        setPreferred("floating");
    }, [preferredFloatingGeometry, setPreferred]);
    const closeToLauncher = useCallback(() => setPreferred("closed"), [setPreferred]);
    const pin = useCallback(() => {
        // Persist last floating geometry before entering pinned.
        writeBosFloatingGeometry(preferredFloatingGeometry);
        setPreferred("pinned");
    }, [preferredFloatingGeometry, setPreferred]);
    const unpinToFloating = useCallback(() => {
        const restored = clampBosFloatingGeometry(preferredFloatingGeometry, viewportBounds());
        setFloatingGeometryState(restored);
        setPreferred("floating");
    }, [preferredFloatingGeometry, setPreferred]);

    const value = useMemo(
        () => ({
            canvas,
            derivation,
            floatingGeometry,
            floatingPlacementTrustworthy,
            preferredFloatingGeometry,
            setPreferred,
            setPinnedWidthPx,
            setDockedWidthPx: setPinnedWidthPx,
            restoreDefaultWidth,
            setFloatingGeometry,
            resetFloatingGeometry,
            openFloating,
            closeToLauncher,
            pin,
            unpinToFloating,
        }),
        [
            canvas,
            derivation,
            floatingGeometry,
            floatingPlacementTrustworthy,
            preferredFloatingGeometry,
            setPreferred,
            setPinnedWidthPx,
            restoreDefaultWidth,
            setFloatingGeometry,
            resetFloatingGeometry,
            openFloating,
            closeToLauncher,
            pin,
            unpinToFloating,
        ],
    );

    return (
        <BosPresentationControllerContext.Provider value={value}>
            {children}
        </BosPresentationControllerContext.Provider>
    );
}

export function useBosPresentationController(): BosPresentationControllerValue {
    const ctx = useContext(BosPresentationControllerContext);
    if (!ctx) {
        throw new Error("useBosPresentationController requires BosPresentationControllerProvider");
    }
    return ctx;
}

export function useBosPresentationControllerOptional(): BosPresentationControllerValue | null {
    return useContext(BosPresentationControllerContext);
}

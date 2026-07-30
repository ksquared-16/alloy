"use client";

/**
 * Processing PDF canvas — rasterizes the imported PDF and paints detected question
 * regions on top of it, with two-way selection sync against the review list.
 *
 * PDF.js comes from `unpdf/pdfjs` (already a dependency; no new package, no worker
 * asset — see the workerSrc note in the load effect). It is imported dynamically
 * inside an effect so the ~1.5MB bundle never enters the SSR/server graph.
 */

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type JSX,
} from "react";
import type {
    PageViewport,
    PDFDocumentLoadingTask,
    PDFDocumentProxy,
    RenderTask,
} from "unpdf/pdfjs";

export type PdfHighlightRegion = {
    id: string;
    /** 1-based page number */
    page: number;
    /** PDF user-space points, bottom-left origin: [x0, y0, x1, y1] */
    bbox: [number, number, number, number];
    /** visual tone; default "auto" */
    tone?: "auto" | "operator";
};

type RegionTone = NonNullable<PdfHighlightRegion["tone"]>;

type LoadedPage = {
    pageNumber: number;
    /** Unscaled viewport, kept so overlays can be re-projected at any zoom without re-parsing the page. */
    base: PageViewport;
};

/** Rasterize a screen's worth beyond the viewport so scrolling rarely lands on a placeholder. */
const NEAR_VIEWPORT_MARGIN = "800px 0px";
/** Beyond 2x the extra pixels cost more than they show. */
const MAX_DEVICE_PIXEL_RATIO = 2;
/** Horizontal breathing room inside the scroller, per side. */
const VIEWPORT_PAD_PX = 24;

const REGION_TONE_CLASS: Record<RegionTone, { idle: string; selected: string }> = {
    auto: {
        idle: "border border-alloy-blue/40 bg-alloy-blue/10 hover:bg-alloy-blue/20",
        selected: "border-2 border-alloy-blue bg-alloy-blue/25 ring-2 ring-alloy-blue/25",
    },
    operator: {
        idle: "border border-alloy-bend-pine/45 bg-alloy-bend-pine/10 hover:bg-alloy-bend-pine/20",
        selected: "border-2 border-alloy-bend-pine bg-alloy-bend-pine/25 ring-2 ring-alloy-bend-pine/25",
    },
};

function regionArea(region: PdfHighlightRegion): number {
    const [x0, y0, x1, y1] = region.bbox;
    return Math.abs(x1 - x0) * Math.abs(y1 - y0);
}

/** Cancelled renders are a normal consequence of scrolling/zooming — never operator-facing errors. */
function isCancellation(error: unknown): boolean {
    const name = (error as { name?: string } | null)?.name;
    return name === "RenderingCancelledException" || name === "AbortException";
}

function toMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

export default function ProcessingPdfCanvas({
    url,
    regions,
    selectedId,
    onSelectRegion,
    zoom = 1,
    onDocumentLoaded,
    onError,
    className,
}: {
    /** Signed URL of the PDF. */
    url: string;
    regions: PdfHighlightRegion[];
    selectedId: string | null;
    onSelectRegion: (id: string | null) => void;
    /** 1 = fit container width. Caller owns zoom UI. */
    zoom?: number;
    onDocumentLoaded?: (info: { pageCount: number }) => void;
    onError?: (message: string) => void;
    className?: string;
}): JSX.Element {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const pageElsRef = useRef(new Map<number, HTMLDivElement>());
    const regionElsRef = useRef(new Map<string, HTMLDivElement>());
    const anchorPageRef = useRef(1);
    const prevScaleRef = useRef(0);

    const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
    const [pages, setPages] = useState<LoadedPage[]>([]);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    // Callbacks live in refs so a caller re-creating them inline never re-triggers a document load.
    const onDocumentLoadedRef = useRef(onDocumentLoaded);
    const onErrorRef = useRef(onError);
    useEffect(() => {
        onDocumentLoadedRef.current = onDocumentLoaded;
        onErrorRef.current = onError;
    });

    useEffect(() => {
        let cancelled = false;
        let loadingTask: PDFDocumentLoadingTask | null = null;

        setStatus("loading");
        setErrorMessage(null);
        setPages([]);
        setDoc(null);

        void (async () => {
            const pdfjs = await import("unpdf/pdfjs");
            if (cancelled) return;

            // The unpdf build inlines the pdf.js worker (`_setupFakeWorkerGlobal`), but ships a
            // default workerSrc of "./pdf.worker.mjs" — an asset we do not serve. Clearing it makes
            // pdf.js take the inlined path immediately instead of 404ing a real Worker first.
            pdfjs.GlobalWorkerOptions.workerSrc = "";

            const task = pdfjs.getDocument({ url, isEvalSupported: false, useSystemFonts: true });
            loadingTask = task;

            const pdf = await task.promise;
            if (cancelled) return;

            // Page dimensions up front so every page gets a correctly-sized placeholder and
            // scroll position stays stable regardless of which pages have rasterized.
            const loaded: LoadedPage[] = [];
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                const page = await pdf.getPage(pageNumber);
                if (cancelled) return;
                loaded.push({ pageNumber, base: page.getViewport({ scale: 1 }) });
            }
            if (cancelled) return;

            setDoc(pdf);
            setPages(loaded);
            setStatus("ready");
            onDocumentLoadedRef.current?.({ pageCount: pdf.numPages });
        })().catch((error: unknown) => {
            if (cancelled) return;
            const message = toMessage(error, "This document could not be opened.");
            setStatus("error");
            setErrorMessage(message);
            onErrorRef.current?.(message);
        });

        return () => {
            cancelled = true;
            // Destroying the loading task tears down the document and its transport too.
            void loadingTask?.destroy().catch(() => {});
        };
    }, [url]);

    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const measure = () => setContainerWidth(el.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // One scale for the whole stack (widest page fits) so mixed page sizes stay visually consistent.
    const widestPagePt = useMemo(
        () => pages.reduce((max, page) => Math.max(max, page.base.width), 0),
        [pages]
    );

    const scale = useMemo(() => {
        if (widestPagePt <= 0 || containerWidth <= 0) return 0;
        const available = Math.max(160, containerWidth - VIEWPORT_PAD_PX * 2);
        return (available / widestPagePt) * (zoom > 0 ? zoom : 1);
    }, [containerWidth, widestPagePt, zoom]);

    const regionsByPage = useMemo(() => {
        const byPage = new Map<number, PdfHighlightRegion[]>();
        for (const region of regions) {
            const existing = byPage.get(region.page);
            if (existing) existing.push(region);
            else byPage.set(region.page, [region]);
        }
        // Largest first: later siblings get a higher z-index, so a small region nested inside a
        // big one stays visible and clickable rather than being swallowed by it.
        for (const list of byPage.values()) list.sort((a, b) => regionArea(b) - regionArea(a));
        return byPage;
    }, [regions]);

    const registerPageEl = useCallback((pageNumber: number, el: HTMLDivElement | null) => {
        if (el) pageElsRef.current.set(pageNumber, el);
        else pageElsRef.current.delete(pageNumber);
    }, []);

    const registerRegionEl = useCallback((id: string, el: HTMLDivElement | null) => {
        if (el) regionElsRef.current.set(id, el);
        else regionElsRef.current.delete(id);
    }, []);

    const handlePageError = useCallback((message: string) => {
        onErrorRef.current?.(message);
    }, []);

    // Remember the top-most visible page so a zoom change can restore roughly the same place.
    const handleScroll = useCallback(() => {
        const root = rootRef.current;
        if (!root) return;
        const rootTop = root.getBoundingClientRect().top;
        const numbers = [...pageElsRef.current.keys()].sort((a, b) => a - b);
        for (const pageNumber of numbers) {
            const el = pageElsRef.current.get(pageNumber);
            if (!el) continue;
            if (el.getBoundingClientRect().bottom > rootTop + 4) {
                anchorPageRef.current = pageNumber;
                return;
            }
        }
    }, []);

    useLayoutEffect(() => {
        const previous = prevScaleRef.current;
        prevScaleRef.current = scale;
        if (!previous || !scale || previous === scale) return;
        pageElsRef.current.get(anchorPageRef.current)?.scrollIntoView({ block: "start" });
    }, [scale]);

    // Selection arriving from the review list: bring the region into view, but never yank the
    // page around when the operator can already see it.
    useEffect(() => {
        if (!selectedId || status !== "ready") return;
        const el = regionElsRef.current.get(selectedId);
        const root = rootRef.current;
        if (!el || !root) return;
        const region = el.getBoundingClientRect();
        const bounds = root.getBoundingClientRect();
        const fullyVisible =
            region.top >= bounds.top &&
            region.bottom <= bounds.bottom &&
            region.left >= bounds.left &&
            region.right <= bounds.right;
        if (fullyVisible) return;
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }, [selectedId, status, scale, pages]);

    const ready = status === "ready" && doc !== null && scale > 0;

    return (
        <div
            ref={rootRef}
            data-testid="pdf-canvas"
            data-pdf-status={status}
            onScroll={handleScroll}
            className={`relative h-full min-h-0 overflow-auto bg-alloy-stone ${className ?? ""}`}
        >
            {status === "loading" ? <PdfCanvasSkeleton /> : null}

            {status === "error" ? (
                <div
                    data-testid="pdf-canvas-error"
                    className="m-4 rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-4 py-3 text-[12px] text-alloy-midnight"
                >
                    <p className="font-semibold">This document could not be displayed.</p>
                    {errorMessage ? <p className="mt-1 text-alloy-midnight/60">{errorMessage}</p> : null}
                </div>
            ) : null}

            {ready ? (
                <div className="flex min-w-max flex-col items-center gap-4 px-6 py-6">
                    {pages.map((page) => (
                        <PdfPageLayer
                            key={page.pageNumber}
                            doc={doc}
                            pageNumber={page.pageNumber}
                            baseViewport={page.base}
                            scale={scale}
                            regions={regionsByPage.get(page.pageNumber) ?? []}
                            selectedId={selectedId}
                            onSelectRegion={onSelectRegion}
                            registerPageEl={registerPageEl}
                            registerRegionEl={registerRegionEl}
                            onPageError={handlePageError}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function PdfPageLayer({
    doc,
    pageNumber,
    baseViewport,
    scale,
    regions,
    selectedId,
    onSelectRegion,
    registerPageEl,
    registerRegionEl,
    onPageError,
}: {
    doc: PDFDocumentProxy;
    pageNumber: number;
    baseViewport: PageViewport;
    scale: number;
    regions: PdfHighlightRegion[];
    selectedId: string | null;
    onSelectRegion: (id: string | null) => void;
    registerPageEl: (pageNumber: number, el: HTMLDivElement | null) => void;
    registerRegionEl: (id: string, el: HTMLDivElement | null) => void;
    onPageError: (message: string) => void;
}) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [near, setNear] = useState(false);
    const [painted, setPainted] = useState(false);

    const viewport = useMemo(() => baseViewport.clone({ scale }), [baseViewport, scale]);

    // Only pages at or near the viewport are worth rasterizing; an 18-page document would
    // otherwise hold 18 full-resolution bitmaps at once.
    useEffect(() => {
        const el = wrapperRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) setNear(entry.isIntersecting);
            },
            { rootMargin: NEAR_VIEWPORT_MARGIN }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (!near) {
            // Release the bitmap; the wrapper keeps its layout size so scroll position never jumps.
            canvas.width = 0;
            canvas.height = 0;
            setPainted(false);
            return;
        }

        let cancelled = false;
        let task: RenderTask | null = null;

        void (async () => {
            const page = await doc.getPage(pageNumber);
            if (cancelled) return;

            // Back the canvas with device pixels, then hand it back its layout size in CSS.
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
            canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
            canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;

            task = page.render({
                canvas,
                viewport,
                transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
            });
            await task.promise;
            if (!cancelled) setPainted(true);
        })().catch((error: unknown) => {
            if (isCancellation(error) || cancelled) return;
            onPageError(toMessage(error, `Page ${pageNumber} could not be rendered.`));
        });

        return () => {
            // Scrolling away or changing zoom aborts the in-flight raster.
            cancelled = true;
            task?.cancel();
        };
    }, [doc, pageNumber, viewport, near, onPageError]);

    const overlays = useMemo(
        () =>
            regions.map((region) => {
                // PDF user space is bottom-left origin, CSS is top-left. The viewport transform
                // already encodes the flip, so let pdf.js do the conversion instead of hand-rolling
                // it — that also keeps page rotation correct.
                const projected = viewport.convertToViewportRectangle(region.bbox) as number[];
                const [x0, y0, x1, y1] = projected;
                return {
                    region,
                    left: Math.min(x0, x1),
                    top: Math.min(y0, y1),
                    width: Math.max(2, Math.abs(x1 - x0)),
                    height: Math.max(2, Math.abs(y1 - y0)),
                };
            }),
        [regions, viewport]
    );

    return (
        <div
            ref={(el) => {
                wrapperRef.current = el;
                registerPageEl(pageNumber, el);
            }}
            data-testid={`pdf-page-${pageNumber}`}
            data-pdf-page={pageNumber}
            data-pdf-page-painted={painted ? "true" : "false"}
            className="relative shrink-0 overflow-hidden rounded-lg border border-alloy-stone/15 bg-white shadow-[0_1px_4px_rgba(24,39,58,0.06)]"
            style={{ width: viewport.width, height: viewport.height }}
            onClick={(event) => {
                // The canvas and placeholder are pointer-transparent, so a click that reaches the
                // wrapper itself is a click on empty page area.
                if (event.target === event.currentTarget) onSelectRegion(null);
            }}
        >
            <canvas ref={canvasRef} className="pointer-events-none block" aria-hidden="true" />

            {!painted ? (
                <div className="pointer-events-none absolute inset-0 animate-pulse bg-alloy-stone/70" aria-hidden="true" />
            ) : null}

            {overlays.map((overlay, index) => {
                const selected = overlay.region.id === selectedId;
                const tone = REGION_TONE_CLASS[overlay.region.tone ?? "auto"];
                return (
                    <div
                        key={overlay.region.id}
                        ref={(el) => {
                            registerRegionEl(overlay.region.id, el);
                        }}
                        data-testid={`pdf-region-${overlay.region.id}`}
                        data-pdf-region-selected={selected ? "true" : "false"}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        aria-label={`Detected region on page ${pageNumber}`}
                        className={`absolute cursor-pointer rounded-[2px] transition-colors ${
                            selected ? tone.selected : tone.idle
                        }`}
                        style={{
                            left: overlay.left,
                            top: overlay.top,
                            width: overlay.width,
                            height: overlay.height,
                            // overlays are sorted largest-first, so smaller regions sit on top;
                            // the selection always outranks all of them.
                            zIndex: selected ? 999 : index + 1,
                        }}
                        onClick={(event) => {
                            event.stopPropagation();
                            onSelectRegion(overlay.region.id);
                        }}
                        onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            event.stopPropagation();
                            onSelectRegion(overlay.region.id);
                        }}
                    />
                );
            })}
        </div>
    );
}

function PdfCanvasSkeleton() {
    return (
        <div className="flex flex-col items-center gap-4 px-6 py-6" data-testid="pdf-canvas-skeleton">
            {[0, 1].map((key) => (
                <div
                    key={key}
                    className="h-[520px] w-full max-w-[680px] animate-pulse rounded-lg border border-alloy-stone/15 bg-white/70"
                />
            ))}
        </div>
    );
}

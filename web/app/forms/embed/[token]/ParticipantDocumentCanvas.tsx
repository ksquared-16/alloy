"use client";

/**
 * The participant's original enrollment document, rendered in place.
 *
 * A deliberately small sibling of the operator's `ProcessingPdfCanvas`: same PDF.js recipe
 * (`unpdf/pdfjs`, dynamic import so the bundle never enters the SSR graph, workerSrc cleared to run
 * workerless), none of the operator machinery. Enrollment paperwork is a few pages; every page
 * renders eagerly at container width.
 *
 * The `url` prop is the whole refresh contract: the host bumps a `rev` query param after an edit,
 * the effect re-runs, and the freshly regenerated document replaces the stale one.
 *
 * ## The signature overlay
 *
 * When the host is in its SIGNING state it passes the version's authored placement (PDF points,
 * bottom-left origin). The overlay is projected into CSS space on the placement's page — a tap
 * target where the document says "sign here", which is where signing belongs. Once captured, the
 * same rect shows the mark (drawn image or typed name) so the parent sees their signature ON the
 * document before submitting. The overlay is presentation: evidence stays Forms-owned.
 */

import { useEffect, useRef, useState } from "react";

/** Beyond 2x the extra pixels cost more than they show. */
const MAX_DEVICE_PIXEL_RATIO = 2;

/** The smallest a fitted page may be scaled before it stops being readable at all. */
const MIN_FIT_SCALE = 0.34;

export type DocumentSignatureOverlay = {
    /** 0-indexed page, PDF points, origin bottom-left — the version's authored placement. */
    readonly page: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    /** Captured mark to preview in place, when the parent has signed. */
    readonly preview?: { readonly typedName?: string | null; readonly drawnPngDataUrl?: string | null };
    /** Tap/click on the signature area. */
    readonly onActivate: () => void;
    /** Scroll the placement into view when the signing state opens. */
    readonly focus?: boolean;
};


/**
 * Paint the signature target for whatever the parent has (or has not) captured.
 *
 * Extracted so the same rules serve both a full rasterize and an in-place update. The mark is
 * PRESENTATION over an already-rendered page; nothing about it needs the PDF re-fetched.
 */
function paintSignatureTarget(
    target: HTMLElement,
    preview: DocumentSignatureOverlay["preview"],
    heightPx: number,
): void {
    target.replaceChildren();
    if (preview?.drawnPngDataUrl) {
        target.className = "rounded-md";
        const img = document.createElement("img");
        img.src = preview.drawnPngDataUrl;
        img.alt = "Your signature";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        target.appendChild(img);
        target.setAttribute("data-artifact-signature-state", "signed");
    } else if (preview?.typedName) {
        target.className = "rounded-md text-left font-medium italic text-alloy-midnight";
        target.style.fontSize = `${Math.max(12, Math.min(heightPx * 0.6, 20))}px`;
        target.textContent = preview.typedName;
        target.setAttribute("data-artifact-signature-state", "signed");
    } else {
        target.className =
            "animate-pulse rounded-md border-2 border-dashed border-alloy-bend-pine/70 bg-alloy-bend-pine/10 text-[13px] font-medium text-alloy-bend-pine";
        target.textContent = "Tap to sign";
        target.setAttribute("data-artifact-signature-state", "unsigned");
    }
}

export function ParticipantDocumentCanvas({
    url,
    signature,
    onUnavailable,
    fitHeightPx,
    zoom,
}: {
    url: string;
    signature?: DocumentSignatureOverlay | null;
    /** The document could not render — the host falls back to the semantic review, never a blank. */
    onUnavailable: () => void;
    /**
     * Scale the whole page to fit within this many pixels of height.
     *
     * Absent, the page renders at container width — which is right when the document IS the task
     * (reading it, signing it) and wrong when the task is "decide whether this is correct": a
     * letter page at full width is taller than a laptop viewport, so the decision controls beneath
     * it sat below the fold and a parent had to guess they existed.
     */
    fitHeightPx?: number;
    /**
     * Magnification, as a multiple of the width that would just fill the container.
     *
     * "View larger" originally only removed the height cap, which meant the page grew to container
     * width and stopped. On a phone the container IS roughly the fitted width, so the document went
     * from 362px tall to 365px — Kelly pressed it and correctly reported that nothing happened.
     * Enlarging has to mean bigger than the space available, with the region scrolled to read it.
     */
    zoom?: number;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [status, setStatus] = useState<"loading" | "ready">("loading");
    const [pageCount, setPageCount] = useState(0);
    const [page, setPage] = useState(1);
    /** Read inside the render effect without making the effect depend on it. */
    const pageRef = useRef(1);
    pageRef.current = page;
    // The latest overlay props, readable from the imperative render without re-rasterizing.
    const signatureRef = useRef<DocumentSignatureOverlay | null>(signature ?? null);
    signatureRef.current = signature ?? null;

    useEffect(() => {
        let cancelled = false;
        const container = containerRef.current;
        if (!container) return;

        void (async () => {
            try {
                setStatus("loading");
                const pdfjs = await import("unpdf/pdfjs");
                // No worker asset is served for the public embed either — run on the main thread.
                pdfjs.GlobalWorkerOptions.workerSrc = "";
                const doc = await pdfjs.getDocument({ url, isEvalSupported: false, useSystemFonts: true })
                    .promise;
                if (cancelled) return;

                const width = Math.max(280, container.clientWidth);
                const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);

                // Replace previous render wholesale — a regenerate is a new document, not a patch.
                container.replaceChildren();
                setPageCount(doc.numPages);

                /*
                 * ONE PAGE AT A TIME.
                 *
                 * Paperwork is read a page at a time, and a phone cannot show four stacked pages
                 * legibly — the parent got a single tall column and had to scroll past pages they
                 * were not being asked about. Only the page in view is rendered, so navigation is
                 * also the thing that keeps a long document cheap.
                 */
                const only = Math.min(Math.max(1, pageRef.current), doc.numPages);
                for (let pageNumber = only; pageNumber <= only; pageNumber++) {
                    const page = await doc.getPage(pageNumber);
                    if (cancelled) return;
                    const base = page.getViewport({ scale: 1 });
                    /*
                     * FIT THE PAGE WHEN A HEIGHT BUDGET IS GIVEN, and never below legibility.
                     *
                     * `MIN_FIT_SCALE` is the floor: shrinking a page past it to satisfy "one
                     * viewport" produces something nobody can read, which is not a review surface.
                     * Below the floor the page keeps a readable size and the region scrolls, and the
                     * host's own controls stay visible outside it either way.
                     */
                    const widthScale = width / base.width;
                    const fitted =
                        fitHeightPx && fitHeightPx > 0
                            ? Math.max(MIN_FIT_SCALE, Math.min(widthScale, fitHeightPx / base.height))
                            : widthScale;
                    // Zoom is relative to filling the container, so it is genuine magnification at
                    // any width rather than "grow until you touch the edges, then stop".
                    const scale = zoom && zoom > 0 ? widthScale * zoom : fitted;
                    const viewport = page.getViewport({ scale });

                    // Same render contract as the operator canvas: the CANVAS is handed to pdf.js,
                    // DPR applied as a transform, CSS size at the logical viewport.
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
                    canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
                    canvas.style.width = `${viewport.width}px`;
                    canvas.style.height = `${viewport.height}px`;
                    canvas.style.display = "block";
                    canvas.setAttribute("data-participant-document-page", String(pageNumber));
                    await page.render({
                        canvas,
                        viewport,
                        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
                    }).promise;
                    if (cancelled) return;

                    const wrapper = document.createElement("div");
                    wrapper.className =
                        "relative overflow-hidden rounded-lg border border-alloy-midnight/10 shadow-sm";
                    /*
                     * SIZED TO THE PAGE, so an enlarged document can actually be scrolled to.
                     *
                     * The wrapper is `overflow-hidden` (it rounds the canvas corners) and, left to
                     * flow, it took the REGION's width. So at 375 a page rendered 616px wide sat
                     * inside a 299px wrapper that clipped it, and the region's scrollWidth stayed at
                     * 299 — the right half of the document was not merely off-screen, it was
                     * unreachable by scrolling. Stating the width makes the region scroll instead.
                     */
                    wrapper.style.width = `${viewport.width}px`;
                    wrapper.style.flexShrink = "0";
                    wrapper.appendChild(canvas);

                    const sig = signatureRef.current;
                    if (sig && sig.page === pageNumber - 1) {
                        // PDF points (bottom-left origin) → CSS pixels (top-left origin).
                        const left = sig.x * scale;
                        const top = (base.height - sig.y - sig.height) * scale;
                        const w = sig.width * scale;
                        const h = sig.height * scale;

                        const target = document.createElement("button");
                        target.type = "button";
                        target.setAttribute("data-artifact-signature-target", "true");
                        target.style.position = "absolute";
                        target.style.left = `${left}px`;
                        target.style.top = `${top}px`;
                        target.style.width = `${Math.max(w, 120)}px`;
                        target.style.height = `${Math.max(h, 30)}px`;
                        target.addEventListener("click", () => signatureRef.current?.onActivate());

                        paintSignatureTarget(target, sig.preview, h);
                        wrapper.appendChild(target);
                        if (sig.focus) {
                            // After paint, bring the signature area to the parent's eye.
                            setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
                        }
                    }

                    container.appendChild(wrapper);
                }
                if (!cancelled) setStatus("ready");
            } catch {
                if (!cancelled) onUnavailable();
            }
        })();

        return () => {
            cancelled = true;
        };
        // onUnavailable is a stable host callback by contract; the url and the signature's captured
        // preview are the identity of a render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        // `page` is a dependency: turning the page re-renders that page and only that page.
        /*
         * THE CAPTURED MARK IS NOT A DEPENDENCY OF THE RASTERIZE.
         *
         * It used to be. So the moment a parent finished signing, this effect re-imported pdf.js,
         * re-fetched the document and re-rasterized the page — several seconds — purely to relabel
         * one overlay. For that whole time the OLD overlay stayed on screen: a dashed, pulsing
         * "Tap to sign" inviting them to sign something they had just signed. Kelly's words were
         * "did my signature actually work?".
         *
         * The mark is painted over an already-rendered page, so it updates in place below. The
         * document may still regenerate afterwards; the acknowledgment no longer waits for it.
         */
    }, [url, page, signature?.focus, !!signature, fitHeightPx, zoom]);

    /**
     * The captured mark, projected immediately.
     *
     * Runs off `capturedSignature` — which the host sets only after the authoritative commit — so
     * this shows the signed state as soon as it is true, and never before.
     */
    useEffect(() => {
        const target = containerRef.current?.querySelector<HTMLElement>("[data-artifact-signature-target]");
        if (!target) return;
        paintSignatureTarget(target, signature?.preview, target.getBoundingClientRect().height);
    }, [signature?.preview?.typedName, signature?.preview?.drawnPngDataUrl]);

    /*
     * A signature navigates to its own page.
     *
     * The parent should never be asked to find the place they are meant to sign — when a signature
     * is being captured, the document turns to the page its authored placement lives on.
     */
    useEffect(() => {
        /*
         * ONE effect, because two of them raced and the later one always won.
         *
         * A separate "a regenerated document starts at the beginning" effect ran after this one and
         * reset the page to 1 — on every url change, which includes entering the signing phase and
         * every regeneration during it. On the Oregon CIS the signature is on page 1 and the bug was
         * invisible; on the Oregon Nonmedical Exemption it is on page 2, so the parent was shown a
         * page with no signature line and no way to know where to sign.
         *
         * Where the parent is meant to BE is one decision: the signature's own page when there is a
         * placement, and the first page otherwise.
         */
        setPage(signature && typeof signature.page === "number" ? signature.page + 1 : 1);
    }, [url, signature?.page, !!signature]);

    const atFirst = page <= 1;
    const atLast = pageCount > 0 && page >= pageCount;

    return (
        <div data-participant-document="true" data-participant-document-pages={pageCount || undefined}>
            {status === "loading" ? (
                <p className="py-6 text-center text-[14px] text-alloy-midnight/50">
                    Preparing your paperwork…
                </p>
            ) : null}
            <div ref={containerRef} className="flex flex-col gap-4" />
            {pageCount > 1 ? (
                /* Reachable on a phone: full-height targets, and never off the safe area. */
                <nav
                    className="mt-4 flex items-center justify-between gap-3 border-t border-alloy-midnight/[0.07] pt-4"
                    aria-label="Document pages"
                    data-participant-document-nav="true"
                >
                    <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={atFirst}
                        className="min-h-[44px] rounded-xl border border-alloy-midnight/15 px-4 text-[14px] font-medium text-alloy-midnight disabled:opacity-35"
                    >
                        ‹ Previous
                    </button>
                    <span className="text-[13px] tabular-nums text-alloy-midnight/60" aria-live="polite">
                        Page {Math.min(page, pageCount)} of {pageCount}
                    </span>
                    <button
                        type="button"
                        onClick={() => setPage((p) => (pageCount ? Math.min(pageCount, p + 1) : p))}
                        disabled={atLast}
                        className="min-h-[44px] rounded-xl border border-alloy-midnight/15 px-4 text-[14px] font-medium text-alloy-midnight disabled:opacity-35"
                    >
                        Next ›
                    </button>
                </nav>
            ) : null}
        </div>
    );
}

"use client";

/**
 * The participant's original enrollment document, rendered in place.
 *
 * A deliberately small sibling of the operator's `ProcessingPdfCanvas`: same PDF.js recipe
 * (`unpdf/pdfjs`, dynamic import so the bundle never enters the SSR graph, workerSrc cleared to run
 * workerless), none of the operator machinery — no region overlays, no selection sync, no zoom.
 * Enrollment paperwork is a few pages; every page renders eagerly at container width.
 *
 * The `url` prop is the whole refresh contract: the host bumps a `rev` query param after an edit,
 * the effect re-runs, and the freshly regenerated document replaces the stale one. No imperative
 * reload handle to hold wrong.
 */

import { useEffect, useRef, useState } from "react";

/** Beyond 2x the extra pixels cost more than they show. */
const MAX_DEVICE_PIXEL_RATIO = 2;

export function ParticipantDocumentCanvas({
    url,
    onUnavailable,
}: {
    url: string;
    /** The document could not render — the host falls back to the semantic review, never a blank. */
    onUnavailable: () => void;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [status, setStatus] = useState<"loading" | "ready">("loading");

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

                for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
                    const page = await doc.getPage(pageNumber);
                    if (cancelled) return;
                    const base = page.getViewport({ scale: 1 });
                    const viewport = page.getViewport({ scale: width / base.width });

                    // Same render contract as the operator canvas: the CANVAS is handed to pdf.js,
                    // DPR applied as a transform, CSS size at the logical viewport.
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
                    canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
                    canvas.style.width = `${viewport.width}px`;
                    canvas.style.height = `${viewport.height}px`;
                    canvas.style.display = "block";
                    canvas.className = "rounded-lg border border-alloy-midnight/10 shadow-sm";
                    canvas.setAttribute("data-participant-document-page", String(pageNumber));
                    await page.render({
                        canvas,
                        viewport,
                        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
                    }).promise;
                    if (cancelled) return;
                    container.appendChild(canvas);
                }
                if (!cancelled) setStatus("ready");
            } catch {
                if (!cancelled) onUnavailable();
            }
        })();

        return () => {
            cancelled = true;
        };
        // onUnavailable is a stable host callback by contract; the url IS the identity of a render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url]);

    return (
        <div data-participant-document="true">
            {status === "loading" ? (
                <p className="py-6 text-center text-[14px] text-alloy-midnight/50">
                    Preparing your paperwork…
                </p>
            ) : null}
            <div ref={containerRef} className="flex flex-col gap-4" />
        </div>
    );
}

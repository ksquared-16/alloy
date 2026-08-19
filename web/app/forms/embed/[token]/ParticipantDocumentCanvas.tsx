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

export function ParticipantDocumentCanvas({
    url,
    signature,
    onUnavailable,
}: {
    url: string;
    signature?: DocumentSignatureOverlay | null;
    /** The document could not render — the host falls back to the semantic review, never a blank. */
    onUnavailable: () => void;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [status, setStatus] = useState<"loading" | "ready">("loading");
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

                for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
                    const page = await doc.getPage(pageNumber);
                    if (cancelled) return;
                    const base = page.getViewport({ scale: 1 });
                    const scale = width / base.width;
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

                        const preview = sig.preview;
                        if (preview?.drawnPngDataUrl) {
                            target.className = "rounded-md";
                            const img = document.createElement("img");
                            img.src = preview.drawnPngDataUrl;
                            img.alt = "Your signature";
                            img.style.width = "100%";
                            img.style.height = "100%";
                            img.style.objectFit = "contain";
                            target.appendChild(img);
                        } else if (preview?.typedName) {
                            target.className =
                                "rounded-md text-left font-medium italic text-alloy-midnight";
                            target.style.fontSize = `${Math.max(12, Math.min(h * 0.6, 20))}px`;
                            target.textContent = preview.typedName;
                        } else {
                            target.className =
                                "animate-pulse rounded-md border-2 border-dashed border-alloy-bend-pine/70 bg-alloy-bend-pine/10 text-[13px] font-medium text-alloy-bend-pine";
                            target.textContent = "Tap to sign";
                        }
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
    }, [url, signature?.preview?.typedName, signature?.preview?.drawnPngDataUrl, signature?.focus, !!signature]);

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

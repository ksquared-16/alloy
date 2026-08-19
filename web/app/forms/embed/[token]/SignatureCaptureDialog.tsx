"use client";

/**
 * Signature capture, opened from the document's own signature area.
 *
 * PRESENTATION ONLY — what a signature means, what it requires and where its evidence lives all
 * stay Forms-owned (`validateSubmission` + `form_submission_signatures`). This dialog produces the
 * exact payload shape that authority already validates: a DRAWN capture (PNG from the pad) or a
 * TYPED name, exclusively — never both on one signature — plus the electronic-signature
 * acknowledgment the field's policy requires.
 *
 * Drawing uses pointer events, which unify mouse, touch and stylus — an iPhone finger and a desktop
 * mouse hit the same handlers. `touch-action: none` keeps the page from scrolling mid-stroke.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type CapturedSignature =
    | { readonly kind: "drawn"; readonly pngBase64: string; readonly acknowledged: boolean }
    | { readonly kind: "typed"; readonly typedName: string; readonly acknowledged: boolean };

const PAD_WIDTH = 460;
const PAD_HEIGHT = 160;

export function SignatureCaptureDialog({
    signerNameHint,
    allowTyped,
    onDone,
    onCancel,
}: {
    /** Prefill for the typed path — the parent's name if the conversation knows it. */
    signerNameHint?: string | null;
    /** The field's policy permits a typed signature (it always permits drawing). */
    allowTyped: boolean;
    onDone: (captured: CapturedSignature) => void;
    onCancel: () => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const [hasInk, setHasInk] = useState(false);
    const [mode, setMode] = useState<"draw" | "type">("draw");
    const [typedName, setTypedName] = useState(signerNameHint ?? "");
    const [acknowledged, setAcknowledged] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || mode !== "draw") return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = PAD_WIDTH * dpr;
        canvas.height = PAD_HEIGHT * dpr;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#151a2e";
    }, [mode]);

    const pointFrom = (canvas: HTMLCanvasElement, e: PointerEvent | React.PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left) / rect.width) * PAD_WIDTH,
            y: ((e.clientY - rect.top) / rect.height) * PAD_HEIGHT,
        };
    };

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        canvas.setPointerCapture(e.pointerId);
        drawingRef.current = true;
        const p = pointFrom(canvas, e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const p = pointFrom(canvas, e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        setHasInk(true);
    }, []);

    const onPointerUp = useCallback(() => {
        drawingRef.current = false;
    }, []);

    const clear = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        ctx.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
        setHasInk(false);
    }, []);

    const ready = acknowledged && (mode === "draw" ? hasInk : typedName.trim().length > 1);

    const done = useCallback(() => {
        if (!ready) return;
        if (mode === "draw") {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const pngBase64 = canvas.toDataURL("image/png").split(",")[1] ?? "";
            onDone({ kind: "drawn", pngBase64, acknowledged });
            return;
        }
        onDone({ kind: "typed", typedName: typedName.trim(), acknowledged });
    }, [ready, mode, typedName, acknowledged, onDone]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-alloy-midnight/40 p-4 sm:items-center"
            data-signature-capture="true"
            role="dialog"
            aria-modal="true"
            aria-label="Sign"
        >
            <div className="w-full max-w-[520px] rounded-2xl bg-white p-5 shadow-xl">
                <p className="text-[17px] font-medium text-alloy-midnight">Sign here</p>
                <p className="pt-1 text-[13px] text-alloy-midnight/55">
                    {mode === "draw"
                        ? "Use your finger or mouse to sign."
                        : "Type your full legal name as your signature."}
                </p>

                {mode === "draw" ? (
                    <canvas
                        ref={canvasRef}
                        style={{ width: "100%", height: PAD_HEIGHT, touchAction: "none" }}
                        className="mt-4 rounded-xl border border-alloy-midnight/15 bg-white"
                        data-signature-pad="true"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerLeave={onPointerUp}
                    />
                ) : (
                    <input
                        type="text"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        placeholder="Type your full name"
                        className="mt-4 w-full rounded-xl border border-alloy-midnight/15 px-3 py-3 text-[16px] italic"
                        data-signature-typed="true"
                    />
                )}

                <label className="mt-4 flex items-start gap-2 text-[13px] text-alloy-midnight/70">
                    <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        className="mt-0.5"
                        data-signature-consent="true"
                    />
                    <span>I acknowledge this electronic signature applies to this form.</span>
                </label>

                <div className="mt-5 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={done}
                        disabled={!ready}
                        className="rounded-xl bg-alloy-midnight px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-40"
                        data-signature-done="true"
                    >
                        Done
                    </button>
                    {mode === "draw" ? (
                        <button
                            type="button"
                            onClick={clear}
                            className="text-[14px] text-alloy-midnight/60 underline underline-offset-2"
                        >
                            Clear
                        </button>
                    ) : null}
                    <span className="flex-1" />
                    {allowTyped ? (
                        <button
                            type="button"
                            onClick={() => setMode(mode === "draw" ? "type" : "draw")}
                            className="text-[14px] text-alloy-midnight/60 underline underline-offset-2"
                        >
                            {mode === "draw" ? "Type instead" : "Draw instead"}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-[14px] text-alloy-midnight/60 underline underline-offset-2"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

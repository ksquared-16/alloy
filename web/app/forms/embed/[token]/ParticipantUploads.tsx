"use client";

/**
 * "Bring us a copy of this" — the part of enrollment paperwork that is not a question.
 *
 * A parent is asked for their child's immunization record because Oregon law requires the school to
 * hold one. That is work, and its result is evidence; it is not a box on the form with a value in
 * it. So this reads as a short list of things to bring, each one done or not done, and never as
 * another field to fill in.
 *
 * The file goes to the token-scoped route, which files it as a canonical Document and hands back an
 * id. That id — and only that id — is what lands in the payload, because a `file_ref` destination
 * holds a document reference. Nothing here decides what the document MEANS.
 */

import { useRef, useState } from "react";
import clsx from "clsx";

import type { ParticipantUploadRequest } from "@/lib/enrollment/participantRuntime/participantUploadRequests";

type Attached = { document_id: string; filename: string };

export function ParticipantUploads({
    requests,
    attached,
    token,
    onAttached,
    onUpload,
}: {
    requests: readonly ParticipantUploadRequest[];
    /** The participant's own link token — how a row offers to show back what it holds. */
    token?: string;
    /** What is already on file, by field id — the payload's own `file_ref` values. */
    attached: Readonly<Record<string, Attached | undefined>>;
    onAttached: (fieldId: string, doc: Attached) => void;
    onUpload: (fieldId: string, file: File) => Promise<Attached | { error: string }>;
}) {
    if (requests.length === 0) return null;
    return (
        <div className="border-t border-alloy-midnight/[0.08] pt-6" data-participant-uploads="true">
            <p className="pb-1 text-[15px] font-medium text-alloy-midnight">A couple of things to bring</p>
            <p className="pb-4 text-[14px] text-alloy-midnight/60">
                Take a photo or attach a file — whatever you already have is fine.
            </p>
            <div className="flex flex-col gap-3">
                {requests.map((request) => (
                    <UploadRow
                        key={request.field_id}
                        request={request}
                        attached={attached[request.field_id]}
                        token={token}
                        onAttached={onAttached}
                        onUpload={onUpload}
                    />
                ))}
            </div>
        </div>
    );
}

function UploadRow({
    request,
    token,
    attached,
    onAttached,
    onUpload,
}: {
    request: ParticipantUploadRequest;
    token?: string;
    attached: Attached | undefined;
    onAttached: (fieldId: string, doc: Attached) => void;
    onUpload: (fieldId: string, file: File) => Promise<Attached | { error: string }>;
}) {
    const input = useRef<HTMLInputElement | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pick = async (file: File | undefined) => {
        if (!file) return;
        setBusy(true);
        setError(null);
        const result = await onUpload(request.field_id, file);
        setBusy(false);
        if ("error" in result) {
            setError(result.error);
            return;
        }
        onAttached(request.field_id, result);
    };

    return (
        <div
            className="flex flex-wrap items-center gap-3 rounded-xl border border-alloy-midnight/[0.10] px-4 py-3"
            data-upload-request={request.field_id}
        >
            <div className="min-w-0 flex-1">
                <div className="text-[15px] text-alloy-midnight">{request.title}</div>
                {request.description ? (
                    <div className="pt-0.5 text-[13px] leading-relaxed text-alloy-midnight/55">{request.description}</div>
                ) : null}
                {attached ? (
                    <div className="pt-1 text-[13px] text-alloy-bend-pine" data-upload-attached={request.field_id}>
                        Attached — {attached.filename}
                        {token ? (
                            <>
                                {" · "}
                                {/*
                                 * "Replace" without "look" asks a parent to correct a mistake they
                                 * cannot see. Opens the file they attached, from the session-scoped
                                 * route, so they can check it is the right photo before committing.
                                 */}
                                <a
                                    href={`/api/public/forms/${encodeURIComponent(token)}/enrollment-upload?document_id=${encodeURIComponent(attached.document_id)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex min-h-[44px] items-center underline underline-offset-2"
                                    data-upload-view={request.field_id}
                                >
                                    View
                                </a>
                            </>
                        ) : null}
                    </div>
                ) : null}
                {error ? <div className="pt-1 text-[13px] text-red-700">{error}</div> : null}
            </div>
            <input
                ref={input}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="sr-only"
                data-upload-input={request.field_id}
                onChange={(e) => void pick(e.target.files?.[0])}
            />
            <button
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
                className={clsx(
                    // 44px: the platform's touch minimum, which this control missed at 41px. The
                    // measurement is from the real participant surface at 390px.
                    "min-h-[44px] rounded-xl px-4 py-2.5 text-[14px] font-medium",
                    attached
                        ? "border border-alloy-midnight/15 text-alloy-midnight"
                        : "bg-alloy-bend-pine text-white",
                    busy && "opacity-60",
                )}
            >
                {busy ? "Attaching…" : attached ? "Replace" : "Attach"}
            </button>
        </div>
    );
}

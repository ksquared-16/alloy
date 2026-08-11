"use client";

/**
 * Shared identity avatar with optional upload/replace for live Work Unit cards.
 * Honors Surfaces avatar visibility; persists through canonical person profile-photo API.
 *
 * Upload is one-shot: pick file → local preview → auto upload+bind → keep durable URL.
 * On failure, Retry save / Cancel remain. Blob previews are never written to session storage
 * (revoked on remount).
 */

import { useEffect, useRef, useState } from "react";
import IdentityAvatar from "@/components/admin/focusPanel/identity/IdentityAvatar";
import type { IdentityAvatarSemanticRole } from "@/lib/adminV2/runtime/focusPanel/focusPanelIdentityAvatar";
import type { FocusPanelPhotoSaveResult } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import {
    clearPersonProfilePhoto,
    resolvePersonIdForProfilePhoto,
    uploadPersonProfilePhotoDocument,
} from "@/lib/adminV2/runtime/focusPanel/persistPersonProfilePhoto";
import {
    clearChildAvatarSessionPreviewMatchingUrl,
    getChildAvatarSessionPreview,
    setChildAvatarSessionPreview,
} from "@/lib/adminV2/runtime/focusPanel/children/childAvatarSessionPreview";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";

export type IdentityAvatarPhotoSave = (args: {
    childId: string;
    personId: string;
    documentId: string;
}) => Promise<FocusPanelPhotoSaveResult>;

export type IdentityAvatarPhotoClear = (args: {
    childId: string;
    personId: string;
}) => Promise<FocusPanelPhotoSaveResult>;

type Props = {
    name: string;
    imageUrl?: string | null;
    size?: number;
    visible?: boolean;
    role?: IdentityAvatarSemanticRole;
    recordId?: string;
    /** Person id for documents upload entity binding. */
    personId?: string | null;
    /** Fallback when inquiry evidence omitted person_id — resolve/ensure via member. */
    customerMemberId?: string | null;
    /** When set with allowUpload, operators can stage/upload from the live card. */
    onSavePhoto?: IdentityAvatarPhotoSave;
    onClearPhoto?: IdentityAvatarPhotoClear;
    disabled?: boolean;
    /**
     * When false, show the photo (evidence/session) but hide Add/Change/Save/Remove.
     * Children Summary uses false; Context Facts uses true.
     */
    allowUpload?: boolean;
};

function trimUrl(value: string | null | undefined): string | null {
    const text = (value ?? "").trim();
    return text.length > 0 ? text : null;
}

function sessionPreviewForIds(ids: Array<string | null | undefined>): string | null {
    for (const id of ids) {
        const hit = getChildAvatarSessionPreview(id);
        if (hit) return hit;
    }
    return null;
}

function rememberSessionPreview(
    ids: Array<string | null | undefined>,
    url: string | null,
): void {
    for (const id of ids) {
        if (!id?.trim()) continue;
        setChildAvatarSessionPreview(id, url);
    }
}

export default function IdentityAvatarEditable({
    name,
    imageUrl,
    size = 30,
    visible = true,
    role,
    recordId,
    personId,
    customerMemberId,
    onSavePhoto,
    onClearPhoto,
    disabled = false,
    allowUpload = true,
}: Props) {
    const composer = useFocusPanelComposer();
    const inputRef = useRef<HTMLInputElement>(null);
    const blobUrlRef = useRef<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
    const [committedUrl, setCommittedUrl] = useState<string | null>(null);
    const [resolvedPersonId, setResolvedPersonId] = useState<string | null>(personId ?? null);

    const revokeBlob = () => {
        if (blobUrlRef.current) {
            const revoked = blobUrlRef.current;
            URL.revokeObjectURL(revoked);
            blobUrlRef.current = null;
            clearChildAvatarSessionPreviewMatchingUrl(revoked);
        }
        setLocalBlobUrl(null);
    };

    const previewIds = [recordId, personId, customerMemberId, resolvedPersonId];

    const resolveDisplayUrl = (): string | null => {
        // Staged draft always wins until Save/Cancel.
        const draft = trimUrl(localBlobUrl);
        if (draft) return draft;
        // Prefer the URL we just committed this session — evidence can lag or briefly omit photo_url.
        const committed = trimUrl(committedUrl);
        if (committed) return committed;
        const evidence = trimUrl(imageUrl);
        if (evidence) return evidence;
        const composerPreview = recordId && composer ? composer.childAvatarPreviewUrl(recordId) : null;
        return trimUrl(composerPreview) ?? sessionPreviewForIds(previewIds);
    };

    const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => resolveDisplayUrl());

    const applyCommittedPreview = (url: string | null) => {
        const next = trimUrl(url);
        setCommittedUrl(next);
        setResolvedUrl(next ?? resolveDisplayUrl());
        if (next === null || !next.startsWith("blob:")) {
            rememberSessionPreview(previewIds, next);
            if (recordId) composer?.setChildAvatarPreviewUrl(recordId, next);
        }
    };

    useEffect(() => {
        setResolvedUrl(resolveDisplayUrl());
        setResolvedPersonId(personId ?? null);
        // When durable evidence arrives, clear the local "committed" mirror so evidence stays source of truth.
        const evidence = trimUrl(imageUrl);
        if (evidence && committedUrl && evidence === committedUrl) {
            setCommittedUrl(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveDisplayUrl closes over latest props/state
    }, [recordId, imageUrl, personId, customerMemberId, composer, localBlobUrl, committedUrl]);

    useEffect(() => () => revokeBlob(), []);

    if (!visible) return null;

    const showUploadControls = Boolean(allowUpload && onSavePhoto && recordId && !disabled);
    const canAttemptUpload = Boolean(showUploadControls && (resolvedPersonId || customerMemberId));
    const hasPendingDraft = Boolean(pendingFile && localBlobUrl);

    const onFilePicked = (file: File | undefined) => {
        if (!file || !showUploadControls) return;
        setError(null);
        revokeBlob();
        const blobUrl = URL.createObjectURL(file);
        blobUrlRef.current = blobUrl;
        setLocalBlobUrl(blobUrl);
        setPendingFile(file);
        setResolvedUrl(blobUrl);
        // One-shot persist: preview instantly, then upload+bind without a second Save click.
        void persistPhotoFile(file);
    };

    const onCancelDraft = () => {
        if (uploading) return;
        setError(null);
        setPendingFile(null);
        revokeBlob();
        // Do not call resolveDisplayUrl() here — localBlobUrl state may still be set
        // until the next render after revokeBlob().
        setResolvedUrl(
            trimUrl(committedUrl)
                ?? trimUrl(imageUrl)
                ?? (recordId && composer ? trimUrl(composer.childAvatarPreviewUrl(recordId)) : null)
                ?? sessionPreviewForIds(previewIds),
        );
    };

    const persistPhotoFile = async (file: File) => {
        if (!onSavePhoto || !recordId) return;
        setUploading(true);
        setError(null);
        try {
            const resolved = await resolvePersonIdForProfilePhoto({
                personId: resolvedPersonId,
                customerMemberId,
            });
            if (!resolved.ok) throw new Error(resolved.error);
            setResolvedPersonId(resolved.personId);

            const uploaded = await uploadPersonProfilePhotoDocument({
                personId: resolved.personId,
                file,
                title: `${name} profile photo`,
            });
            if (!uploaded.ok) throw new Error(uploaded.error);

            const result = await onSavePhoto({
                childId: recordId,
                personId: resolved.personId,
                documentId: uploaded.documentId,
            });
            if (!result.ok) throw new Error(result.error || "Could not save profile photo");

            const remoteUrl = trimUrl(result.photoUrl);
            setPendingFile(null);
            if (remoteUrl) {
                applyCommittedPreview(remoteUrl);
                rememberSessionPreview(
                    [resolved.personId, customerMemberId, recordId],
                    remoteUrl,
                );
                revokeBlob();
            } else {
                // Bind ok without URL — keep blob until evidence catches up, but clear pending.
                setCommittedUrl(trimUrl(localBlobUrl));
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const onSaveDraft = async () => {
        if (!pendingFile) return;
        await persistPhotoFile(pendingFile);
    };

    const onRemove = async () => {
        if (!recordId || hasPendingDraft) return;
        setUploading(true);
        setError(null);
        try {
            const resolved = await resolvePersonIdForProfilePhoto({
                personId: resolvedPersonId,
                customerMemberId,
            });
            if (!resolved.ok) throw new Error(resolved.error);
            setResolvedPersonId(resolved.personId);

            if (onClearPhoto) {
                const result = await onClearPhoto({ childId: recordId, personId: resolved.personId });
                if (!result.ok) throw new Error(result.error || "Could not remove photo");
            } else {
                const result = await clearPersonProfilePhoto({ personId: resolved.personId });
                if (!result.ok) throw new Error(result.error);
            }
            revokeBlob();
            setPendingFile(null);
            applyCommittedPreview(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Remove failed");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div
            className="identity-avatar-editable"
            data-children-avatar="true"
            data-identity-avatar-editable={showUploadControls ? "true" : "false"}
            data-identity-avatar-can-persist={canAttemptUpload ? "true" : "false"}
            data-identity-avatar-has-photo={resolvedUrl ? "true" : "false"}
            data-identity-avatar-pending={hasPendingDraft ? "true" : "false"}
        >
            <IdentityAvatar
                name={name}
                imageUrl={resolvedUrl}
                size={size}
                visible={visible}
                role={role}
                recordId={recordId}
                allowZoom={!showUploadControls}
            />
            {showUploadControls ? (
                <div className="identity-avatar-editable__actions">
                    {hasPendingDraft ? (
                        <>
                            <button
                                type="button"
                                className="identity-avatar-editable__btn"
                                data-child-avatar-save="true"
                                disabled={uploading || !canAttemptUpload}
                                onClick={() => void onSaveDraft()}
                            >
                                {uploading ? "Saving…" : "Retry save"}
                            </button>
                            <button
                                type="button"
                                className="identity-avatar-editable__btn identity-avatar-editable__btn--muted"
                                data-child-avatar-cancel="true"
                                disabled={uploading}
                                onClick={onCancelDraft}
                                title={uploading ? "Wait for save to finish or fail" : "Discard photo"}
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="identity-avatar-editable__btn"
                                data-child-avatar-upload="true"
                                disabled={uploading}
                                onClick={() => {
                                    if (!resolvedPersonId && !customerMemberId) {
                                        setError("Link a person record before uploading a profile photo.");
                                        return;
                                    }
                                    inputRef.current?.click();
                                }}
                            >
                                {uploading ? "Saving…" : resolvedUrl ? "Change" : "Add photo"}
                            </button>
                            {resolvedUrl && (onClearPhoto || resolvedPersonId || customerMemberId) ? (
                                <button
                                    type="button"
                                    className="identity-avatar-editable__btn identity-avatar-editable__btn--muted"
                                    data-child-avatar-remove="true"
                                    disabled={uploading}
                                    onClick={() => void onRemove()}
                                >
                                    Remove
                                </button>
                            ) : null}
                        </>
                    )}
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        data-child-avatar-file-input="true"
                        onChange={(e) => {
                            onFilePicked(e.target.files?.[0]);
                            e.target.value = "";
                        }}
                    />
                </div>
            ) : null}
            {error ? (
                <p className="identity-avatar-editable__error" data-child-avatar-error="true">
                    {error}
                </p>
            ) : null}
        </div>
    );
}

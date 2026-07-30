"use client";

/**
 * Shared identity avatar with optional upload/replace for live Work Unit cards.
 * Honors Surfaces avatar visibility; persists through canonical person profile-photo API.
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
    /** When set, operators can upload/replace from the live card (Surfaces Avatar on). */
    onSavePhoto?: IdentityAvatarPhotoSave;
    onClearPhoto?: IdentityAvatarPhotoClear;
    disabled?: boolean;
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
}: Props) {
    const composer = useFocusPanelComposer();
    const inputRef = useRef<HTMLInputElement>(null);
    const blobUrlRef = useRef<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
    const [resolvedPersonId, setResolvedPersonId] = useState<string | null>(personId ?? null);

    const revokeBlob = () => {
        if (blobUrlRef.current) {
            const revoked = blobUrlRef.current;
            URL.revokeObjectURL(revoked);
            blobUrlRef.current = null;
            // Older builds wrote blob: URLs into session; scrub so remounts don't
            // show Change/Remove over a dead object URL (initials).
            clearChildAvatarSessionPreviewMatchingUrl(revoked);
        }
        setLocalBlobUrl(null);
    };

    const previewIds = [recordId, personId, customerMemberId, resolvedPersonId];

    const resolveDisplayUrl = (): string | null => {
        const evidence = trimUrl(imageUrl);
        if (evidence) return evidence;
        const composerPreview = recordId && composer ? composer.childAvatarPreviewUrl(recordId) : null;
        return (
            trimUrl(localBlobUrl)
            ?? trimUrl(composerPreview)
            ?? sessionPreviewForIds(previewIds)
        );
    };

    const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => resolveDisplayUrl());

    const applyPreview = (url: string | null) => {
        const next = trimUrl(url);
        setResolvedUrl(next);
        // Session (and composer bridge) only keep durable URLs — blob previews are
        // local-only so summary↔context remounts don't inherit revoked object URLs.
        if (next === null || !next.startsWith("blob:")) {
            rememberSessionPreview(previewIds, next);
            if (recordId) composer?.setChildAvatarPreviewUrl(recordId, next);
        }
    };

    // Evidence wins when present. Otherwise keep blob/session preview — never wipe a
    // just-uploaded photo when `_inquiry_children` briefly returns without photo_url.
    useEffect(() => {
        setResolvedUrl(resolveDisplayUrl());
        setResolvedPersonId(personId ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveDisplayUrl closes over latest props/state
    }, [recordId, imageUrl, personId, customerMemberId, composer, localBlobUrl]);

    useEffect(() => () => revokeBlob(), []);

    if (!visible) return null;

    const showUploadControls = Boolean(onSavePhoto && recordId && !disabled);
    const canAttemptUpload = Boolean(showUploadControls && (resolvedPersonId || customerMemberId));

    const onFileChange = async (file: File | undefined) => {
        if (!file || !onSavePhoto || !recordId) return;
        setUploading(true);
        setError(null);
        revokeBlob();
        const blobUrl = URL.createObjectURL(file);
        blobUrlRef.current = blobUrl;
        setLocalBlobUrl(blobUrl);
        // Instant feedback — do not wait for storage/bind before showing the photo.
        applyPreview(blobUrl);
        try {
            const resolved = await resolvePersonIdForProfilePhoto({
                personId: resolvedPersonId,
                customerMemberId,
            });
            if (!resolved.ok) throw new Error(resolved.error);
            setResolvedPersonId(resolved.personId);
            // Keep blob local-only until the remote URL lands — do not session-store blob:.

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
            if (remoteUrl) {
                applyPreview(remoteUrl);
                rememberSessionPreview([resolved.personId, customerMemberId, recordId], remoteUrl);
                revokeBlob();
            }
            // If bind returned ok without a URL (should not), keep the blob preview.
        } catch (e) {
            revokeBlob();
            applyPreview(trimUrl(imageUrl));
            setError(e instanceof Error ? e.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const onRemove = async () => {
        if (!recordId) return;
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
                revokeBlob();
                applyPreview(null);
            } else {
                const result = await clearPersonProfilePhoto({ personId: resolved.personId });
                if (!result.ok) throw new Error(result.error);
                revokeBlob();
                applyPreview(null);
            }
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
                        {uploading ? "…" : resolvedUrl ? "Change" : "Add photo"}
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
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        data-child-avatar-file-input="true"
                        onChange={(e) => {
                            void onFileChange(e.target.files?.[0]);
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

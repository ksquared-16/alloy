"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { ImagePlus, ImageOff, Trash2 } from "lucide-react";

import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import type {
    IdentityAvatarPhotoClear,
    IdentityAvatarPhotoSave,
} from "@/components/admin/focusPanel/identity/IdentityAvatarEditable";
import {
    groupShowAvatarForNestedGroup,
    groupUseProfilePhotosForNestedGroup,
    setGroupShowAvatarInNestedGroup,
    setGroupUseProfilePhotosInNestedGroup,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import {
    clearPersonProfilePhoto,
    resolveSurfaceAvatarRuntime,
    uploadAndBindPersonProfilePhoto,
    uploadPersonProfilePhotoDocument,
} from "@/lib/adminV2/runtime/focusPanel/persistPersonProfilePhoto";

type BuilderBinding = {
    config: NestedSurfaceConfig;
    onConfigChange: (next: NestedSurfaceConfig) => void;
};

type Props = {
    surfaceId: string;
    groupKey: string;
    childId: string;
    childName: string;
    imageUrl: string | null;
    personId: string | null;
    size?: number;
    /**
     * Surface Builder (/surfaces) drill-in — always show Show/Hide + Upload.
     * Used when FocusPanelComposerProvider is not wrapping this tree.
     */
    builder?: BuilderBinding;
    /** Live Work Unit — bind + refresh projection through Focus Panel mutation. */
    onSavePhoto?: IdentityAvatarPhotoSave;
    onClearPhoto?: IdentityAvatarPhotoClear;
};

/**
 * Child identity avatar — Surfaces composer controls + shared runtime persistence.
 *
 * Upload uses documents API (`entity_type=person`), then binds
 * `persons.metadata.profile_photo_document_id` so every shared Avatar consumer
 * resolves the same image after refresh.
 */
export default function ChildProfileAvatarComposer({
    surfaceId,
    groupKey,
    childId,
    childName,
    imageUrl,
    personId,
    size = 40,
    builder,
    onSavePhoto,
    onClearPhoto,
}: Props) {
    const composer = useFocusPanelComposer();
    const composingFromContext = composer?.isComposingSurface(surfaceId) ?? false;
    const composing = Boolean(builder) || composingFromContext;
    const config = builder?.config ?? composer?.configFor(surfaceId);
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

    const previewUrl =
        localPreviewUrl
        ?? composer?.childAvatarPreviewUrl(childId)
        ?? imageUrl;
    const showAvatar = config ? groupShowAvatarForNestedGroup(config, groupKey) : true;
    const useProfilePhotos = config ? groupUseProfilePhotosForNestedGroup(config, groupKey) : true;
    const { imageUrl: displayUrl } = resolveSurfaceAvatarRuntime({
        showAvatar,
        useProfilePhotos,
        imageUrl: previewUrl,
    });

    const mutate = (next: NestedSurfaceConfig) => {
        if (builder) {
            builder.onConfigChange(next);
            return;
        }
        composer?.updateConfig(surfaceId, next);
    };

    const setPreview = (url: string | null) => {
        setLocalPreviewUrl(url);
        composer?.setChildAvatarPreviewUrl(childId, url);
    };

    const onFileChange = async (file: File | undefined) => {
        if (!file) return;
        if (!personId) {
            setUploadError("Link a person record before uploading a profile photo.");
            return;
        }
        setUploading(true);
        setUploadError(null);
        try {
            let photoUrl: string | null = null;
            if (onSavePhoto) {
                const uploaded = await uploadPersonProfilePhotoDocument({
                    personId,
                    file,
                    title: `${childName} profile photo`,
                });
                if (!uploaded.ok) throw new Error(uploaded.error);
                const result = await onSavePhoto({
                    childId,
                    personId,
                    documentId: uploaded.documentId,
                });
                if (!result.ok) throw new Error(result.error || "Could not save profile photo");
                photoUrl = result.photoUrl ?? null;
            } else {
                const bound = await uploadAndBindPersonProfilePhoto({
                    personId,
                    file,
                    title: `${childName} profile photo`,
                });
                if (!bound.ok) throw new Error(bound.error);
                photoUrl = bound.photoUrl;
            }
            setPreview(photoUrl);
            if (config && !useProfilePhotos) {
                mutate(setGroupUseProfilePhotosInNestedGroup(config, groupKey, true));
            }
            if (config && !showAvatar) {
                mutate(setGroupShowAvatarInNestedGroup(config, groupKey, true));
            }
        } catch (e) {
            setUploadError(e instanceof Error ? e.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const removeImage = async () => {
        setUploadError(null);
        if (!personId) {
            setPreview(null);
            return;
        }
        setUploading(true);
        try {
            if (onClearPhoto) {
                const result = await onClearPhoto({ childId, personId });
                if (!result.ok) throw new Error(result.error || "Could not remove photo");
            } else {
                const result = await clearPersonProfilePhoto({ personId });
                if (!result.ok) throw new Error(result.error);
            }
            setPreview(null);
        } catch (e) {
            setUploadError(e instanceof Error ? e.message : "Remove failed");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div
            className={clsx("fp-child-avatar", composing && "fp-child-avatar--composing")}
            data-child-avatar-composer={childId}
            onClick={(e) => {
                if (!composing) return;
                e.stopPropagation();
                composer?.select({ kind: "region", surfaceId, groupKey });
            }}
        >
            {showAvatar ? (
                <CardAvatar name={childName} imageUrl={displayUrl} size={size} />
            ) : (
                <span className="fp-child-avatar__hidden" aria-hidden>
                    <ImageOff className="h-4 w-4" />
                </span>
            )}
            {composing && config ? (
                <div className="fp-child-avatar__controls">
                    <button
                        type="button"
                        className={clsx("fp-layout-field__toggle", showAvatar && "is-on")}
                        aria-pressed={showAvatar}
                        onClick={(e) => {
                            e.stopPropagation();
                            mutate(setGroupShowAvatarInNestedGroup(config, groupKey, !showAvatar));
                        }}
                    >
                        {showAvatar ? "Hide" : "Show"}
                    </button>
                    {showAvatar ? (
                        <>
                            <button
                                type="button"
                                className={clsx("fp-layout-field__toggle", useProfilePhotos && "is-on")}
                                aria-pressed={useProfilePhotos}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    mutate(
                                        setGroupUseProfilePhotosInNestedGroup(
                                            config,
                                            groupKey,
                                            !useProfilePhotos,
                                        ),
                                    );
                                }}
                            >
                                {useProfilePhotos ? "Photos on" : "Photos off"}
                            </button>
                            <button
                                type="button"
                                className="fp-child-avatar__upload"
                                disabled={uploading}
                                data-child-avatar-upload
                                onClick={(e) => {
                                    e.stopPropagation();
                                    inputRef.current?.click();
                                }}
                            >
                                <ImagePlus className="h-3 w-3" aria-hidden />
                                {uploading ? "Uploading…" : previewUrl ? "Change" : "Upload"}
                            </button>
                            {previewUrl ? (
                                <button
                                    type="button"
                                    className="fp-child-avatar__upload"
                                    aria-label="Remove profile image"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        void removeImage();
                                    }}
                                >
                                    <Trash2 className="h-3 w-3" aria-hidden />
                                    Remove
                                </button>
                            ) : null}
                        </>
                    ) : (
                        <button
                            type="button"
                            className="fp-child-avatar__upload"
                            onClick={(e) => {
                                e.stopPropagation();
                                mutate(setGroupShowAvatarInNestedGroup(config, groupKey, true));
                            }}
                        >
                            <ImageOff className="h-3 w-3" aria-hidden />
                            Show avatar
                        </button>
                    )}
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        data-child-avatar-file-input
                        onChange={(e) => {
                            void onFileChange(e.target.files?.[0]);
                            e.target.value = "";
                        }}
                    />
                    {uploadError ? <p className="fp-child-avatar__hint">{uploadError}</p> : null}
                </div>
            ) : null}
        </div>
    );
}

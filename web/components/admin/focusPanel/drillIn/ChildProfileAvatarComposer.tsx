"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { ImagePlus, ImageOff, Trash2 } from "lucide-react";

import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import {
    groupShowAvatarForNestedGroup,
    groupUseProfilePhotosForNestedGroup,
    setGroupShowAvatarInNestedGroup,
    setGroupUseProfilePhotosInNestedGroup,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";

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
};

/**
 * Child identity avatar — runtime display + in-place composer controls.
 *
 * Upload uses documents API (`entity_type=person`). Canonical photo persistence on
 * `persons` is not wired yet — composer preview URLs are session-only until that lands.
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
    const displayUrl = showAvatar && useProfilePhotos ? previewUrl : null;

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
            const body = new FormData();
            body.append("file", file);
            body.append("entity_type", "person");
            body.append("entity_id", personId);
            body.append("doc_type", "profile_photo");
            body.append("title", `${childName} profile photo`);

            const uploadRes = await fetch("/api/admin/documents/upload", { method: "POST", body });
            if (!uploadRes.ok) throw new Error("Upload failed");
            const payload = (await uploadRes.json()) as { document?: { id?: string } };
            const docId = payload.document?.id;
            if (!docId) throw new Error("Upload response missing document id");
            const signedRes = await fetch(`/api/admin/documents/${docId}/signed-url`);
            if (!signedRes.ok) throw new Error("Could not resolve uploaded image URL");
            const signed = (await signedRes.json()) as { url?: string };
            if (!signed.url) throw new Error("Signed URL missing");
            setPreview(signed.url);
            if (config && !useProfilePhotos) {
                mutate(setGroupUseProfilePhotosInNestedGroup(config, groupKey, true));
            }
            if (config && !showAvatar) {
                mutate(setGroupShowAvatarInNestedGroup(config, groupKey, true));
            }
        } catch {
            setUploadError("Upload stored in documents; preview-only until person photo field persists.");
        } finally {
            setUploading(false);
        }
    };

    const removeImage = () => {
        setPreview(null);
        setUploadError(null);
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
                                        removeImage();
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

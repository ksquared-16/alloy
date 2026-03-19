/**
 * Maps Supabase Storage API errors to stable codes and HTTP statuses for admin document flows.
 * Supabase often returns { message, statusCode } (see @supabase/storage-js StorageError).
 */
export type DocumentStorageErrorCode =
    | "STORAGE_BUCKET_NOT_FOUND"
    | "STORAGE_OBJECT_NOT_FOUND"
    | "STORAGE_FORBIDDEN"
    | "STORAGE_PAYLOAD_TOO_LARGE"
    | "STORAGE_UNKNOWN";

export type ClassifiedStorageError = {
    code: DocumentStorageErrorCode;
    httpStatus: number;
    /** Safe for JSON responses and UI (no stack traces). */
    message: string;
};

function lowerMessage(err: { message?: string } | null | undefined): string {
    return (err?.message ?? "").toLowerCase();
}

/**
 * Classify upload / signed-URL failures from `supabase.storage.from(...).upload` or `createSignedUrl`.
 */
export function classifySupabaseStorageError(err: { message?: string; statusCode?: string; status?: string } | null | undefined): ClassifiedStorageError {
    const msg = lowerMessage(err);
    const status = err?.statusCode ?? err?.status ?? "";

    if (msg.includes("bucket not found") || (msg.includes("bucket") && msg.includes("not found"))) {
        return {
            code: "STORAGE_BUCKET_NOT_FOUND",
            httpStatus: 503,
            message:
                "Storage bucket is missing or misconfigured. Create a public/private bucket (default name: org_documents) and grant the service role upload/read, or set ADMIN_DOCUMENTS_BUCKET to match your bucket name.",
        };
    }

    if (
        msg.includes("the resource was not found") ||
        msg.includes("object not found") ||
        (msg.includes("not found") && (msg.includes("path") || msg.includes("object"))) ||
        status === "404"
    ) {
        return {
            code: "STORAGE_OBJECT_NOT_FOUND",
            httpStatus: 404,
            message: "File not found in storage. The object may have been deleted or the path is invalid.",
        };
    }

    if (
        msg.includes("payload too large") ||
        msg.includes("entity too large") ||
        msg.includes("file too large") ||
        status === "413"
    ) {
        return {
            code: "STORAGE_PAYLOAD_TOO_LARGE",
            httpStatus: 413,
            message: "File is too large for storage. Reduce file size or raise bucket/object limits in Supabase.",
        };
    }

    if (
        msg.includes("jwt") ||
        msg.includes("forbidden") ||
        msg.includes("denied") ||
        msg.includes("not authorized") ||
        msg.includes("policy") ||
        status === "403"
    ) {
        return {
            code: "STORAGE_FORBIDDEN",
            httpStatus: 503,
            message:
                "Storage access was denied. Ensure bucket policies allow the service role to insert and read objects for admin uploads and signed URLs.",
        };
    }

    return {
        code: "STORAGE_UNKNOWN",
        httpStatus: 500,
        message: err?.message?.trim() ? err.message.trim() : "Storage operation failed.",
    };
}

/**
 * The largest file the administrative upload route stores.
 *
 * Before D1a it had no limit at all: the route buffered whatever arrived and wrote it to
 * `org_documents`, and the bucket carries no `file_size_limit` either (deployed census 2026-10-20).
 * 10 MB matches the participant enrollment upload, so an operator and a family face the same ceiling
 * for the same kind of file; the largest object stored on the deployed tenant is 4.4 MB.
 *
 * Enforced from the declared multipart size BEFORE the body is buffered, and again on the bytes.
 */
export const ADMIN_DOCUMENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

import type { SupabaseClient } from "@supabase/supabase-js";

export type BookV2CleaningJobDetailsInput = {
    home_type_key?: string | null;
    access_method_key?: string | null;
    square_footage_tier_key?: string | null;
    beds?: number | null;
    baths?: number | null;
    /** Stored on row metadata for display when UI used token keys like 2_5 */
    bathrooms_booking_key?: string | null;
};

/**
 * Persists cleaning-specific job attributes on cleaning_job_details (not on locations).
 */
export async function upsertCleaningJobDetailsFromBookV2(
    supabase: SupabaseClient,
    jobId: string,
    input: BookV2CleaningJobDetailsInput
): Promise<void> {
    const { data: existing } = await supabase.from("cleaning_job_details").select("metadata").eq("job_id", jobId).maybeSingle();
    const prevMeta = ((existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
    const metaNext: Record<string, unknown> = { ...prevMeta, source: "book-v2", book_v2_synced_at: new Date().toISOString() };
    if (input.bathrooms_booking_key != null && String(input.bathrooms_booking_key).trim() !== "") {
        metaNext.book_v2_bathrooms_key = String(input.bathrooms_booking_key).trim();
    }
    const row: Record<string, unknown> = {
        job_id: jobId,
        metadata: metaNext,
    };
    if (input.home_type_key != null) row.home_type_key = input.home_type_key;
    if (input.access_method_key != null) row.access_method_key = input.access_method_key;
    if (input.square_footage_tier_key != null) row.square_footage_tier_key = input.square_footage_tier_key;
    if (input.beds != null && Number.isFinite(input.beds)) row.beds = input.beds;
    if (input.baths != null && Number.isFinite(input.baths)) row.baths = input.baths;

    const { error } = await supabase.from("cleaning_job_details").upsert(row, { onConflict: "job_id" });
    if (error) {
        console.warn("[BOOK_V2] cleaning_job_details upsert failed", error.message);
    }
}

import type { SupabaseClient } from "@supabase/supabase-js";

export type BookV2CleaningJobDetailsInput = {
    home_type_id?: string | null;
    sqft_band_id?: string | null;
    square_footage?: number | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    /** When set, stored on row metadata as `book_v2_bathrooms_key` (half-baths / plus tiers). */
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
    if (input.home_type_id != null) row.home_type_id = input.home_type_id;
    if (input.sqft_band_id != null) row.sqft_band_id = input.sqft_band_id;
    if (input.square_footage != null && Number.isFinite(input.square_footage)) {
        row.square_footage = Math.round(Number(input.square_footage));
    }
    if (input.bedrooms != null && Number.isFinite(input.bedrooms)) row.bedrooms = Math.round(Number(input.bedrooms));
    if (input.bathrooms != null && Number.isFinite(input.bathrooms)) row.bathrooms = Math.round(Number(input.bathrooms));

    const { error } = await supabase.from("cleaning_job_details").upsert(row, { onConflict: "job_id" });
    if (error) {
        console.warn("[BOOK_V2] cleaning_job_details upsert failed", error.message);
    }
}

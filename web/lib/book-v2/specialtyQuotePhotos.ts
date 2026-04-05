/** Form field names + API multipart keys for specialty quote photo slots (AI / ops review). */
export const SPECIALTY_QUOTE_PHOTO_FORM_KEYS = [
    "photo_living_room",
    "photo_kitchen",
    "photo_master_bedroom",
    "photo_master_bathroom",
] as const;

export type SpecialtyQuotePhotoFormKey = (typeof SPECIALTY_QUOTE_PHOTO_FORM_KEYS)[number];

/** Persisted on `documents.doc_type` for specialty intake photos. */
export const SPECIALTY_QUOTE_PHOTO_DOC_TYPE = "specialty_quote_photo";

/** JSON key on `documents.metadata` (and quote cross-references). */
export const SPECIALTY_QUOTE_PHOTO_SLOT_METADATA_KEY = "specialty_quote_photo_slot";

export type SpecialtyQuotePhotoSemanticSlot =
    | "living_room"
    | "kitchen"
    | "master_bedroom"
    | "master_bathroom";

export const SPECIALTY_QUOTE_PHOTO_SEMANTIC_SLOT_BY_FORM_KEY: Record<
    SpecialtyQuotePhotoFormKey,
    SpecialtyQuotePhotoSemanticSlot
> = {
    photo_living_room: "living_room",
    photo_kitchen: "kitchen",
    photo_master_bedroom: "master_bedroom",
    photo_master_bathroom: "master_bathroom",
};

export const SPECIALTY_QUOTE_PHOTO_LABELS: Record<SpecialtyQuotePhotoFormKey, string> = {
    photo_living_room: "Living room",
    photo_kitchen: "Kitchen",
    photo_master_bedroom: "Master bedroom",
    photo_master_bathroom: "Master bathroom",
};

export const MAX_SPECIALTY_QUOTE_PHOTO_BYTES = 10 * 1024 * 1024;

export const SPECIALTY_QUOTE_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

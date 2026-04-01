/**
 * QA / preview-only escape hatch for the FIRSTFREE4×120 flow.
 *
 * Enable by setting at build/runtime:
 *   NEXT_PUBLIC_ALLOY_FIRSTFREE_QA_SHIM=true
 *
 * Never set this in production Vercel env. It is inert when unset/false.
 *
 * Usage (homepage only — `FirstFreeCampaignHomeFlow` is mounted on `/`):
 *   /?campaign=firstfree4x120&qa_firstfree_terms=1
 * Optional: &qa_email=…&qa_phone=…&qa_subtotal=265
 */

export function isFirstFreeQaShimEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ALLOY_FIRSTFREE_QA_SHIM === "true";
}

/** Placeholder UUID — booking APIs may reject; enough to load book-v2 UI for layout QA */
export const FIRSTFREE_QA_SHIM_DISCOUNT_PROGRAM_ID = "00000000-0000-4000-8000-0000000000a1";

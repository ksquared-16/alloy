"use client";

import { useSearchParams } from "next/navigation";
import SpecialtyCleaningQuoteForm, { type SpecialtyCleaningType } from "@/components/cleaning/SpecialtyCleaningQuoteForm";

function normalizeType(raw: string | null): SpecialtyCleaningType {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "heavy_clean" || t === "heavyclean" || t === "deep") return "heavy_clean";
  return "move_out";
}

export default function SpecialtyQuoteTypeClient() {
  const searchParams = useSearchParams();
  const cleaningType = normalizeType(searchParams.get("cleaning_type"));

  return (
    <div className="bg-white rounded-xl p-4 md:p-8 border border-alloy-stone/50 shadow-sm">
      <SpecialtyCleaningQuoteForm cleaningType={cleaningType} />
    </div>
  );
}

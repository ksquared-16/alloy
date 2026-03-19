import { Suspense } from "react";
import FirstFree4x60Client from "./FirstFree4x60Client";

export const metadata = {
  title: "First cleaning offer | Alloy",
  description: "Recurring standard cleaning — complete 4 visits in 60 days. Get a quote and book.",
};

export default function FirstFree4x60Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen home-page flex items-center justify-center">
          <p className="text-alloy-midnight/70 text-sm">Loading…</p>
        </div>
      }
    >
      <FirstFree4x60Client />
    </Suspense>
  );
}

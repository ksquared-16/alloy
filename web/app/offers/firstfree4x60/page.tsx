import { redirect } from "next/navigation";

export const metadata = {
  title: "First cleaning offer | Alloy",
  description:
    "Legacy URL — redirects to the current first-free offer (4 visits in 120 days).",
};

/** Legacy QR / short link: forwards to canonical campaign slug. */
export default function FirstFree4x60Page() {
  redirect("/?campaign=firstfree4x120");
}

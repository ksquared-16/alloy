import { redirect } from "next/navigation";

export const metadata = {
  title: "First cleaning offer | Alloy",
  description:
    "First Service Free — complete 4 visits in 120 days. Opens the homepage with the offer; quote and terms in modals, then book.",
};

/** QR / short link: same flow as `/?campaign=firstfree4x120` */
export default function FirstFree4x120Page() {
  redirect("/?campaign=firstfree4x120");
}

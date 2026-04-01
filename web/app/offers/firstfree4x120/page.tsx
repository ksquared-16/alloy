import { redirect } from "next/navigation";

export const metadata = {
  title: "First cleaning offer | Alloy",
  description:
    "First Service Free — complimentary first cleaning within 30 days of redemption; four (4) recurring cleanings within 120 days after that first clean. Opens the homepage with the offer; quote and terms in modals, then book.",
};

/** QR / short link: same flow as `/?campaign=firstfree4x120` */
export default function FirstFree4x120Page() {
  redirect("/?campaign=firstfree4x120");
}

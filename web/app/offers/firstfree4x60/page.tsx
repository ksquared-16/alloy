import { redirect } from "next/navigation";

export const metadata = {
  title: "First cleaning offer | Alloy",
  description:
    "Recurring standard cleaning — complete 4 visits in 60 days. Opens the homepage with the offer; quote and terms in modals, then book.",
};

/** QR / short link: same flow as `/?campaign=firstfree4x60` */
export default function FirstFree4x60Page() {
  redirect("/?campaign=firstfree4x60");
}

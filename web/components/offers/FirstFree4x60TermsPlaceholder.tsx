"use client";

const TERMS_ITEMS: string[] = [
  "Offer valid for new residential customers in Bend, OR only. One per household/address. Cannot be combined with other offers or discounts.",
  '"First Clean Free" applies only to a standard recurring maintenance clean (up to 3 hours total; kitchen, bathrooms, living areas, dusting, vacuuming/mopping, standard surface cleaning).',
  "Does not include deep cleans, move-in/move-out, or post-construction.",
  "Heavy pet hair/odor removal, oven/fridge interior, windows, laundry, organizing, or add-on services—these are available at regular rates.",
  "Customer must enroll in and commit to at least 4 consecutive recurring cleans (weekly, bi-weekly, or monthly schedule).",
  "Early cancellation before completing 4 cleans will result in regular charge for the first clean (billed at standard rate).",
  "Free clean must be scheduled and completed within 60 days of postcard redemption/offer expiration.",
  "Subject to availability; we reserve the right to refuse or reschedule if home is not reasonably accessible, safe, or in a condition suitable for standard cleaning (e.g., extreme hoarding, biohazards, unsafe pets).",
  "No-show or last-minute cancellation (less than 24 hours) may forfeit the free clean offer and/or incur a fee.",
  "All services subject to our standard terms of service (available on website/upon request). We are not responsible for pre-existing damage or items not disclosed.",
  "Must leave honest Google review within 30 days of first clean.",
  "Limited to the first 100 redemptions in Bend. We track via a unique QR code and booking system. Void where prohibited.",
];

export default function FirstFree4x60TermsPlaceholder() {
  return (
    <div className="rounded-lg border border-alloy-stone/30 bg-alloy-stone/5 p-4 md:p-6 text-sm text-alloy-midnight/90 max-h-[50vh] overflow-y-auto">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-juniper mb-3">Terms of service</h3>
      <ul className="list-disc pl-4 sm:pl-5 space-y-2.5 text-alloy-midnight/90 leading-relaxed marker:text-alloy-juniper">
        {TERMS_ITEMS.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </div>
  );
}

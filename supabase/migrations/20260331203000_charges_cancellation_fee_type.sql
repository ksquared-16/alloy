-- Allow cancellation_fee as a first-class charge_type (fees for cancelled visits/jobs).

ALTER TABLE "public"."charges" DROP CONSTRAINT IF EXISTS "charges_charge_type_chk";

ALTER TABLE "public"."charges"
    ADD CONSTRAINT "charges_charge_type_chk" CHECK (
        (
            "charge_type" = ANY (
                ARRAY[
                    'service'::"text",
                    'fee'::"text",
                    'adjustment'::"text",
                    'cancellation_fee'::"text"
                ]
            )
        )
    );

COMMENT ON CONSTRAINT "charges_charge_type_chk" ON "public"."charges" IS 'service=primary receivable; fee=generic fee; adjustment=pricing delta etc.; cancellation_fee=visit/job cancel policy.';

-- Normalize pricing_frequencies.frequency_key to stable machine keys
-- Keep frequency_label and discount_label human-readable

update public.pricing_frequencies
set frequency_key = 'weekly'
where id = '9826edfb-c762-4fae-afba-4124fa7f4632'::uuid
  and frequency_key <> 'weekly';

update public.pricing_frequencies
set frequency_key = 'biweekly'
where id = 'fc81c32c-b7b8-404b-91d7-f193fae85f37'::uuid
  and frequency_key <> 'biweekly';

update public.pricing_frequencies
set frequency_key = 'monthly'
where id = '27bfabf8-c74a-45e7-975e-cf866a1d1eac'::uuid
  and frequency_key <> 'monthly';
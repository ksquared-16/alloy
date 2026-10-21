-- FI-02 deployed: the disposable family ZZQAFI120104's submissions and what each signature row
-- records about its signer. QA family only; names are the QA family's own test names.
SELECT question_id, kind, payload
FROM (
    SELECT 's1_signatures' AS question_id, 'row' AS kind,
           concat_ws(' | ', left(fs.id::text, 8), fd.name, fs.status, sig.field_id, sig.signature_kind,
                     'typed=' || coalesce(sig.typed_full_name, '-'),
                     'drawn_doc=' || (sig.drawn_asset_document_id IS NOT NULL)::text,
                     'signer=' || coalesce((sig.metadata -> 'signer')::text, 'NONE')) AS payload
      FROM public.form_submissions fs
      JOIN public.form_definitions fd ON fd.id = fs.form_definition_id
      JOIN public.customers c ON c.id = fs.customer_id
      LEFT JOIN public.form_submission_signatures sig ON sig.form_submission_id = fs.id
     WHERE fs.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19' AND c.name LIKE '%ZZQAFI120104%'
) q
ORDER BY payload;

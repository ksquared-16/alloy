-- V0.5 FI-12 objective (OPWORK_2CEA84351D90_SPRINT_2A03D808C37E) c3, READ-ONLY.
-- Does Business Process revision 59 (a32816b4, org 93667019) carry any `kind: "document"` stage
-- requirement? Prior censuses (gar_5d83654dceee91, gar_824cdac2193af0) measured only form and
-- financial requirements. SELECT only; regex quantifier kept at the PostgreSQL maximum (255).
WITH r AS (
    SELECT payload::text AS p
      FROM public.business_process_revisions
     WHERE id = 'a32816b4-41c4-4848-9e6f-9e554fb73d58'::uuid
       AND org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
)
SELECT question_id, kind, payload
FROM (
    SELECT 'd0_revision_found' AS question_id, 'count' AS kind,
           count(*)::text || ' revision row(s) for a32816b4' AS payload
      FROM r
    UNION ALL
    SELECT 'd1_document_requirement_count', 'count',
           (SELECT count(*) FROM regexp_matches(r.p, '"kind": ?"document"', 'g'))::text || ' document requirement(s) in rev 59 payload'
      FROM r
    UNION ALL
    SELECT 'd2_document_requirement_snippets', 'row',
           left(m[1], 300)
      FROM r, LATERAL regexp_matches(r.p, '("kind": ?"document"[^}]{0,255})', 'g') AS m
) q
ORDER BY question_id, payload;

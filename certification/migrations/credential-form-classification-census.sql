-- Read-only census: WHAT are the 17 credential-shaped form definitions?
--
-- Slice 3 must classify each as eligible qualification evidence, not evidence, or
-- ambiguous — and the instruction is explicit that they must not be classified by
-- name alone. So this returns each definition's NAME plus the facts that decide
-- eligibility: whether it is active, whether it collects an uploaded document at
-- all, and how many submissions and documents it actually has.
--
-- Form definition names are ORGANIZATION CONFIGURATION, not personal data, and the
-- classification cannot be made without them. No submission content, no
-- respondent, no document filename and no personal field value is emitted — a
-- form named "CPR Certification Upload" tells us it collects a credential without
-- telling us whose.
--
-- Output obeys the trusted-host parser: question_id | kind | payload. The payload
-- packs the decision facts into one line per definition because the parser gives
-- one payload column.
select question_id, kind, payload
from (
    select
        'credential_form'::text as question_id,
        'definition'::text      as kind,
        (fd.name
          || ' | active=' || coalesce(fd.is_active::text, '?')
          || ' | submissions=' || coalesce(s.n::text, '0')
          || ' | documents=' || coalesce(d.n::text, '0')
          || ' | upload_docs=' || coalesce(u.n::text, '0'))::text as payload,
        lower(fd.name)          as sort_key
    from public.form_definitions fd
    left join lateral (
        select count(*) n from public.form_submissions fs where fs.form_definition_id = fd.id
    ) s on true
    left join lateral (
        select count(*) n from public.form_submission_documents fsd
        join public.form_submissions fs2 on fs2.id = fsd.form_submission_id
        where fs2.form_definition_id = fd.id
    ) d on true
    left join lateral (
        -- An 'upload' role document is the strongest signal that the form collects
        -- an artifact a qualification could reference, rather than merely asking
        -- a question about one.
        select count(*) n from public.form_submission_documents fsd2
        join public.form_submissions fs3 on fs3.id = fsd2.form_submission_id
        where fs3.form_definition_id = fd.id and fsd2.role = 'upload'
    ) u on true
    where fd.name ~* '(cpr|first aid|background|clearance|licen[cs]e|certif|training|immuniz|food handler|fingerprint|tb test|physical)'

    union all

    select 'total_credential_shaped'::text, 'count'::text,
           (select count(*)::text from public.form_definitions
            where name ~* '(cpr|first aid|background|clearance|licen[cs]e|certif|training|immuniz|food handler|fingerprint|tb test|physical)'),
           'zzz'::text
) rows(question_id, kind, payload, sort_key)
order by sort_key;

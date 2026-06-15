-- Allow general (unlinked) operational tasks alongside opportunity-linked tasks.

ALTER TABLE public.operational_tasks
    DROP CONSTRAINT IF EXISTS operational_tasks_entity_type_check;

ALTER TABLE public.operational_tasks
    ALTER COLUMN entity_type DROP NOT NULL,
    ALTER COLUMN entity_type DROP DEFAULT;

ALTER TABLE public.operational_tasks
    ALTER COLUMN entity_id DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'operational_tasks_entity_link_check'
          AND conrelid = 'public.operational_tasks'::regclass
    ) THEN
        ALTER TABLE public.operational_tasks
            ADD CONSTRAINT operational_tasks_entity_link_check
            CHECK (
                (entity_type IS NULL AND entity_id IS NULL)
                OR (entity_type = 'opportunities'::text AND entity_id IS NOT NULL)
            );
    END IF;
END $$;

COMMENT ON CONSTRAINT operational_tasks_entity_link_check ON public.operational_tasks IS
    'General tasks have no entity link; linked tasks must reference an opportunity.';

CREATE OR REPLACE FUNCTION public.enforce_operational_tasks_org_matches_opportunity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    opp_org uuid;
BEGIN
    IF NEW.entity_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT o.org_id INTO opp_org FROM public.opportunities o WHERE o.id = NEW.entity_id;
    IF opp_org IS NULL OR opp_org <> NEW.org_id THEN
        RAISE EXCEPTION 'operational_tasks: entity org mismatch' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

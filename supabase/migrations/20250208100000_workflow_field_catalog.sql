-- Function for workflow field catalog: returns columns for a given public table.
-- Excludes bytea and other non-useful types. Operators are derived in API from data_type.

CREATE OR REPLACE FUNCTION public.get_workflow_entity_columns(
    p_table_schema text DEFAULT 'public',
    p_table_name text DEFAULT NULL
)
RETURNS TABLE (
    key text,
    label text,
    data_type text,
    source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        c.column_name::text AS key,
        c.column_name::text AS label,
        c.data_type::text AS data_type,
        'table'::text AS source
    FROM information_schema.columns c
    WHERE c.table_schema = p_table_schema
      AND c.table_name = p_table_name
      AND c.data_type != 'bytea'
    ORDER BY c.ordinal_position;
$$;

COMMENT ON FUNCTION public.get_workflow_entity_columns IS 'Used by admin workflow field-catalog API to list entity table columns.';

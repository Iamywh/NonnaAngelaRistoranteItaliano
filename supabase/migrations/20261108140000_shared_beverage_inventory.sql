BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_module_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module = 'beverage_inventory'),
  PRIMARY KEY (user_id, module)
);

CREATE TABLE IF NOT EXISTS public.beverage_inventory (
  id smallint PRIMARY KEY CHECK (id = 1),
  categories jsonb NOT NULL,
  version bigint NOT NULL CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.staff_module_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beverage_inventory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_module_permissions, public.beverage_inventory
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.beverage_inventory_has_access()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.analytics_has_permission('analytics.write') OR EXISTS (
    SELECT 1 FROM public.staff_module_permissions AS staff
    WHERE staff.user_id = (SELECT auth.uid()) AND staff.module = 'beverage_inventory'
  );
$$;

CREATE OR REPLACE FUNCTION public.beverage_inventory_load()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.beverage_inventory_has_access() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'categories', inventory.categories,
      'version', inventory.version,
      'updated_at', inventory.updated_at
    )
    FROM public.beverage_inventory AS inventory WHERE inventory.id = 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.beverage_inventory_save(
  p_categories jsonb,
  p_expected_version bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_inventory public.beverage_inventory%ROWTYPE;
BEGIN
  IF NOT public.beverage_inventory_has_access() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_categories) IS DISTINCT FROM 'array'
    OR p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'invalid_inventory';
  END IF;

  IF jsonb_array_length(p_categories) = 0 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_categories) AS category(value)
    WHERE jsonb_typeof(value->'id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(value->'title') IS DISTINCT FROM 'string'
       OR jsonb_typeof(value->'unit') IS DISTINCT FROM 'string'
       OR jsonb_typeof(value->'items') IS DISTINCT FROM 'array'
  ) THEN
    RAISE EXCEPTION 'invalid_inventory';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_categories) AS category(value)
    CROSS JOIN LATERAL jsonb_array_elements(category.value->'items') AS item(value)
    WHERE jsonb_typeof(item.value->'name') IS DISTINCT FROM 'string'
       OR CASE WHEN jsonb_typeof(item.value->'quantity') = 'number'
               THEN (item.value->>'quantity')::numeric < 0
               ELSE true END
  ) THEN
    RAISE EXCEPTION 'invalid_inventory';
  END IF;

  IF p_expected_version = 0 THEN
    INSERT INTO public.beverage_inventory (id, categories, version, updated_by)
    VALUES (1, p_categories, 1, auth.uid())
    ON CONFLICT (id) DO NOTHING
    RETURNING * INTO v_inventory;
  ELSE
    UPDATE public.beverage_inventory
    SET categories = p_categories, version = version + 1,
        updated_at = now(), updated_by = auth.uid()
    WHERE id = 1 AND version = p_expected_version
    RETURNING * INTO v_inventory;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_conflict';
  END IF;

  RETURN jsonb_build_object('version', v_inventory.version, 'updated_at', v_inventory.updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.beverage_inventory_has_access(), public.beverage_inventory_load(),
  public.beverage_inventory_save(jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beverage_inventory_has_access(), public.beverage_inventory_load(),
  public.beverage_inventory_save(jsonb, bigint) TO authenticated;

COMMIT;

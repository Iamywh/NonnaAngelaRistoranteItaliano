BEGIN;
CREATE TABLE public.manager_cost_model (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), body jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid
);
CREATE TABLE public.procurement_suppliers (id text PRIMARY KEY, body jsonb NOT NULL);
CREATE TABLE public.procurement_products (
 id text PRIMARY KEY, body jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid
);
CREATE TABLE public.procurement_orders (
 id uuid PRIMARY KEY, request jsonb NOT NULL, body jsonb NOT NULL, created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 notification text NOT NULL DEFAULT 'pending' CHECK(notification IN ('pending','sending','sent','failed','uncertain')),
 attempt uuid, notified_at timestamptz
);
CREATE INDEX procurement_orders_created ON public.procurement_orders(created_at DESC);
ALTER TABLE public.manager_cost_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manager_cost_model,public.procurement_suppliers,public.procurement_products,public.procurement_orders FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.procurement_authorized() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.role()='authenticated' AND (
 public.analytics_has_permission('analytics.write') OR EXISTS(
 SELECT 1 FROM public.staff_module_permissions WHERE user_id=auth.uid() AND module='orders'));
$$;
CREATE FUNCTION public.manager_cost_load() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.analytics_has_permission('analytics.read') THEN RAISE EXCEPTION 'Access denied'; END IF;
 RETURN (SELECT jsonb_build_object('body',body,'version',version,'updated_at',updated_at) FROM public.manager_cost_model WHERE id);
END; $$;
CREATE FUNCTION public.manager_cost_save(p_version integer,p_params jsonb,p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_model jsonb; v_params jsonb; v_rows jsonb; v_row jsonb; v_change jsonb; v_key text; v_n numeric;
BEGIN
 IF NOT public.analytics_has_permission('analytics.write') THEN RAISE EXCEPTION 'Access denied'; END IF;
 SELECT body INTO v_model FROM public.manager_cost_model WHERE id AND version=p_version FOR UPDATE;
 IF v_model IS NULL THEN RAISE EXCEPTION 'Conflitto: ricarica i costi prima di salvare'; END IF;
 v_params:=v_model->'params';
 IF jsonb_typeof(p_params) IS DISTINCT FROM 'object' OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid model'; END IF;
 FOREACH v_key IN ARRAY ARRAY['fixed_monthly','covers','dishes_per_cover','kitchen_share','tax_rate','raw_target','margin_target','open_days','ticket'] LOOP
  IF jsonb_typeof(p_params->v_key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid parameter %',v_key; END IF;
  v_n:=(p_params->>v_key)::numeric;
  IF v_n<0 OR v_n>1000000 OR (v_key IN ('covers','dishes_per_cover','open_days','ticket') AND v_n<=0)
   OR (v_key IN ('kitchen_share','tax_rate','raw_target','margin_target') AND v_n>=1)
   OR (v_key='open_days' AND (v_n>31 OR v_n<>trunc(v_n))) THEN RAISE EXCEPTION 'Invalid parameter %',v_key; END IF;
  v_params:=jsonb_set(v_params,ARRAY[v_key],p_params->v_key);
 END LOOP;
 IF (v_params->>'raw_target')::numeric+(v_params->>'margin_target')::numeric>=1 THEN RAISE EXCEPTION 'Targets must total less than 100%%'; END IF;
 IF jsonb_array_length(p_rows)<>jsonb_array_length(v_model->'rows') THEN RAISE EXCEPTION 'Invalid recipe count'; END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_rows)x)<>jsonb_array_length(p_rows) THEN RAISE EXCEPTION 'Duplicate recipe'; END IF;
 v_rows:='[]'::jsonb;
 FOR v_row IN SELECT value FROM jsonb_array_elements(v_model->'rows') LOOP
  SELECT value INTO v_change FROM jsonb_array_elements(p_rows) WHERE value->>'id'=v_row->>'id';
  IF v_change IS NULL OR jsonb_typeof(v_change->'approved') IS DISTINCT FROM 'boolean'
   OR (jsonb_typeof(v_change->'raw_cost') NOT IN ('number','null'))
   OR NOT(v_change ? 'raw_cost') THEN RAISE EXCEPTION 'Invalid recipe'; END IF;
  IF v_change->'raw_cost'<>'null'::jsonb AND ((v_change->>'raw_cost')::numeric<0 OR (v_change->>'raw_cost')::numeric>10000) THEN RAISE EXCEPTION 'Invalid cost'; END IF;
  IF (v_change->>'approved')::boolean AND (v_change->'raw_cost'='null'::jsonb OR v_row->>'menu_key' IS NULL) THEN RAISE EXCEPTION 'Recipe must have a cost and menu match'; END IF;
  IF v_row->'raw_cost' IS DISTINCT FROM v_change->'raw_cost' OR v_row->'approved' IS DISTINCT FROM v_change->'approved' THEN
   v_row:=v_row||jsonb_build_object('raw_cost',v_change->'raw_cost','approved',v_change->'approved','edited_at',now(),'edited_by',auth.uid());
  END IF;
  v_rows:=v_rows||jsonb_build_array(v_row);
 END LOOP;
 UPDATE public.manager_cost_model SET body=jsonb_set(jsonb_set(v_model,'{params}',v_params),'{rows}',v_rows),version=version+1,updated_at=now(),updated_by=auth.uid() WHERE id;
 RETURN public.manager_cost_load();
END; $$;
CREATE FUNCTION public.procurement_load() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.procurement_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
 RETURN jsonb_build_object('products',coalesce((SELECT jsonb_agg(body||jsonb_build_object('version',version,'updated_at',updated_at) ORDER BY body->>'name') FROM public.procurement_products),'[]'::jsonb),
 'suppliers',coalesce((SELECT jsonb_agg(body ORDER BY body->>'name') FROM public.procurement_suppliers),'[]'::jsonb));
END; $$;
CREATE FUNCTION public.procurement_supplier_create(p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id text; v_body jsonb;
BEGIN
 IF NOT public.analytics_has_permission('analytics.write') THEN RAISE EXCEPTION 'Access denied'; END IF;
 IF p_name IS NULL OR length(btrim(p_name))<1 OR length(p_name)>120 THEN RAISE EXCEPTION 'Invalid supplier name'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('procurement_supplier_create'));
 IF EXISTS(SELECT 1 FROM public.procurement_suppliers WHERE lower(body->>'name')=lower(btrim(p_name))) THEN RAISE EXCEPTION 'Fornitore già presente'; END IF;
 v_id:='supplier-'||gen_random_uuid()::text;
 v_body:=jsonb_build_object('id',v_id,'name',btrim(p_name),'status','manual','notes','Creato da admin; verificare dati di contatto');
 INSERT INTO public.procurement_suppliers(id,body) VALUES(v_id,v_body);
 RETURN v_body;
END; $$;
CREATE FUNCTION public.procurement_product_save(p_id text,p_version integer,p_quantity numeric,p_minimum numeric,p_supplier text,p_unit_cost numeric) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old jsonb; v_body jsonb; v_version integer;
BEGIN
 IF NOT public.procurement_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
 IF (p_quantity IS NOT NULL AND (p_quantity<0 OR p_quantity>1000000 OR p_quantity::text IN ('NaN','Infinity','-Infinity')))
 OR (p_minimum IS NOT NULL AND (p_minimum<0 OR p_minimum>1000000 OR p_minimum::text IN ('NaN','Infinity','-Infinity')))
 OR (p_unit_cost IS NOT NULL AND (p_unit_cost<0 OR p_unit_cost>1000000 OR p_unit_cost::text IN ('NaN','Infinity','-Infinity'))) THEN RAISE EXCEPTION 'Invalid stock or cost'; END IF;
 SELECT body INTO v_old FROM public.procurement_products WHERE id=p_id AND version=p_version FOR UPDATE;
 IF v_old IS NULL THEN RAISE EXCEPTION 'Conflitto: ricarica inventario prima di salvare'; END IF;
 IF NOT public.analytics_has_permission('analytics.write') AND (
  p_supplier IS DISTINCT FROM v_old->>'supplier' OR p_unit_cost IS DISTINCT FROM (v_old->>'unit_cost')::numeric)
 THEN RAISE EXCEPTION 'Only admin can change supplier or cost'; END IF;
 IF p_supplier IS DISTINCT FROM v_old->>'supplier' AND p_supplier IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.procurement_suppliers WHERE id=p_supplier) THEN RAISE EXCEPTION 'Unknown supplier'; END IF;
 v_body:=v_old||jsonb_build_object('quantity',p_quantity,'minimum',p_minimum,'supplier',p_supplier,'unit_cost',p_unit_cost);
 IF p_unit_cost IS DISTINCT FROM (v_old->>'unit_cost')::numeric THEN v_body:=v_body||jsonb_build_object('cost_source','Aggiornamento manuale admin: verificare fattura e base fiscale'); END IF;
 UPDATE public.procurement_products SET body=v_body,version=version+1,updated_at=now(),updated_by=auth.uid() WHERE id=p_id RETURNING version INTO v_version;
 RETURN v_body||jsonb_build_object('version',v_version,'updated_at',now());
END; $$;
CREATE FUNCTION public.procurement_order_list() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.procurement_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
 RETURN coalesce((SELECT jsonb_agg(body||jsonb_build_object('notification',notification,'notified_at',notified_at) ORDER BY created_at DESC)
 FROM (SELECT * FROM public.procurement_orders ORDER BY created_at DESC LIMIT 100)o),'[]'::jsonb);
END; $$;
CREATE FUNCTION public.procurement_order_create(p_id uuid,p_lines jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_line jsonb; v_product jsonb; v_lines jsonb:='[]'; v_suppliers jsonb; v_qty numeric; v_order jsonb; v_existing public.procurement_orders%ROWTYPE;
BEGIN
 IF NOT public.procurement_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
 IF p_id IS NULL OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid order'; END IF;
 IF jsonb_array_length(p_lines)<1 OR jsonb_array_length(p_lines)>100 THEN RAISE EXCEPTION 'Order requires 1–100 lines'; END IF;
 SELECT * INTO v_existing FROM public.procurement_orders WHERE id=p_id;
 IF FOUND THEN
  IF v_existing.created_by<>auth.uid() OR v_existing.request<>p_lines THEN RAISE EXCEPTION 'Order identifier already used'; END IF;
  RETURN v_existing.body||jsonb_build_object('notification',v_existing.notification);
 END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(v_line->'quantity') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  v_qty:=(v_line->>'quantity')::numeric;
  IF v_qty<=0 OR v_qty>1000000 OR length(coalesce(v_line->>'notes',''))>500 THEN RAISE EXCEPTION 'Invalid quantity or notes'; END IF;
  SELECT body INTO v_product FROM public.procurement_products WHERE id=v_line->>'product_id' FOR SHARE;
  IF v_product IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.procurement_suppliers WHERE id=v_product->>'supplier') THEN RAISE EXCEPTION 'Assegna un fornitore prima di ordinare: %',v_product->>'name'; END IF;
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object('productId',v_product->>'id','product',v_product->>'name','unit',v_product->>'unit','supplier',v_product->>'supplier','supplierName',(SELECT body->>'name' FROM public.procurement_suppliers WHERE id=v_product->>'supplier'),'orderType',v_product->>'area','quantity',v_qty,'notes',coalesce(v_line->>'notes',''),'unitCost',v_product->'unit_cost','costSource',v_product->'cost_source'));
 END LOOP;
 SELECT jsonb_agg(DISTINCT x->>'supplier') INTO v_suppliers FROM jsonb_array_elements(v_lines)x;
 v_order:=jsonb_build_object('id',p_id,'orderNumber','NA-'||substr(p_id::text,1,8),'createdAt',now(),'createdBy',auth.uid(),'status','requested','suppliers',v_suppliers,'lines',v_lines,'orderType',CASE WHEN (SELECT count(DISTINCT x->>'orderType') FROM jsonb_array_elements(v_lines)x)>1 THEN 'mixed' ELSE v_lines->0->>'orderType' END);
 INSERT INTO public.procurement_orders(id,request,body,created_by) VALUES(p_id,p_lines,v_order,auth.uid()) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO v_existing FROM public.procurement_orders WHERE id=p_id;
 IF v_existing.created_by<>auth.uid() OR v_existing.request<>p_lines THEN RAISE EXCEPTION 'Order identifier already used'; END IF;
 RETURN v_existing.body||jsonb_build_object('notification',v_existing.notification);
END; $$;
-- Only the verified Edge Function can claim/complete a Telegram delivery.
CREATE FUNCTION public.procurement_notify_claim(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_order public.procurement_orders%ROWTYPE;
BEGIN
 SELECT * INTO v_order FROM public.procurement_orders WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF v_order.notification NOT IN ('pending','failed') THEN RETURN jsonb_build_object('state',v_order.notification); END IF;
 UPDATE public.procurement_orders SET notification='sending',attempt=gen_random_uuid() WHERE id=p_id RETURNING * INTO v_order;
 RETURN jsonb_build_object('state','claimed','attempt',v_order.attempt,'order',v_order.body);
END; $$;
CREATE FUNCTION public.procurement_notify_finish(p_id uuid,p_attempt uuid,p_state text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_state NOT IN ('sent','failed','uncertain') THEN RAISE EXCEPTION 'Invalid delivery state'; END IF;
 UPDATE public.procurement_orders SET notification=p_state,notified_at=CASE WHEN p_state='sent' THEN now() ELSE NULL END
 WHERE id=p_id AND attempt=p_attempt AND notification='sending';
 RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.procurement_authorized(),public.manager_cost_load(),public.manager_cost_save(integer,jsonb,jsonb),public.procurement_load(),public.procurement_supplier_create(text),public.procurement_product_save(text,integer,numeric,numeric,text,numeric),public.procurement_order_list(),public.procurement_order_create(uuid,jsonb),public.procurement_notify_claim(uuid),public.procurement_notify_finish(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_authorized(),public.manager_cost_load(),public.manager_cost_save(integer,jsonb,jsonb),public.procurement_load(),public.procurement_supplier_create(text),public.procurement_product_save(text,integer,numeric,numeric,text,numeric),public.procurement_order_list(),public.procurement_order_create(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_notify_claim(uuid),public.procurement_notify_finish(uuid,uuid,text) TO service_role;
COMMIT;

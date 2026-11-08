-- Phase 13C/1: "La Famiglia" pilot. Staff-issued bearer cards, no contact details.
-- Never reads public.reservations; the tables are private, writes go through
-- owner/admin-only RPCs. Public visitors can only read/delete with a 256-bit
-- bearer card token, not a guessable 8-character staff lookup code.
-- Privacy: no names, emails, phone numbers, invoices, booking IDs or automated campaigns.
BEGIN;

CREATE TABLE public.loyalty_program_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  issuing_enabled boolean NOT NULL DEFAULT false,
  reward_threshold integer NOT NULL DEFAULT 5 CHECK (reward_threshold BETWEEN 3 AND 12),
  reward_label text CHECK (reward_label IS NULL OR char_length(btrim(reward_label)) BETWEEN 5 AND 100),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_settings_enabled_reward CHECK (
    NOT issuing_enabled OR reward_label IS NOT NULL
  )
);
INSERT INTO public.loyalty_program_settings (id, issuing_enabled, reward_threshold)
VALUES (1,false,5);

CREATE TABLE public.loyalty_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_sha256 text NOT NULL UNIQUE CHECK(secret_sha256 ~ '^[0-9a-f]{64}$'),
  public_code text NOT NULL UNIQUE CHECK(public_code ~ '^[A-F0-9]{8}$'),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','blocked')),
  reward_threshold integer NOT NULL CHECK(reward_threshold BETWEEN 3 AND 12),
  reward_label text NOT NULL CHECK(char_length(btrim(reward_label)) BETWEEN 5 AND 100),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loyalty_cards_created_idx ON public.loyalty_cards(created_at DESC);

CREATE TABLE public.loyalty_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.loyalty_cards(id) ON DELETE CASCADE,
  visit_date date NOT NULL,
  stamped_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(card_id,visit_date)
);
CREATE INDEX loyalty_visits_date_idx ON public.loyalty_visits(visit_date DESC);

CREATE TABLE public.loyalty_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.loyalty_cards(id) ON DELETE CASCADE,
  redeemed_on date NOT NULL,
  reward_label text NOT NULL,
  reward_threshold integer NOT NULL,
  redeemed_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(card_id,redeemed_on)
);
CREATE INDEX loyalty_redemptions_date_idx ON public.loyalty_redemptions(redeemed_on DESC);

ALTER TABLE public.loyalty_program_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.loyalty_program_settings,public.loyalty_cards,
  public.loyalty_visits,public.loyalty_redemptions FROM PUBLIC,anon,authenticated;

-- Owner/admin authorization is checked on the SERVER, never from the
-- sessionStorage manager password. Read/issue/stamp/redeem/configure all
-- use the same role verification and never open the underlying tables.
CREATE FUNCTION public.loyalty_staff_authorized()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT auth.role() = 'authenticated' AND EXISTS(
    SELECT 1 FROM public.analytics_user_roles r
    WHERE r.user_id = auth.uid() AND r.is_active AND r.role IN ('owner','admin')
  );
$$;
REVOKE ALL ON FUNCTION public.loyalty_staff_authorized() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.loyalty_admin_settings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_cfg public.loyalty_program_settings%ROWTYPE;
BEGIN
  IF NOT public.loyalty_staff_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO v_cfg FROM public.loyalty_program_settings WHERE id=1;
  RETURN jsonb_build_object(
    'issuing_enabled',v_cfg.issuing_enabled,
    'reward_threshold',v_cfg.reward_threshold,
    'reward_label',v_cfg.reward_label,
    'total_cards',(SELECT count(*) FROM public.loyalty_cards),
    'active_cards',(SELECT count(*) FROM public.loyalty_cards WHERE status='active'),
    'visits_30_days',(SELECT count(*) FROM public.loyalty_visits
      WHERE visit_date >= (now() AT TIME ZONE 'Atlantic/Canary')::date-29),
    'rewards_30_days',(SELECT count(*) FROM public.loyalty_redemptions
      WHERE redeemed_on >= (now() AT TIME ZONE 'Atlantic/Canary')::date-29)
  );
END;
$$;

-- Changes to thresholds / reward only affect NEW cards. Existing cards
-- retain the offer they received, avoiding retroactive rule changes.
CREATE FUNCTION public.loyalty_admin_configure(
  p_issuing_enabled boolean,p_reward_threshold integer,p_reward_label text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_label text := NULLIF(btrim(coalesce(p_reward_label,'')),'');
BEGIN
  IF NOT public.loyalty_staff_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_issuing_enabled IS NULL OR p_reward_threshold IS NULL
    OR p_reward_threshold NOT BETWEEN 3 AND 12
    OR (v_label IS NOT NULL AND char_length(v_label) NOT BETWEEN 5 AND 100)
    OR (p_issuing_enabled AND v_label IS NULL) THEN
    RAISE EXCEPTION 'Invalid loyalty configuration';
  END IF;
  UPDATE public.loyalty_program_settings
    SET issuing_enabled=p_issuing_enabled,reward_threshold=p_reward_threshold,
        reward_label=v_label,updated_by=auth.uid(),updated_at=now()
    WHERE id=1;
  RETURN public.loyalty_admin_settings();
END;
$$;

-- Every new card receives a cryptographically random token, returned ONCE.
-- Only its SHA-256 digest is stored. The short code is for staff lookups,
-- never for public authentication.
CREATE FUNCTION public.loyalty_admin_issue()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_cfg public.loyalty_program_settings%ROWTYPE;
  v_token text; v_hash text; v_code text;
  v_id uuid; v_i integer;
BEGIN
  IF NOT public.loyalty_staff_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO v_cfg FROM public.loyalty_program_settings WHERE id=1 FOR SHARE;
  IF NOT v_cfg.issuing_enabled OR v_cfg.reward_label IS NULL THEN
    RAISE EXCEPTION 'Issuing is disabled: configure the pilot reward before creating cards';
  END IF;
  FOR v_i IN 1..5 LOOP
    v_token:=replace(gen_random_uuid()::text,'-','')
          ||replace(gen_random_uuid()::text,'-','');
    v_hash:=encode(sha256(convert_to(v_token,'UTF8')),'hex');
    v_code:=upper(substr(v_hash,1,8));
    INSERT INTO public.loyalty_cards(
      secret_sha256,public_code,reward_threshold,reward_label,created_by
    ) VALUES(v_hash,v_code,v_cfg.reward_threshold,v_cfg.reward_label,auth.uid())
    ON CONFLICT DO NOTHING RETURNING id INTO v_id;
    EXIT WHEN v_id IS NOT NULL;
  END LOOP;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Could not issue a unique card'; END IF;
  RETURN jsonb_build_object(
    'token',v_token,'public_code',v_code,
    'reward_threshold',v_cfg.reward_threshold,'reward_label',v_cfg.reward_label
  );
END;
$$;

CREATE FUNCTION public.loyalty_admin_lookup(p_public_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_card public.loyalty_cards%ROWTYPE;
  v_visits integer; v_redeemed integer;
BEGIN
  IF NOT public.loyalty_staff_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_public_code IS NULL OR btrim(p_public_code) !~* '^[A-F0-9]{8}$' THEN
    RAISE EXCEPTION 'Invalid card code';
  END IF;
  SELECT * INTO v_card FROM public.loyalty_cards
    WHERE public_code=upper(btrim(p_public_code));
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*)::integer INTO v_visits FROM public.loyalty_visits WHERE card_id=v_card.id;
  SELECT count(*)::integer INTO v_redeemed FROM public.loyalty_redemptions WHERE card_id=v_card.id;
  RETURN jsonb_build_object(
    'public_code',v_card.public_code,'status',v_card.status,
    'reward_threshold',v_card.reward_threshold,'reward_label',v_card.reward_label,
    'visits',v_visits,'redeemed',v_redeemed,
    'available_rewards',greatest(0,(v_visits/v_card.reward_threshold)-v_redeemed),
    'last_visit',(SELECT max(visit_date) FROM public.loyalty_visits WHERE card_id=v_card.id)
  );
END;
$$;

-- One credited visit per calendar day, witnessed and approved by staff;
-- allows controlled backfill of a visit in the last 7 days.
CREATE FUNCTION public.loyalty_admin_stamp(p_public_code text,p_visit_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_card public.loyalty_cards%ROWTYPE; v_today date;
        v_id uuid;
BEGIN
  IF NOT public.loyalty_staff_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  v_today:=(now() AT TIME ZONE 'Atlantic/Canary')::date;
  IF p_public_code IS NULL OR btrim(p_public_code) !~* '^[A-F0-9]{8}$'
    OR p_visit_date IS NULL OR p_visit_date>v_today OR p_visit_date<v_today-7 THEN
    RAISE EXCEPTION 'Invalid card code or visit date (last 7 days only)';
  END IF;
  SELECT * INTO v_card FROM public.loyalty_cards
    WHERE public_code=upper(btrim(p_public_code)) FOR UPDATE;
  IF v_card.id IS NULL OR v_card.status<>'active' THEN
    RAISE EXCEPTION 'Card not found or inactive';
  END IF;
  INSERT INTO public.loyalty_visits(card_id,visit_date,stamped_by)
    VALUES(v_card.id,p_visit_date,auth.uid())
    ON CONFLICT(card_id,visit_date) DO NOTHING
    RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Visit already recorded for this date'; END IF;
  RETURN public.loyalty_admin_lookup(v_card.public_code);
END;
$$;

-- Redeem at most one earned reward each calendar day. Card lock serializes
-- visit/redemption operations, preventing double-spend of the same stamps.
CREATE FUNCTION public.loyalty_admin_redeem(p_public_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_card public.loyalty_cards%ROWTYPE; v_today date;
        v_visits integer; v_redeemed integer; v_id uuid;
BEGIN
  IF NOT public.loyalty_staff_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_public_code IS NULL OR btrim(p_public_code) !~* '^[A-F0-9]{8}$' THEN
    RAISE EXCEPTION 'Invalid card code';
  END IF;
  SELECT * INTO v_card FROM public.loyalty_cards
    WHERE public_code=upper(btrim(p_public_code)) FOR UPDATE;
  IF v_card.id IS NULL OR v_card.status<>'active' THEN
    RAISE EXCEPTION 'Card not found or inactive';
  END IF;
  SELECT count(*)::integer INTO v_visits FROM public.loyalty_visits WHERE card_id=v_card.id;
  SELECT count(*)::integer INTO v_redeemed FROM public.loyalty_redemptions WHERE card_id=v_card.id;
  IF (v_visits/v_card.reward_threshold) - v_redeemed < 1 THEN
    RAISE EXCEPTION 'Not enough verified visits for a reward';
  END IF;
  v_today:=(now() AT TIME ZONE 'Atlantic/Canary')::date;
  INSERT INTO public.loyalty_redemptions(
    card_id,redeemed_on,reward_label,reward_threshold,redeemed_by
  ) VALUES(v_card.id,v_today,v_card.reward_label,v_card.reward_threshold,auth.uid())
  ON CONFLICT(card_id,redeemed_on) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'A reward has already been redeemed today'; END IF;
  RETURN public.loyalty_admin_lookup(v_card.public_code);
END;
$$;

-- Public brochure status contains no members or individual records.
-- Disabling issuance only affects NEW cards, never accrued entitlements.
CREATE FUNCTION public.loyalty_public_program()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $
DECLARE v_cfg public.loyalty_program_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.loyalty_program_settings WHERE id=1;
  RETURN jsonb_build_object(
    'issuing_enabled',v_cfg.issuing_enabled,
    'reward_threshold',CASE WHEN v_cfg.issuing_enabled THEN v_cfg.reward_threshold ELSE NULL END,
    'reward_label',CASE WHEN v_cfg.issuing_enabled THEN v_cfg.reward_label ELSE NULL END
  );
END;
$;

-- Possession of the 256-bit bearer token is required for a public read.
-- No raw visit records, staff IDs, PII or token digests are ever returned.
CREATE FUNCTION public.loyalty_public_card(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_card public.loyalty_cards%ROWTYPE;
        v_visits integer; v_redeemed integer;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_card FROM public.loyalty_cards
    WHERE secret_sha256=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  IF v_card.id IS NULL THEN RETURN NULL; END IF;
  SELECT count(*)::integer INTO v_visits FROM public.loyalty_visits WHERE card_id=v_card.id;
  SELECT count(*)::integer INTO v_redeemed FROM public.loyalty_redemptions WHERE card_id=v_card.id;
  RETURN jsonb_build_object(
    'public_code',v_card.public_code,'status',v_card.status,
    'reward_threshold',v_card.reward_threshold,'reward_label',v_card.reward_label,
    'visits',v_visits,'redeemed',v_redeemed,
    'available_rewards',greatest(0,(v_visits/v_card.reward_threshold)-v_redeemed),
    'progress',mod(v_visits,v_card.reward_threshold)
  );
END;
$$;

-- The card holder can erase the pass and associated visits/rewards by proving
-- possession of the bearer token. There is no user contact data to erase here.
CREATE FUNCTION public.loyalty_public_delete(p_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_deleted integer;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  DELETE FROM public.loyalty_cards
    WHERE secret_sha256=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  GET DIAGNOSTICS v_deleted=ROW_COUNT;
  RETURN v_deleted=1;
END;
$$;

REVOKE ALL ON FUNCTION public.loyalty_admin_settings() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.loyalty_admin_configure(boolean,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.loyalty_admin_issue() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.loyalty_admin_lookup(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.loyalty_admin_stamp(text,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.loyalty_admin_redeem(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.loyalty_public_program() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.loyalty_public_card(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.loyalty_public_delete(text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.loyalty_admin_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_admin_configure(boolean,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_admin_issue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_admin_lookup(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_admin_stamp(text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_admin_redeem(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_public_program() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_public_card(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_public_delete(text) TO anon,authenticated;
COMMIT;

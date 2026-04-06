-- Migration: Achim Eckert als authorized_user hinzufügen + PWA-PIN erstellen
-- Tenant: gehlhaar_test
-- Datum: 2026-04-06
-- Ausführen im Supabase SQL Editor.

DO $$
DECLARE
  v_email        text    := 'achim.eckert@beventures.ch';
  v_display_name text    := 'Achim Eckert';
  v_role         text    := 'admin';
  v_pin          text    := '123456';  -- << PIN anpassen falls gewünscht (6 Ziffern)
  v_tenant_id    uuid;
  v_user_id      uuid;
  v_pin_hash     text;
BEGIN
  -- Tenant-ID holen
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE slug = 'gehlhaar_test';

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant gehlhaar_test nicht gefunden.';
  END IF;

  -- Authorized User einfuegen (oder bestehenden reaktivieren)
  SELECT id INTO v_user_id
  FROM public.authorized_users
  WHERE tenant_id = v_tenant_id AND email = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    INSERT INTO public.authorized_users (tenant_id, email, display_name, role, is_active)
    VALUES (v_tenant_id, v_email, v_display_name, v_role, true)
    RETURNING id INTO v_user_id;
  ELSE
    UPDATE public.authorized_users SET
      display_name = v_display_name,
      role         = v_role,
      is_active    = true
    WHERE id = v_user_id;
  END IF;

  RAISE NOTICE 'Authorized User: % (id: %)', v_email, v_user_id;

  -- PIN hashen: sha256(authorized_user_id + ":" + pin)
  v_pin_hash := encode(digest(v_user_id::text || ':' || v_pin, 'sha256'), 'hex');

  -- PWA-PIN einfuegen (oder bestehenden ersetzen)
  INSERT INTO public.pwa_registration_pins
    (tenant_id, authorized_user_id, pin_hash, is_used, expires_at)
  VALUES
    (v_tenant_id, v_user_id, v_pin_hash, false, now() + interval '30 days')
  ON CONFLICT (tenant_id, authorized_user_id)
  DO UPDATE SET
    pin_hash   = EXCLUDED.pin_hash,
    is_used    = false,
    expires_at = now() + interval '30 days',
    used_at    = null;

  RAISE NOTICE 'PWA-PIN erstellt fuer % - PIN zum Eingeben: %', v_email, v_pin;
END $$;

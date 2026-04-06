-- Migration: Achim Eckert als Staff-Mitglied hinzufügen
-- Tenant: gehlhaar_test
-- Datum: 2026-04-06
-- Ausführen im Supabase SQL Editor.

DO $$
DECLARE
  v_name       text := 'Achim Eckert';
  v_kuerzel    text := 'AE';
  v_funktion   text := 'Geschäftsführer';
  v_tenant_id  uuid;
BEGIN
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE slug = 'gehlhaar_test';

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant gehlhaar_test nicht gefunden.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.staff WHERE tenant_id = v_tenant_id AND name = v_name) THEN
    UPDATE public.staff SET
      kuerzel  = v_kuerzel,
      funktion = v_funktion
    WHERE tenant_id = v_tenant_id AND name = v_name;
    RAISE NOTICE 'Staff-Eintrag aktualisiert: %', v_name;
  ELSE
    INSERT INTO public.staff (tenant_id, name, kuerzel, funktion)
    VALUES (v_tenant_id, v_name, v_kuerzel, v_funktion);
    RAISE NOTICE 'Staff-Eintrag erstellt: %', v_name;
  END IF;
END $$;

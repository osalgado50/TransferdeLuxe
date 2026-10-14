-- Datos de factura del ticket de combustible (los lee el OCR del ticket; útiles para contabilidad). Todo opcional y
-- aditivo: los tickets que ya había siguen igual.
alter table public.tickets_combustible add column if not exists hora text check (hora is null or hora ~ '^([01]\d|2[0-3]):[0-5]\d$');
alter table public.tickets_combustible add column if not exists nif_gasolinera text check (nif_gasolinera is null or char_length(nif_gasolinera) between 8 and 12);
alter table public.tickets_combustible add column if not exists numero_factura text check (numero_factura is null or char_length(numero_factura) <= 40);
alter table public.tickets_combustible add column if not exists base_imponible numeric(10, 2) check (base_imponible is null or base_imponible >= 0);
alter table public.tickets_combustible add column if not exists iva_pct numeric(5, 2) check (iva_pct is null or iva_pct between 0 and 30);
alter table public.tickets_combustible add column if not exists iva_importe numeric(10, 2) check (iva_importe is null or iva_importe >= 0);

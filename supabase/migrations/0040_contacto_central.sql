-- Contacto de la central para el cliente (aditiva): si al reservar no hay ningún conductor libre a esa hora, la web le
-- ofrece escribir por WhatsApp o llamar. Se rellena en «Flota y ajustes»; vacío = no se ofrecen esos botones.
alter table public.ajustes add column if not exists telefono_central text check (telefono_central is null or char_length(telefono_central) <= 20);
alter table public.ajustes add column if not exists whatsapp_central text check (whatsapp_central is null or char_length(whatsapp_central) <= 20);

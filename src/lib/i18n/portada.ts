/** Textos de la portada pública (reserva rápida) en castellano, catalán e inglés. */
export type Idioma = "es" | "ca" | "en";
export const IDIOMAS: { codigo: Idioma; nombre: string; corto: string }[] = [
  { codigo: "es", nombre: "Español", corto: "ES" },
  { codigo: "ca", nombre: "Català", corto: "CA" },
  { codigo: "en", nombre: "English", corto: "EN" },
];

/** Idioma pedido (?lang=) o, si no, el del navegador (Accept-Language); castellano por defecto. */
export function leerIdioma(param: string | undefined, acceptLanguage: string | null): Idioma {
  if (param === "es" || param === "ca" || param === "en") return param;
  for (const parte of (acceptLanguage ?? "").toLowerCase().split(",")) {
    const c = parte.trim().slice(0, 2);
    if (c === "ca" || c === "es" || c === "en") return c;
  }
  return "es";
}

export interface TextosPortada {
  meta: { titulo: string; descripcion: string };
  nav: { reservar: string; profesionales: string; profesionalesSub: string; idioma: string };
  hero: { etiqueta: string; titulo: string; destinos: string[]; subtitulo: string; sello: string[] };
  form: {
    titulo: string; recogida: string; recogidaAyuda: string; destino: string; destinoAyuda: string; dia: string; hora: string;
    pasajeros: string; maletas: string; menos: string; mas: string; vehiculo: string; vuelo: string; vueloAyuda: string;
    nombre: string; telefono: string; email: string; notas: string; notasAyuda: string; privacidad: string; politica: string;
    enviar: string; enviando: string; ok: string; okDetalle: string; otra: string; revisa: string; campo: string;
    pasado: string; vuelta: string; correo: string; demasiados: string; completa: string; frecuentes: string;
    /** Menos de media hora de antelación; sin coche libre (contactar / enviar igualmente); página actualizada durante la reserva. */
    pronto: string; sinHueco: string; sinHuecoTexto: string; whatsapp: string; llamar: string; igualmente: string; otraHora: string;
    mensajeWhatsApp: (d: { dia: string; hora: string; origen: string; destino: string; pax: number }) => string;
    actualizada: string; recargar: string;
  };
  vehiculos: Record<"sedan" | "minivan" | "minivan_premium" | "microbus" | "minibus", string>;
  ventajas: { titulo: string; items: { icono: string; titulo: string; texto: string }[] };
  pie: { privacidad: string; aviso: string; lema: string };
  direccion: { buscando: string; buscandoMapa: string; sugerencias: string; usar: (t: string) => string; sinPunto: string;
    voz: string; dictar: string; escuchando: string; permiso: string; noOido: string; otro: string;
    ubicacion: string; buscandoUbicacion: string; sinPermisoUbicacion: string; errorUbicacion: string };
}

export const TEXTOS: Record<Idioma, TextosPortada> = {
  es: {
    meta: { titulo: "Traslados VIP en la Costa Dorada · TransferdeLuxe", descripcion: "Reserva tu traslado privado en Salou, Cambrils, Tarragona, PortAventura y los aeropuertos de Reus y Barcelona." },
    nav: { reservar: "Reservar", profesionales: "Acceso profesionales", profesionalesSub: "Central y conductores", idioma: "Idioma" },
    hero: {
      etiqueta: "Traslados VIP · Costa Dorada",
      titulo: "Tu traslado privado a",
      destinos: ["PortAventura", "el aeropuerto", "Barcelona", "Salou", "Cambrils", "la estación del AVE"],
      subtitulo: "Conductor profesional, coche premium y seguimiento en directo. Reserva en un minuto.",
      sello: ["Aeropuertos de Reus y Barcelona", "De 1 a 19 pasajeros", "Aviso por WhatsApp"],
    },
    form: {
      titulo: "Reserva tu traslado", recogida: "¿Dónde te recogemos?", recogidaAyuda: "Hotel, dirección o aeropuerto",
      destino: "¿Adónde vas?", destinoAyuda: "Hotel, dirección o aeropuerto", dia: "Día", hora: "Hora",
      pasajeros: "Pasajeros", maletas: "Maletas", menos: "Uno menos", mas: "Uno más", vehiculo: "Te asignamos",
      vuelo: "Nº de vuelo", vueloAyuda: "Opcional · p. ej. FR1234", nombre: "Nombre y apellidos", telefono: "Teléfono (WhatsApp)",
      email: "Correo electrónico", notas: "Comentarios", notasAyuda: "Silla de bebé, equipaje especial… (opcional)",
      privacidad: "Acepto la", politica: "política de privacidad", enviar: "Reservar ahora", enviando: "Enviando…",
      ok: "¡Reserva recibida!", okDetalle: "Te confirmaremos el traslado muy pronto por teléfono o WhatsApp.", otra: "Hacer otra reserva",
      revisa: "Revisa los datos marcados", campo: "Revisa este dato", pasado: "La recogida no puede ser en el pasado",
      vuelta: "La vuelta tiene que ser después de la ida", correo: "Escribe un correo válido",
      demasiados: "Demasiadas reservas desde esta conexión. Inténtalo más tarde.",
      completa: "¿Ida y vuelta o un vehículo concreto? Usa la reserva completa", frecuentes: "Destinos frecuentes",
      pronto: "Reserva con al menos media hora de antelación. Si es más urgente, llámanos.",
      sinHueco: "A esa hora tenemos todos los coches ocupados", sinHuecoTexto: "Escríbenos o llámanos y te buscamos una solución, o elige otra hora.",
      whatsapp: "Escribir por WhatsApp", llamar: "Llamar a la central", igualmente: "Enviar la solicitud igualmente", otraHora: "Elegir otra hora",
      mensajeWhatsApp: (d) => `Hola, quiero un traslado el ${d.dia} a las ${d.hora} de ${d.origen} a ${d.destino} (${d.pax} pasajeros). ¿Tenéis disponibilidad?`,
      actualizada: "Hemos actualizado la web mientras reservabas. Recarga la página y vuelve a enviarla.", recargar: "Recargar la página",
    },
    vehiculos: { sedan: "Sedán · hasta 3", minivan: "MiniVan · hasta 7", minivan_premium: "MiniVan Premium · hasta 8", microbus: "MicroBus · hasta 13", minibus: "MiniBus · hasta 19" },
    ventajas: {
      titulo: "Viaja tranquilo",
      items: [
        { icono: "✈️", titulo: "Vigilamos tu vuelo", texto: "Si tu vuelo se retrasa, ajustamos la recogida a la llegada real." },
        { icono: "💬", titulo: "Aviso por WhatsApp", texto: "Te escribimos cuando el conductor sale y te enviamos un enlace para ver el coche en el mapa." },
        { icono: "🚐", titulo: "Coche a tu medida", texto: "De 1 a 19 pasajeros, con sitio para las maletas." },
        { icono: "📍", titulo: "Conductores locales", texto: "Conocemos cada rincón de la Costa Dorada." },
      ],
    },
    pie: { privacidad: "Privacidad", aviso: "Aviso legal", lema: "TransferdeLuxe · Costa Dorada" },
    direccion: { buscando: "Buscando direcciones…", buscandoMapa: "Buscando en el mapa…", sugerencias: "Sugerencias de dirección", usar: (t) => `Usar “${t}” tal cual`, sinPunto: "(sin punto en el mapa)",
      voz: "es-ES", dictar: "Dictar la dirección", escuchando: "Escuchando… toca para terminar", permiso: "Permite el micrófono para dictar la dirección.",
      noOido: "No te he oído. Toca el micrófono y vuelve a probar.", otro: "No se pudo dictar. Escríbela, por favor.",
      ubicacion: "Usar mi ubicación", buscandoUbicacion: "Buscando dónde estás…", sinPermisoUbicacion: "Permite la ubicación en el navegador para rellenar la dirección.",
      errorUbicacion: "No se pudo saber dónde estás. Escribe la dirección, por favor." },
  },
  ca: {
    meta: { titulo: "Trasllats VIP a la Costa Daurada · TransferdeLuxe", descripcion: "Reserva el teu trasllat privat a Salou, Cambrils, Tarragona, PortAventura i els aeroports de Reus i Barcelona." },
    nav: { reservar: "Reservar", profesionales: "Accés professionals", profesionalesSub: "Central i conductors", idioma: "Idioma" },
    hero: {
      etiqueta: "Trasllats VIP · Costa Daurada",
      titulo: "El teu trasllat privat a",
      destinos: ["PortAventura", "l’aeroport", "Barcelona", "Salou", "Cambrils", "l’estació de l’AVE"],
      subtitulo: "Conductor professional, cotxe prèmium i seguiment en directe. Reserva en un minut.",
      sello: ["Aeroports de Reus i Barcelona", "D’1 a 19 passatgers", "Avís per WhatsApp"],
    },
    form: {
      titulo: "Reserva el teu trasllat", recogida: "On et recollim?", recogidaAyuda: "Hotel, adreça o aeroport",
      destino: "On vas?", destinoAyuda: "Hotel, adreça o aeroport", dia: "Dia", hora: "Hora",
      pasajeros: "Passatgers", maletas: "Maletes", menos: "Un menys", mas: "Un més", vehiculo: "T’assignem",
      vuelo: "Núm. de vol", vueloAyuda: "Opcional · p. ex. FR1234", nombre: "Nom i cognoms", telefono: "Telèfon (WhatsApp)",
      email: "Correu electrònic", notas: "Comentaris", notasAyuda: "Cadira de nadó, equipatge especial… (opcional)",
      privacidad: "Accepto la", politica: "política de privacitat", enviar: "Reserva ara", enviando: "Enviant…",
      ok: "Reserva rebuda!", okDetalle: "Et confirmarem el trasllat molt aviat per telèfon o WhatsApp.", otra: "Fer una altra reserva",
      revisa: "Revisa les dades marcades", campo: "Revisa aquesta dada", pasado: "La recollida no pot ser en el passat",
      vuelta: "La tornada ha de ser després de l’anada", correo: "Escriu un correu vàlid",
      demasiados: "Massa reserves des d’aquesta connexió. Torna-ho a provar més tard.",
      completa: "Anada i tornada o un vehicle concret? Fes servir la reserva completa", frecuentes: "Destinacions freqüents",
      pronto: "Reserva amb almenys mitja hora d’antelació. Si és més urgent, truca’ns.",
      sinHueco: "A aquesta hora tenim tots els cotxes ocupats", sinHuecoTexto: "Escriu-nos o truca’ns i et buscarem una solució, o tria una altra hora.",
      whatsapp: "Escriure per WhatsApp", llamar: "Trucar a la central", igualmente: "Enviar la sol·licitud igualment", otraHora: "Triar una altra hora",
      mensajeWhatsApp: (d) => `Hola, vull un trasllat el ${d.dia} a les ${d.hora} de ${d.origen} a ${d.destino} (${d.pax} passatgers). Teniu disponibilitat?`,
      actualizada: "Hem actualitzat la web mentre reservaves. Recarrega la pàgina i torna-la a enviar.", recargar: "Recarregar la pàgina",
    },
    vehiculos: { sedan: "Berlina · fins a 3", minivan: "MiniVan · fins a 7", minivan_premium: "MiniVan Prèmium · fins a 8", microbus: "MicroBus · fins a 13", minibus: "MiniBus · fins a 19" },
    ventajas: {
      titulo: "Viatja tranquil",
      items: [
        { icono: "✈️", titulo: "Vigilem el teu vol", texto: "Si el vol s’endarrereix, ajustem la recollida a l’arribada real." },
        { icono: "💬", titulo: "Avís per WhatsApp", texto: "T’escrivim quan el conductor surt i t’enviem un enllaç per veure el cotxe al mapa." },
        { icono: "🚐", titulo: "Cotxe a la teva mida", texto: "D’1 a 19 passatgers, amb lloc per a les maletes." },
        { icono: "📍", titulo: "Conductors locals", texto: "Coneixem cada racó de la Costa Daurada." },
      ],
    },
    pie: { privacidad: "Privacitat", aviso: "Avís legal", lema: "TransferdeLuxe · Costa Daurada" },
    direccion: { buscando: "Cercant adreces…", buscandoMapa: "Cercant al mapa…", sugerencias: "Suggeriments d’adreça", usar: (t) => `Fer servir “${t}” tal com està`, sinPunto: "(sense punt al mapa)",
      voz: "ca-ES", dictar: "Dictar l’adreça", escuchando: "Escoltant… toca per acabar", permiso: "Permet el micròfon per dictar l’adreça.",
      noOido: "No t’he sentit. Toca el micròfon i torna-ho a provar.", otro: "No s’ha pogut dictar. Escriu-la, si us plau.",
      ubicacion: "Fer servir la meva ubicació", buscandoUbicacion: "Cercant on ets…", sinPermisoUbicacion: "Permet la ubicació al navegador per omplir l’adreça.",
      errorUbicacion: "No s’ha pogut saber on ets. Escriu l’adreça, si us plau." },
  },
  en: {
    meta: { titulo: "VIP transfers on the Costa Dorada · TransferdeLuxe", descripcion: "Book your private transfer in Salou, Cambrils, Tarragona, PortAventura and Reus and Barcelona airports." },
    nav: { reservar: "Book", profesionales: "Staff access", profesionalesSub: "Dispatch & drivers", idioma: "Language" },
    hero: {
      etiqueta: "VIP transfers · Costa Dorada",
      titulo: "Your private transfer to",
      destinos: ["PortAventura", "the airport", "Barcelona", "Salou", "Cambrils", "the train station"],
      subtitulo: "Professional driver, premium car and live tracking. Book in one minute.",
      sello: ["Reus & Barcelona airports", "1 to 19 passengers", "WhatsApp updates"],
    },
    form: {
      titulo: "Book your transfer", recogida: "Where do we pick you up?", recogidaAyuda: "Hotel, address or airport",
      destino: "Where are you going?", destinoAyuda: "Hotel, address or airport", dia: "Date", hora: "Time",
      pasajeros: "Passengers", maletas: "Suitcases", menos: "One less", mas: "One more", vehiculo: "Your vehicle",
      vuelo: "Flight number", vueloAyuda: "Optional · e.g. FR1234", nombre: "Full name", telefono: "Phone (WhatsApp)",
      email: "Email", notas: "Comments", notasAyuda: "Baby seat, special luggage… (optional)",
      privacidad: "I accept the", politica: "privacy policy", enviar: "Book now", enviando: "Sending…",
      ok: "Booking received!", okDetalle: "We will confirm your transfer very soon by phone or WhatsApp.", otra: "Make another booking",
      revisa: "Please check the highlighted fields", campo: "Please check this field", pasado: "The pick-up can't be in the past",
      vuelta: "The return must be after the outbound trip", correo: "Please enter a valid email",
      demasiados: "Too many bookings from this connection. Please try again later.",
      completa: "Return trip or a specific vehicle? Use the full booking form", frecuentes: "Popular destinations",
      pronto: "Book at least 30 minutes in advance. If it’s more urgent, please call us.",
      sinHueco: "All our cars are booked at that time", sinHuecoTexto: "Message or call us and we’ll find a solution, or choose another time.",
      whatsapp: "Message us on WhatsApp", llamar: "Call our office", igualmente: "Send the request anyway", otraHora: "Choose another time",
      mensajeWhatsApp: (d) => `Hello, I’d like a transfer on ${d.dia} at ${d.hora} from ${d.origen} to ${d.destino} (${d.pax} passengers). Do you have availability?`,
      actualizada: "We updated the website while you were booking. Please reload the page and send it again.", recargar: "Reload the page",
    },
    vehiculos: { sedan: "Sedan · up to 3", minivan: "MiniVan · up to 7", minivan_premium: "MiniVan Premium · up to 8", microbus: "MicroBus · up to 13", minibus: "MiniBus · up to 19" },
    ventajas: {
      titulo: "Travel with peace of mind",
      items: [
        { icono: "✈️", titulo: "We track your flight", texto: "If your flight is late, we move the pick-up to the real arrival time." },
        { icono: "💬", titulo: "WhatsApp updates", texto: "We message you when the driver sets off, with a link to follow the car on the map." },
        { icono: "🚐", titulo: "The right car", texto: "From 1 to 19 passengers, with room for your luggage." },
        { icono: "📍", titulo: "Local drivers", texto: "We know every corner of the Costa Dorada." },
      ],
    },
    pie: { privacidad: "Privacy", aviso: "Legal notice", lema: "TransferdeLuxe · Costa Dorada" },
    direccion: { buscando: "Searching addresses…", buscandoMapa: "Searching the map…", sugerencias: "Address suggestions", usar: (t) => `Use “${t}” as typed`, sinPunto: "(no map point)",
      voz: "en-GB", dictar: "Dictate the address", escuchando: "Listening… tap to finish", permiso: "Allow the microphone to dictate the address.",
      noOido: "I didn’t hear you. Tap the microphone and try again.", otro: "Dictation failed. Please type it.",
      ubicacion: "Use my location", buscandoUbicacion: "Finding where you are…", sinPermisoUbicacion: "Allow location in your browser to fill in the address.",
      errorUbicacion: "We couldn’t find your location. Please type the address." },
  },
};

/** Destinos frecuentes (lugares públicos) para rellenar el destino con un toque. */
export const DESTINOS_FRECUENTES: { nombre: Record<Idioma, string>; texto: string; lat: number; lng: number }[] = [
  { nombre: { es: "Aeropuerto de Reus", ca: "Aeroport de Reus", en: "Reus Airport" }, texto: "Aeropuerto de Reus (REU)", lat: 41.1474, lng: 1.1672 },
  { nombre: { es: "Aeropuerto de Barcelona", ca: "Aeroport de Barcelona", en: "Barcelona Airport" }, texto: "Aeropuerto de Barcelona-El Prat (BCN)", lat: 41.2974, lng: 2.0833 },
  { nombre: { es: "PortAventura", ca: "PortAventura", en: "PortAventura" }, texto: "PortAventura World · Salou", lat: 41.0879, lng: 1.1577 },
  { nombre: { es: "Estación AVE", ca: "Estació AVE", en: "High-speed station" }, texto: "Estación Camp de Tarragona (AVE)", lat: 41.1915, lng: 1.2728 },
  { nombre: { es: "Salou", ca: "Salou", en: "Salou" }, texto: "Salou centro", lat: 41.0763, lng: 1.1416 },
  { nombre: { es: "Cambrils", ca: "Cambrils", en: "Cambrils" }, texto: "Cambrils · Port", lat: 41.067, lng: 1.0597 },
  { nombre: { es: "Tarragona", ca: "Tarragona", en: "Tarragona" }, texto: "Tarragona · Rambla Nova", lat: 41.1189, lng: 1.2445 },
];

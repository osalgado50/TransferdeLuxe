/**
 * Datos de demostración para el panel en vivo (lógica pura): servicios de hoy y de mañana en todos los estados, con su
 * historial de eventos, una incidencia y posiciones de los coches, relativos a «ahora». Pensado para que un juez o
 * cualquiera que mire la app la encuentre funcionando. Clientes inventados, lugares públicos de la Costa Dorada.
 */
export interface ConductorDemo { id: string; nombre: string; vehiculoId: string | null }
export interface ServicioDemo {
  id: string; cliente_nombre: string; cliente_apellidos: string; cliente_email: string; cliente_telefono: string;
  origen_texto: string; origen_lat: number; origen_lng: number; destino_texto: string; destino_lat: number; destino_lng: number;
  fecha_hora_recogida: string; pasajeros: number; maletas: number; tipo_vehiculo_pedido: "sedan" | "minivan" | "minivan_premium";
  numero_vuelo: string | null; notas: string; origen_pedido: "web" | "manual"; estado: string; conductor_id: string | null;
  vehiculo_id: string | null; asignado_en: string | null; duracion_estimada_min: number; incidencia_vista: boolean; ultima_incidencia: string | null;
}
export interface EventoDemo { servicio_id: string; tipo: string; actor_id: string | null; motivo: string | null; creado_en: string }
export interface PosicionDemo { conductor_id: string; lat: number; lng: number; velocidad: number; registrado_en: string; simulada: true }
export interface IncidenciaDemo { conductor_id: string; servicio_id: string; tipo: "retraso"; descripcion: string; lat: number; lng: number; creado_en: string }
export interface Demo { servicios: ServicioDemo[]; eventos: EventoDemo[]; posiciones: PosicionDemo[]; incidencias: IncidenciaDemo[] }

export const NOTA_DEMO = "Datos de demostración";
const L = {
  reus: { t: "Aeropuerto de Reus (REU)", lat: 41.1474, lng: 1.1672 },
  bcn: { t: "Aeropuerto de Barcelona-El Prat (BCN)", lat: 41.2974, lng: 2.0833 },
  pa: { t: "PortAventura World · Salou", lat: 41.0879, lng: 1.1577 },
  ave: { t: "Estación Camp de Tarragona (AVE)", lat: 41.1915, lng: 1.2728 },
  salou: { t: "Salou · Plaça d’Europa", lat: 41.0764, lng: 1.1416 },
  cambrils: { t: "Cambrils · Port", lat: 41.067, lng: 1.0597 },
  tgn: { t: "Tarragona · Rambla Nova", lat: 41.1189, lng: 1.2445 },
  pineda: { t: "La Pineda · Passeig de Pau Casals", lat: 41.0753, lng: 1.182 },
  miami: { t: "Miami Platja · centro", lat: 41.0028, lng: 0.9853 },
};
type Lugar = (typeof L)[keyof typeof L];
const CLIENTES = [
  ["Lucía", "Ferrer Vidal"], ["Hugo", "Martín Soler"], ["Emma", "Roca Puig"], ["Daniel", "Serra Costa"], ["Paula", "Gil Navarro"],
  ["Marta", "Pons Ribas"], ["Pablo", "Vila Mas"], ["Irene", "Castells Font"], ["Álex", "Prats Camps"], ["Clara", "Mir Sala"],
  ["Jorge", "Bosch Pujol"], ["Sara", "Llorens Vives"], ["Nil", "Esteve Valls"], ["Laura", "Ortega Rius"], ["Grupo", "Nordic Travel"],
];
const MIN = 60_000;
const entre = (a: Lugar, b: Lugar, f: number) => ({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });

/** Escenario de demo relativo a `ahora`. `nuevoId` permite ids deterministas en los tests. */
export function construirDemo(ahora: Date, conductores: ConductorDemo[], nuevoId: () => string = () => crypto.randomUUID()): Demo {
  const t = ahora.getTime();
  const iso = (ms: number) => new Date(ms).toISOString();
  const c = (i: number) => (conductores.length ? conductores[i % conductores.length] : null);
  const servicios: ServicioDemo[] = [], eventos: EventoDemo[] = [], posiciones: PosicionDemo[] = [], incidencias: IncidenciaDemo[] = [];
  let n = 0;
  const servicio = (o: Lugar, d: Lugar, recogida: number, dur: number, estado: string, cond: ConductorDemo | null,
    x: Partial<ServicioDemo> = {}, pasos: [string, number][] = []) => {
    // Sin conductores (base vacía): lo que necesitaría uno queda sin asignar, sin historial de pasos.
    if (!cond && ["completado", "recogido", "en_camino", "aceptado", "asignado"].includes(estado)) { estado = "pendiente"; pasos = []; x = { ...x, asignado_en: null }; }
    const [nombre, apellidos] = CLIENTES[n % CLIENTES.length];
    const id = nuevoId();
    n++;
    servicios.push({
      id, cliente_nombre: nombre, cliente_apellidos: apellidos, cliente_email: `cliente${n}@ejemplo.test`, cliente_telefono: `600000${String(200 + n)}`,
      origen_texto: o.t, origen_lat: o.lat, origen_lng: o.lng, destino_texto: d.t, destino_lat: d.lat, destino_lng: d.lng,
      fecha_hora_recogida: iso(recogida), pasajeros: 2 + (n % 3), maletas: 1 + (n % 3), tipo_vehiculo_pedido: n % 4 === 0 ? "minivan" : "sedan",
      numero_vuelo: null, notas: NOTA_DEMO, origen_pedido: "manual", estado, conductor_id: cond?.id ?? null, vehiculo_id: cond?.vehiculoId ?? null,
      asignado_en: null, duracion_estimada_min: dur, incidencia_vista: true, ultima_incidencia: null, ...x,
    });
    // Historial: «creado» y luego cada paso con su hora (siempre en orden).
    eventos.push({ servicio_id: id, tipo: "creado", actor_id: null, motivo: null, creado_en: iso(Math.min(recogida, t) - 24 * 60 * MIN) });
    for (const [tipo, cuando] of pasos) {
      const actor = tipo === "asignado" || tipo === "cancelado" ? null : cond?.id ?? null;
      eventos.push({ servicio_id: id, tipo, actor_id: actor, motivo: null, creado_en: iso(cuando) });
    }
    return id;
  };
  const completo = (r: number, dur: number): [string, number][] =>
    [["asignado", r - 20 * 60 * MIN], ["aceptado", r - 19 * 60 * MIN], ["en_camino", r - 25 * MIN], ["recogido", r + 2 * MIN], ["completado", r + dur * MIN]];

  // Esta mañana: ya hechos.
  servicio(L.reus, L.salou, t - 4 * 60 * MIN, 25, "completado", c(0), { asignado_en: iso(t - 24 * 60 * MIN), numero_vuelo: "FR2471" }, completo(t - 4 * 60 * MIN, 25));
  servicio(L.pa, L.bcn, t - 3 * 60 * MIN, 75, "completado", c(1), { asignado_en: iso(t - 24 * 60 * MIN), tipo_vehiculo_pedido: "minivan", pasajeros: 5 }, completo(t - 3 * 60 * MIN, 75));
  servicio(L.tgn, L.cambrils, t - 2 * 60 * MIN, 30, "cancelado", null, {}, [["cancelado", t - 3 * 60 * MIN]]);

  // Ahora mismo: uno con pasajeros y otro de camino a la recogida (con su coche en el mapa).
  const r1 = t - 20 * MIN;
  servicio(L.ave, L.pa, r1, 35, "recogido", c(0), { asignado_en: iso(t - 20 * 60 * MIN) },
    [["asignado", r1 - 20 * 60 * MIN], ["aceptado", r1 - 19 * 60 * MIN], ["en_camino", r1 - 25 * MIN], ["recogido", r1 + 2 * MIN]]);
  if (c(0)) posiciones.push({ conductor_id: c(0)!.id, ...entre(L.ave, L.pa, 0.45), velocidad: 62, registrado_en: iso(t), simulada: true });
  const r2 = t + 15 * MIN;
  const enCamino = servicio(L.cambrils, L.reus, r2, 25, "en_camino", c(1), { asignado_en: iso(t - 6 * 60 * MIN), numero_vuelo: "VY1342" },
    [["asignado", t - 6 * 60 * MIN], ["aceptado", t - 5 * 60 * MIN], ["en_camino", t - 10 * MIN]]);
  if (c(1)) {
    const p = entre(L.salou, L.cambrils, 0.7);
    posiciones.push({ conductor_id: c(1)!.id, ...p, velocidad: 48, registrado_en: iso(t), simulada: true });
    incidencias.push({ conductor_id: c(1)!.id, servicio_id: enCamino, tipo: "retraso", descripcion: "Tráfico denso en la N-340: llego unos 10 minutos tarde.", ...p, creado_en: iso(t - 4 * MIN) });
  }

  // Esta tarde: aceptados, uno esperando respuesta, una reserva web nueva y un rechazo para reasignar.
  servicio(L.salou, L.reus, t + 90 * MIN, 25, "aceptado", c(2), { asignado_en: iso(t - 3 * 60 * MIN) }, [["asignado", t - 3 * 60 * MIN], ["aceptado", t - 170 * MIN]]);
  servicio(L.pineda, L.bcn, t + 3 * 60 * MIN, 80, "aceptado", c(0), { asignado_en: iso(t - 2 * 60 * MIN), tipo_vehiculo_pedido: "minivan_premium", pasajeros: 6, maletas: 6 },
    [["asignado", t - 2 * 60 * MIN], ["aceptado", t - 110 * MIN]]);
  servicio(L.reus, L.miami, t + 2 * 60 * MIN, 40, "asignado", c(3), { asignado_en: iso(t - 2 * MIN), numero_vuelo: "LS1871" }, [["asignado", t - 2 * MIN]]);
  servicio(L.pa, L.ave, t + 4 * 60 * MIN, 30, "pendiente", null, { origen_pedido: "web" });
  servicio(L.cambrils, L.tgn, t + 150 * MIN, 30, "pendiente", null,
    { incidencia_vista: false, ultima_incidencia: "rechazado: No llego a tiempo desde Tarragona" },
    [["asignado", t - 60 * MIN], ["rechazado", t - 40 * MIN]]);

  // Mañana: pendientes para probar la asignación automática.
  const manana = t + 24 * 60 * MIN;
  for (const [o, d, h, dur] of [[L.salou, L.reus, -2, 25], [L.cambrils, L.bcn, -1, 75], [L.ave, L.pa, 0, 30], [L.reus, L.pineda, 1, 25], [L.tgn, L.salou, 2, 30]] as const) {
    servicio(o, d, manana + h * 60 * MIN, dur, "pendiente", null, { origen_pedido: h % 2 ? "web" : "manual" });
  }

  // El resto de conductores, aparcados en la base de Salou o en Cambrils (para que salgan en el mapa).
  conductores.slice(2).forEach((x, i) => {
    const { lat, lng } = i % 2 ? L.cambrils : L.salou;
    if (!posiciones.some((p) => p.conductor_id === x.id)) posiciones.push({ conductor_id: x.id, lat, lng, velocidad: 0, registrado_en: iso(t), simulada: true });
  });
  return { servicios, eventos, posiciones, incidencias };
}

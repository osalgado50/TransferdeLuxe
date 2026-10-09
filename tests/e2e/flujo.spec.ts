import { expect, test, type Browser } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const PASS = process.env.DEMO_PASSWORD!;

async function entrar(browser: Browser, email: string) {
  const ctx = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    geolocation: { latitude: 41.0763, longitude: 1.1416 },
    permissions: ["geolocation"],
  });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASS);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

test("reserva web → asignar → aceptar → en camino → carga → descarga", async ({ browser, page }) => {
  const cliente = `e2e-${Date.now()}`;
  // El límite de reservas es por IP y en memoria: cada ejecución usa una IP de prueba distinta.
  // Solo funciona porque en local no hay proxy: ipCliente toma la única entrada de x-forwarded-for, que aquí la fija el cliente.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}` });
  await page.goto("/reservar");
  await page.getByLabel("Dirección de recogida").fill("Aeropuerto de Reus");
  await page.getByText("Aeropuerto de Reus").first().click();
  await page.getByLabel("Dirección de destino").fill("PortAventura");
  await page.getByText("PortAventura World").first().click();
  // «Mañana» en hora de Madrid (no UTC: entre las 00:00 y las 02:00 locales difieren).
  const manana = new Date(Date.now() + 86400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  await page.getByLabel("Fecha de recogida").fill(manana);
  await page.getByLabel("Hora de recogida").fill("11:00");
  await page.getByLabel("Pasajeros").selectOption("3");
  await page.getByLabel("Nombre").fill(cliente);
  await page.getByLabel("Email").fill("e2e@ejemplo.test");
  await page.getByLabel("Teléfono").fill("600000999");
  await page.getByLabel(/política de privacidad/).check();
  await page.getByRole("button", { name: "Reservar" }).click();
  await expect(page.getByText("¡Reserva recibida!")).toBeVisible();

  const central = await entrar(browser, "central@transferdeluxe.test");
  await expect(central.getByText(cliente).first()).toBeVisible();
  const alerta = central.locator("article[data-alerta]").filter({ hasText: cliente });
  await alerta.getByRole("button", { name: "Asignar", exact: true }).click();
  await central.getByRole("button", { name: /^Asignar a / }).first().click();
  await expect(central.getByRole("dialog")).toBeHidden();
  await central.goto(`/central/servicios?fecha=${manana}`);
  await central.getByRole("row").filter({ hasText: cliente }).getByRole("link", { name: /Ver/ }).click();
  await central.waitForURL(/\/central\/servicios\/[0-9a-f-]{36}$/);
  await expect(central.getByText("Esperando respuesta").first()).toBeVisible();
  const servicioId = central.url().split("/").pop()!;
  const asignado = (await central.getByTestId("conductor-asignado").textContent())!;
  const n = ({ "Marc Demo": 1, "Laia Demo": 2, "Jordi Demo": 3 } as Record<string, number>)[asignado.trim()]!;
  expect(n).toBeTruthy();

  const movil = await entrar(browser, `conductor${n}@transferdeluxe.test`);
  // El conductor puede tener más servicios nuevos sembrados: se aceptan en cola hasta llegar al nuestro.
  const dialogo = movil.getByRole("dialog", { name: "Servicio nuevo" });
  await expect(dialogo).toBeVisible();
  for (let i = 0; i < 6 && !(await dialogo.getByText(/PortAventura/).isVisible()); i++) {
    const previo = await dialogo.innerText();
    await dialogo.getByRole("button", { name: "ACEPTAR" }).click();
    await expect.poll(async () => (await dialogo.isVisible()) ? await dialogo.innerText() : "", { timeout: 15_000 }).not.toBe(previo);
  }
  await expect(dialogo.getByText(/PortAventura/)).toBeVisible();
  await dialogo.getByRole("button", { name: "ACEPTAR" }).click();
  await expect(dialogo).toBeHidden();
  // La reserva es de mañana: se llega a ella desde «Próximos días».
  await movil.goto("/conductor");
  await expect(movil.getByRole("heading", { name: "Próximos días" })).toBeVisible();
  await movil.locator(`a[href="/conductor/servicio/${servicioId}"]`).click();
  await movil.waitForURL(`**/conductor/servicio/${servicioId}`);
  for (const paso of ["Salgo hacia la recogida", "CARGA – pasajeros a bordo", "DESCARGA – servicio terminado"]) {
    const boton = movil.getByRole("button", { name: paso });
    await expect(boton).toBeEnabled();
    await boton.click();
  }
  await expect(movil.getByText("¡Servicio terminado!")).toBeVisible();
  // El conductor ve el paso de forma optimista; la cola sincroniza con el servidor en segundo plano.
  await expect(async () => {
    await central.reload();
    await expect(central.getByText("Completado").first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
});

test("rechazo vuelve a la central con alerta", async ({ browser }) => {
  const central = await entrar(browser, "central@transferdeluxe.test");
  await central.goto("/central/servicios?estado=pendiente");
  await central.getByRole("link", { name: /Ver/ }).first().click();
  await central.getByRole("button", { name: "Asignar", exact: true }).click();
  await central
    .getByTestId("tarjeta-conductor-Jordi Demo")
    .getByRole("button", { name: /Asignar/ })
    .click();
  const confirmar = central.getByRole("button", { name: /confirmar/i });
  if (await confirmar.isVisible({ timeout: 1000 }).catch(() => false)) await confirmar.click();
  await expect(central.getByText("Esperando respuesta").first()).toBeVisible();
  const movil = await entrar(browser, "conductor3@transferdeluxe.test");
  await movil.getByRole("button", { name: "Rechazar" }).click();
  await movil.getByRole("button", { name: "Avería" }).click();
  await expect(movil.getByRole("button", { name: "Rechazar" })).toBeHidden();
  await expect(async () => {
    await central.goto("/central");
    await expect(central.getByText(/Rechazado por Jordi Demo: Avería/)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
});

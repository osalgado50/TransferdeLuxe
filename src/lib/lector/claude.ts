import Anthropic from "@anthropic-ai/sdk";
import { parsearRespuesta } from "./parsear";
import type { DatosTicket, ImagenTicket, LectorTicket } from "./tipos";

export const MODELO_LECTOR = "claude-haiku-5-5";

const INSTRUCCIONES = `Eres un lector de tickets de gasolinera españoles. Devuelve SOLO un objeto JSON con:
fecha (YYYY-MM-DD), gasolinera (nombre de la estación), litros (número), precio_litro (número, €/L),
importe (número, total en €), tipo_combustible (p. ej. "Diésel", "Gasolina 95"), confianza ("alta"|"media"|"baja").
Usa null en cualquier campo que no puedas leer con seguridad. No añadas texto fuera del JSON.`;

export class ClaudeHaikuLector implements LectorTicket {
  constructor(private cliente: Anthropic = new Anthropic()) {}
  async leer(img: ImagenTicket): Promise<DatosTicket> {
    const r = await this.cliente.messages.create({
      model: MODELO_LECTOR,
      max_tokens: 400,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } },
        { type: "text", text: INSTRUCCIONES },
      ] }],
    });
    const texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return parsearRespuesta(texto);
  }
}

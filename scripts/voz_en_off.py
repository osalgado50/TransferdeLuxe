# Genera la voz en off de cada bloque con la voz «Mónica» (es_ES) de macOS. Grafías fonéticas para que los nombres
# en inglés suenen como los diría alguien de aquí (no a la inglesa ni deletreados).
import re, subprocess, sys, pathlib
guion = pathlib.Path("docs/GUION_VIDEO.md").read_text(encoding="utf-8")
sec = guion.split("### Texto de la voz en off")[1].split("## Plan de tomas")[0]
textos = [re.sub(r"\s+", " ", m).strip() for m in re.findall(r"^\d+\. «(.*?)»", sec, re.S | re.M)]
nombres = ["01_portada", "02_reserva", "03_panel", "04_asignacion", "05_conductor", "06_central_manda", "07_cliente", "08_ticket", "08b_jornada", "09_gestion", "10_cierre"]
assert len(textos) == 11, len(textos)
FONETICA = [("Claude Code", "Clod Cóud"), ("WhatsApp", "guásap"), ("commits", "cómits"), ("prompts", "prómts"), ("CIF", "cif"),
            ("Transfer de Luxe", "Tránsfer de Lux")]
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
total = 0.0
for n, t in zip(nombres, textos):
    for a, b in FONETICA: t = t.replace(a, b)
    # Pausas algo más largas tras punto y punto y coma (más natural que el ritmo por defecto).
    t = t.replace(". ", ". [[slnc 250]] ").replace("; ", "; [[slnc 150]] ").replace(": ", ": [[slnc 120]] ")
    aiff = out / f"{n}.aiff"; m4a = out / f"{n}.m4a"
    subprocess.run(["say", "-v", "Mónica", "-r", "168", "-o", str(aiff), t], check=True)
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac@44100", "-b", "96000", str(aiff), str(m4a)], check=True)
    aiff.unlink()
    d = float(re.search(r"estimated duration: ([\d.]+)", subprocess.run(["afinfo", str(m4a)], capture_output=True, text=True).stdout).group(1))
    total += d
    print(f"{n}: {d:5.1f} s")
print(f"TOTAL voz: {total:5.1f} s")

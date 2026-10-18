# Subtítulos del vídeo demo: el texto de la voz en off (docs/GUION_VIDEO.md) en frases cortas, sincronizado con las
# pausas reales de cada audio, quemado en blanco con borde negro en la parte inferior y también como .srt.
# Uso: python3 scripts/subtitular_video.py <vídeo sin subtítulos> <carpeta de bloques> <vídeo de salida>
import re, subprocess, sys, pathlib, tempfile
from PIL import Image, ImageDraw, ImageFont

ENTRADA, BLOQUES, SALIDA = map(pathlib.Path, sys.argv[1:4])
VOZ = pathlib.Path("docs/video/voz")
NOMBRES = ["01_portada", "02_reserva", "03_panel", "04_asignacion", "05_conductor", "06_central_manda", "07_cliente", "08_ticket",
           "09_gestion", "10_cierre"]
RETARDO = 0.6  # la voz empieza 0,6 s después de cada bloque (montaje_video.py)
W, H, MAX_W, MAX_CHARS = 1920, 1080, 1500, 86
FUENTE = ImageFont.truetype("/System/Library/Fonts/Avenir Next.ttc", 46, index=2)  # Demi Bold

guion = pathlib.Path("docs/GUION_VIDEO.md").read_text(encoding="utf-8")
sec = guion.split("### Texto de la voz en off")[1].split("## Plan de tomas")[0]
textos = [re.sub(r"\s+", " ", m).strip().replace("Transfer de Luxe", "TransferdeLuxe") for m in re.findall(r"^\d+\. «(.*?)»", sec, re.S | re.M)]
assert len(textos) == 10

def duracion(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True).stdout)

def pausas(p):
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(p), "-af", "silencedetect=n=-35dB:d=0.12", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    ini = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    fin = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    return [(a + b) / 2 for a, b in zip(ini, fin)]

def frases(t):
    """Trozos de como mucho MAX_CHARS, cortando en puntuación (donde la voz hace pausa)."""
    trozos = [x for x in re.split(r"(?<=[.,;:])\s+", t) if x]
    out, cur = [], ""
    for x in trozos:
        if cur and len(cur) + 1 + len(x) > MAX_CHARS: out.append(cur); cur = x
        else: cur = f"{cur} {x}".strip()
    if cur: out.append(cur)
    return out

def tiempos(cues, dur, gaps):
    total = sum(len(c) for c in cues); acum = 0; bordes = [0.0]; usados = set()
    for c in cues[:-1]:
        acum += len(c); est = dur * acum / total
        cand = [g for g in gaps if g > bordes[-1] + 0.8 and g not in usados]
        g = min(cand, key=lambda g: abs(g - est), default=None)
        if g is not None and abs(g - est) < 1.5: usados.add(g); bordes.append(g)
        else: bordes.append(est)
    bordes.append(dur + 0.4)
    return list(zip(bordes[:-1], bordes[1:]))

def lineas(t):
    pal, out, cur = t.split(), [], ""
    for p in pal:
        prueba = f"{cur} {p}".strip()
        if FUENTE.getlength(prueba) > MAX_W and cur: out.append(cur); cur = p
        else: cur = prueba
    out.append(cur); return out

def imagen(t, ruta):
    ls = lineas(t); alto = 60
    im = Image.new("RGBA", (W, alto * len(ls) + 20), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for i, l in enumerate(ls):
        x = (W - FUENTE.getlength(l)) / 2
        d.text((x, 6 + i * alto), l, font=FUENTE, fill="white", stroke_width=4, stroke_fill="black")
    im.save(ruta); return im.size[1]

inicio, subs = 0.0, []
for n, texto in zip(NOMBRES, textos):
    voz = VOZ / f"{n}.m4a"
    cues = frases(texto)
    for c, (a, b) in zip(cues, tiempos(cues, duracion(voz), pausas(voz))):
        subs.append((inicio + RETARDO + a, inicio + RETARDO + b, c))
    inicio += duracion(BLOQUES / f"{n}.mp4")

def srt_t(s):
    ms = round(s * 1000); return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"
SALIDA.with_suffix(".srt").write_text("".join(f"{i}\n{srt_t(a)} --> {srt_t(b)}\n{t}\n\n" for i, (a, b, t) in enumerate(subs, 1)),
                                      encoding="utf-8")

tmp = pathlib.Path(tempfile.mkdtemp())
args, fc, prev = ["ffmpeg", "-v", "error", "-y", "-i", str(ENTRADA)], "", "0:v"
for i, (a, b, t) in enumerate(subs, 1):
    h = imagen(t, tmp / f"{i}.png"); args += ["-i", str(tmp / f"{i}.png")]
    fc += f"[{prev}][{i}:v]overlay=0:{H - 38 - h}:enable='between(t,{a:.2f},{b:.2f})'[v{i}];"; prev = f"v{i}"
args += ["-filter_complex", fc.rstrip(";"), "-map", f"[{prev}]", "-map", "0:a", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
         "-c:a", "copy", "-movflags", "+faststart", str(SALIDA)]
subprocess.run(args, check=True)
print(f"{len(subs)} subtítulos → {SALIDA} y {SALIDA.with_suffix('.srt')}")

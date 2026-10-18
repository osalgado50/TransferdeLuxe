# Montaje del vídeo demo: cada bloque = tramos de su toma (recortados/acelerados) sobre un fondo con rótulo + su voz.
# Uso: python3 scripts/montaje_video.py <carpeta_salida> [bloques…]; después, concatenar los bloques (ver DOCUMENTACION_TECNICA).
import subprocess, sys, pathlib
from PIL import Image, ImageDraw, ImageFont

REPO = pathlib.Path("/Users/mac2019/dev/TransferdeLuxe")
TOMAS = REPO / "docs/video/tomas"
VOZ = REPO / "docs/video/voz"
OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
SOLO = set(sys.argv[2:])  # bloques a renderizar (vacío = todos)

W, H, TOP = 1920, 1080, 75
CH = H - TOP  # alto del contenido (1005)
IPAD = (round(CH * 4 / 3), CH)            # 1340x1005 (iPad en horizontal, 4:3)
MOVIL = (round(CH * 1206 / 2622) // 2 * 2, CH)  # 462x1005
F = "/System/Library/Fonts/Avenir Next.ttc"
def fuente(t, idx): return ImageFont.truetype(F, t, index=idx)
ORO, BLANCO, GRIS = (231, 183, 74), (240, 244, 250), (150, 166, 190)

def fondo(nombre, etiqueta, cajas, titulo=None, lineas=()):
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):  # degradado azul noche
        k = y / H
        d.line([(0, y), (W, y)], fill=(int(12 - 6 * k), int(18 - 10 * k), int(34 - 18 * k)))
    d.text((40, 20), "TransferdeLuxe", font=fuente(30, 1), fill=ORO)
    d.text((300, 24), etiqueta, font=fuente(26, 0), fill=GRIS)
    for (x, y, w, h) in cajas:
        d.rounded_rectangle([x - 5, y - 5 + 0, x + w + 4, min(H + 20, y + h + 4)], radius=16, fill=(31, 42, 68))
    if titulo:
        d.text((120, 330), titulo, font=fuente(66, 1), fill=BLANCO)
        for i, l in enumerate(lineas):
            d.text((120, 440 + i * 56), l, font=fuente(36, 0), fill=GRIS)
    p = OUT / f"fondo_{nombre}.png"; im.save(p); return p

# (nombre, layout, toma(s), tramos [(ini, fin, velocidad)], etiqueta, título y líneas para el móvil)
BLOQUES = [
    ("01_portada", "ipad", ["01_portada"], [(0, 9, 1), (20, 31, 1)], "1 · Una empresa de traslados de la Costa Dorada"),
    ("02_reserva", "movil", ["02_reserva"], [(0, 5, 1), (19, 25, 1), (220, 230, 2.5), (236, 258, 3), (258, 274, 2.5), (298, 305, 1)],
     "2 · Reserva del cliente", "Reserva desde el móvil", ["Castellano, catalán o inglés", "Recogida con su ubicación", "Sin coche libre: otras horas"]),
    ("03_panel", "ipad", ["03_panel"], [(0, 18, 1)], "3 · Centro de control en vivo"),
    ("04_asignacion", "ipad", ["04_asignacion"], [(2, 6, 1), (17, 22, 1), (47, 59, 1), (70, 76, 1)], "4 · Asignación automática"),
    ("05_conductor", "split", ["05_central", "05_movil"], [(2, 24, 1), (24, 60, 5), (60, 85, 5), (105, 125, 5), (150, 158, 2)],
     "5 · Central y app del conductor, en el mismo segundo"),
    ("06_central_manda", "ipad", ["06_central"], [(2, 5, 1), (25, 34, 2), (36, 56, 4), (66, 84, 3), (88, 100, 2), (106, 120, 2.5), (124, 130, 1)],
     "6 · La central lo controla todo"),
    ("07_cliente", "movil", ["07_cliente"], [(26, 35, 1), (80, 94, 1)],
     "7 · Cliente informado", "Seguimiento en directo", ["Aviso por WhatsApp con un toque", "El cliente ve el coche y la hora"]),
    ("08_ticket", "movil", ["08_ticket"], [(4, 7, 1), (30, 34, 1), (37, 47, 1), (55, 62, 1)],
     "8 · Tickets de combustible", "Tickets por OCR", ["Foto del ticket y datos rellenos", "Precio comparado con el Ministerio"]),
    ("09_gestion", "ipad", ["09_gestion"], [(4, 12, 1), (22, 26, 1), (28, 33, 1), (35, 41, 1), (64, 68.7, 1)],
     "9 · Jornadas, horarios, informes y flota"),
    ("10_cierre", "ipad", ["10_cierre"], [(0, 5, 1), (10, 15, 1), (19, 22, 1), (25, 30, 1), (33, 40, 1)],
     "10 · Hecho con Claude Code"),
]

def dur(tramos): return sum((b - a) / v for a, b, v in tramos)

def cadena(entrada, tramos, rot, size, tag):
    n = len(tramos)
    s = f"[{entrada}:v]fps=30,split={n}" + "".join(f"[{tag}r{i}]" for i in range(n)) + ";"
    for i, (a, b, v) in enumerate(tramos):
        s += f"[{tag}r{i}]trim=start={a}:end={b},setpts=(PTS-STARTPTS)/{v},fps=30[{tag}t{i}];"
    s += "".join(f"[{tag}t{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0"
    s += (",transpose=2" if rot else "") + f",scale={size[0]}:{size[1]}:flags=lanczos,setsar=1[{tag}];"
    return s

def render(b):
    nombre, lay, tomas, tramos, etiq = b[:5]
    D = round(dur(tramos), 2)
    if lay == "ipad":
        pos = [((W - IPAD[0]) // 2, TOP)]; cajas = [(pos[0][0], TOP, *IPAD)]
        bg = fondo(nombre, etiq, cajas)
    elif lay == "movil":
        pos = [(1240, TOP)]; cajas = [(1240, TOP, *MOVIL)]
        bg = fondo(nombre, etiq, cajas, b[5], b[6])
    else:
        pos = [(40, TOP), (W - 40 - MOVIL[0], TOP)]
        cajas = [(40, TOP, *IPAD), (W - 40 - MOVIL[0], TOP, *MOVIL)]
        bg = fondo(nombre, etiq, cajas)
    args = ["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "30", "-t", str(D), "-i", str(bg)]
    for t in tomas: args += ["-i", str(TOMAS / f"{t}_bruto.mp4")]
    args += ["-i", str(VOZ / f"{nombre}.m4a")]
    fc = ""
    for i, t in enumerate(tomas):
        rot = lay == "ipad" or (lay == "split" and i == 0)
        fc += cadena(i + 1, tramos, rot, IPAD if rot else MOVIL, f"c{i}")
    prev = "0:v"
    for i, (x, y) in enumerate(pos):
        fc += f"[{prev}][c{i}]overlay={x}:{y}:eof_action=repeat[o{i}];"; prev = f"o{i}"
    fc += f"[{prev}]trim=duration={D},fade=t=in:st=0:d=0.3,fade=t=out:st={D - 0.3}:d=0.3,format=yuv420p[v];"
    a = len(tomas) + 1
    fc += f"[{a}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay=600|600,apad,atrim=0:{D}[a]"
    args += ["-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
             "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(OUT / f"{nombre}.mp4")]
    subprocess.run(args, check=True)
    print(f"{nombre}: {D:.1f} s")

def final():
    im = Image.new("RGB", (W, H), (7, 10, 20)); d = ImageDraw.Draw(im)
    def centro(t, f, y, c):
        w = d.textlength(t, font=f); d.text(((W - w) / 2, y), t, font=f, fill=c)
    centro("TransferdeLuxe", fuente(110, 1), 330, ORO)
    centro("app.transfersvipluxe.com", fuente(48, 0), 500, BLANCO)
    centro("Hackathon de Vibe Coding · Big School · Hecho con Claude Code", fuente(36, 0), 600, GRIS)
    centro("Marca y datos ficticios, solo para la demostración", fuente(28, 0), 700, GRIS)
    p = OUT / "fondo_final.png"; im.save(p)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "30", "-t", "4", "-i", str(p), "-f", "lavfi", "-t", "4",
                    "-i", "anullsrc=r=48000:cl=stereo", "-vf", "fade=t=in:st=0:d=0.4,fade=t=out:st=3.4:d=0.6,format=yuv420p",
                    "-r", "30", "-c:v", "libx264", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-shortest", str(OUT / "11_final.mp4")], check=True)

for b in BLOQUES:
    if not SOLO or b[0][:2] in SOLO: render(b)
if not SOLO or "11" in SOLO: final()
print("TOTAL previsto:", round(sum(dur(b[3]) for b in BLOQUES) + 4, 1), "s")

# Presentación del vídeo demo: el autor (vídeo vertical del móvil, recortado con la máscara de personas de Vision) sobre
# un fondo de oficina, con subtítulos como el resto del vídeo; al final, fundido y empieza el vídeo demo.
# Uso: python3 scripts/intro_video.py <persona.mp4> <mascara.mp4> <audio original> <fondo> <subtítulos.srt> <vídeo demo> <salida>
import re, subprocess, sys, pathlib, tempfile
from PIL import Image, ImageDraw, ImageFont, ImageFilter

PERSONA, MASCARA, AUDIO, FONDO, SRT, DEMO, SALIDA = map(pathlib.Path, sys.argv[1:8])
W, H = 1920, 1080
PW, PH = 608, 1080            # persona escalada a toda la altura
PX = 380                      # a la izquierda del centro: el portátil de la derecha sigue a la vista
FADE = 1.0
FUENTE = ImageFont.truetype("/System/Library/Fonts/Avenir Next.ttc", 46, index=2)
tmp = pathlib.Path(tempfile.mkdtemp())

def dur(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True).stdout)

# Fondo: recorte 16:9 a 1920×1080 con un desenfoque suave (profundidad de campo: la persona queda nítida delante).
im = Image.open(FONDO).convert("RGB")
esc = W / im.width
im = im.resize((W, round(im.height * esc)), Image.LANCZOS)
y0 = (im.height - H) // 2
im = im.crop((0, y0, W, y0 + H)).filter(ImageFilter.GaussianBlur(2.2))
im.save(tmp / "fondo.png")

def seg(t):
    h, m, s = t.replace(",", ".").split(":"); return int(h) * 3600 + int(m) * 60 + float(s)
subs = [(seg(a), seg(b), " ".join(t.split())) for a, b, t in
        re.findall(r"\d+\n([\d:,]+) --> ([\d:,]+)\n(.+?)(?:\n\n|\Z)", SRT.read_text(encoding="utf-8"), re.S)]

def lineas(t, maxw=1500):
    out, cur = [], ""
    for p in t.split():
        pr = f"{cur} {p}".strip()
        if FUENTE.getlength(pr) > maxw and cur: out.append(cur); cur = p
        else: cur = pr
    return out + [cur]

D = dur(PERSONA)
args = ["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "30", "-t", f"{D}", "-i", str(tmp / "fondo.png"),
        "-i", str(PERSONA), "-i", str(MASCARA), "-i", str(AUDIO)]
# Máscara: suavizado del borde y desvanecido en los laterales y abajo (los hombros tocan el borde del vídeo del móvil).
fc = ("[2:v]format=gray,gblur=sigma=1.5,geq=lum='lum(X,Y)*min(1,min(X,W-1-X)/60)*min(1,(H-1-Y)/40)',"
      f"scale={PW}:{PH}[m];[1:v]scale={PW}:{PH},format=yuva420p[p];[p][m]alphamerge[pa];"
      f"[0:v][pa]overlay={PX}:0[v0];")
prev = "v0"
for i, (a, b, t) in enumerate(subs, 1):
    ls = lineas(t)
    img = Image.new("RGBA", (W, 60 * len(ls) + 20), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    for k, l in enumerate(ls):
        d.text(((W - FUENTE.getlength(l)) / 2, 6 + k * 60), l, font=FUENTE, fill="white", stroke_width=4, stroke_fill="black")
    img.save(tmp / f"s{i}.png"); args += ["-i", str(tmp / f"s{i}.png")]
    fc += f"[{prev}][{3 + i}:v]overlay=0:{H - 38 - img.height}:enable='between(t,{a:.2f},{b:.2f})'[v{i}];"; prev = f"v{i}"
fc += f"[{prev}]fade=t=in:st=0:d=0.5,fade=t=out:st={D - FADE}:d={FADE},format=yuv420p,fps=30[vi];"
fc += (f"[3:a:0]aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.2,afade=t=out:st={D - FADE}:d={FADE},"
       f"atrim=0:{D},aformat=channel_layouts=stereo[ai];")
n = 4 + len(subs)
args += ["-i", str(DEMO)]
fc += f"[{n}:v]fps=30,format=yuv420p,setsar=1[vd];[{n}:a]aresample=48000,aformat=channel_layouts=stereo[ad];"
fc += "[vi][ai][vd][ad]concat=n=2:v=1:a=1[v][a]"
args += ["-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
         "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(SALIDA)]
subprocess.run(args, check=True)
print(f"presentación {D:.1f} s + demo → {SALIDA}")

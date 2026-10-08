#!/usr/bin/env python3
# ORKAV Quick Start Guide — PDF generator (no external libs, raw PDF)
# Colori interfaccia Orkav

import zlib

BG      = (0.0, 0.0, 0.0)        # nero
GREEN   = (0.29, 0.87, 0.50)     # #4ade80
PURPLE  = (0.70, 0.61, 1.0)      # #b39dff
ORANGE  = (1.0, 0.71, 0.27)      # #ffb545
RED     = (1.0, 0.30, 0.30)      # #ff4d4d
PINK    = (1.0, 0.06, 0.94)      # #ff10f0
WHITE   = (0.92, 0.92, 0.92)
DIM     = (0.45, 0.45, 0.45)

W, H = 595, 842  # A4

def esc(t):
    return t.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

class PDF:
    def __init__(self):
        self.ops = []
    def rect(self, x, y, w, h, color):
        r, g, b = color
        self.ops.append(f"{r} {g} {b} rg {x} {y} {w} {h} re f")
    def text(self, x, y, size, color, t, font='F1'):
        r, g, b = color
        self.ops.append(f"BT {r} {g} {b} rg /{font} {size} Tf {x} {y} Td ({esc(t)}) Tj ET")
    def line(self, x1, y1, x2, y2, color, w=1):
        r, g, b = color
        self.ops.append(f"{r} {g} {b} RG {w} w {x1} {y1} m {x2} {y2} l S")

# Ogni pagina ha il proprio stream di operatori
pages = []
page = PDF()
pages.append(page)
# Sfondo nero
page.rect(0, 0, W, H, BG)
# Header
page.rect(0, H-70, W, 70, (0.04, 0.04, 0.04))
page.text(40, H-48, 30, PINK, "ORKAV", 'F2')
page.text(165, H-45, 11, GREEN, "QUICK START GUIDE", 'F2')
page.text(165, H-60, 8, DIM, "orcav audiovisual livecoding — fork of ORCA")
page.line(40, H-75, W-40, H-75, PURPLE, 1)

y = H - 105
# piccolo margine inferiore oltre il quale si passa a pagina 2
PAGE_BREAK = 78

def new_page():
    global page, y
    page = PDF()
    pages.append(page)
    page.rect(0, 0, W, H, BG)
    page.rect(0, H-40, W, 40, (0.04, 0.04, 0.04))
    page.text(40, H-26, 10, GREEN, "ORKAV — QUICK START GUIDE (continua)", 'F2')
    page.line(40, H-45, W-40, H-45, PURPLE, 1)
    y = H - 70

def section(title):
    global y
    if y < PAGE_BREAK + 40:
        new_page()
    page.text(40, y, 13, ORANGE, title, 'F2')
    y -= 7
    page.line(40, y, 200, y, ORANGE, 0.5)
    y -= 15

def row(key, desc, kcolor=GREEN):
    global y
    if y < PAGE_BREAK:
        new_page()
    page.text(48, y, 9, kcolor, key, 'F2')
    page.text(190, y, 9, WHITE, desc, 'F1')
    y -= 14

def gap(n=6):
    global y
    y -= n

# === AVVIO ===
section("AVVIO")
row("npm start", "da Orkav/desktop — apre app + DevTools")
row("Mic", "consenti microfono (senza: bande simulate dal beat)")
row("Webcam", "consenti fotocamera per face tracking + maschere")
row("MIDI", "collega controller prima dell'avvio, tutti i canali attivi")
gap()

# === SHADER FX ===
section("SHADER FX — Alt + tasto (default 400.400)")
row("Alt+V", "prompt: fx:nome.rand.drive  es. fx:datamosh.400.400")
row("Alt+T", "brokentv — TV rotta anni 90")
row("Alt+D", "datamosh — compression artifacts")
row("Alt+J", "glitch digitale")
row("Alt+K", "ameba — linee verticali che slittano su X")
row("Alt+R", "fractal — Mandelbrot audio-reattivo")
row("Alt+S", "displace")
row("Alt+N", "chromawarp")
row("Alt+Q", "fracture")
row("Alt+L", "glow — bagliore neon")
row("Alt+F", "freezeloop — blocchi congelati in loop di pixel", PURPLE)
row("Alt+E", "bubble — bolle iridescenti shiny glow", PURPLE)
row("fx: vuoto", "spegne la chain", RED)
gap()

# === CAMERA / FACE / 3D ===
section("CAMERA · FACE TRACKING · 3D")
row("Alt+Z", "webcam come feed (attiva anche la maschera viso)")
row("Alt+H", "maschera emoji sul viso (468 landmark MediaPipe)")
row("", "— bocca/occhi/testa/rotazione pilotano gli shader")
row("Alt+P", "modello 3D — segue il tag corrente, nessun setup", GREEN)
row("", "— Poly Haven: 520+ modelli CC0, API pubblica senza token")
row("", "— opzionale Thingiverse: tvtoken:<TOKEN> (serve approvazione)")
row("", "— formati GLB/glTF, STL, OBJ, deformazione audio-reattiva")
row("", "— vaga per tutto lo schermo (non resta al centro)")
row("Alt+M", "aggiungi un altro modello (multi-oggetto)")
row("Alt+Shift+P", "cerca modello: digita un termine + Enter")
row("Alt+C", "GLOSSY / chrome on/off (riflessi lucidi)")
row("Alt+Shift+C", "svuota tutti i modelli")
gap()

# === TOTAL GLITCH ===
section("TOTAL GLITCH & PANICO")
row("Alt+Shift+X", "TOTAL GLITCH — distrugge feed + patch + terminale", RED)
row("", "— BPM random 0-999 molto veloce + scritta PANICO multilingua")
row("Esc", "esce dal glitch e ripristina tutto")
row("Alt+Shift+X", "di nuovo: esce anche lui")
gap()

# === CONTENUTO VISIVO ===
section("CONTENUTO VISIVO (il feed degli shader)")
row("Alt+B", "background random dal tag corrente")
row("Alt+G", "stormo GIF boids")
row("Alt+W", "big text overlay (max 4) — auto-fit + font dafont", PINK)
row("", "— resta ~300ms/carattere (min 6s) per leggerlo tutto")
row("", "— moto casuale: tutto intero / corre in orizzontale")
row("", "  / entra da sopra o sotto / diagonale / ibrido")
row("Cmd+Shift+T", "cambia tag")
row("Cmd+W", "aggiungi tag e cerca subito immagini + GIF")
gap()

# === MIDI ===
section("MIDI — tutti i canali in ascolto")
row("nota ON", "bg: cambia img/video | gif: swarm | bigtext: scritta")
row("velocity", "dimensione bg / scala gif / flicker testo")
row("score Orca", "ogni nota generata = flash visivo sincronizzato", PINK)
row("midi:<n>", "seleziona output device (mididevices li elenca)", GREEN)
row("midi:-1", "azzera la selezione output")
gap()

# === LINK / BPM ===
section("LINK / BPM / DISPLAY")
row("BPM rosso", "play attivo — Orkav sta mandando il sync Link", RED)
row(">  lampeggia", "batte col sequencer (=/+ alternati)")
row("P<n> verde", "peer Ableton Link collegati")
row("C:/G:", "carico CPU/GPU + FPS + temperatura nel monitor")
row("| 3D props", "caricamento in corso (rete/3D) — sparisce da solo")
gap()

# === SEQUENCER ===
section("SEQUENCER (essenziale ORCA)")
row("Space", "play / pausa")
row("Cmd+K", "commander (bpm:140, play, stop, find:)")
row("Cmd+G", "guida operatori + lista comandi a schermo")
row("Cmd+L", "carica moduli .orca multipli (inject:nome dal commander)")
row("Cmd+Enter", "fullscreen")
row("Cmd+S", "esporta patch .orca")
gap()

# === RETE / CACHE ===
section("RETE · CACHE · PREFETCH")
row("netstats", "contatori rete (ok/timeout/annullate) + stato cache", GREEN)
row("netcache", "svuota la cache su disco (indice Poly Haven)")
row("prefetch", "three.js + indice Poly Haven scaricati in background al boot")
row("", "— MediaPipe (3.8 MB) solo se la webcam e' gia' stata usata")
row("timeout", "ogni richiesta HTTP scade in 4-8 s: niente piu' blocchi")
row("video", "filtrati a max 12-15 MB, preferenza mp4 > webm > ogv")

# Footer (solo ultima pagina)
last = pages[-1]
last.line(40, 60, W-40, 60, PURPLE, 0.5)
last.text(40, 44, 8, DIM, "ORKAV — underground audiovisual engineering. fx:nome.rand.drive | rand = 3 parametri shader + 7 filtri spettrali | drive = audio capture")
last.text(40, 32, 8, PINK, "ALT+SHIFT+X quando tutto va in fiamme. Esc per uscirne. Sempre.")

# === BUILD PDF ===
objects = []
objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
kids = " ".join(f"{3 + i*3} 0 R" for i in range(len(pages)))
objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode())

font_objs = {}
for i in range(len(pages)):
    # page
    objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents {6 + i*3} 0 R >>".encode())
    # content stream
    content = "\n".join(pages[i].ops).encode('latin-1', 'replace')
    objects.append(b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream")

# Fonts (4, 5) — inseriti dopo le pagine, qui li appendo alla fine con rinumero
# NOTA: i riferimenti /F1 4 0 R e /F2 5 0 R devono puntare agli oggetti font.
# Li mettiamo come ultimi due oggetti.
# Ricostruiamo gli oggetti: catalog(1) pages(2) [per ogni pagina: page, content] font1 font2

# Ricalcolo pulito: oggetti nell'ordine corretto
objs = []
objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
objs.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode())
page_content_pairs = []
for i in range(len(pages)):
    content = "\n".join(pages[i].ops).encode('latin-1', 'replace')
    page_content_pairs.append(content)
# gli indici degli oggetti: catalog=1, pages=2, poi page_i = 3+2i, content_i = 4+2i, font1 = 3+2*n, font2 = 4+2*n
n = len(pages)
font1_idx = 3 + 2*n
font2_idx = 4 + 2*n
for i in range(n):
    objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 {font1_idx} 0 R /F2 {font2_idx} 0 R >> >> /Contents {4 + 2*i} 0 R >>".encode())
    objs.append(b"<< /Length " + str(len(page_content_pairs[i])).encode() + b" >>\nstream\n" + page_content_pairs[i] + b"\nendstream")
objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>")
objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>")

out = bytearray()
out += b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
offsets = []
for i, obj in enumerate(objs, 1):
    offsets.append(len(out))
    out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"

xref_pos = len(out)
out += f"xref\n0 {len(objs)+1}\n".encode()
out += b"0000000000 65535 f \n"
for off in offsets:
    out += f"{off:010d} 00000 n \n".encode()
out += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()

import os
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ORKAV-quickstart.pdf")
with open(path, 'wb') as f:
    f.write(bytes(out))
print("PDF creato:", path, len(out), "bytes, pagine:", len(pages))

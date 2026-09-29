# ORKAV — GLOSSARIO

Riferimento rapido di tutti i termini, gli effetti, i comandi e i tasti di Orkav.
(Per gli **operatori Orca** vedi la tabella in fondo o la guida in-app `Cmd+G`.)

---

## 1. Shader GLEngine

Si attivano con `Alt + tasto` (oppure `fx:nome.rand.drive` nel commander).
Ogni `*.frag` in `desktop/sources/shaders/` viene caricato automaticamente all'avvio.

| Nome | Tasto | Cosa fa |
|------|-------|---------|
| `brokentv` | `Alt+T` | TV rotta anni 90: scanline, sfasamento di quadro, rumore analogico |
| `datamosh` | `Alt+D` | artefatti di compressione: i blocchi si trascinano tra i frame |
| `glitch` | `Alt+J` | glitch digitale: slice orizzontali, RGB split, block displacement |
| `ameba` | `Alt+K` | **linee verticali che slittano sull'asse orizzontale** |
| `fractal` | `Alt+R` | Mandelbrot/Julia audio-reattivo |
| `displace` | `Alt+S` | displacement map: il feed spostato da una mappa di rumore |
| `chromawarp` | `Alt+N` | curvatura cromatica: le componenti RGB si curvano separatamente |
| `fracture` | `Alt+Q` | fratture: il frame si spezza in lastre |
| `glow` | `Alt+L` | bagliore neon con bloom |
| `freezeloop` | `Alt+F` | **congela parti dello schermo e le fa rottare in loop di pixel** |
| `bubble` | `Alt+E` | **bolle iridescenti lucide (shiny glow) con rifrazione** |
| `copy` | — | shader di servizio (pass-through usato dal motore) |

### `ameba` (Alt+K)
Il feed viene scomposto in **strisce verticali**. Ogni linea campiona l'immagine con un
proprio **offset orizzontale** = deriva continua (loop con `fract`) + oscillazione lenta +
spinta data da RMS/bassi. Velocità, verso e fase sono **indipendenti per linea** (hash).
Aggiunge RGB split proporzionale allo spostamento, micro-glow sul bordo di ogni linea e
scansione verticale. **Tutto il movimento vive sull'asse X**: nessuna caduta verticale.

### `freezeloop` (Alt+F)
1. Lo schermo è diviso in una **griglia di blocchi**.
2. Alcuni blocchi vengono **congelati** (selezione da hash + bassi + flash + drop).
3. I blocchi congelati smettono di leggere il feed live: campionano il **frame precedente**
   (`u_prev`) con una **rotazione attorno al centro del blocco** (twirl) e se lo rimandano
   indietro → **loop chiuso di pixel** che gira su se stesso.
4. Un **decadimento < 1** più una minima iniezione di frame live tengono il loop stabile
   (non satura a bianco, non muore a nero) e una leggera rotazione di tinta lo fa "girare".
5. Bordo luminoso sui blocchi ghiacciati, brina/vetro sopra, bagliore al centro del vortice.

### `bubble` (Alt+E)
Campo di bolle su celle con **centri jitterati** che vagano lentamente. Ogni bolla:
**rifrange** il feed come una lente sferica, ha **aberrrazione cromatica radiale**,
un **bordo iridescente thin-film** (`cos` a 3 fasi sull'angolo di incidenza),
un **highlight speculare** (il tocco "shiny") e un **alone glow** che si somma al feed.
Il raggio respira coi bassi; le alte fanno scintillare i bordi.

---

## 2. Contratto uniform degli shader

Disponibili in tutti gli shader (definiti nell'`HEAD` del GLEngine):

| Uniform | Contenuto |
|---------|-----------|
| `u_tex` | frame corrente in ingresso (il "feed") |
| `u_prev` | **frame precedente** → usalo per feedback/loop |
| `u_res` | risoluzione in pixel |
| `u_time` | beat corrente (da BPM) |
| `u_int` | **seed** (dal primo valore di `fx:nome.rand.drive`) |
| `u_pa` | bande audio **p0–p3** (7 filtri bandpass random sullo spettro) |
| `u_pb` | bande **p4–p6** in `.xyz`, **drive** audio capture in `.w` |
| `u_bass` `u_mid` `u_high` `u_vol` | aggregati audio |
| `u_flash` | transienti + **note dello score MIDI** + blink del viso |
| `u_drop` `u_dscroll` | stato "drop" (glitch ritmico) |
| `u_regime` `u_strobe` | regime BPM e strobe |
| `u_wave[16]` | profilo RMS temporale (16 finestre) |
| `u_face` | `(bocca aperta, occhio aperto, blink, blinkEdge)` |
| `u_face2` | `(posX viso, posY viso, roll, scala viso)` |

Helper disponibili: `hash`, `vnoise`, `fbm`, `hue`, `rot`, `ramp`, `dropUV`, `warp`,
`permute`, `cellular2x2x2`, `voronoi`.

Da scegliere `in vec2 v_uv;` e scrivere `FragColor`.

---

## 3. Tasti

### Effetti
| Tasto | Azione |
|-------|--------|
| `Alt+V` | prompt commander `fx:` |
| `Alt+T` / `Alt+D` / `Alt+J` / `Alt+K` / `Alt+R` / `Alt+S` / `Alt+N` / `Alt+Q` / `Alt+L` | shader: brokentv / datamosh / glitch / ameba / fractal / displace / chromawarp / fracture / glow |
| `Alt+F` / `Alt+E` | shader: freezeloop / bubble |
| `Alt+Shift+X` | **TOTAL GLITCH + scritta PANICO multilingua** (uscita: `Esc` o di nuovo) |
| `Esc` | reset totale |

### Contenuto visivo
| Tasto | Azione |
|-------|--------|
| `Alt+B` | background random dal tag corrente |
| `Alt+Shift+B` | background auto-cycle |
| `Alt+G` | stormo GIF (boids) |
| `Alt+W` | big text overlay |
| `Alt+Z` | webcam (attiva anche la maschera viso) |
| `Alt+H` | maschera emoji sul viso |
| `Alt+P` | modello 3D on/off (Poly Haven di default, Thingiverse se configurato) |
| `Alt+M` | 3D: **aggiunge** un altro modello (multi-oggetto, max 6) |
| `Alt+Shift+P` | 3D: prompt **[3D SEARCH]** — digita il termine e premi `Enter` |
| `Alt+C` | 3D: **GLOSSY / Chrome** on/off (riflessi lucidi) |
| `Alt+Shift+C` | 3D: svuota tutti i modelli |
| `Cmd+W` | aggiungi tag e cerca subito |
| `Cmd+Shift+T` | tag successivo |

### Sequencer (Orca)
| Tasto | Azione |
|-------|--------|
| `Space` | play / pausa |
| `Cmd+K` | commander |
| `Cmd+G` | guida operatori + comandi |
| `Cmd+J` | find |
| `Cmd+B` | inject modulo |
| `Cmd+L` | carica moduli `.orca` multipli |
| `Cmd+S` | esporta patch |
| `Cmd+Enter` | fullscreen |
| `>` `<` | velocità −/+ |
| `Cmd+>` `Cmd+<` | velocità 10× |
| `Cmd+Space` | play/pausa MIDI |
| `Cmd+,` `Cmd+.` | device MIDI input/output successivo |
| `Cmd+Shift+M` | refresh device MIDI |
| `[` `]` `{` `}` | griglia −/+ colonne e righe |
| `Tab` | retina on/off |
| `Cmd+0` / `Cmd+=` / `Cmd+-` | zoom reset / in / out |

---

## 4. Comandi del commander (`Cmd+K`)

| Comando | Effetto |
|---------|---------|
| `fx:nome.rand.drive` | attiva uno shader (es. `fx:datamosh.400.400`); catena con `+` (max 4); `fx:` vuoto spegne |
| `bpm:140` | imposta il BPM |
| `apm:160` | anima il BPM verso il valore |
| `play` / `stop` / `run` | trasporto |
| `frame:0` / `skip:2` / `rewind:2` | controllo frame |
| `midi:<n>` | seleziona il device MIDI di output (esclusivo); `midi:-1` azzera |
| `mididevices` | elenca device MIDI con indice |
| `tag:<nome>` | cambia il tag media corrente |
| `text:HELLO` | big text immediato |
| `ph:<query>` | **Poly Haven** (CC0, senza token): cerca e carica un modello |
| `phadd:<query>` | come `ph:` ma **aggiunge** invece di sostituire |
| `phlist:<query>` | elenca i modelli Poly Haven che matchano |
| `phclear` | svuota tutti i modelli 3D |
| `glossy:on` / `glossy:off` | effetto lucido sui modelli |
| `tv:<query>` | cerca su Thingiverse e carica un modello (serve il token) |
| `tvsearch:<query>` | elenca i risultati Thingiverse |
| `tvtoken:<TOKEN>` | salva il token API Thingiverse (si crea **da loggati** su `thingiverse.com/apps/create`) |
| `tvhelp` | ristampa in console le istruzioni per il token Thingiverse |
| `udp:1234` / `osc:1234` / `ip:127.0.0.1` | rete |
| `color:f00;0f0;00f` | ricolora l'interfaccia |
| `find:testo` / `select:x;y;w;h` / `write:H;x;y` | editing |
| `mods` | elenca i moduli `.orca` caricati |
| `inject:nome` | inietta un modulo caricato |

---

## 4b. Modelli 3D

**Sorgenti** provate in ordine: **Thingiverse** (solo con token) → **Poly Haven** (CC0, nessun token, default) → lista GLB Khronos di fallback.

| Termine | Significato |
|---------|-------------|
| **Poly Haven** | libreria CC0 (520+ modelli: props, natura, industria) con API pubblica e CORS aperto — funziona **senza configurazione** |
| **alias** | tabella tag Orkav → termini Poly Haven (es. `lucifer` → lighting, `cyberdeck` → electronics) |
| **glTF multi-file** | il `.gltf` di Poly Haven referenzia `.bin` + texture: vengono risolti con un `LoadingManager.setURLModifier` |
| **STL / OBJ** | formati tipici di Thingiverse, caricati con `STLLoader` / `OBJLoader` |
| **vagabondaggio** | il modello non resta al centro: due oscillatori non multipli lo fanno girare per tutto il frame |
| **multi-oggetto** | più modelli insieme (`Alt+M`, max 6): ognuno ha sfasamento, rotazione e deformazione proprie; la scala si riduce per non accavallarli |
| **glossy** | materiale `MeshPhysicalMaterial` (roughness 0.08, clearcoat 1.0, iridescenza) + environment map procedurale `RoomEnvironment` |
| **envMap** | mappa d'ambiente: senza di essa un materiale lucido non ha nulla da riflettere |
| **anti-ripetizione** | il selettore evita l'ultimo modello usato, così due `Alt+P` di fila danno modelli diversi |

---


I tag pilotano background, GIF e modelli 3D (`Cmd+Shift+T` per ciclare, `Cmd+W` per aggiungerne).

`pokemon`, `merda`, `1312`, `michale jackson`, `twin peaks`, `gatti`, `simpson`,
`rick and morty`, `the office`, `friends`, `south park`, `liminal space`, `horror vacui`,
`cyberfeminism`, `cyberdeck`, `hacktivism`, `hacker`, `matrix`, `red pill`, `blue pill`,
`sex workers`, `demons`, `lucifer`, `satan`, `esoterism`, `ai`, `ki`, `solar opposites`,
`brickleberry`, `futurama`

---

## 6. Big text

| Termine | Significato |
|---------|-------------|
| `oneshot` | la scritta compare **tutta intera e ferma** al centro |
| `run-x` | **corre** in orizzontale (destra o sinistra), su una fascia casuale |
| `run-y` | **entra da sopra o da sotto** e attraversa in verticale |
| `run-diag` | attraversa in **diagonale** (una delle 4 direzioni) |
| `hybrid` | **ibrido**: prima tutta intera e ferma (~35–60% della vita), poi corre via |
| auto-fit | il font viene rimpicciolito perché **tutto il testo entri** nella larghezza |
| durata | ~**300 ms per carattere** (minimo 3 s di lettura), da 6 s a 30 s; MIDI allunga fino a +50% |

Font (dafont, solo per i big text): `Ghastly Panic`, `Melted Monster`, `VCR OSD Mono`, `Nulshock`.

---

## 7. MIDI

| Canale | Destinazione | Nota → | Velocity → |
|--------|--------------|--------|-----------|
| 0–1 | Background | cambia immagine/video (tag) | dimensione 8–100% |
| 2–3 | GIF swarm | carica stormo | scala 0.3×–2.5× |
| 4–5 | Big Text | testo gigante da tag | durata/flicker |

Operatore `:` accetta un **6° parametro port**: `:canale.ottava.nota.vel.lunghezza.port`
(`-1` = usa il device selezionato, altrimenti indice esplicito).

---

## 8. Termini vari

| Termine | Significato |
|---------|-------------|
| **feed** | il piano intermedio (background + GIF + big text in corsa + 3D + maschera), su cui agiscono gli shader |
| **terminale / progEl** | il piano della patch Orca, **sempre leggibile** sopra il feed (tranne in Total Glitch) |
| **chain** | la catena di shader attivi (max 4) |
| **rand** | primo valore di `fx:` — seed: randomizza 3 parametri dello shader + riposiziona i 7 filtri spettrali |
| **drive** | secondo valore di `fx:` — sensibilità dell'audio capture (0–999 → 0–1) |
| **7 filtri** | 7 bandpass posizionati randomicamente sullo spettro logaritmico, con +6 dB/ottava sulle alte |
| **scoreFlash** | flash generato dalle note MIDI dello score Orca |
| **Total Glitch** | shader al massimo che distruggono feed **e** terminale, con BPM random 0–999 e scritta PANICO |
| **peer** | altro partecipante alla sessione Ableton Link (`P<n>` in verde) |
| **CABLES** | *rimosso*: le patch cables.gl non fanno più parte di Orkav |

---

## 9. Operatori Orca

`A` add · `B` subtract · `C` clock · `D` delay · `E` east · `F` if · `G` generator ·
`H` halt · `I` increment · `J` jumper · `K` konkat · `L` less · `M` multiply · `N` north ·
`O` read · `P` push · `Q` query · `R` random · `S` south · `T` track · `U` uclid ·
`V` variable · `W` west · `X` write · `Y` jymper · `Z` lerp · `*` bang · `#` comment

IO: `:` midi · `%` mono · `!` cc · `?` pb · `;` udp · `=` osc · `$` self

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
| `fracture` | `Alt+Q` | **vetro infranto**: shard Worley, rifrazione per-shard, dispersione cromatica, crepe e caustiche |
| `glow` | `Alt+L` | bagliore neon con bloom |
| `motionmosh` | `Alt+F` | **datamosh + glitch**: stima il movimento, trascina i pixel nel verso opposto (scia P-frame) e ci stratifica tearing, macroblocchi, RGB burst e databending |
| `bubble` | `Alt+E` | **schiuma di sapone**: Worley a 2 ottave, pellicole traslucide che deformano il feed |
| `copy` | — | shader di servizio (pass-through usato dal motore) |

### `ameba` (Alt+K)
Il feed viene scomposto in **strisce verticali**. Ogni linea campiona l'immagine con un
proprio **offset orizzontale** = deriva continua (loop con `fract`) + oscillazione lenta +
spinta data da RMS/bassi. Velocità, verso e fase sono **indipendenti per linea** (hash).
Aggiunge RGB split proporzionale allo spostamento, micro-glow sul bordo di ogni linea e
scansione verticale. **Tutto il movimento vive sull'asse X**: nessuna caduta verticale.

### `motionmosh` (Alt+F) — datamosh con stima del movimento
Sostituisce il vecchio `freezeloop`. È un **P-frame senza I-frame**: si stima dove
sta andando il contenuto e si trascinano i pixel **nel verso opposto**, lasciando la scia.

| Termine | Significato |
|---------|-------------|
| **stima del movimento** | griglia di blocchi; block-match brute force 5×5 con SAD su tap a croce fra `u_prev` e `u_tex`. Costo oltre soglia = blocco **disoccluso** |
| **flusso locale** | gradiente spaziale + differenza temporale: liscia il campo *sotto* il blocco |
| **scia** | `u_prev` campionato in direzione **opposta** al moto (`uv - mot*str`), con un secondo tap lungo per evitare bordi netti |
| **decadimento** | la persistenza è alta ma rientra sempre un po' di frame vivo: le scie si accumulano senza saturare a bianco né morire |
| **blocco congelato** | vettore forzato a 0: un'immagine ferma trascinata sopra uno sfondo che si muove |
| **vettore quantizzato** | spostamento arrotondato a passi grossi: è l'artefatto che si riconosce come "compressione" |
| **chroma trail** | R/B spostati lungo il vettore |

Mappatura audio: bassi = trascinamento + quota di blocchi congelati, mid = numero
di blocchi e raggio di ricerca, alti = chroma e grana, `u_flash` = kick casuale su
tutti i vettori, `u_drop` = saltello di campo, `regime` = quantizzazione, `drive` = forza master.

### `bubble` (Alt+E) — schiuma di sapone
Due ottave di **Worley** (`cellular2x2x2`) combinate in `min`: una massa di celle
piccole, non più poche bolle giganti. Il numero di celle è pilotato da due dei
parametri random (5–48 attraverso lo schermo).
1. L'**`F2-F1`** dell'ottava vincente disegna la **rete di bordi di Plateau**, dove
   tre celle si incontrano → giunzioni luminose e pellicole sottili.
2. Il **gradiente** del campo cellulare (differenze finite sulla stessa base ruotata)
   fa da **normale di superficie**: `u_tex` viene rifratto lungo di essa, con lente
   che cresce verso il bordo e **aberrrazione cromatica a 3 tap**.
3. Un `warp()` di **dominio** deforma tutto lo schermo: la schiuma "respira".
4. **Iridescenza thin-film** `0.5+0.5*cos(6.2831*(spessore+vec3(0,0.33,0.67)))`, con lo
   spessore legato alla geometria della cella: le bande di colore seguono le celle.
5. Il corpo della pellicola resta **traslucido** (il feed si vede attraverso, tinto e
   rifratto) con bordi bagnati, shimmer sulle alte, bloom sul flash, strobe e vignetta.

Mappatura audio: bassi = rigonfiamento celle, mid = densità e turbolenza, alti =
scintillio dei bordi, `u_flash` (+ bocca aperta) = pop/bloom, `u_drop` = scroll,
`drive` = forza della deformazione.

### `fracture` (Alt+Q) — vetro infranto
Shard **Worley irregolari** (ricerca 3×3 con jitter da `hash`), non una griglia.
Da `d1`/`d2` derivano bordo, bisello, glint speculare e bordo di Plateau.
1. Ogni shard ha **rifrazione propria**: offset dal suo hash + **rotazione attorno al
   proprio centro**.
2. **Dispersione cromatica**: R/G/B campionati a offset diversi con separazione che
   **cresce verso i bordi** (il vetro è più spesso lì) — è ciò che vende l'effetto vetro.
3. Una **seconda rete cellulare fine** (celle ×2.6) disegna **crepe capillari** con
   glow colorato via `hue()` e una **caustica** lungo le crepe.
4. **Profondità per shard**: parallasse su spinta e rifrazione; gli shard più lontani
   sono più scuri/desaturati.
5. Il tempo è **quantizzato** (`tk = floor(u_time*rate)`) e solo una frazione di shard
   "schizza" via ad ogni burst; **feedback breve** da `u_prev` per lo smear.

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
| `Alt+F` / `Alt+E` | shader: motionmosh / bubble |
| `Alt+Shift+T` | tag successivo **solo per i modelli 3D** |
| `Alt+Shift+X` | **TOTAL GLITCH + scritta PANICO multilingua** (uscita: `Esc` o di nuovo) |
| `Esc` | reset totale |

### Contenuto visivo
| Tasto | Azione |
|-------|--------|
| `Alt+B` | background random dal tag corrente |
| `Alt+Shift+B` | background auto-cycle |
| `Alt+G` / `Alt+Shift+G` | **aggiungi** stormo GIF (boids) / azzera tutti gli stormi |
| `Alt+W` | big text overlay |
| `Alt+Z` | webcam (attiva anche la maschera viso) |
| `Alt+H` | maschera emoji sul viso, **glitchata dal suo shader dedicato** |
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
| `midi:<n>` | **output multiplo**: aggiunge/toglie il device (toggle) |
| `midi:<n>!` | esclusiva: solo quel device |
| `midi:0,2` | selezione esatta |
| `midi:-1` | azzera la selezione |
| `midiclock:<n>` | stessa sintassi, ma per **clock/transport** (vuoto = tutti gli output) |
| `mididevices` | elenca device MIDI con indice |
| `tag:<nome>` | cambia il tag **globale** (bg + gif + 3D senza override) |
| `tagbg:` `taggif:` `tag3d:` `tagfont:` | tag **per canale** (vuoto = torna al globale) |
| `tags` | stampa i tag dei quattro canali |
| `tagrotate` / `tagrotate:<canale>` | toglie i pin e riattiva la rotazione dei tag |
| `swarms` | stato di stormi GIF e modelli 3D in scena |
| `swarmclear` | azzera tutti gli stormi |
| `swarmmax:<n>` | stormi massimi (1–8, default 4) |
| `models:<n>` | modelli 3D massimi (1–16, default 10) |
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
| `netstats` | contatori rete (`ok / timeout / annullate / errori / in corso`) e stato cache |
| `netcache` | svuota la cache di rete su disco |

---

## 4a. Tag: rotazione per canale e stormi multipli

| Termine | Significato |
|---------|-------------|
| **rotazione del tag** | ogni volta che si carica un elemento **nuovo** (stormo GIF o modello 3D) il tag di quel canale **avanza** nella lista: due stormi o tre modelli pescano sempre da ricerche diverse |
| **pin** | un override (`tag3d:matrix`, `taggif:lucifer`, …) **ferma** la rotazione di quel canale. Togliere l'override la riattiva |
| **`client.nextTagFor(kind)`** | avanza e restituisce il tag del canale; se il canale è pinnato restituisce il pin senza avanzare |
| **`client.resetTagRotation()`** | azzera i cursori: chiamato da `Cmd+Shift+T` e da `Cmd+W` |
| **stormo multiplo** | `background.swarms` è un array (max `maxSwarms`, default 4). Ogni stormo ha la sua GIF, il suo `<img>` nascosto, i suoi boid e la sua zona (slot) |
| **`crowd`** | con più stormi in scena le GIF rimpiccioliscono (`max(0.55, 1-(n-1)*0.12)`) per non accavallarsi |
| **`_dropSwarm(i)`** | rimuove uno stormo e libera il suo `<img>`; oltre il massimo esce sempre il più vecchio |
| **modelli 3D** | fino a 10 in scena (`maxModels`), regolabile con `models:<n>` |

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

## 4c. Rete, cache e prefetch

| Termine | Significato |
|---------|-------------|
| **`Net`** | wrapper unico di `fetch` nel renderer (`scripts/lib/net.js`): timeout, annullamento, cache, contatori |
| **canale** | nome logico di una richiesta (`bg-fetch`, `bg-http`, `ph-index`, `ph-files`, `tv`). `Net.begin(canale)` annulla la richiesta precedente dello stesso canale |
| **richiesta `quiet`** | richiesta di background (prefetch): non entra in `Net.busy()` né nell'indicatore di caricamento |
| **`Net.stale(canale, signal)`** | true se nel frattempo il canale è stato rilanciato: la risposta vecchia va ignorata invece di sovrascrivere quella nuova |
| **cache su disco** | `userData/orkav-cache/<chiave>.json`, scrittura atomica (tmp + rename) via IPC. `localStorage` su `file://` **non persiste** in Electron, quindi non basta |
| **TTL** | vita della cache: l'indice Poly Haven dura 7 giorni |
| **prefetch** | riscaldamento in background (`scripts/prefetch.js`): parte 2.5 s dopo il boot, una risorsa alla volta, solo in idle |
| **ordine del prefetch** | three.js+loader → indice Poly Haven → **MediaPipe** (bundle, wasm SIMD da 9.4 MB, modello) → **MaskFX** |
| **indicatore di caricamento** | `\| 3D props` / `/ net 2` a sinistra della telemetria di Orkav, sparisce dopo 10 s |

---

## 4c-bis. GIF, file locali e dialog nativo

| Termine | Significato |
|---------|-------------|
| **persistenza su disco** | `localStorage` su `file://` non viene mai scritto in Electron: chiave Giphy e cartella locale si salvano in `userData/orkav-cache` e si ripristinano con `Background.loadPersisted()` |
| **catena sorgenti GIF** | Giphy (~200px, veloce) → Commons per tag → Commons per **categoria** (`Category:Animated GIF files`, senza chiave) → frame procedurali |
| **filtro GIF** | max 2 MB / 900px, ordinamento per peso percepito (`byte + width*400`), scelta fra i più leggeri |
| **timeout GIF** | 8 s: se una GIF non arriva si passa alla sorgente successiva invece di restare fermi |
| **finestra modale** | `client.beginModal()` / `endModal()`: mentre è aperta, `update()` salta feed, shader e terminale e non pulisce il canvas |
| **`dialog:openFile`** | apertura file nel **processo main** (`dialog.showOpenDialog`). Il file viene letto lì: il renderer non può chiedere path arbitrari |
| **`dialog:saveFile` + `fs:writeChosen`** | salvataggio su un path scelto dall'utente tramite il dialogo nativo |

---

## 4d. Maschera facciale e shader dedicato

| Termine | Significato |
|---------|-------------|
| **MaskFX** | pipeline WebGL2 separata (`scripts/mask-fx.js`) che glitcha l'emoticon **prima** che finisca nel feed. 256×256 **con alpha**, così la maschera continua a ritagliare il viso |
| **`shaders/mask/glitch.frag`** | lo shader delle emoticon. Sta in una **sottocartella** apposta: la catena FX carica solo i `.frag` di primo livello, quindi non compare fra gli shader selezionabili |
| **slice displace** | bande orizzontali spostate a scatti, quantizzate nel tempo (`floor(u_time*rate)`) |
| **rim neon** | bordo luminoso ricavato dall'alpha, con hue che ruota |
| **seed per emoticon** | ogni swap chiama `reseed()`: ogni emoticon ha il **suo** pattern di glitch |
| **rasterizzazione on demand** | le 110 emoji restano **stringhe**; il canvas 256×256 si crea la prima volta che serve, con cache LRU di 24 (prima: 110 canvas 512×512 = ~115 MB in un solo frame) |

---

## 4e. Slot dello schermo

| Termine | Significato |
|---------|-------------|
| **slot** | una delle 12 zone **periferiche** di `client.slotList` (coordinate normalizzate). Serve a non impilare tutto al centro, dove sta la patch Orca |
| **`nextSlot()`** | restituisce la prossima zona a rotazione, con partenza casuale |
| **`resetSlots()`** | riparte da una zona casuale: chiamato da `Alt+P` |
| **chi li usa** | layer immagine, spawn dello stormo GIF, centro di oscillazione dei modelli 3D |

---

## 4f. Testo 3D, palette e font

| Termine | Significato |
|---------|-------------|
| **prospettiva per blocco** | il testo è diviso in max 6 blocchi, ognuno proiettato con la prospettiva del suo centro mentre la scritta ruota |
| **estrusione** | 8 strati dietro la faccia frontale, tinti della stessa famiglia di colore |
| **rotazione quantizzata** | 0.07 rad + intervallo minimo 110 ms fra rigenerazioni: il costo del render 3D è ammortizzato |
| **bloom a bassa risoluzione** | il glow: la faccia frontale è disegnata in un canvas 1/4 e upscalata col smoothing bilineare (che *è* il blur). NIENTE `shadowBlur`: in Skia è un blur CPU ed era la voce più cara del frame |
| **`lighter`** | blend additivo usato per il glow. `screen` costava 90 ms/frame |
| **`bigTextPalette`** | rosa shock · viola · verde fluo · petrolio. Solo tinte sgargianti |
| **font misurati** | 34 famiglie passate al benchmark; 4 tolte perché costavano 35–106 ms per rigenerazione (COLRv1/outline patched) |
| **CSS pigro** | `bigtext-fonts.css` (3.1 MB) non si carica all'avvio ma nel prefetch |

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

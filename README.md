# ORKAV

**Orkav** è un fork audiovisivo di **[ORCΛ](https://github.com/hundredrabbits/Orca)**: mantiene intatto il sequencer esoterico di Hundred Rabbits e ci costruisce sopra un motore visivo — **11 shader audio-reattivi**, **Ableton Link bidirezionale**, routing **MIDI** avanzato, **face tracking** (MediaPipe), **modelli 3D** (Poly Haven / Thingiverse), big text, tag media e **Total Glitch**.

- **Guida rapida**: [`ORKAV-quickstart.pdf`](ORKAV-quickstart.pdf) — **Glossario completo**: [`GLOSSARY.md`](GLOSSARY.md)
- **Avvio**: `cd desktop && npm install && npm start`
- Tutto quello che Orkav aggiunge è descritto nella sezione [**ORKAV — Fork audiovisivo**](#orkav--fork-audiovisivo).

---

# ORCΛ (upstream) — documentazione originale

<img src="https://raw.githubusercontent.com/hundredrabbits/100r.co/master/media/content/characters/orca.hello.png" width="300"/>

Orca is an [esoteric programming language](https://en.wikipedia.org/wiki/Esoteric_programming_language) designed to quickly create procedural sequencers, in which every letter of the alphabet is an operation, where lowercase letters operate on bang, uppercase letters operate each frame.

This application **is not a synthesizer, but a livecoding environment** capable of sending MIDI, OSC & UDP to your audio/visual interfaces, like Ableton, Renoise, VCV Rack or SuperCollider.

If you need **help**, visit the [chatroom](https://discord.gg/F7W98pXKd7), the [mailing list](https://lists.sr.ht/~rabbits/orca), join the [forum](https://llllllll.co/t/orca-live-coding-tool/17689) or watch a [tutorial](https://www.youtube.com/watch?v=ktcWOLeWP-g).

- [Download builds](https://hundredrabbits.itch.io/orca), available for **Linux, Windows and OSX**.
- Use [in your browser](https://hundredrabbits.github.io/Orca/), requires **webMidi**.
- Use [in a terminal](https://git.sr.ht/~rabbits/orca), written in C.
- Use [on small computers](https://git.sr.ht/~rabbits/orca-toy), written in assembly.
- Use [on the Monome Norns](https://llllllll.co/t/orca/22492), written in Lua.

## Install & Run

If you wish to use Orca inside of [Electron](https://electronjs.org/), follow these steps:

```
git clone https://github.com/hundredrabbits/Orca.git
cd Orca/desktop/
npm install
npm start
```

<img src='https://raw.githubusercontent.com/hundredrabbits/Orca/master/resources/preview.jpg' width="600"/>

## Operators

To display the list of operators inside of Orca, use `CmdOrCtrl+G`.

- `A` **add**(*a* b): Outputs sum of inputs.
- `B` **subtract**(*a* b): Outputs difference of inputs.
- `C` **clock**(*rate* mod): Outputs modulo of frame.
- `D` **delay**(*rate* mod): Bangs on modulo of frame.
- `E` **east**: Moves eastward, or bangs.
- `F` **if**(*a* b): Bangs if inputs are equal.
- `G` **generator**(*x* *y* *len*): Writes operands with offset.
- `H` **halt**: Halts southward operand.
- `I` **increment**(*step* mod): Increments southward operand.
- `J` **jumper**(*val*): Outputs northward operand.
- `K` **konkat**(*len*): Reads multiple variables.
- `L` **less**(*a* *b*): Outputs smallest of inputs.
- `M` **multiply**(*a* b): Outputs product of inputs.
- `N` **north**: Moves Northward, or bangs.
- `O` **read**(*x* *y* read): Reads operand with offset.
- `P` **push**(*len* *key* val): Writes eastward operand.
- `Q` **query**(*x* *y* *len*): Reads operands with offset.
- `R` **random**(*min* max): Outputs random value.
- `S` **south**: Moves southward, or bangs.
- `T` **track**(*key* *len* val): Reads eastward operand.
- `U` **uclid**(*step* max): Bangs on Euclidean rhythm.
- `V` **variable**(*write* read): Reads and writes variable.
- `W` **west**: Moves westward, or bangs.
- `X` **write**(*x* *y* val): Writes operand with offset.
- `Y` **jymper**(*val*): Outputs westward operand.
- `Z` **lerp**(*rate* target): Transitions operand to input.
- `*` **bang**: Bangs neighboring operands.
- `#` **comment**: Halts a line.

### IO

- `:` **midi**(channel octave note velocity length): Sends a MIDI note.
- `%` **mono**(channel octave note velocity length): Sends monophonic MIDI note.
- `!` **cc**(channel knob value): Sends MIDI control change.
- `?` **pb**(channel value): Sends MIDI pitch bench.
- `;` **udp**: Sends UDP message.
- `=` **osc**(*path*): Sends OSC message.
- `$` **self**: Sends [ORCA command](#Commands).

## MIDI

The [MIDI](https://en.wikipedia.org/wiki/MIDI) operator `:` takes up to 5 inputs('channel, 'octave, 'note, velocity, length). 

For example, `:25C`, is a **C note, on the 5th octave, through the 3rd MIDI channel**, `:04c`, is a **C# note, on the 4th octave, through the 1st MIDI channel**. Velocity is an optional value from `0`(0/127) to `g`(127/127). Note length is the number of frames during which a note remains active. See it in action with [midi.orca](https://git.sr.ht/~rabbits/orca-examples/tree/master/basics/_midi.orca).

## MIDI MONO

The [MONO](https://en.wikipedia.org/wiki/Monophony) operator `%` takes up to 5 inputs('channel, 'octave, 'note, velocity, length). 

This operator is very similar to the default Midi operator, but **each new note will stop the previously playing note**, would its length overlap with the new one. Making certain that only a single note is ever played at once, this is ideal for monophonic analog synthesisers that might struggle to dealing with chords and note overlaps.

## MIDI CC

The [MIDI CC](https://www.sweetwater.com/insync/continuous-controller/) operator `!` takes 3 inputs('channel, 'knob, 'value).

It sends a value **between 0-127**, where the value is calculated as a ratio of 36, over a maximum of 127. For example, `!008`, is sending **28**, or `(8/36)*127` through the first channel, to the control mapped with `id0`. You can press **enter**, with the `!` operator selected, to assign it to a controller. By default, the operator sends to `CC64` [and up](https://nickfever.com/Music/midi-cc-list), the offset can be changed with the [command](#commands) `cc:0`, to set the offset to 0.

## MIDI PITCHBEND

The [MIDI PB](https://www.sweetwater.com/insync/pitch-bend/) operator `?` takes 3 inputs('channel, 'lsb, 'msb).

It sends two different values **between 0-127**, where the value is calculated as a ratio of 36, over a maximum of 127. For example, `?008`, is sending an MSB of **28**, or `(8/36)*127` and an LSB of 0 through the first midi channel.

## MIDI BANK SELECT / PROGRAM CHANGE

This is a command (see below) rather than an operator and it combines the [MIDI program change and bank select functions](https://www.sweetwater.com/sweetcare/articles/6-what-msb-lsb-refer-for-changing-banks-andprograms/). 

The syntax is `pg:channel;msb;lsb;program`. Channel is 0-15, msb/lsb/program are 0-127, but program will automatically be translated to 1-128 by the MIDI driver. `program` typically corresponds to a "patch" selection on a synth. Note that `msb` may also be identified as "bank" and `lsb` as "sub" in some applications (like Ableton Live). 

`msb` and `lsb` can be left blank if you only want to send a simple program change. For example, `pg:0;;;63` will set the synth to patch number 64 (without changing the bank)

## UDP

The [UDP](https://nodejs.org/api/dgram.html#dgram_socket_send_msg_offset_length_port_address_callback) operator `;` locks each consecutive eastwardly ports. For example, `;hello`, will send the string "hello", on bang, to the port `49160` on `localhost`. In commander, use `udp:7777` to select the **custom UDP port 7777**, and `ip:127.0.0.12` to change the target IP. UDP is not available in the browser version of Orca.

You can use the [listener.js](https://github.com/hundredrabbits/Orca/blob/master/resources/listener.js) to test UDP messages. See it in action with [udp.orca](https://git.sr.ht/~rabbits/orca-examples/tree/master/basics/_udp.orca).

## OSC

The [OSC](https://github.com/MylesBorins/node-osc) operator `=` locks each consecutive eastwardly ports. The first character is used for the path, the following characters are sent as integers using the [base36 Table](https://github.com/hundredrabbits/Orca#base36-table). In commander, use `osc:7777` to select the **custom OSC port 7777**, and `ip:127.0.0.12` to change the target IP. OSC is not available in the browser version of Orca.

For example, `=1abc` will send `10`, `11` and `12` to `/1`, via the port `49162` on `localhost`; `=a123` will send `1`, `2` and `3`, to the path `/a`. You can use the [listener.js](https://github.com/hundredrabbits/Orca/blob/master/resources/listener.js) to test OSC messages. See it in action with [osc.orca](https://git.sr.ht/~rabbits/orca-examples/tree/master/basics/_osc.orca) or try it with [SonicPi](https://github.com/hundredrabbits/Orca/blob/master/resources/TUTORIAL.md#sonicpi).

<img src='https://raw.githubusercontent.com/hundredrabbits/Orca/master/resources/preview.hardware.jpg' width="600"/>

## Advanced Controls

Some of Orca's features can be **controlled externally** via UDP though port `49160`, or via its own command-line interface. To activate the command-line prompt, press `CmdOrCtrl+K`. The prompt can also be used to inject patterns or change settings.

### Project Mode

You can **quickly inject orca files** into the currently active file, by using the command-line prompt — Allowing you to navigate across multiple files like you would a project. Press `CmdOrCtrl+L` to load multiple orca files, then press `CmdOrCtrl+B` and type the name of a loaded `.orca` file to inject it.

### Default Ports

| UDP Input  | OSC Input  | UDP Output | OSC Output |
| ---------- | ---------- | ---------- | -----------|
| 49160      | None       | 49161      | 49162

### Commands

All commands have a shorthand equivalent to their first two characters, for example, `write` can also be called using `wr`. You can see the full list of commands [here](https://github.com/hundredrabbits/Orca/blob/master/desktop/sources/scripts/commander.js).

- `play` Plays program.
- `stop` Stops program.
- `run` Runs current frame.
- `bpm:140` Sets bpm speed to `140`.
- `apm:160` Animates bpm speed to `160`.
- `frame:0` Sets the frame value to `0`.
- `skip:2` Adds `2`, to the current frame value.
- `rewind:2` Removes `2`, to the current frame value.
- `color:f00;0f0;00f` Colorizes the interface.
- `find:aV` Sends cursor to string `aV`.
- `select:3;4;5;6` Move cursor to position `3,4`, and select size `5:6`(optional).
- `inject:pattern;12;34` Inject the local file `pattern.orca`, at `12,34`(optional).
- `write:H;12;34` Writes glyph `H`, at `12,34`(optional).
- `time` Prints the time, in minutes seconds, since `0f`.
- `midi:1;2` Set Midi output device to `#1`, and input device to `#2`.
- `udp:1234;5678` Set UDP output port to `1234`, and input port to `5678`.
- `osc:1234` Set OSC output port to `1234`.

---

# ORKAV — Fork audiovisivo

Orkav estende Orca con **FX shader audio-reattivi**, **Ableton Link**, **MIDI→visuale** (background/GIF/big text), **tag media**, **webcam + face tracking (MediaPipe)**, **modelli 3D web** e **Total Glitch / Panic Button**.

## FX (commander `fx:`)

Formato: **`fx:nome.rand.drive`** — esempio `fx:datamosh.400.400`

| Valore | Range | Significato |
|--------|-------|-------------|
| `rand` | 0–999 (default 400) | randomizza **3 parametri dello shader** + riposiziona i **7 filtri spettrali** |
| `drive` | 0–999 (default 400) | **drive dell'audio capture** (sensibilità dei 7 filtri) |

- `fx:datamosh.400.400` — datamosh con seed 400, drive 400
- `fx:glitch.200+datamosh.800` — combo (max 4 in chain)
- `fx:` (vuoto) spegne tutto

### Contratto 10 parametri shader

Ogni shader ha 10 parametri controllabili:

| Uniform | Contenuto |
|---------|-----------|
| `u_int` | seed (da `rand`) — randomizza 3 parametri via hash |
| `u_pa.x/y/z/w` | bande audio **p0–p3** (7 filtri bandpass random sullo spettro) |
| `u_pb.x/y/z` | bande audio **p4–p6** |
| `u_pb.w` | **drive** audio capture (0–1) |
| `u_time` | beat (BPM) |

Più utility: `u_bass`, `u_mid`, `u_high`, `u_vol`, `u_flash` (transienti + **score MIDI**), `u_strobe`, `u_drop`, `u_prev` (feedback frame precedente), `u_tex`, `u_res`.

### Shader GLEngine (`desktop/sources/shaders/*.frag`)

| Shader | Shortcut | Effetto |
|--------|----------|---------|
| `brokentv` | `Alt+T` | TV rotta anni 90 |
| `datamosh` | `Alt+D` | compression artifacts |
| `glitch` | `Alt+J` | glitch digitale |
| `ameba` | `Alt+K` | **linee verticali che slittano sull'asse orizzontale** (deriva + oscillazione + spinta audio per linea) |
| `fractal` | `Alt+R` | Mandelbrot/Julia audio-reattivo |
| `displace` | `Alt+S` | displacement map |
| `chromawarp` | `Alt+N` | curvatura cromatica |
| `fracture` | `Alt+Q` | **vetro infranto**: shard Worley irregolari con rifrazione per-shard, dispersione cromatica, biselli, crepe capillari e caustiche |
| `glow` | `Alt+L` | bagliore neon |
| `motionmosh` | `Alt+F` | **datamosh vero**: stima il movimento fra i frame e trascina i pixel nel verso **opposto**, lasciando la scia (look P-frame) |
| `bubble` | `Alt+E` | **schiuma di sapone**: due ottave di Worley, pellicole traslucide che deformano il feed, bordi di Plateau iridescenti |

#### `motionmosh` — datamosh con stima del movimento
Sostituisce il vecchio `freezeloop`. Il principio è quello di un **P-frame senza I-frame**: si stima dove sta andando il contenuto e si trascinano i pixel **nel verso opposto**, accumulando una scia.

1. **Stima**: griglia di blocchi (quanti = parametri + audio). Block-match brute force 5×5 con SAD su tap a croce fra `u_prev` e `u_tex`; costo del match oltre soglia = blocco disoccluso. In più un flusso locale dal gradiente spaziale, che liscia il campo sotto il blocco, e una deriva sintetica di rumore così la scia esiste anche se il feed è fermo.
2. **Scia**: `u_prev` viene campionato in direzione **opposta** al moto (`uv - mot*str`), con un secondo tap lungo per evitare bordi netti.
3. **Feedback** con persistenza alta **ma con decadimento**: rientra sempre un po' di frame vivo, così le scie si accumulano senza saturare a bianco né morire.
4. **Artefatti P-frame**: parte dei blocchi ha il vettore **quantizzato grosso**, una frazione è **congelata** (vettore 0: un'immagine ferma trascinata sopra uno sfondo che si muove), qualcuno **salta**, e i canali R/B sono spostati lungo il vettore (chroma trail da compressione).
5. **Audio**: bassi = trascinamento e quota di blocchi congelati, mid = numero di blocchi e raggio di ricerca, alti = separazione chroma e grana, `u_flash` = kick casuale su tutti i vettori, `u_drop` = saltello di campo, `regime` = aggressività della quantizzazione, `drive` = forza master.

#### `bubble` — schiuma (foam)
Due ottave di **Worley** (`cellular2x2x2`) combinate in `min`: una massa di celle piccole, non più quattro bolle giganti. L'`F2-F1` dell'ottava vincente disegna la **rete di bordi di Plateau** dove tre celle si incontrano, quindi le pellicole hanno giunzioni luminose e spessori sottili.

La **deformazione è reale**: il gradiente del campo cellulare (differenze finite sulla stessa base ruotata) fa da normale di superficie, e `u_tex` viene rifratto lungo di essa con lente che cresce verso il bordo + **aberrrazione cromatica a 3 tap**; sopra, un `warp()` di dominio deforma tutto lo schermo. Misurato su GPU: `drive` 0→1 sposta i pixel di **26.6/255** in media, i bassi di **22.2**, entrambi di **32.0**.

L'iridescenza è `0.5+0.5*cos(6.2831*(spessore + vec3(0,0.33,0.67)))`, con lo spessore legato alla geometria della cella: le bande di colore seguono le celle e derivano col tempo e con l'audio. Il corpo della pellicola resta **traslucido** (il feed si vede attraverso, tinto e rifratto), con bordi bagnati, shimmer sulle alte, bloom sul flash, poi strobe e vignetta.

#### `fracture` — vetro infranto
Shard **Worley irregolari** (ricerca 3×3 con jitter da `hash`, non una griglia regolare). Da `d1`/`d2` derivano bordo, bisello, glint speculare e bordo di Plateau.

Ogni shard ha **rifrazione propria**: offset dal suo hash, rotazione attorno al proprio centro, e R/G/B campionati a offset diversi con separazione che **cresce verso i bordi** (il vetro è più spesso lì) — è la dispersione cromatica che vende l'effetto. Una seconda rete cellulare fine (celle ×2.6) disegna **crepe capillari** con glow colorato via `hue()` e una caustica lungo le crepe. Ogni shard ha una **profondità**: parallasse su spinta e rifrazione, e quelli più lontani sono più scuri/desaturati. Il tempo è **quantizzato** (`tk = floor(u_time*rate)`) e solo una frazione di shard "schizza" via ad ogni burst, con un feedback breve da `u_prev`.

## Total Glitch & Panico

- **`Alt+Shift+X`**: TOTAL GLITCH — brokentv+glitch+datamosh+fracture al massimo, distrugge **tutto** il feed visivo compresa la patch e il terminale Orca. Durante il glitch il BPM diventa **randomico 0–999 a ritmo molto veloce** (solo locale, non propagato a Link) e compare la scritta **PANICO multilingua** a rotazione (PANIC/PANICO/PANIQUE/PÁNICO/PANIK/PÂNICO/ПАНИКА/恐慌/パニック/PANIEK/PANIKA).
- **Uscita**: solo `Esc` o di nuovo `Alt+Shift+X` (ripristina BPM, shader, patch e terminale).

## Webcam · Face Tracking · Maschere

- **`Alt+Z`**: attiva la webcam come feed (attiva automaticamente anche la maschera viso).
- **`Alt+H`**: maschera emoji sul viso — 468 landmark MediaPipe FaceMesh; le emoticon **swap velocemente**, si **freezano sui bassi** (bass > 0.8) e ogni ~17 secondi; ancorata ~20px sotto il centro del viso.
- I landmark del viso (bocca/occhi/rotazione/imbardata/beccheggio) **pilotano i parametri degli shader** (`u_face`/`u_face2`).

### Glitch dedicato alle emoticon (`MaskFX`)

Le emoticon **nascono già glitchate**: c'è uno shader solo per loro, sempre attivo quando c'è una maschera, in `desktop/sources/shaders/mask/glitch.frag` (sottocartella: **non** fa parte della catena FX e non compare fra gli shader selezionabili).

`MaskFX` (`scripts/mask-fx.js`) è una pipeline WebGL2 dedicata, 256×256 **con alpha**: la catena FX normale lavora sul feed già composto, mentre la maschera va glitchata **prima** di essere disegnata sul viso e deve restare trasparente attorno all'emoji (un quadrato glitchato coprirebbe la faccia).

Lo shader fa, in ordine: **slice displace** (bande orizzontali spostate a scatti, quantizzate nel tempo), **block corrupt**, **RGB split** crescente verso i bordi, **tracking band**, **rim neon** ricavato dall'alpha e tinto con una hue che ruota, **drop/cut** sul flash. L'alpha finale non supera mai quello dell'emoji originale. Ogni emoticon ha il **suo** seed, quindi il pattern cambia ad ogni swap.

### Perché il face tracking bloccava tutto

Erano due cose, entrambe risolte:

| Causa | Prima | Ora |
|-------|-------|-----|
| **wasm di MediaPipe** | il `FilesetResolver` scaricava **9.4 MB** di `vision_wasm_internal.wasm` **in linea**, mentre l'utente aspettava | prefetch in background dopo il boot (bundle + wasm SIMD + modello, richieste `quiet`) |
| Pool maschere | **110 canvas 512×512** (~115 MB) + 110 `fillText` da 420px **sincroni** in un solo frame all'attivazione | lista di stringhe + rasterizzazione **on demand** a 256×256, cache LRU di 24 |
| Shader maschera | compilato al primo `Alt+H` | **precompilato nel prefetch** |
| `detectForVideo` | ogni frame, sul main thread | un frame sì e uno no (~30 Hz): la maschera resta incollata al viso |

**Misurato** (init completo del face tracker, da freddo): **10 544 ms → 3 115 ms**. `Alt+H` (pool + shader): **442 ms → 33 ms**.

### Aggancio della maschera

Il glifo dell'emoji viene **centrato sul canvas misurando il suo bounding box reale** (`actualBoundingBoxAscent/Descent`) e riscalato a riempire l'86% del canvas: prima si disegnava a coordinate fisse (`128, 215`) e il glifo finiva spostato in basso, quindi la maschera non combaciava col viso.

La dimensione è `max(faceW × W × 2.5, faceH × H × 1.75)`: si adatta sia alla larghezza sia all'**altezza** del viso, quindi quando ti avvicini alla camera la maschera cresce invece di restare piccola (~+25% rispetto a prima). L'offset verticale è una frazione della dimensione (`+3%`) e non più 20px fissi, che su schermi grandi non scalavano.

## GIF: perché non si caricavano

Tre cause, tutte risolte.

| Problema | Causa | Fix |
|----------|-------|-----|
| **La chiave Giphy spariva** | `localStorage` su origine `file://` **non viene scritto su disco** in Electron: dopo ogni riavvio `giphyKey` era `null` e la sorgente primaria veniva saltata | la chiave (e `bg_dir`) si salvano anche in `userData/orkav-cache` e si ripristinano al boot con `loadPersisted()` |
| **GIF enormi che non finivano mai** | la ricerca Commons restituiva GIF da 5–20 MB a 1796×1820 | filtro a **2 MB / 900px**, ordinamento per peso percepito e scelta fra i più leggeri |
| **Nessun timeout** | se una GIF non arrivava, lo stormo restava vuoto per sempre | **timeout 8 s**: si passa alla sorgente successiva |

Catena delle sorgenti: **Giphy** (GIF ~200px, la più veloce) → **Commons per tag** → **Commons per categoria** (`Category:Animated GIF files`, sempre disponibile senza chiave) → frame procedurali.

> Dopo l'aggiornamento la chiave Giphy va inserita **una volta** con `giphykey:<LA_TUA_KEY>`: da lì in poi resta su disco.

## Cmd+O: apertura file nativa

`Cmd+O` apriva il pannello con un `<input type="file">` **dal processo di rendering**: nel frattempo il render loop continuava a pieno regime e il pannello di sistema compariva dopo secondi.

Ora l'apertura passa da `dialog.showOpenDialog` nel **processo main** (`window.api.dialog`), il renderer non fa nulla e si mette in **pausa**:

- `client.beginModal()` / `endModal()` — mentre `_modal > 0`, `update()` **salta feed, shader e terminale** e non chiama `clear()`, così resta a schermo l'ultimo frame invece di un fondo nero.
- il file viene letto nel processo main (il renderer non può chiedere path arbitrari: `fs:readFileSync` ha una whitelist) e il contenuto arriva già pronto.
- c'è anche `dialog.saveFile` + `fs:writeChosen` per l'esportazione.

## Modelli 3D — Poly Haven (default) · Thingiverse (opzionale)

- **`Alt+P`**: carica un modello 3D seguendo il **tag corrente**.
- **Formati**: GLB/glTF, STL, OBJ.
- **Deformazione audio-reattiva** dei vertici (`u_disp`).

### Sorgenti, in ordine di tentativo

| # | Sorgente | Token | Note |
|---|----------|-------|------|
| 1 | **Thingiverse** | serve un token approvato | usata solo se il token è configurato |
| 2 | **Poly Haven** | **nessuno** | 520+ modelli **CC0**, API pubblica, CORS aperto — **default** |
| 3 | lista GLB Khronos | nessuno | fallback locale, sempre disponibile |

### Poly Haven (nessuna configurazione)

Funziona **subito**, senza token. I modelli sono **CC0** (dominio pubblico).

- `Alt+P` → prende il **tag corrente** e carica un modello coerente
- `ph:<query>` → cerca e carica (es. `ph:barrel`, `ph:forest`, `ph:camera`)
- `phlist:<query>` → elenca i modelli che matchano

I tag di Orkav vengono tradotti in termini Poly Haven (che è realistico: props, natura, industria) tramite una **tabella di alias** — es. `twin peaks` → forest/tree/pine, `lucifer` → lighting/lamp, `cyberdeck` → electronics/circuit, `demons` → creature/statue. Se un tag non matcha nulla viene usato un modello a caso (gli altri vanno a vuoto).

### Configurare Thingiverse (opzionale, richiede un token approvato)

L'API (`api.thingiverse.com`) risponde **401** senza token. Il token è gratuito ma si crea
**solo da loggati**: la pagina `thingiverse.com/apps/create` senza login mostra soltanto "Login".

1. Fai **login** su [thingiverse.com](https://www.thingiverse.com/) — senza login la pagina del token non si apre.
2. Apri [thingiverse.com/apps/create](https://www.thingiverse.com/apps/create) → *Create an App*
   (nome e URL qualsiasi) → copia l'**Access Token**.
3. In Orkav apri il commander (`Cmd+K`) ed esegui:
   - `tvtoken:<IL_TUO_TOKEN>` → salva il token (persiste in `localStorage`)
   - `tvhelp` → ristampa queste istruzioni in console

| Comando | Effetto |
|---------|---------|
| `Alt+P` | carica un modello per il **tag corrente** (Thingiverse se configurato, altrimenti Poly Haven) |
| `tv:<query>` | cerca su Thingiverse e carica un modello (es. `tv:skull`, `tv:low poly`) |
| `tvsearch:<query>` | elenca i risultati in console (nome + `thing:<id>`) |

Note:
- `/developers/thing-apps` è la **documentazione API**, non il punto dove si crea il token.
- `/apps` è il **catalogo di app di terzi**: non serve.
- Il token è personale: non condividerlo; se lo perdi o fai logout, rigenerane uno.
- Senza token tutto continua a funzionare con i modelli GLB di fallback.

### Caricare modelli diversi · più modelli · effetto glossy

| Comando | Cosa fa |
|---------|---------|
| `Alt+P` | **on/off**. All'accensione carica **1 modello** per il **tag corrente**; spegnendo rimuove tutto |
| `Alt+M` | **aggiunge un altro modello** (multi-oggetto, max 6) — ognuno vaga per conto suo |
| `Alt+Shift+P` | apre il prompt **[3D SEARCH]**: digita un termine e premi `Enter` → cerca e carica |
| `Alt+C` | **GLOSSY (Chrome) on/off**: materiale lucido con riflessi d'ambiente sui modelli |
| `Alt+Shift+C` | **svuota** tutti i modelli dalla scena |

Da commander:

| Comando | Cosa fa |
|---------|---------|
| `ph:<query>` | carica per termine esplicito (es. `ph:skull`, `ph:barrel`, `ph:forest`) |
| `phadd:<query>` | come `ph:` ma **aggiunge** invece di sostituire |
| `phlist:<query>` | elenca in console i modelli Poly Haven che matchano |
| `phclear` | svuota la scena |
| `glossy:on` / `glossy:off` | effetto lucido |

**Come caricare modelli diversi** — tre modi:
1. **Cambia tag** (`Cmd+Shift+T` per ciclare, o `Cmd+W` per aggiungerne uno nuovo) poi `Alt+P`: ogni tag dà un modello diverso.
2. **`Alt+Shift+P`** e digita un termine libero (in inglese funziona meglio: `barrel`, `forest`, `camera`, `chair`, `rock`).
3. **`ph:<query>`** dal commander per la stessa cosa senza prompt.

Ripetere `Alt+P` (o `ph:`) con lo stesso tag dà **modelli diversi**: il selettore evita di ripescare l'ultimo usato.

**Multi-oggetto**: `Alt+M` aggiunge senza togliere i precedenti (fino a 6). Con più modelli in scena la scala si riduce automaticamente (fino a ~-47%) così non si accavallano, e ognuno ha sfasamento, rotazione e deformazione **proprie**.

**Glossy** (`Alt+C`): sostituisce i materiali con `MeshPhysicalMaterial` — `roughness 0.08`, `clearcoat 1.0`, riflessi iridescenti — e costruisce una **environment map procedurale** (`RoomEnvironment` + `PMREMGenerator`) perché senza envMap un materiale lucido non ha nulla da riflettere. Il toggle è **non distruttivo**: i materiali originali sono salvati e ripristinati.

### Tag per canale (bg · gif · 3D · font)

I tag sono **indipendenti per canale**: le GIF possono pescare da un tag diverso dalle immagini di background, dai modelli 3D e dai font dei big text. `null` = segue il tag globale.

| Comando | Effetto |
|---------|---------|
| `tag:<nome>` | tag **globale** (ricarica bg, GIF e 3D che non hanno un override) |
| `tagbg:<nome>` | solo le **immagini di background** |
| `taggif:<nome>` | solo lo **stormo GIF** |
| `tag3d:<nome>` | solo i **modelli 3D** |
| `tagfont:<nome>` | solo i **font dei big text** (tag diversi partono da font diversi, poi ruotano) |
| `tagbg:` (vuoto) | rimuove l'override: il canale torna a seguire il globale |
| `tags` | stampa la situazione dei quattro canali |

`Cmd+Shift+T` cicla il tag **globale** e ricarica background, GIF e (se attivo) modello 3D. `Alt+Shift+T` cicla **solo** il tag dei modelli 3D.

`tag:`, `tagbg:`, `taggif:`, `tag3d:` e `tagfont:` accettano anche un tag nuovo: viene aggiunto a `commonsTags` e all'elenco dei tag, quindi da lì in poi è raggiungibile anche con `Cmd+Shift+T`.

### Movimento nello schermo

Il modello **non nasce più al centro**: prende una **zona** dall'allocatore di slot (vedi sotto) e ci oscilla attorno con due oscillatori a frequenze non multiple (0.70/0.23 e 0.53/0.31), più capriole/rollio lenti (`spinX`/`spinZ`). La camera resta quasi ferma e guarda il centro, così il movimento si vede davvero invece di essere annullato da un inseguimento.

> **Bug storico del "flickering"**: `P.drift += dt` sommava i **millisecondi**, quindi la fase avanzava di ~17 unità per frame. Con `speed ≈ 0.16` il seno girava a **~18 Hz**: il modello non vagava, **vibrava** sul posto. Ora `P.drift += dts` (secondi) → ~0.96 unità/s, un ciclo in ~56 s. Verificato a runtime.

**Velocità e limiti di campo** — il vagabondaggio è volutamente **lento**: un ciclo completo dura ~56 s a riposo, ~29 s con i bassi a metà, ~20 s al massimo (prima scendeva a ~5 s e i modelli sfrecciavano fuori).

**Rotazioni in slow-motion** — tempi per un giro completo:

| | a riposo | audio al massimo |
|---|---|---|
| rotazione Y | ~70 s | ~25 s |
| capriola (X) | ~115 s | ~36 s |
| rollio (Z) | ~155 s | ~45 s |

`dt` da `client.update()` è in **millisecondi**: va convertito in secondi (`dts = dt/1000`). Il vecchio `* dt * 60` trattava i millisecondi come frame e faceva girare tutto ~16× troppo veloce (un giro in 0.9 s con i bassi al massimo). Vale anche per `AnimationMixer.update()`, che in three.js vuole i secondi (le animazioni GLB giravano 1000× troppo veloci).

L'ampiezza è calcolata perché il modello **resti dentro il frame**. Con camera a `z=3`, fov 45° e aspect 16:9, a `z=0` si vedono ±2.21 in orizzontale e ±1.24 in verticale; i due termini oscillanti si sommano (1 + 0.30 = 1.30×) e vanno sommati anche alla metà del modello, quindi:

| Asse | Escursione max | + metà modello | Limite visibile |
|------|----------------|----------------|-----------------|
| X | 1.31 | 2.16 | 2.21 ✓ |
| Y | 0.39 | 1.24 | 1.24 ✓ |

La scala del modello normalizza la **diagonale** del bounding box a **1.7** (non più 2.0): un oggetto alto arrivava a ~1.0 di semi-altezza sui 1.24 disponibili, lasciando troppo poco spazio e uscendo dal campo.

## Distribuzione degli elementi (slot)

Prima **tutto compariva al centro**, dove sta la patch Orca, e gli elementi si accavallavano. Ora c'è un **allocatore di slot** su `client` (`nextSlot()`): 12 zone **periferiche** in coordinate normalizzate, assegnate **a rotazione** con partenza casuale.

| Elemento | Come usa gli slot |
|----------|-------------------|
| modelli 3D (`Alt+P` / `Alt+M`) | lo slot viene convertito in coordinate mondo (`×0.42` di 2.21 in X, `×0.45` di 1.24 in Y) e diventa il **centro dell'oscillazione**; il vagabondaggio si stringe con `1/√n` quando ci sono più modelli |
| layer immagine (`Alt+B`, MIDI) | posizione iniziale del layer |
| stormo GIF (`Alt+G`) | centro di spawn dello stormo |

`Alt+P` riparte da una zona diversa ad ogni attivazione (`resetSlots`).

## Luce e materiali 3D

I modelli **erano sempre scuri**. Tre cause, tutte risolte:

1. **Nessuna environment map.** I glTF di Poly Haven sono PBR fotogrammetrici: senza IBL un metallo non ha nulla da riflettere e va a nero. La `RoomEnvironment` + `PMREMGenerator` ora si costruisce **sempre** (prima solo col glossy) e finisce in `scene.environment`.
2. **Nessun tonemapping.** Aggiunti `outputColorSpace = SRGBColorSpace` e `ACESFilmicToneMapping` con esposizione 1.25.
3. **Luci povere.** Aggiunte una `HemisphereLight` (schiarisce le facce in ombra senza appiattire) e una seconda direzionale di riempimento.

In più `_tuneMaterials()` normalizza i materiali appena caricati: `envMapIntensity 1.35`, metalness limitata a 0.18 quando è 1 **senza** `metalnessMap` (specchio nero), roughness 0.85 se era 1 e senza mappa, `transparent` disattivato quando l'alpha è ≥ 0.99. (Con `metalnessMap`/`roughnessMap` presenti i fattori 1 restano: sono corretti, le mappe li modulano.)

## Shortcut Orkav

| Tasto | Azione |
|-------|--------|
| `Alt+V` | prompt commander `fx:` |
| `Alt+T/D/J/K/R/S/N/Q/L/F/E` | shader FX (brokentv/datamosh/glitch/ameba/fractal/displace/chromawarp/fracture/glow/**motionmosh**/bubble) |
| `Alt+Z` | webcam (attiva anche la maschera) |
| `Alt+H` | maschera emoji sul viso |
| `Alt+P` | modello 3D (Poly Haven / Thingiverse) |
| `Alt+Shift+X` | Total Glitch + PANICO multilingua |
| `Alt+G` | stormo GIF (boids) |
| `Alt+B` | background random |
| `Alt+Shift+B` | background auto-cycle |
| `Alt+W` | big text overlay |
| `Cmd+W` | **aggiungi tag** (prompt) → cerca subito immagini + GIF |
| `Cmd+Shift+T` | tag **globale** successivo (ricarica bg, GIF e 3D) |
| `Alt+Shift+T` | tag **solo dei modelli 3D** successivo |
| `Cmd+K` | commander |
| `Cmd+L` | carica moduli .orca multipli |
| `Cmd+Enter` | fullscreen |
| `Esc` | reset tutto |

### Aggiungere un tag con Cmd+W

1. Premi `Cmd+W` → compare `[ADD TAG]` nella riga di stato
2. Digita il tag (es. `cyberpunk`, `vaporwave`, `glitch art`)
3. Premi `Enter` → il tag viene **aggiunto alla libreria** e **cercato subito**: carica un'immagine di background e uno stormo GIF da quel tag

## Performance

Il rendering gira su `requestAnimationFrame`; queste sono le ottimizzazioni attive.

| Ottimizzazione | Guadagno |
|----------------|----------|
| **UI cacheata** — barra di stato, monitor audio (spettro FFT), overlay e guida si ridisegnano a ~15 fps in un buffer dedicato e si blittano ogni frame | **da ~5-6 ms a ~2 ms per frame** (era l'85% del costo) |
| **Qualità adattiva shader** — la catena gira a risoluzione interna ridotta (0.5–1.0) e risale/scende da sola in base agli fps; l'upscale è nella `drawImage`, gratis | fino a **−75%** del costo shader |
| **3D a 30 fps + 960×540** (era 60 fps a 1280×720) | **−75%** del costo 3D |
| **`querySelectorAll` ogni 2 s** (era a ogni frame) | elimina una scansione del DOM 60 volte al secondo |
| **Banda audio lisciata** (EMA con attacco rapido / rilascio lento) per i modelli 3D | reazioni fluide invece che a scatti |
| **Rete con timeout** — ogni richiesta HTTP passa da `Net` con `AbortController` (4–8 s) | una CDN lenta non blocca più la coda |
| **Cache su disco dell'indice Poly Haven** (530 KB, TTL 7 giorni) in `userData/orkav-cache/` | primo modello istantaneo: **515 ms → 9 ms** |
| **Prefetch in idle** — three.js + loader, indice Poly Haven, MediaPipe si scaricano in background dopo il boot | Alt+P / Alt+Z non aspettano più la rete |
| **Filtro dimensione sui video** di Wikimedia/archive.org (max 12–15 MB, preferenza mp4 → webm → ogv) | niente più download da centinaia di MB che ingolfavano il decoder |
| **Annullamento per canale** — una nuova richiesta di background/GIF annulla la precedente | niente risposte fuori ordine che sovrascrivevano il contenuto |
| **Decode immagini off-main-thread** — `img.decode()` + `createImageBitmap` con ridimensionamento a 1600px, poi il layer disegna un `ImageBitmap` già pronto | un'immagine Commons 4000×3000 non fa più saltare il frame |
| **Cache su disco dei modelli 3D** (`.gltf` + `.bin` + texture, TTL 30 giorni) in `userData/orkav-cache/bin/` | dal secondo caricamento lo stesso modello arriva dal disco, zero rete |

Misurato con un profiler per-frame (prima → dopo): **5.4–7.1 ms → 2.4–2.7 ms per frame**, con gli fps passati da ~60 a **~80–120**.

Nelle modalità con input di testo (tag, big text, ricerca 3D, commander) la UI si ridisegna ogni frame, così digitare resta immediato.

Il **puntatore del mouse di sistema è nascosto** (`cursor: none` in `links/main.css`): Orkav disegna il suo cursore custom nel canvas (`client.drawCursor`) e la freccia di macOS andava a sovrapporsi.

### Rete: `Net` (`sources/scripts/lib/net.js`)

Tutto il traffico del renderer passa da qui: `Net.fetch/json/bytes` applicano un timeout, `Net.begin(canale)`/`Net.stale(canale, signal)` gestiscono l'annullamento, `Net.cacheLoad/cacheSave` la cache persistente.

> `localStorage` su origine `file://` **non viene scritto su disco** in Electron: la cache affidabile è il file in `userData/orkav-cache/<chiave>.json`, scritto in modo atomico via IPC. `localStorage` resta solo come livello veloce di sessione.

- `netstats` — contatori (`ok / timeout / annullate / errori / in corso`), stato della cache indice e **dimensione della cache modelli su disco**
- `netcache` — svuota la cache di rete (l'indice viene riscaricato al prossimo Alt+P)

La cache binaria ha un limite di sicurezza di 40 MB per file e scrive in modo atomico (tmp + rename) in `userData/orkav-cache/bin/`.

### Prefetch in background (`sources/scripts/prefetch.js`)

Parte 2.5 s dopo il boot, una risorsa alla volta, solo nei momenti di idle (`requestIdleCallback`) e si mette in pausa se una richiesta vera è in corso. Le richieste di prefetch sono marcate `quiet` e non entrano nell'indicatore di caricamento.

| Cosa | Peso | Quando |
|------|------|--------|
| three.js + GLTFLoader/STLLoader/OBJLoader/RoomEnvironment | ~1.35 MB | sempre (se il 3D non è già attivo) |
| indice Poly Haven (521 modelli CC0) | ~530 KB | se la cache ha più di 7 giorni |
| MediaPipe + modello face landmarker | ~3.8 MB | solo se la webcam è già stata usata (`orkav_webcam_used`) |

Lo stato dei caricamenti compare nel terminale, a sinistra della telemetria: `| 3D props`, `/ net 2`. Scompare da solo dopo 10 s.

## Rendering (fps indipendenti dal BPM)

Il rendering gira su **requestAnimationFrame** disaccoppiato dal clock del sequencer: a 120 BPM il sequencer ticka 8 volte/sec ma le visual girano a 30–60 fps. Il **terminale Orca è su un piano separato**: gli shader agiscono solo sul feed (background/GIF/effetti), la patch resta sempre leggibile sopra — tranne in Total Glitch.

## Big Text

- **`Alt+W`**: prompt big text; digita e premi `Enter`. Il testo va a schermo gigante.
- **Durata leggibile**: la scritta resta a schermo abbastanza da leggerla tutta — minimo ~6 s, calcolata come **~300 ms per carattere** (minimo 3 s di lettura), fino a 30 s. Con MIDI la velocity allunga ancora (fino a +50%).
- **Auto-fit**: la dimensione del font viene ridotta automaticamente perché **l'intero testo entri nella larghezza** dello schermo — niente più scritte tagliate ai bordi.
- **Font**: 4 font display distintivi da dafont (`Ghastly Panic`, `Melted Monster`, `VCR OSD Mono`, `Nulshock`), incorporati in `sources/links/bigtext-fonts.css` e ruotati a ogni scritta. **Il font dell'interfaccia non cambia.**

### Moto dei big text (ibrido, casuale per ogni scritta)

Ogni scritta riceve a caso uno di questi comportamenti:

| Moto | Effetto |
|------|---------|
| `oneshot` | compare **tutta intera e ferma** al centro (si legge subito) |
| `run-x` | **corre** attraverso lo schermo in orizzontale (destra o sinistra), su una fascia verticale casuale |
| `run-y` | **entra da sopra o da sotto** e attraversa in verticale |
| `run-diag` | attraversa in **diagonale** (una delle 4 direzioni) |
| `hybrid` | **ibrido**: prima tutta intera e ferma (~35–60% della vita), poi corre via |

- Le scritte **intere/ferme** sono disegnate sopra gli shader (sempre leggibili, effetto chroma/glow); quelle **in corsa** sono disegnate dentro il feed, quindi le deformano gli shader.
- Ogni corsa attraversa lo schermo **esattamente una volta** nell'arco della propria durata: il tempo di attraversamento si adatta alla lunghezza del testo e resta leggibile.

## Score MIDI → Visual

Ogni nota MIDI **generata dallo score Orca** (operatore `:`) produce un flash nel motore grafico (`u_flash` negli shader) — sincronizzato con la musica, indipendente dal framerate.

## MIDI → Visuale (input esterno)

| Canale | Destinazione | Nota → | Velocity → |
|--------|-------------|--------|-----------|
| 0–1 | Background | cambia immagine/video (tag) | dimensione 8–100% |
| 2–3 | GIF swarm | carica stormo | scala 0.3×–2.5× |
| 4–5 | Big Text | testo gigante da tag | flicker + durata |

I tag ciclano su: pokemon, merda, 1312, michale jackson, twin peaks, gatti, simpson, rick and morty, the office, friends, south park, liminal space, horror vacui, cyberfeminism, cyberdeck, hacktivism, hacker, matrix, red pill, blue pill, sex workers, demons, lucifer, satan, esoterism, ai, ki, solar opposites, brickleberry, futurama.

## Ableton Link

- BPM sincronizzato con qualsiasi app Link (Ableton Live, VCV, ecc.)
- Display: **BPM rosso fisso** (#ff4d4d) in play (stiamo mandando il sync), **peers verdi** (#4ade80) `P<n>` accanto.
- Peer **bidirezionale**: segue il tempo/start-stop remoto e propaga il proprio.

## MIDI hardware (USB)

- Comando `mididevices` elenca output/input con indice; `midi:<n>` seleziona un **singolo** device di output (esclusivo), `midi:-1` azzera.
- L'operatore `:` accetta un **6° parametro port**: `:canale.ottava.nota.vel.lunghezza.port` (port = `-1` usa il device selezionato, altrimenti indice esplicito).
- Per l'Ableton Move usa in genere **Standalone Port** o **External Port** (non la Live Port, che controlla Ableton Live via USB).

## Audio Reactor (7 filtri random)

Microfono senza filtri (`echoCancellation/noiseSuppression/autoGainControl` off), gain 3.5.
**7 filtri bandpass posizionati randomicamente** (seeded da `rand`) nello spettro logaritmico, con compensazione +6dB/ottava sulle alte e smoothing per-banda (bassi lenti, alti sui transienti). Ogni `fx:nuovo.400` riposiziona i filtri — la stessa musica pilota parametri diversi a ogni seed. Aggregate: `bass`, `mid`, `high`, `vol` (envelope).

## Base36 Table

Orca operates on a base of **36 increments**. Operators using numeric values will typically also operate on letters and convert them into values as per the following table. For instance `Do` will bang every *24th frame*. 

| **0** | **1** | **2** | **3** | **4** | **5** | **6** | **7** | **8** | **9** | **A** | **B**  | 
| :-:   | :-:   | :-:   | :-:   | :-:   | :-:   | :-:   | :-:   | :-:   | :-:   | :-:   | :-:    | 
| 0     | 1     | 2     | 3     | 4     | 5     | 6     | 7     | 8     | 9     | 10    | 11     |
| **C** | **D** | **E** | **F** | **G** | **H** | **I** | **J** | **K** | **L** | **M** | **N**  |
| 12    | 13    | 14    | 15    | 16    | 17    | 18    | 19    | 20    | 21    | 22    | 23     |
| **O** | **P** | **Q** | **R** | **S** | **T** | **U** | **V** | **W** | **X** | **Y** | **Z**  | 
| 24    | 25    | 26    | 27    | 28    | 29    | 30    | 31    | 32    | 33    | 34    | 35     |

## Transpose Table

The midi operator interprets any letter above the chromatic scale as a transpose value, for instance `3H`, is equivalent to `4A`.

| **0** | **1** | **2** | **3** | **4** | **5** | **6** | **7** | **8** | **9** | **A** | **B**  | 
| :-:   | :-:   | :-:   | :-:   | :-:   | :-:   | :-:   | :-:   | :-:   | :-:   | :-:   | :-:    | 
| _     | _     | _     | _     | _     | _     | _     | _     | _     | _     | A0    | B0     |
| **C** | **D** | **E** | **F** | **G** | **H** | **I** | **J** | **K** | **L** | **M** | **N**  |
| C0    | D0    | E0    | F0    | G0    | A0    | B0    | C1    | D1    | E1    | F1    | G1     | 
| **O** | **P** | **Q** | **R** | **S** | **T** | **U** | **V** | **W** | **X** | **Y** | **Z**  | 
| A1    | B1    | C2    | D2    | E2    | F2    | G2    | A2    | B2    | C3    | D3    | E3     | 

## Companion Applications

- [Pilot](https://github.com/hundredrabbits/pilot), a companion synth tool.
- [Aioi](https://github.com/MAKIO135/aioi), a companion to send complex OSC messages.
- [Estra](https://github.com/kyleaedwards/estra), a companion sampler tool.
- [Gull](https://github.com/qleonetti/gull), a companion sampler, slicer and synth tool.
- [Sonic Pi](https://in-thread.sonic-pi.net/t/using-orca-to-control-sonic-pi-with-osc/2381/), a livecoding environment.
- [Remora](https://github.com/martinberlin/Remora), a ESP32 Led controller firmware.

## Links

- [Overview Video](https://www.youtube.com/watch?v=RaI_TuISSJE)
- [Orca Podcast](https://futureofcoding.org/episodes/045)
- [Ableton & Unity3D](https://www.elizasj.com/unity_live_orca/)
- [Japanese Tutorial](https://qiita.com/rucochanman/items/98a4ea988ae99e04b333)
- [German Tutorial](http://tropone.de/2019/03/13/orca-ein-sequenzer-der-kryptischer-nicht-aussehen-kann-und-ein-versuch-einer-anleitung/)
- [French Tutorial](http://makingsound.fr/blog/orca-sequenceur-modulaire/)
- [Examples & Templates](https://git.sr.ht/~rabbits/orca-examples)

## Extras

- This application supports the [Ecosystem Theme](https://github.com/hundredrabbits/Themes).
- Download and share your patches on [PatchStorage](http://patchstorage.com/platform/orca/).
- Support this project through [Patreon](https://www.patreon.com/hundredrabbits).
- See the [License](LICENSE.md) file for license rights and limitations (MIT).
- Pull Requests are welcome!

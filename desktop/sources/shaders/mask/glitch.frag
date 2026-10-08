#version 300 es
// ============================================================================
// MASK GLITCH — shader DEDICATO alle emoticon della maschera facciale.
//
// Non fa parte della catena FX di Orkav (non è in sources/shaders/): è
// compilato da MaskFX (scripts/mask-fx.js) con le SUE uniform, e viene
// applicato all'emoji PRIMA che finisca nel feed. È sempre attivo: l'emoticon
// nasce già glitchata, dal primo frame in cui compare.
//
// Cosa fa, in ordine:
//   1. SLICE DISPLACE  — bande orizzontali spostate a scatti (quantizzate nel
//      tempo, così il glitch "scatta" invece di vibrare);
//   2. BLOCK CORRUPT   — blocchi rettangolari che copiano da un'altra zona;
//   3. RGB SPLIT       — separazione canali crescente verso i bordi;
//   4. TRACKING BAND   — una banda chiara che scorre verticalmente;
//   5. RIM NEON        — bordo luminoso ricavato dall'alpha, tinto con hue();
//   6. DROP/CUT        — su u_flash l'emoji si spezza e si ricompone.
//
// L'ALPHA è preservato: fuori dall'emoji resta trasparente, così la maschera
// continua a ritagliare il viso invece di diventare un quadrato.
// ============================================================================
precision highp float;

in vec2 v_uv;
out vec4 FragColor;

uniform sampler2D u_tex;    // l'emoticon rasterizzata (RGBA, sfondo trasparente)
uniform vec2  u_res;        // risoluzione del canvas maschera
uniform float u_time;       // secondi
uniform float u_seed;       // seed per attivazione (0..1)
uniform float u_int;        // intensità globale (0..1)
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_vol;
uniform float u_flash;
uniform float u_glitch;     // master on/off (0 = passthrough pulito)

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 uv = v_uv;

  // Tempo quantizzato: il glitch cambia a scatti (12-40 Hz), non in modo fluido.
  float rate = 12.0 + u_bass * 18.0 + u_flash * 30.0;
  float tk = floor(u_time * rate);

  float g = u_glitch * (0.55 + u_int * 0.45 + u_high * 0.35 + u_flash * 0.6);

  // ---------------------------------------------------------------- 1. SLICE
  // Bande orizzontali: quante e quanto larghe dipendono dal seed e dai bassi.
  float bands = 9.0 + floor(u_seed * 14.0) + u_bass * 10.0;
  float by = floor(uv.y * bands);
  float bh = hash(vec2(by, tk + u_seed * 37.0));
  // solo una parte delle bande si sposta ad ogni tick
  float live = step(0.42, bh);
  float shift = (hash(vec2(by * 3.1, tk * 1.7)) - 0.5) * 2.0;
  // quantizzato a passi grossi: si vede lo "scatto" digitale
  shift = floor(shift * 14.0) / 14.0;
  float amp = (0.030 + u_bass * 0.075 + u_flash * 0.10) * live * g;
  uv.x += shift * amp;

  // ------------------------------------------------------- 2. BLOCK CORRUPT
  // Griglia di blocchi: alcuni vengono riempiti da una zona diversa dell'emoji.
  vec2 bgrid = vec2(6.0 + floor(u_seed * 5.0), 6.0 + floor(u_seed * 7.0));
  vec2 bid = floor(uv * bgrid);
  float bsel = hash(bid + tk * 0.37 + u_seed * 11.0);
  if (bsel > 0.88) {
    vec2 src = vec2(hash(bid + 3.3), hash(bid + 8.8));
    src = floor(src * 8.0) / 8.0;
    uv = mix(uv, src, (0.55 + u_flash * 0.4) * g * step(0.88, bsel));
  }

  // --------------------------------------------------------- 3. RGB SPLIT
  // Separazione dei canali che cresce verso i bordi (e con le alte).
  vec2 c = uv - 0.5;
  float rad = length(c);
  float split = (0.004 + u_high * 0.020 + u_flash * 0.030) * (0.35 + rad * 1.8) * g;
  vec2 dir = normalize(c + vec2(1e-5));

  vec4 base = texture(u_tex, clamp(uv, 0.0, 1.0));
  vec4 sR = texture(u_tex, clamp(uv + dir * split, 0.0, 1.0));
  vec4 sB = texture(u_tex, clamp(uv - dir * split, 0.0, 1.0));
  vec4 sG = texture(u_tex, clamp(uv + vec2(0.0, split * 0.35), 0.0, 1.0));

  vec4 col = vec4(sR.r, sG.g, sB.b, base.a);

  // ------------------------------------------------------ 4. TRACKING BAND
  // Una banda chiara che scorre: aggiunge energia senza coprire l'emoji.
  float bandY = fract(u_time * (0.25 + u_seed * 0.5));
  float band = exp(-pow((uv.y - bandY) * 26.0, 2.0));
  col.rgb += vec3(0.55, 0.75, 1.0) * band * (0.22 + u_mid * 0.4) * g;

  // ---------------------------------------------------------- 5. RIM NEON
  // Bordo dall'alpha: l'emoji si stacca dal feed con un contorno acceso.
  float aC = texture(u_tex, clamp(uv, 0.0, 1.0)).a;
  float aX = texture(u_tex, clamp(uv + vec2(0.016, 0.0), 0.0, 1.0)).a;
  float aY = texture(u_tex, clamp(uv + vec2(0.0, 0.016), 0.0, 1.0)).a;
  float rim = clamp(aC - max(aX, aY), 0.0, 1.0);
  float hueA = u_seed * 6.2831 + u_time * (0.5 + u_bass * 1.2);
  vec3 neon = 0.5 + 0.5 * cos(hueA + vec3(0.0, 2.094, 4.188));
  col.rgb += neon * rim * (1.1 + u_high * 1.4 + u_flash * 1.6) * (0.35 + 0.65 * g);

  // ----------------------------------------------------------- 6. DROP / CUT
  // Sul flash l'emoji si spezza in due metà disallineate.
  if (u_flash > 0.45) {
    float cut = 0.5 + (hash(vec2(tk, u_seed * 9.0)) - 0.5) * 0.3;
    if (uv.y > cut) { col = texture(u_tex, clamp(vec2(uv.x + 0.06 * u_flash, uv.y), 0.0, 1.0)); }
  }

  // Micro-jitter del campione: rumore organico, non disturbo costante.
  float j = (vnoise(uv * 22.0 + u_time * 3.0) - 0.5) * 0.008 * g;
  vec4 jc = texture(u_tex, clamp(uv + vec2(j, j * 0.5), 0.0, 1.0));
  col = mix(col, jc, 0.25 * g);

  // Saturazione spinta: l'emoji glitchata deve essere più accesa dell'originale.
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  col.rgb = mix(vec3(lum), col.rgb, 1.0 + 0.55 * g);
  col.rgb *= (1.0 + 0.18 * g + u_bass * 0.22);

  // L'alpha non deve mai superare quello dell'emoji originale.
  col.a = clamp(max(col.a, aC * (0.85 + u_flash * 0.15)), 0.0, 1.0);

  // Passthrough pulito quando il glitch è spento.
  if (u_glitch < 0.5) { col = texture(u_tex, clamp(v_uv, 0.0, 1.0)); }

  FragColor = col;
}

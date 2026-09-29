// AMEBA (Alt+K) — LINEE VERTICALI CHE SLITTANO SULL'ASSE ORIZZONTALE.
// Il feed viene scomposto in strisce verticali: ognuna campiona l'immagine con
// un offset ORIZZONTALE proprio (deriva continua + oscillazione + spinta audio)
// e si muove a velocità e verso indipendenti. Niente caduta verticale: tutto il
// movimento vive sull'asse X.
void main(){
    vec2 uv = v_uv;
    float seed = u_int;
    float r1 = hash(vec2(seed * 31.7, 0.3));
    float r2 = hash(vec2(seed * 57.1, 1.7));
    float r3 = hash(vec2(seed * 97.3, 2.3));

    float b0 = u_pa.x, b1 = u_pa.y, b2 = u_pa.z, b3 = u_pa.w;
    float b4 = u_pb.x, b5 = u_pb.y, b6 = u_pb.z;
    float drive = u_pb.w;

    // --- Scomposizione in linee verticali (larghezza dal seed) ---
    float lines = mix(18.0, 150.0, r1);
    float li = floor(uv.x * lines);          // indice della linea
    float lf = fract(uv.x * lines);          // posizione dentro la linea
    float cx = (li + 0.5) / lines;           // centro X della linea

    // Profilo RMS della linea (u_wave = 16 finestre temporali)
    float wf = cx * 15.0;
    int i0 = int(clamp(floor(wf), 0.0, 15.0));
    int i1 = int(clamp(floor(wf) + 1.0, 0.0, 15.0));
    float rms = mix(u_wave[i0], u_wave[i1], fract(wf));

    // --- Parametri indipendenti PER LINEA ---
    float h1 = hash(vec2(li, r2 * 13.0));    // direzione / fase
    float h2 = hash(vec2(li, r3 * 29.0));    // velocità
    float dir = (h1 > 0.5) ? 1.0 : -1.0;
    float spd = (0.04 + h2 * 0.5) * (0.35 + drive * 1.7);

    // --- SPOSTAMENTO ORIZZONTALE ---
    // 1) deriva continua (loop con fract → le linee rientrano dall'altro lato)
    float drift = fract(u_time * spd * dir + h1) - 0.5;
    // 2) oscillazione lenta avanti/indietro
    float swing = sin(u_time * (0.35 + h2 * 1.2) + h1 * 6.2831) * (0.01 + r1 * 0.07);
    // 3) spinta audio: i bassi/rms spingono la linea lungo X
    float push = (rms * (0.10 + drive * 0.85) + b0 * 0.10) * (h2 - 0.5) * 2.0;
    float off = drift * (0.6 + r2 * 0.8) + swing + push;

    // La linea legge il feed spostato lungo X (wrap orizzontale continuo).
    // Il micro-jitter per pixel evita che la striscia risulti piatta.
    float jitter = (lf - 0.5) * (0.0015 + drive * 0.006);
    float sx = fract(cx + off + jitter);

    // RGB split orizzontale proporzionale allo spostamento della linea
    float ca = (0.0008 + abs(off) * 0.05) * (0.4 + drive);
    vec3 col;
    col.r = texture(u_tex, vec2(fract(sx + ca), uv.y)).r;
    col.g = texture(u_tex, vec2(sx, uv.y)).g;
    col.b = texture(u_tex, vec2(fract(sx - ca), uv.y)).b;

    // --- Bordo della linea: micro-glow che rende visibile la scomposizione ---
    float edge = 1.0 - smoothstep(0.0, 0.12, min(lf, 1.0 - lf));
    vec3 lineCol = hue(vec3(1.0, 0.35, 0.85), h1 * 6.2831 + u_time * 0.4 + b4 * 3.0);
    col = mix(col, lineCol * (0.30 + b5 * 0.8), edge * (0.14 + drive * 0.30));

    // Scansione verticale sottile: enfatizza il movimento orizzontale
    float scan = 0.5 + 0.5 * sin(uv.y * mix(60.0, 280.0, r2) + u_time * 2.5);
    col += vec3(scan * b2 * 0.07);

    // Le alte fanno lampeggiare le singole linee
    col += vec3((hash(vec2(li, floor(u_time * 24.0))) - 0.5) * b3 * 0.22);

    // Flash delle note dello score + strobe
    col += vec3(u_flash * 0.30);
    col = mix(col, vec3(1.0), u_strobe * 0.20);

    // Vignette
    col *= smoothstep(1.35, 0.45, length(uv - 0.5) * 1.3);

    FragColor = vec4(col, 1.0);
}

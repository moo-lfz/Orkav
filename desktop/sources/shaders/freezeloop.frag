// FREEZE LOOP (Alt+F) — congela PARTI dello schermo e le fa roteare in loop
// di pixel che si autoalimentano (feedback via u_prev, il frame precedente).
//
// Come funziona:
//  1) lo schermo è diviso in una griglia di blocchi;
//  2) alcuni blocchi sono "congelati" (selezione da hash + audio);
//  3) i blocchi congelati non leggono più il feed live: campionano il FRAME
//     PRECEDENTE con una rotazione (twirl) attorno al centro del blocco e se lo
//     rimandano indietro → i pixel girano in un loop chiuso;
//  4) un pizzico di frame live viene iniettato a ogni giro (decadimento < 1)
//     così il loop evolve e non si spegne né satura.
void main(){
    vec2 uv = v_uv;
    float seed = u_int;
    float r1 = hash(vec2(seed * 31.7, 0.3));
    float r2 = hash(vec2(seed * 57.1, 1.7));
    float r3 = hash(vec2(seed * 97.3, 2.3));

    float b0 = u_pa.x, b1 = u_pa.y, b2 = u_pa.z, b3 = u_pa.w;
    float b4 = u_pb.x, b5 = u_pb.y, b6 = u_pb.z;
    float drive = u_pb.w;

    // --- 1) Griglia di blocchi ---
    float cells = mix(3.0, 12.0, r1);
    vec2 gp = uv * cells;
    vec2 gid = floor(gp);
    vec2 luv = fract(gp);                    // 0..1 dentro il blocco
    float h = hash(gid + r2 * 17.0);         // identità del blocco

    // --- 2) Quali blocchi sono congelati? (hash + audio + tempo) ---
    // I bassi allargano la zona congelata; il tempo fa cambiare i blocchi
    // lentamente così il pattern "respira" invece di restare fisso.
    float morph = floor(u_time * (0.15 + r3 * 0.35));
    float hh = hash(gid + r2 * 17.0 + morph * 3.7);
    float thr = clamp(0.62 - b0 * 0.45 - drive * 0.25, 0.08, 0.95);
    float frozen = step(thr, hh);
    // I transienti (flash) congelano temporaneamente TUTTO
    frozen = max(frozen, u_flash);
    frozen = max(frozen, u_drop * 0.6);

    // --- 3) TWIRL: rotazione attorno al centro del blocco ---
    vec2 c = luv - 0.5;
    float radius = length(c);
    // angolo: velocità per-blocco + audio; più forte al centro (vortice)
    float ang = (0.25 + h * 1.4) * (0.5 + drive * 2.2) * u_time * (0.25 + r1 * 0.5);
    ang += sin(u_time * (0.3 + hh * 0.9) + h * 6.2831) * (0.35 + b1 * 1.2);
    float swirl = ang * (1.0 - smoothstep(0.0, 0.72, radius));
    vec2 ruv = rot(swirl) * c + 0.5;

    // UV del blocco TWIRLATO (dentro il blocco, clampato per non sconfinare)
    vec2 twirlUV = (gid + clamp(ruv, 0.0, 1.0)) / cells;

    // --- 4) Feedback: il frame precedente rimandato in circolo ---
    vec3 live = texture(u_tex, uv).rgb;
    vec3 prevHere = texture(u_prev, uv).rgb;
    vec3 prevTwirl = texture(u_prev, twirlUV).rgb;
    // Il loop mescola il pixel ruotato con quello fermo: il "vortice" trascina
    // i vicini e crea scie di pixel che girano.
    vec3 looped = mix(prevTwirl, prevHere, 0.30);
    // Decadimento < 1 (il loop non satura) + iniezione minima di frame live
    // (il loop non muore): il risultato è un ciclo di pixel stabile ed evolutivo.
    float decay = 0.955 - abs(b4 - 0.5) * 0.05;
    vec3 frozenCol = looped * decay + live * (1.0 - decay) * 1.6;
    // Leggera rotazione di tinta a ogni giro → il loop si vede "girare"
    frozenCol = hue(frozenCol, 0.012 + b5 * 0.05);

    // --- Composizione ---
    vec3 col = mix(live, frozenCol, frozen);

    // Bordo dei blocchi congelati: griglia luminosa che mostra le zone ghiacciate
    vec2 edgeD = min(luv, 1.0 - luv);
    float edge = 1.0 - smoothstep(0.0, 0.045, min(edgeD.x, edgeD.y));
    vec3 edgeCol = hue(vec3(0.55, 0.85, 1.0), h * 6.2831 + u_time * 0.5);
    col += edgeCol * edge * frozen * (0.18 + b2 * 0.5 + u_flash * 0.6);

    // Brina/vetro sui blocchi congelati (raggiunge anche i vicini non congelati)
    float frost = 0.0;
    {
        vec2 fgp = uv * cells;
        vec2 fgid = floor(fgp);
        float fh = hash(fgid + r2 * 17.0 + morph * 3.7);
        frost = step(thr, fh);
    }
    col = mix(col, col * 1.12 + vec3(0.05, 0.09, 0.14), frost * (0.25 + b3 * 0.3));

    // Cuore del vortice: un piccolo bagliore al centro dei blocchi congelati
    float core = exp(-radius * (7.0 + drive * 8.0)) * frozen;
    col += hue(vec3(1.0, 0.6, 0.9), h * 6.2831 + u_time) * core * (0.25 + b6 * 0.5);

    // Strobe
    col = mix(col, vec3(1.0), u_strobe * 0.22);

    // Vignette
    col *= smoothstep(1.35, 0.45, length(uv - 0.5) * 1.3);

    FragColor = vec4(col, 1.0);
}

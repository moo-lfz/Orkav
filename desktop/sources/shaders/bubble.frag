// SOAP FOAM (Alt+E) — schiuma di sapone densa sopra il feed.
//
// Come è fatto:
//  - CAMPO DI CELLE a due ottave di Worley relaxate; il bordo di Plateau (F2-F1)
//    disegna le giunzioni dove tre bolle si incontrano;
//  - la pellicola RIFRANGE il feed con una lente che cresce verso il bordo
//    (+ aberrazione cromatica) e il campo intero respira con warp();
//  - IRIDESCENZA thin-film: le bande di colore seguono lo spessore della
//    pellicola, quindi la geometria della cella, e derivano nel tempo;
//  - RIFLESSI BAGNATI sui bordi, scintillio sulle alte, pop sul flash;
//  - audio: bass = rigonfiamento/bolla, mid = densità+turbolenza, high = shimmer,
//    flash = bloom, drop = caduta del campo. I 6 parametri random cambiano
//    numero di celle, spessore, tinta, deriva, warp e contrasto.
void main(){
    float seed = u_int;

    // --- Parametri random per attivazione -----------------------------------
    float rA = hash(vec2(seed * 37.1, 0.7));   // densità / numero di celle
    float rB = hash(vec2(seed * 61.3, 1.9));   // spessore pellicola
    float rC = hash(vec2(seed * 89.7, 2.6));   // tinta
    float rD = hash(vec2(seed * 113.9, 3.4));  // deriva
    float rE = hash(vec2(seed * 149.3, 4.1));  // warp
    float rF = hash(vec2(seed * 191.7, 5.8));  // contrasto

    float u0 = u_pb.x;   // densità celle
    float u1 = u_pb.y;   // spessore pellicola
    float u2 = u_pb.z;   // tinta
    float u3 = u_pa.x;   // densità strato 2
    float u4 = u_pa.y;   // velocità deriva
    float u5 = u_pa.z;   // deformazione
    float drive = u_pb.w;

    // --- Audio --------------------------------------------------------------
    float bass = clamp(u_bass, 0.0, 1.6);
    float mid  = clamp(u_mid, 0.0, 1.6);
    float high = clamp(u_high, 0.0, 1.6);
    float pop  = clamp(u_flash + u_face.x * 0.35 * (0.3 + bass), 0.0, 1.6);

    // --- Spazio + deformazione di dominio -----------------------------------
    vec2 uv = dropUV(v_uv);
    float aspect = u_res.x / max(1.0, u_res.y);
    vec2 p = vec2(uv.x * aspect, uv.y);

    float wt = u_time * (0.10 + rD * 0.16 + u4 * 0.16) + seed * 11.0;
    float wamp = 0.05 + drive * 0.05 + rE * 0.05 + mid * 0.10;
    vec2 pw = warp(p * 0.9, wt * 0.6, wamp);

    // --- Campo di schiuma: 2 ottave di Worley relaxate ----------------------
    float dens = 9.0 + rA * 22.0 + u0 * 26.0 + u3 * 14.0;
    dens /= (1.0 + bass * 0.35 + u_face.x * 0.18);
    dens *= (1.0 - mid * 0.18 * (1.0 - 2.0 * rF));
    dens = clamp(dens, 5.0, 48.0);

    vec2 P = pw * dens;
    P += vec2(sin(P.y * 0.21 + wt * 1.7 + rC * 9.0),
              cos(P.x * 0.19 - wt * 1.3)) * (0.22 + bass * 0.40 + mid * 0.25);

    vec2 d1 = cellular2x2x2(vec3(P, wt * 0.13));
    vec2 P2 = rot(0.7 + rB * 2.6) * mat2(0.78, 0.62, -0.62, 0.78) * P;
    vec2 d2 = cellular2x2x2(vec3(P2, wt * 0.13 + 9.3));

    float F1 = d1.x, G1 = max(d1.y - d1.x, 0.0);
    float B2 = d2.x * 1.35, G2 = d2.y - d2.x;

    float phB = fract(seed * 7.13);                  // sfasamento fra le ottave
    B2 = mix(B2, mix(B2, F1, phB * 0.9), smoothstep(0.12, 0.52, mid));
    G2 = mix(G2, mix(G2, G1, phB * 0.9), smoothstep(0.12, 0.52, mid));

    float F = min(F1, B2);
    float low2 = step(B2, F1);                       // 1 = vince lo strato basso
    float G = mix(G1, max(G2, 0.0), low2);           // bordo di Plateau (F2-F1)
    float hs = mix(1.0 - low2, low2 * 0.65 + hash(vec2(seed * 3.7, 1.3)), 0.55);
    float rnd = hash(floor(P2) + hs * 37.0);

    // --- Spessore pellicola + iridescenza -----------------------------------
    float thick = F * (2.1 + rB * 3.4 + u1 * 2.6 + bass * 0.9 + u_face.x * 0.5)
                + rnd * 0.9;

    // rifrazione: normale della cella = gradiente del campo (stessa base ruotata)
    float gs = 0.02;
    vec2 dgx = cellular2x2x2(vec3(P + vec2(gs, 0.0), wt * 0.13));
    vec2 dgy = cellular2x2x2(vec3(P + vec2(0.0, gs), wt * 0.13));
    vec2 grad = vec2(dgx.x - F1, dgy.x - F1);
    float gl = length(grad);
    vec2 N = gl > 1e-5 ? grad / gl : vec2(0.0, 1.0);

    // --- Feed deformato: lente + aberrazione cromatica ----------------------
    float lens = (0.010 + drive * 0.022 + u5 * 0.012) * clamp(F * 4.5, 0.0, 1.8);
    vec2 defl = vec2(N.x / aspect, N.y) * lens;
    vec3 refr;
    refr.r = texture(u_tex, clamp(uv + defl * 1.30, 0.0, 1.0)).r;
    refr.g = texture(u_tex, clamp(uv + defl, 0.0, 1.0)).g;
    refr.b = texture(u_tex, clamp(uv + defl * 0.70, 0.0, 1.0)).b;

    // --- Iridescenza thin-film ---------------------------------------------
    float spess = thick + rB * 1.7 + hs * 0.9 + u_time * 0.22
                + bass * 0.45 + mid * 0.30 + u_face.x * 0.40 + u2 * 4.0;
    float contrast = 0.65 + rF * 1.4;
    vec3 irid = 0.5 + 0.5 * cos(6.2831 * (spess + vec3(0.0, 0.33, 0.67)));
    irid = pow(irid, vec3(contrast));
    irid = mix(irid, vec3(1.0), 0.15);
    irid *= mix(vec3(1.0), hue(vec3(1.0), (rC - 0.5) * 2.2 + u2 * 1.5), 0.55);

    float rim = smoothstep(0.22, 0.0, F);            // 1 sui bordi delle celle
    float body = 1.0 - rim;                          // 1 al centro (corpo trasparente)

    // --- Bordo bagnato / giunzione di Plateau -------------------------------
    float plateau = smoothstep(0.10, 0.0, G);        // dove tre celle si toccano

    float modu = 0.65 + 0.35 * sin(u_time * (1.7 + rD * 2.5) + hs * 6.2831
                                   + d1.x * 9.0 + P.x * 1.5);
    float rimspec = rim * modu;
    float shimmer = 1.0 + high * 1.1 * rimspec;
    float lit = (rimspec * (0.42 + drive * 0.32 + rB * 0.20)
                 + pow(plateau, 3.0) * (0.40 + pop * 0.55)
                 + pow(rim, 7.0) * 0.30) * shimmer;

    // --- Composito: schiuma traslucida sopra il feed ------------------------
    vec3 bg = texture(u_tex, uv).rgb;
    vec3 col = mix(bg, refr, clamp(0.35 + body * 0.45 + drive * 0.25, 0.0, 0.95));
    col = mix(col, col * irid, clamp(0.16 + rim * 0.60 + drive * 0.22, 0.0, 0.95));
    col += irid * body * (0.030 + bass * 0.07 + pop * 0.04);
    col += vec3(0.95, 0.98, 1.0) * lit * (0.40 + rF * 0.40);
    col += irid * exp(-F * 3.2) * (0.13 + drive * 0.18) * (0.7 + pop * 0.7);

    // turbolenza fine: grana bagnata sulle alte
    float grain = fbm(pw * (3.0 + mid * 6.0) + wt * 0.4 + vec2(0.0, -u_time * 0.3));
    col += (grain - 0.5) * (0.04 + high * 0.12) * (0.4 + rim);

    // scia di schiuma dal frame precedente
    vec3 prev = texture(u_prev, uv).rgb;
    col = mix(col, col * 0.72 + prev * 0.42, 0.10);

    // bloom soft
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col += col * smoothstep(0.55, 1.15, lum) * (0.30 + pop * 0.45 + drive * 0.20);

    // strobe + vignette
    col = mix(col, vec3(1.0), clamp(u_strobe * 0.18, 0.0, 0.5));
    col *= smoothstep(1.40, 0.40, length(v_uv - 0.5) * 1.28);

    FragColor = vec4(clamp(col, 0.0, 1.35), 1.0);
}

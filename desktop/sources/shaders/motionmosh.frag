// MOTION MOSH — datamosh vero con STIMA DEL MOVIMENTO fra frame (look P-frame).
// Idea: "displace the pixels while keeping a trace in opposition of the
// movement": si stima dove va il contenuto e si trascinano i pixel nel verso
// opposto, con la scia che resta in memoria (u_prev) per molte generazioni.
// 1) STIMA: griglia di blocchi (quanti = params+audio), block-match 5x5 (offset
//    -2..2, bounds FISSI) con SAD su 5 tap a croce fra u_prev e u_tex, più un
//    flusso locale (gradiente + diff. temporale) dove il match è debole, e una
//    deriva di rumore così la scia esiste anche su feed fermo.
// 2) SCIA: si campiona AVANTI lungo il moto (uv + mot*str) e lo si trascina qui,
//    quindi la traccia resta nella direzione OPPOSTA al movimento; ~2..11 px per
//    frame, la scia lunga nasce dall'ACCUMULO nel feedback, con un secondo tap.
// 3) FEEDBACK a persistenza alta ma con DECADIMENTO: rientra sempre un po' di
//    frame vivo, così le scie si accumulano e non saturano né muoiono.
// 4) ARTEFATTI P-frame: vettore quantizzato grosso, blocchi CONGELATI (vettore 0:
//    immagine ferma trascinata sopra lo sfondo che si muove), blocchi che SALTA-
//    NO (vettore moltiplicato) e chroma R/B spostato lungo il vettore.
// 5) AUDIO: bass = trascinamento + quota congelati, mid = blocchi e raggio di
//    ricerca, high = chroma + grana, flash = kick casuale sui vettori, drop =
//    saltello di campo via dropUV, regime = quantizzazione, drive = forza master.
// 6) I 6 param random cambiano blocchi, raggio, persistenza, quantizzazione,
//    chroma e freeze; u_face2.xy fa da attrattore per la scia.
void main(){
    vec2 uv = v_uv;
    float s = u_int;
    float r1 = hash(vec2(s * 31.7, 0.3)), r2 = hash(vec2(s * 57.1, 1.7)), r3 = hash(vec2(s * 97.3, 2.3));
    float p0 = u_pa.x, p1 = u_pa.y, p2 = u_pa.z, p3 = u_pa.w;
    float p4 = u_pb.x, p5 = u_pb.y, p6 = u_pb.z, drive = u_pb.w;
    float bass = clamp(u_bass, 0.0, 3.0), mid = clamp(u_mid, 0.0, 3.0), high = clamp(u_high, 0.0, 3.0);
    float reg = clamp(u_regime, 0.0, 3.0), fl = clamp(u_flash, 0.0, 3.0);
    vec3 L = vec3(0.299, 0.587, 0.114);

    // ---- griglia di blocchi (più blocchi = stima più fine) ----
    float bx = clamp(13.0 + r1 * 17.0 + p0 * 10.0 + mid * 5.0 - bass * 3.0, 8.0, 34.0);
    vec2 bres = vec2(bx, max(6.0, bx * 0.5625));
    vec2 gp = uv * bres, gid = floor(gp), luv = fract(gp);
    float bseed = dot(gid, vec2(1.0, 131.0)) + s * 71.3;
    vec2 px = 1.5 / u_res;                                   // ~1.5 pixel in uv
    float rscale = 1.0 + r2 * 2.0 + mid * 0.7;
    vec2 c = (gid + 0.5 + (luv - 0.5) * 0.35) / bres;        // centro blocco + dettaglio

    // ---- stima del moto: block-match 5x5 (SAD su 5 tap a croce) ----
    float w0 = 0.44, w1 = 0.14;
    float t0 = dot(texture(u_tex, c).rgb, L) * w0;
    float u0 = dot(texture(u_prev, c).rgb, L) * w0;
    float t1 = dot(texture(u_tex, c + vec2(px.x, 0.0)).rgb, L) * w1;
    float u1 = dot(texture(u_prev, c + vec2(px.x, 0.0)).rgb, L) * w1;
    float t2 = dot(texture(u_tex, c - vec2(px.x, 0.0)).rgb, L) * w1;
    float u2 = dot(texture(u_prev, c - vec2(px.x, 0.0)).rgb, L) * w1;
    float t3 = dot(texture(u_tex, c + vec2(0.0, px.y)).rgb, L) * w1;
    float u3 = dot(texture(u_prev, c + vec2(0.0, px.y)).rgb, L) * w1;
    float t4 = dot(texture(u_tex, c - vec2(0.0, px.y)).rgb, L) * w1;
    float u4 = dot(texture(u_prev, c - vec2(0.0, px.y)).rgb, L) * w1;
    float gx = t1 - t2, gy = t3 - t4, dt = t0 - u0;          // gradiente e diff. temporale
    float gap = t0 + t1 + t2 + t3 + t4;
    float bS = 9.0;
    vec2 mv = vec2(0.0);
    for(int y = -2; y <= 2; y++){
        for(int x = -2; x <= 2; x++){
            vec2 o = vec2(float(x), float(y)) * px * rscale;
            vec2 q = c + o;
            float a0 = dot(texture(u_prev, q).rgb, L) * w0;
            float a1 = dot(texture(u_prev, q + vec2(px.x, 0.0)).rgb, L) * w1;
            float a2 = dot(texture(u_prev, q - vec2(px.x, 0.0)).rgb, L) * w1;
            float a3 = dot(texture(u_prev, q + vec2(0.0, px.y)).rgb, L) * w1;
            float a4 = dot(texture(u_prev, q - vec2(0.0, px.y)).rgb, L) * w1;
            float sad = abs(a0 + a1 + a2 + a3 + a4 - gap);
            if(sad < bS){ bS = sad; mv = o; }
        }
    }
    // match scarso = zona disocclusa/rumore → vettore sporco
    float cost = smoothstep(0.02, 0.18, bS);
    float ok = 1.0 - cost;
    // flusso locale (gradiente + diff. temporale) solo dove il match è debole
    vec2 gf = vec2(gx, gy) * (-dt / (0.0008 + gx * gx + gy * gy)) * px * 0.012;
    gf = clamp(gf, -px * (1.0 + rscale), px * (1.0 + rscale)) * cost;
    // vettore in passi di ricerca ∈ [-2,2] → stima vera del moto
    vec2 v = clamp(mv / (px * rscale) + gf, vec2(-2.0), vec2(2.0));
    v *= mix(4.0, 26.0, 1.0 - r3 * 0.85);          // vettore in px (≈4..26)
    v += (vec2(hash(gid + 4.7), hash(gid + 9.1)) - 0.5) * px * 6.0 * cost;  // disturbo se match debole

    // ---- quantizzazione / freeze / salto (P-frame) ----
    float qq = mix(1.0, 1.0 / (0.34 + p1 * 0.5 + reg * 0.22), clamp(reg * 0.25 + p2 * 0.55, 0.0, 1.0));
    v = floor(v * qq + 0.5) / qq;
    float mot = smoothstep(px.x * 0.35, px.x * 6.0, length(v));
    float frz = clamp(0.10 + p3 * 0.60 + bass * 0.16 + drive * 0.20 + fl * 0.30, 0.0, 0.92);
    float frozen = step(1.0 - frz, hash(vec2(bseed, 7.7) + floor(u_time * (0.5 + p4 * 2.0)) * 0.37));
    float jump = step(1.0 - clamp(0.06 + p5 * 0.25 + fl * 0.25, 0.0, 0.5),
                      hash(vec2(bseed, 13.3) + floor(u_time * 1.7) * 0.71));
    v *= mix(1.0, 2.6, jump * (0.3 + 0.7 * mot));
    // deriva sintetica (feed fermo): mai dove il moto è stimato bene
    vec2 dr = vec2(vnoise(gp * 0.35 + u_time * 0.11), vnoise(gp * 0.35 - u_time * 0.09 + 7.3)) - 0.5;
    v = mix(v, dr * px * (3.0 + bass * 5.0 + drive * 4.0), 0.45 * (1.0 - mot) * (0.4 + 0.6 * cost));
    v += (vec2(hash(gid + floor(u_time * 9.0)), hash(gid - floor(u_time * 9.0) + 3.0)) - 0.5) * px * 22.0 * fl;
    if(u_face2.w > 0.001){
        vec2 fd = uv - vec2(u_face2.x, 1.0 - u_face2.y);
        vec2 fa = vec2(-fd.y, fd.x) / (dot(fd, fd) + 0.002);
        v += fa * px * 2.2 * clamp(u_face2.w, 0.0, 2.0) * (0.4 + mot);
    }

    // ---- lo smear: la traccia resta DIETRO al movimento ----
    // direzione unitaria del moto + ampiezza piccola: la scia si costruisce per
    // ACCUMULO nel feedback, così l'immagine non viene strappata via.
    vec2 dir = v * inversesqrt(max(dot(v, v), 1.0e-6));
    float nz = fbm(uv * 6.0 + vec2(u_time * 0.13, -u_time * 0.11));
    float str = (0.9 + drive * 3.6 + bass * 1.1 + u_vol * 0.7 + u_drop * 1.8) * mix(0.45, 1.35, nz);
    float amt = clamp(min(length(v), 26.0) * 0.28 * str, 0.0, 11.0);
    vec2 disp = dir * mot * amt / u_res;
    vec3 prv = texture(u_prev, uv).rgb;
    vec3 smr = mix(texture(u_prev, uv + disp).rgb, texture(u_prev, uv + disp * 1.60).rgb, 0.38);

    // ---- persistenza con decadimento ----
    float fresh = smoothstep(0.30, 0.85, length(texture(u_tex, uv).rgb - prv)) * (1.0 - mot * 0.6);
    vec3 live = texture(u_tex, dropUV(uv)).rgb;
    float gate = mix(0.45, 1.0, mot) * smoothstep(0.004, 0.06, 1.0 - nz) * (1.0 - frozen * 0.20);
    float pers = clamp(mix(0.55, 0.96, p4) + bass * 0.03 - high * 0.012, 0.35, 0.978);
    float wS = max(clamp(pers * drive * (0.35 + 0.75 * mot) * gate, 0.0, 1.0), frozen * (0.35 + 0.45 * drive));
    vec3 col = mix(live, smr, wS * 0.94);
    col = mix(col, col * smr, 0.16 * fresh);                 // traccia del match precedente
    col = mix(col, live, fresh * 0.35);                      // le zone nuove restano leggibili

    // ---- chroma trail + grana da compressione ----
    float sep = (1.0 + p5 * 6.0 + high * 3.0 + fl * 4.0) * mix(0.6, 1.6, r2);
    vec2 cd = clamp(disp * sep, vec2(-0.2), vec2(0.2));
    col.r = mix(col.r, texture(u_prev, uv + cd).r, 0.28);
    col.b = mix(col.b, texture(u_prev, uv - cd * 0.8).b, 0.28);
    float blk = hash(gid + floor(u_time * 6.0) * 0.53);
    col += (vnoise(uv * u_res * 0.6) - 0.5) * (0.06 + high * 0.05 + fl * 0.10);
    float q3 = 4.0 + p6 * 8.0;
    col = floor(col * q3 + 0.5) / q3;
    float wB = smoothstep(0.80 - reg * 0.06, 0.97, blk) * 0.35;
    col += (blk - 0.5) * wB * 0.30;
    col = mix(col, col * vec3(1.0, 0.985, 0.955) + vec3(0.01, 0.0, 0.015), (0.15 + p6 * 0.3) * mot);

    col = mix(col, vec3(1.0), u_strobe * 0.22);
    col *= smoothstep(1.45, 0.40, length(uv - 0.5) * 1.25);
    col = clamp(col, 0.0, 1.4);
    FragColor = vec4(col, 1.0);
}

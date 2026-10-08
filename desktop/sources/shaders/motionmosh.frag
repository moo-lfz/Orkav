// MOTION MOSH — datamosh P-frame: stima del moto + scia opposta al movimento +
// traccia in feedback, SBILANCIATO SUL GLITCH. La vecchia chiusura a pochi
// livelli piatti di colore leggeva come POSTERIZE: TOLTA, ne resta solo una
// quantizzazione debolissima su ~10% dei blocchi (compressione). Il
// peso e' ora sugli artefatti, quantizzati in TEMPO così SCATTANO:
// 1) STIMA: griglia di blocchi, block-match 5x5 (offset -2..2, FISSI) con
//    SAD su 5 tap a croce fra u_prev e u_tex + flusso locale se il match e'
//    debole + deriva di rumore: la scia esiste anche su feed fermo.
// 2) SCIA: si campiona AVANTI lungo il moto e lo si trascina qui (traccia nella
//    direzione OPPOSTA al movimento), accumulata nel feedback con decadimento.
// 3) TEARING: righe spostate a scatti, righe tirate da una vicina (repeat) e
//    "byte shift" per banda col rientro dal wrap sbagliato.
// 4) BLOCCHI: macroblocchi copiati da un'altra zona (salti grossi) e blocchi
//    che RIPETONO il frame precedente (macroblocco congelato, P-frame rotto).
// 5) RGB BURST: canali separati forte AD IMPULSI, lungo il moto E lungo una
//    direzione random per blocco.
// 6) DATABENDING: streak di luminanza tipo pixel-sort che allungano la banda.
// 7) AUDIO: bass = trascinamento + quota congelati, mid = blocchi/raggio,
//    high = tearing + chroma, flash = burst, drop = salto via dropUV, regime =
//    quantizzazione del vettore, drive = forza master.
void main(){
  vec2 uv = v_uv;
  float s = u_int;
  float r1 = hash(vec2(s * 31.7, 0.3)), r2 = hash(vec2(s * 57.1, 1.7)), r3 = hash(vec2(s * 97.3, 2.3));
  float p0 = u_pa.x, p1 = u_pa.y, p2 = u_pa.z, p3 = u_pa.w;
  float p4 = u_pb.x, p5 = u_pb.y, p6 = u_pb.z, drive = u_pb.w;
  float bass = clamp(u_bass, 0.0, 3.0), mid = clamp(u_mid, 0.0, 3.0), high = clamp(u_high, 0.0, 3.0);
  float reg = clamp(u_regime, 0.0, 3.0), fl = clamp(u_flash, 0.0, 3.0);
  vec3 L = vec3(0.299, 0.587, 0.114);
  // tempo quantizzato: il glitch scatta
  float tq = mod(floor(u_time * (5.0 + r1 * 8.0 + high * 2.0 + fl * 5.0)), 89.0);
  float th = mod(floor(u_time * (11.0 + p4 * 14.0 + high * 6.0 + fl * 18.0)), 151.0);
  // rgb burst: impulsi, mai offset costante
  float burst = step(mix(0.86, 0.54, clamp(high * 0.30 + fl * 0.28 + p5 * 0.42, 0.0, 1.0)), hash(vec2(tq * 0.517, r2 * 9.0 + 2.3)));
  // griglia di blocchi
  float bx = clamp(13.0 + r1 * 17.0 + p0 * 10.0 + mid * 5.0 - bass * 3.0, 8.0, 34.0);
  vec2 bres = vec2(bx, max(6.0, bx * 0.5625));
  vec2 gp = uv * bres, gid = floor(gp), luv = fract(gp);
  float bseed = dot(gid, vec2(1.0, 131.0)) + s * 71.3;
  vec2 px = 1.5 / u_res;
  vec2 ex = vec2(px.x, 0.0), ey = vec2(0.0, px.y);
  float rscale = 1.0 + r2 * 2.0 + mid * 0.7;
  vec2 c = (gid + 0.5 + (luv - 0.5) * 0.35) / bres;
  // block-match 5x5 (SAD su 5 tap a croce)
  float w0 = 0.44, w1 = 0.14;
  float t0 = dot(texture(u_tex, c).rgb, L) * w0, u0 = dot(texture(u_prev, c).rgb, L) * w0;
  float t1 = dot(texture(u_tex, c + ex).rgb, L) * w1, u1 = dot(texture(u_prev, c + ex).rgb, L) * w1;
  float t2 = dot(texture(u_tex, c - ex).rgb, L) * w1, u2 = dot(texture(u_prev, c - ex).rgb, L) * w1;
  float t3 = dot(texture(u_tex, c + ey).rgb, L) * w1, u3 = dot(texture(u_prev, c + ey).rgb, L) * w1;
  float t4 = dot(texture(u_tex, c - ey).rgb, L) * w1, u4 = dot(texture(u_prev, c - ey).rgb, L) * w1;
  float gx = t1 - t2, gy = t3 - t4, dt = t0 - u0, gap = t0 + t1 + t2 + t3 + t4;
  float bS = 9.0; vec2 mv = vec2(0.0);
  for(int y = -2; y <= 2; y++){
    for(int x = -2; x <= 2; x++){
      vec2 o = vec2(float(x), float(y)) * px * rscale, q = c + o;
      float a0 = dot(texture(u_prev, q).rgb, L) * w0;
      float a1 = dot(texture(u_prev, q + ex).rgb, L) * w1;
      float a2 = dot(texture(u_prev, q - ex).rgb, L) * w1;
      float a3 = dot(texture(u_prev, q + ey).rgb, L) * w1;
      float a4 = dot(texture(u_prev, q - ey).rgb, L) * w1;
      float sad = abs(a0 + a1 + a2 + a3 + a4 - gap);
      if(sad < bS){ bS = sad; mv = o; }
    }
  }
  float cost = smoothstep(0.02, 0.18, bS);   // match scarso = zona disocclusa
  vec2 gf = vec2(gx, gy) * (-dt / (0.0008 + gx * gx + gy * gy)) * px * 0.012;
  gf = clamp(gf, -px * (1.0 + rscale), px * (1.0 + rscale)) * cost;
  vec2 v = clamp(mv / (px * rscale) + gf, vec2(-2.0), vec2(2.0));
  v *= mix(4.0, 26.0, 1.0 - r3 * 0.85);      // vettore in px (≈4..26)
  v += (vec2(hash(gid + 4.7), hash(gid + 9.1)) - 0.5) * px * 6.0 * cost;
  // freeze / salto (P-frame)
  float qq = mix(1.0, 1.0 / (0.34 + p1 * 0.5 + reg * 0.22), clamp(reg * 0.25 + p2 * 0.55, 0.0, 1.0));
  v = floor(v * qq + 0.5) / qq;
  float mot = smoothstep(px.x * 0.35, px.x * 6.0, length(v));
  float frz = clamp(0.10 + p3 * 0.60 + bass * 0.16 + drive * 0.20 + fl * 0.30, 0.0, 0.92);
  float frozen = step(1.0 - frz, hash(vec2(bseed, 7.7) + floor(u_time * (0.5 + p4 * 2.0)) * 0.37));
  float jmp = step(1.0 - clamp(0.06 + p5 * 0.25 + fl * 0.25, 0.0, 0.5), hash(vec2(bseed, 13.3) + floor(u_time * 1.7) * 0.71));
  v *= mix(1.0, 2.6, jmp * (0.3 + 0.7 * mot));
  vec2 dr = vec2(vnoise(gp * 0.35 + u_time * 0.11), vnoise(gp * 0.35 - u_time * 0.09 + 7.3)) - 0.5;
  v = mix(v, dr * px * (3.0 + bass * 5.0 + drive * 4.0), 0.45 * (1.0 - mot) * (0.4 + 0.6 * cost));
  v += (vec2(hash(gid + floor(u_time * 9.0)), hash(gid - floor(u_time * 9.0) + 3.0)) - 0.5) * px * 22.0 * fl;
  if(u_face2.w > 0.001){
    vec2 fd = uv - vec2(u_face2.x, 1.0 - u_face2.y);
    v += vec2(-fd.y, fd.x) / (dot(fd, fd) + 0.002) * px * 2.2 * clamp(u_face2.w, 0.0, 2.0) * (0.4 + mot);
  }
  // scia: campiona AVANTI lungo il moto
  vec2 dir = v * inversesqrt(max(dot(v, v), 1.0e-6));
  float nz = fbm(uv * 6.0 + vec2(u_time * 0.13, -u_time * 0.11));
  float str = (0.9 + drive * 3.6 + bass * 1.1 + u_vol * 0.7 + u_drop * 1.8) * mix(0.45, 1.35, nz);
  float amt = clamp(min(length(v), 26.0) * 0.28 * str, 0.0, 11.0);
  vec2 disp = dir * mot * amt / u_res;
  // tearing orizzontale
  float rows = 34.0 + r2 * 62.0 + high * 20.0 + fl * 26.0, ry = floor(uv.y * rows);
  float tgate = mix(0.90, 0.58, clamp(p0 * 0.55 + mid * 0.10 + high * 0.12 + fl * 0.35, 0.0, 1.0));
  float tear = step(1.0 - tgate, hash(vec2(ry * 1.13, th * 0.731 + r3 * 13.0)));
  float tmag = min(0.12, (0.004 + 0.05 * hash(vec2(ry, th + 21.0))) * (0.4 + drive * 1.1 + fl * 1.1));
  float tdir = hash(vec2(ry * 2.19, th * 0.417 + 9.0)) * 2.0 - 1.0;
  float tsk = floor(hash(vec2(ry * 3.31, th + 4.0)) * 4.0 + 1.0);
  vec2 guv = uv;
  guv.x = fract(uv.x + tdir * tmag * tear);
  // righe tirate da una vicina (repeat)
  guv.y = mix(guv.y, clamp(uv.y + (hash(vec2(ry, th + 33.0)) * 2.0 - 1.0) * tsk / rows, 0.0, 1.0),
              tear * step(0.55, hash(vec2(ry * 1.71, th * 0.293 + 17.0))));
  // byte shift: rientro dal wrap sbagliato
  float by = floor(guv.y * (9.0 + p6 * 22.0 + high * 6.0));
  float bsh = step(mix(0.94, 0.72, clamp(p3 * 0.50 + fl * 0.40 + high * 0.20, 0.0, 1.0)), hash(vec2(by * 3.3, th * 0.311 + 6.0)));
  guv.x = fract(guv.x + (hash(vec2(by, th + 31.0)) - 0.5) * min(0.28, 0.08 + 0.30 * fl + 0.14 * high) * bsh);
  // blocchi copiati altrove
  vec2 mb = vec2(8.0, 5.0 + p1 * 7.0), mg = floor(uv * mb);
  float mgate = mix(0.94, 0.74, clamp(p2 * 0.45 + bass * 0.15 + high * 0.12 + fl * 0.30 + u_drop * 0.25, 0.0, 1.0));
  float mhit = step(1.0 - mgate, hash(mg + vec2(3.1, 17.7) + tq * 0.311));
  vec2 jm = (vec2(hash(mg + 8.3 + tq), hash(mg + 19.1 - tq)) - 0.5) * min(0.55, 0.22 + 0.30 * fl + 0.25 * drive);
  vec2 suv = fract(guv + jm * mhit);
  float stuck = step(mix(0.94, 0.78, clamp(p3 * 0.50 + bass * 0.15 + drive * 0.30, 0.0, 1.0)), hash(mg + vec2(51.7, 9.3) + tq * 0.173));
  vec2 blk = mg / mb + fract(uv * mb) / mb;
  // scia dai coord strappati, vivo ancorato a uv (immagine leggibile sotto)
  vec3 prv = texture(u_prev, suv).rgb;
  vec3 smr = mix(texture(u_prev, suv + disp).rgb, texture(u_prev, suv + disp * 1.60).rgb, 0.38);
  vec3 live = texture(u_tex, dropUV(uv)).rgb;
  // persistenza
  float fresh = smoothstep(0.30, 0.85, length(texture(u_tex, suv).rgb - prv)) * (1.0 - mot * 0.6);
  float gate = mix(0.45, 1.0, mot) * smoothstep(0.004, 0.06, 1.0 - nz) * (1.0 - frozen * 0.20);
  float pers = clamp(mix(0.55, 0.96, p4) + bass * 0.03 - high * 0.012, 0.35, 0.978);
  float wS = max(clamp(pers * drive * (0.35 + 0.75 * mot) * gate, 0.0, 1.0), frozen * (0.35 + 0.45 * drive));
  vec3 col = mix(live, smr, wS * 0.94);
  col = mix(col, live, fresh * 0.35);
  // stuck block: ripete il prev
  col = mix(col, texture(u_prev, blk).rgb, clamp(stuck * (0.20 + 0.32 * drive), 0.0, 0.55));
  // rgb burst: canali separati ad impulsi
  float ra = hash(gid + 5.5) * 6.2831;
  float sep = min(26.0, 5.0 + p5 * 12.0 + bass * 3.0 + high * 9.0 + fl * 26.0) * (0.30 + 0.70 * drive) / u_res.x;
  vec2 cdo = (dir * (1.0 + fl * 2.0) + vec2(cos(ra), sin(ra)) * (1.3 + fl * 2.2)) * sep * burst;
  float cs = burst * (0.35 + 0.60 * drive);
  col.r = mix(col.r, texture(u_prev, suv + cdo).r, cs);
  col.b = mix(col.b, texture(u_prev, suv - cdo).b, cs);
  // databending: streak tipo pixel-sort
  float sgate = step(mix(0.90, 0.68, clamp(p6 * 0.50 + fl * 0.35 + high * 0.15, 0.0, 1.0)), hash(vec2(by * 1.7, th * 0.213 + 44.0)));
  float sgn = hash(vec2(by, 3.0)) * 2.0 - 1.0, sl = 0.0;
  for(int i = 0; i < 4; i++){
    sl = max(sl, dot(texture(u_prev, suv + vec2(sgn * float(i) * 0.013, 0.0)).rgb, L));
  }
  col = mix(col, col * (0.72 + 0.72 * sl), sgate * (0.30 + 0.30 * drive));
  // quantizzazione su pochi blocchi
  float qmask = step(0.90 - reg * 0.04 - p6 * 0.05, hash(gid + vec2(7.7, 2.1) + tq * 0.37));
  col = mix(col, floor(col * 7.0 + 0.5) / 7.0, qmask * 0.5 * (0.4 + 0.6 * drive));
  col += (vnoise(uv * u_res * 0.6 + th) - 0.5) * (0.05 + high * 0.05 + fl * 0.10);
  col = hue(col, (hash(vec2(tq, 3.3)) - 0.5) * 0.45 * burst);
  col = mix(col, vec3(1.0), u_strobe * 0.22);
  col *= smoothstep(1.45, 0.40, length(uv - 0.5) * 1.25);
  col = clamp(col, 0.0, 1.4);
  FragColor = vec4(col, 1.0);
}

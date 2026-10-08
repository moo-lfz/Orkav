// VETRO INFRANTO — shard Worley irregolari, rifrazione per-shard con dispersione
// cromatica, bisello speculare + bordi di Plateau, rete di crepe capillari secondarie,
// parallasse di profondita', esplosioni a scatti (burst), feedback e reattivita' audio.
void main() {
    vec2 uv = dropUV(v_uv);
    float seed = u_int;
    float p0 = u_pa.x, p1 = u_pa.y, p2 = u_pa.z, p5 = u_pb.z;
    float drive = clamp(u_pb.w, 0.0, 1.0);

    float r1 = hash(vec2(seed * 31.7, 3.1));
    float r2 = hash(vec2(seed * 57.3, 1.7));
    float r3 = hash(vec2(seed * 97.1, 8.3));

    // parametri random (cambiano aspetto tra attivazioni)
    float cellN = 3.0 + p0 * 11.0 + r1 * 2.5 + u_bass * 1.6;         // densita' shard
    float crackA = (p1 - 0.5) * 2.2 + r2 * 2.0 + u_mid * 0.4;        // angolo crepe
    float dispS = (0.010 + p2 * 0.075) * (0.35 + drive);             // scala spostamento
    float dispA = 0.5 + r3 * 2.5 + u_high * 1.2;                     // dispersione
    float tintA = p5 * 6.2831 + u_time * 0.15;                       // tinta caustiche

    // burst temporale: gli shard si assestano e poi ri-saltano
    float rate = 1.5 + r1 * 5.0 + p1 * 4.0 + u_regime * 3.0;
    float tk = floor(u_time * rate);
    float punch = 0.30 + u_bass * 1.3 + u_drop * 1.6 + u_face.x * 0.8;
    float dscale = dispS * (0.4 + drive * 1.4) * punch;

    vec2 asp = vec2(u_res.x / max(u_res.y, 1.0), 1.0);
    vec2 g = rot(crackA) * (uv - 0.5) * asp * cellN;

    // --- shard: cella piu' vicina + bordo + profondita' (jitter dal tempo) ---
    vec2 ci = floor(g), cf = fract(g);
    float d1 = 8.0, d2 = 8.0, idv = 0.0;
    vec2 sid = vec2(0.0), soff = vec2(0.0);
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 o = vec2(float(x), float(y));
            vec2 ci2 = ci + o;
            float h1 = hash(ci2 + r2 * 11.0);
            vec2 jit = vec2(h1, hash(ci2 + 7.7)) * 0.62 + 0.19;
            jit = mix(jit, vec2(0.5) + 0.5 * sin(u_time * 1.1 + 6.2831 * jit), 0.05 * drive);
            float dd = length(o + jit - cf);
            if (dd < d1) { d2 = d1; d1 = dd; idv = h1; sid = ci2; }
            else if (dd < d2) { d2 = dd; }
        }
    }
    float edge = d2 - d1;                       // distanza dal bordo dello shard
    float depth = 0.35 + hash(sid + 21.3) * 0.65;   // parallasse: 0.35 .. 1.0

    // spinta per-shard (burst): solo una parte degli shard schizza via
    float kick = step(1.0 - (0.25 + drive * 0.5), hash(sid + tk * 1.73));
    vec2 dir = vec2(hash(sid + 1.31), hash(sid + 4.19)) - 0.5;
    soff = dir * normalize(dir + 1e-4) * kick * dscale * (0.5 + depth);
    soff += vec2(hash(sid + 9.1) - 0.5, hash(sid + 2.7) - 0.5) * dscale * 0.35 * punch;

    // --- rifrazione per-shard: offset + piccola rotazione attorno al centro ---
    vec2 tl = (sid + 0.5 + soff) / cellN;
    vec2 gs = g - tl;
    float sp = (idv - 0.5) * (0.30 + drive * 0.45) * (0.4 + u_bass * 1.2) * (0.3 + depth);
    gs = rot(sp) * gs;
    vec2 suv = rot(-crackA) * ((gs + soff) / cellN) / asp + 0.5;

    // --- dispersione cromatica (vetro piu' spesso verso i bordi) ---
    float thick = 1.0 + (1.0 - smoothstep(0.0, 0.22, edge)) * 2.0;
    float disp = dispS * dispA * depth * thick * (1.0 + u_high * 2.6 + drive * 0.8);
    vec2 pd = normalize(gs + 1e-4) * disp;
    vec3 col;
    col.r = texture(u_tex, clamp(suv + pd, 0.0, 1.0)).r;
    col.g = texture(u_tex, clamp(suv, 0.0, 1.0)).g;
    col.b = texture(u_tex, clamp(suv - pd, 0.0, 1.0)).b;
    // fuori dal feed: bordo scuro invece di striature di clamp
    float inb = (1.0 - smoothstep(0.0, 0.02, -suv.x)) * (1.0 - smoothstep(1.0, 0.98, suv.x));
    inb *= (1.0 - smoothstep(0.0, 0.02, -suv.y)) * (1.0 - smoothstep(1.0, 0.98, suv.y));
    col *= mix(0.35, 1.0, clamp(inb, 0.0, 1.0));

    // --- bisello: cresta luminosa + interno in ombra + glint speculare ---
    float bev = 1.0 - smoothstep(0.0, 0.13, edge);
    float bp = pow(bev, 6.0);
    col *= mix(0.52 + depth * 0.35, 1.06, bev);
    col = mix(col, vec3(1.0), bp * 0.55);

    // --- crepe secondarie (rete fine): raccolte nel giro sopra + una cella in piu' ---
    float crk = 1.0 - smoothstep(0.0, 0.035 + 0.05 * p2, d2 - d1);
    vec2 g2 = g * 2.6 + vec2(3.1, 5.7);
    vec2 q = floor(g2);
    vec2 cf2 = fract(g2);
    float d3 = 8.0, d4 = 8.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 o = vec2(float(x), float(y));
            vec2 jit = vec2(hash(q + o + 3.9), hash(q + o + 11.7));
            float dd = length(o + jit - cf2);
            if (dd < d3) { d4 = d3; d3 = dd; } else if (dd < d4) { d4 = dd; }
        }
    }
    float fine = 1.0 - smoothstep(0.0, 0.05, d4 - d3);
    float crack = max(crk, fine * (0.55 + u_mid * 0.6));
    float glow = crack * (0.10 + u_mid * 0.45 + u_flash * 1.2 + u_bass * 0.35);
    col += hue(vec3(0.55, 0.8, 1.0), tintA) * glow;
    float hairl = pow(1.0 - smoothstep(0.0, 0.012, abs(d4 - d3)), 3.0);
    col += vec3(1.0) * hairl * (0.06 + u_high * 0.5);

    // glint speculare di bordo + bordo di Plateau (piu' shard si incontrano)
    float glint = pow(bev, 22.0);
    float plat = pow(bev, 3.0) * (1.0 - bev);
    col += vec3(1.0, 0.96, 0.90) * glint * (0.35 + u_high * 1.4) * depth;
    col += hue(vec3(1.0), tintA * 0.5) * plat * (0.10 + u_flash * 0.8 + u_mid * 0.3);

    // profondita': shard lontani piu' scuri e desaturati
    col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))) * 0.75, (1.0 - depth) * 0.35 * (1.0 - bev));

    // feedback breve: le schegge in movimento strisciano
    vec3 pv = texture(u_prev, clamp(suv * 0.5 + v_uv * 0.5, 0.0, 1.0)).rgb;
    col = mix(col, max(col, pv * 0.92), 0.10 + u_bass * 0.16);

    col = mix(col, ramp(clamp(dot(col, vec3(0.333)), 0.0, 1.0)), 0.12 + p0 * 0.10 + u_mid * 0.08);
    col += col * (0.18 + drive * 0.35);

    col = mix(col, vec3(1.0), clamp(u_flash * 0.35 + u_strobe * 0.45, 0.0, 0.75));

    // vignettatura morbida
    vec2 vg = (v_uv - 0.5) * vec2(1.12, 1.0);
    col *= 1.0 - dot(vg, vg) * (0.35 + 0.25 * drive);
    FragColor = vec4(clamp(col, 0.0, 1.6), 1.0);
}

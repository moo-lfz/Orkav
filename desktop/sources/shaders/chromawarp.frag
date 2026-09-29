void main() {
    vec2 uv = v_uv;
    float seed = u_int;
    float r1 = hash(vec2(seed * 13.7, 1.1));
    float r2 = hash(vec2(seed * 43.9, 2.7));
    float r3 = hash(vec2(seed * 79.3, 3.3));

    // PRISMA: bande orizzontali che rifrangono lo spettro (NO noise-warp)
    float bands = 6.0 + floor(r1 * 10.0); // 6-16 fasce
    float yb = floor(uv.y * bands) / bands;
    float stripe = fract(uv.y * bands);

    // Ogni fascia ha uno shift cromatico diverso, mosso da audio + seed
    float phase = hash(vec2(yb * 13.0, r2 * 5.0));
    float anim = u_time * (0.5 + phase) + u_pa.x * 2.0;
    float shift = (sin(anim + yb * 40.0) * 0.5 + 0.5) * (0.01 + r3 * 0.04 + u_pa.y * 0.04);

    // Curvatura verticale (deformazione prismatica)
    float curve = (0.2 + u_bass * 1.5) * sin(uv.y * 3.14159 * (1.0 + phase));
    uv.x += shift + curve * 0.01;

    // RGB split per canale (abberrazione cromatica)
    float ca = 0.003 + u_high * 0.03 + u_pb.w * 0.01;
    vec3 col;
    col.r = texture(u_tex, clamp(uv + vec2(ca, curve * 0.005), 0.0, 1.0)).r;
    col.g = texture(u_tex, clamp(uv, 0.0, 1.0)).g;
    col.b = texture(u_tex, clamp(uv - vec2(ca, -curve * 0.005), 0.0, 1.0)).b;

    // Bordi fascia: linee spettrali luminose
    float line = smoothstep(0.0, 0.05, min(stripe, 1.0 - stripe));
    col = mix(col, vec3(1.0, 0.3, 0.8) * (0.8 + u_pa.z), (1.0 - line) * 0.35);

    // Solarizzazione a scatti col tempo (inversione)
    float sol = step(0.7 + u_mid * 0.3, sin(u_time * 2.0 + phase * 6.28));
    col = mix(col, 1.0 - col, sol * 0.6 * r1);

    // Tonalità ruotata da bande medie/alte
    col = hue(col, (u_mid * 0.5 + u_high * 1.2) * 3.14159 + r2 * 6.28);

    // Vignette
    col *= smoothstep(1.4, 0.4, length(uv - 0.5) * 1.4);

    // Score flash
    col += vec3(u_flash * 0.35);

    FragColor = vec4(col, 1.0);
}

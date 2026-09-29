void main() {
    vec2 uv = dropUV(v_uv);
    float seed = u_int;
    // 3 parametri random dal seed
    float r1 = hash(vec2(seed * 31.7, 0.3));
    float r2 = hash(vec2(seed * 57.1, 1.7));
    float r3 = hash(vec2(seed * 97.3, 2.3));

    // Fratture di vetro: griglia angolata in shard triangolari (NO cerchi)
    // angolo delle fratture ruotato dal seed + audio
    float ang = r1 * 6.2831 + u_pa.x * 2.0;
    mat2 rotM = rot(ang * 0.3);
    vec2 gp = rotM * (uv - 0.5) * (4.0 + r2 * 6.0 + u_bass * 3.0);

    // Celle fratturate: ogni shard ha un offset random
    vec2 cell = floor(gp);
    vec2 f = fract(gp) - 0.5;
    float id = hash(cell + r3 * 7.0);

    // Frattura temporale: gli shard si spostano a scatti col beat
    float tk = floor(u_time * (3.0 + u_regime * 6.0));
    float crack = step(0.55 + u_high * 0.3, hash(cell + tk * 1.7));
    vec2 shard = (vec2(hash(cell + 1.3), hash(cell + 5.9)) - 0.5) * crack * (0.3 + u_pa.y * 0.5) * (0.4 + u_pb.w * 1.2);

    // Offset grosso a livello di shard (fratture nette, quantizzate)
    vec2 off = floor(shard * 24.0) / 24.0;
    vec2 suv = uv + off * u_int;

    vec3 col = texture(u_tex, clamp(suv, 0.0, 1.0)).rgb;

    // Linee di frattura: bordi degli shard luminosi
    float edgeX = smoothstep(0.0, 0.06, abs(f.x));
    float edgeY = smoothstep(0.0, 0.06, abs(f.y));
    float edge = max(edgeX, edgeY);
    vec3 crackColor = mix(vec3(1.0), vec3(u_pa.z, u_pa.w, u_pb.x) * 2.0, r1);
    col = mix(col, crackColor, (1.0 - edge) * 0.7 * crack);

    // RGB split sulle fratture (bande alte)
    float chroma = 0.004 + u_high * 0.03 * u_pb.w;
    col.r = texture(u_tex, clamp(suv + vec2(chroma, 0.0), 0.0, 1.0)).r;
    col.b = texture(u_tex, clamp(suv - vec2(chroma, 0.0), 0.0, 1.0)).b;

    // Score flash → schegge bianche
    col += vec3(u_flash * 0.5 * crack);

    // Strobe sulle bande alte
    col = mix(col, vec3(1.0), u_strobe * 0.3);

    // Quantizzazione colore aggressiva
    col = floor(col * (4.0 + r2 * 5.0)) / (4.0 + r2 * 5.0);

    FragColor = vec4(col, 1.0);
}

void main() {
    // GLOW / BLOOM: estrae le zone luminose, le sfuma e le riaggiunge al feed.
    // Reattivo a bassi (intensità glow), high (soglia), face mouth (dimensione alone)
    vec3 base = texture(u_tex, v_uv).rgb;

    // Luminanza percepita
    float lum = dot(base, vec3(0.299, 0.587, 0.114));

    // Soglia: sotto questa luminanza niente glow. Modulata da u_high e u_pa.x
    float thresh = 0.45 - u_high * 0.25 - u_face.x * 0.15;
    thresh = clamp(thresh, 0.15, 0.6);
    float bright = smoothstep(thresh, 1.0, lum);

    // Campiona l'intorno per costruire l'alone (bloom a raggio variabile)
    // Raggio più grande con bassi e bocca aperta
    float radius = (2.0 + u_bass * 6.0 + u_face.x * 4.0) / u_res.y;
    vec3 glow = vec3(0.0);
    float wsum = 0.0;
    for (int i = -2; i <= 2; i++) {
        for (int j = -2; j <= 2; j++) {
            vec2 off = vec2(float(i), float(j)) * radius;
            vec3 s = texture(u_tex, clamp(v_uv + off, 0.0, 1.0)).rgb;
            float sl = dot(s, vec3(0.299, 0.587, 0.114));
            float w = smoothstep(thresh, 1.0, sl);
            // peso gaussiano approssimato
            float d = float(i * i + j * j);
            w *= exp(-d * 0.6);
            glow += s * w;
            wsum += w;
        }
    }
    glow = wsum > 0.0 ? glow / max(wsum, 0.001) : vec3(0.0);

    // Tinta acida cangiante per l'alone (cicla col tempo)
    float hueShift = u_time * 0.4 + u_pa.z * 2.0;
    vec3 glowTint = mix(vec3(0.2, 1.0, 0.5), vec3(1.0, 0.4, 0.8), 0.5 + 0.5 * sin(hueShift));

    // Composizione: base + alone moltiplicato per la maschera bright + leggera
    // diffusione generale. Intensità audio-reattiva.
    float glowAmt = 0.35 + u_bass * 1.2 + u_face.x * 0.5;
    vec3 col = base + glow * glowTint * bright * glowAmt;

    // Sottile vignetta per concentrare l'attenzione al centro (rimossa col face scale)
    vec2 c = v_uv - 0.5;
    float vig = 1.0 - dot(c, c) * 0.9;
    col *= mix(1.0, vig, 0.25);

    // Sfarfallio strobe/flash
    col = mix(col, vec3(1.0), u_strobe * 0.2);
    col = mix(col, glowTint, u_flash * 0.25);

    FragColor = vec4(col, 1.0);
}

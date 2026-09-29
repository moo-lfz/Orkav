// FOTOGRAMMETRIA 3D del FEED (Alt+R)
// Ricostruzione "fotogrammetrica": il feed viene campionato su una griglia di
// punti 3D che si muovono in profondità in base alla luminanza e all'audio.
// Effetto: nube di punti/schegge che fluttua in 3D con parallasse stereo.
void main(){
    vec2 uv = v_uv;
    float seed = u_int;
    float r1 = hash(vec2(seed * 127.1, 0.7));
    float r2 = hash(vec2(seed * 311.7, 1.3));
    float r3 = hash(vec2(seed * 74.7, 2.9));

    float b0 = u_pa.x, b1 = u_pa.y, b2 = u_pa.z, b3 = u_pa.w;
    float b4 = u_pb.x, b5 = u_pb.y, b6 = u_pb.z;
    float drive = u_pb.w;

    // Griglia fotogrammetrica: densità dei punti (campionamento)
    float density = 28.0 + r1 * 40.0 + b0 * 20.0;
    vec2 gridUv = uv * vec2(density, density * u_res.y / u_res.x);

    // Cella + punto campione dentro la cella (jitter dal seed)
    vec2 cell = floor(gridUv);
    vec2 f = fract(gridUv) - 0.5;
    vec2 jit = vec2(hash(cell + r2 * 3.0), hash(cell + r3 * 7.0)) - 0.5;
    vec2 sampleUv = uv + (jit * 0.6) / vec2(density, density * u_res.y / u_res.x);

    // Colore del feed campionato
    vec3 col = texture(u_tex, clamp(sampleUv, 0.0, 1.0)).rgb;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));

    // PROFONDITÀ: la luminanza + audio spinge il punto nello spazio 3D.
    // I punti più luminosi emergono (parallasse maggiore).
    float depth = (lum - 0.5) * (1.0 + drive * 2.0) + (b1 - 0.5) * 0.6;
    depth += sin(u_time * 0.7 + cell.x * 0.8 + cell.y * 1.3) * 0.15 * (0.3 + b2);

    // Parallasse 3D: offset del punto in base alla profondità + movimento audio
    vec2 parallax = vec2(depth, depth * 0.6) * (0.02 + b0 * 0.06 + drive * 0.02);
    parallax += vec2(sin(u_time * 0.5 + cell.y), cos(u_time * 0.4 + cell.x)) * 0.008 * (0.5 + b3);

    // Rotazione della nube (non a spirale: solo inclinazione lenta)
    float tilt = (r1 - 0.5) * 0.6 + b4 * 0.8;
    mat2 rotM = rot(tilt * 0.2);
    parallax = rotM * parallax;

    vec2 warped = uv + parallax;

    // Ricampiona il feed col parallasse
    vec3 disp = texture(u_tex, clamp(warped, 0.0, 1.0)).rgb;

    // Punti 3D visibili: cerchi di luce dove il punto emerge dalla profondità
    vec2 cellUv = f;
    float point = smoothstep(0.5, 0.0, length(cellUv));
    float emerge = step(0.0, depth); // solo i punti "davanti" sono punti luminosi
    vec3 pointCol = mix(vec3(1.0, 0.08, 0.6), vec3(0.1, 0.9, 0.5), r2);
    pointCol = hue(pointCol, depth * 3.0 + r3 * 6.28);
    disp += pointCol * point * emerge * (0.5 + b5 * 0.6) * drive;

    // RGB split stereo (abberrazione fotogrammetrica)
    float ca = 0.002 + b6 * 0.02 * (0.5 + drive);
    disp.r = texture(u_tex, clamp(warped + vec2(ca, 0.0), 0.0, 1.0)).r;
    disp.b = texture(u_tex, clamp(warped - vec2(ca, 0.0), 0.0, 1.0)).b;

    // Linee di wireframe della griglia fotogrammetrica
    float gx = smoothstep(0.0, 0.05, abs(f.x));
    float gy = smoothstep(0.0, 0.05, abs(f.y));
    float wire = max(gx, gy);
    disp = mix(disp, disp * 0.6 + vec3(0.2, 0.9, 1.0) * 0.3, (1.0 - wire) * 0.25);

    // Score flash → i punti esplodono
    disp += vec3(u_flash * 0.5);

    // Strobe
    disp = mix(disp, vec3(1.0), u_strobe * 0.25);

    // Vignette
    disp *= smoothstep(1.3, 0.4, length(uv - 0.5) * 1.35);

    FragColor = vec4(disp, 1.0);
}

// BUBBLE GLOW (Alt+E) — bolle iridescenti lucide sopra il feed.
//
// Ogni bolla:
//  - RIFRANGE il feed (lente sferica) → il contenuto si deforma dentro la bolla;
//  - ha un BORDO IRIDESCENTE (thin-film) che dipende dall'angolo di incidenza;
//  - ha un HIGHLIGHT SPECULARE che le dà l'aspetto "shiny"/bagnato;
//  - emette un ALONE glow verso l'esterno che si somma al feed.
// Le bolle si muovono, respirano coi bassi e aumentano di contrasto sulle alte.
void main(){
    vec2 uv = v_uv;
    float seed = u_int;
    float r1 = hash(vec2(seed * 31.7, 0.3));
    float r2 = hash(vec2(seed * 57.1, 1.7));
    float r3 = hash(vec2(seed * 97.3, 2.3));

    float b0 = u_pa.x, b1 = u_pa.y, b2 = u_pa.z, b3 = u_pa.w;
    float b4 = u_pb.x, b5 = u_pb.y, b6 = u_pb.z;
    float drive = u_pb.w;

    float aspect = u_res.x / max(1.0, u_res.y);
    vec2 p = vec2(uv.x * aspect, uv.y);      // spazio corretto per l'aspect

    // --- Campo di bolle: celle con centri jitterati (tipo Voronoi) ---
    float cells = mix(2.5, 8.0, r1);
    vec2 gp = p * cells;
    vec2 gid = floor(gp);
    vec2 gf = fract(gp);

    float best = 1e9;      // distanza (negativa = dentro la bolla)
    vec2 bestC = vec2(0.5);
    float bestRad = 0.3;
    float bestH = 0.0;

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 o = vec2(float(x), float(y));
            vec2 id = gid + o;
            float hid = hash(id + r2 * 23.0);

            // centro jitterato
            vec2 ctr = o + vec2(hash(id + r2 * 7.0), hash(id + r3 * 29.0));
            // le bolle vagano lentamente (orbite non sincrone)
            ctr += vec2(
                sin(u_time * (0.22 + hid * 0.55) + hid * 6.2831),
                cos(u_time * (0.18 + hid * 0.48) + hid * 4.712)
            ) * 0.22;

            // raggio: respira coi bassi
            float rad = 0.26 + hid * 0.26 + b0 * 0.14 + u_flash * 0.10;
            float d = length(gf - ctr) - rad;
            if (d < best) { best = d; bestC = ctr; bestRad = rad; bestH = hid; }
        }
    }

    float inside = best;                     // <0 dentro, >0 fuori
    vec2 rv = gf - bestC;                    // vettore dal centro della bolla
    float rr = length(rv) / max(0.001, bestRad); // 0 = centro, 1 = bordo

    // --- Iridescenza (thin-film): dipende dall'angolo di vista (rr) ---
    float thick = rr * 5.5 + bestH * 2.0 + b1 * 2.5 + u_time * 0.25 + b4 * 3.0;
    vec3 irid = 0.5 + 0.5 * cos(6.2831 * (thick + vec3(0.0, 0.33, 0.67)));
    irid = mix(irid, vec3(1.0), 0.25);

    // --- Highlight speculare (il tocco "shiny") ---
    vec2 hlOff = vec2(-0.34, 0.38) * bestRad;      // luce in alto a sinistra
    float hl = 1.0 - smoothstep(0.0, bestRad * 0.42, length(rv - hlOff));
    float hl2 = 1.0 - smoothstep(0.0, bestRad * 0.16, length(rv - hlOff * 0.55));
    float spec = hl * 0.55 + hl2 * 1.0;

    // --- Fresnel sul bordo: la bolla si "accende" sul bordo ---
    float fres = pow(clamp(rr, 0.0, 1.6), 3.0);

    vec3 bg = texture(u_tex, uv).rgb;
    vec3 col = bg;

    if (inside < 0.0) {
        // Dentro la bolla: RIFRAZIONE a lente sferica
        // Il campione si sposta verso il bordo, con intensità crescente dal centro.
        float lensAmt = (0.16 + drive * 0.30) * (0.35 + rr * rr);
        vec2 sampleUV = uv + vec2(rv.x / aspect, rv.y) * lensAmt;
        vec3 refr = texture(u_tex, clamp(sampleUV, 0.0, 1.0)).rgb;

        // Leggera aberrazione cromatica radiale (vetro)
        float ca = 0.004 + rr * 0.012;
        refr.r = texture(u_tex, clamp(sampleUV + vec2(ca, 0.0), 0.0, 1.0)).r;
        refr.b = texture(u_tex, clamp(sampleUV - vec2(ca, 0.0), 0.0, 1.0)).b;

        // Corpo della bolla: rifrazione + tinta iridescente sul bordo
        col = mix(refr, refr * irid * 1.7, 0.28 + 0.50 * fres);
        // Bagliore del bordo
        col += irid * fres * (0.55 + b2 * 0.9 + u_flash * 0.7);
        // Highlight speculare
        col += vec3(1.0, 0.98, 0.95) * spec * (0.55 + b3 * 0.6);
        // Alone interno morbido (la bolla "respira")
        col += irid * exp(-rr * 2.2) * 0.10;
    } else {
        // Fuori: alone glow attorno alla bolla (si somma al feed)
        float glow = exp(-inside * (5.0 + drive * 12.0));
        col = bg + irid * glow * (0.30 + b2 * 0.35);
    }

    // Luccichio globale: le alte fanno scintillare i bordi di tutte le bolle
    float sparkle = 1.0 - smoothstep(0.0, 0.05, abs(inside));
    col += vec3(1.0) * sparkle * (b3 * 0.35 + u_flash * 0.45);

    // Bloom soft: schiarisce le zone più luminose (effetto "glow")
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col += col * smoothstep(0.55, 1.0, lum) * (0.45 + b5 * 0.6);

    // Strobe + vignette
    col = mix(col, vec3(1.0), u_strobe * 0.18);
    col *= smoothstep(1.40, 0.40, length(uv - 0.5) * 1.28);

    FragColor = vec4(col, 1.0);
}

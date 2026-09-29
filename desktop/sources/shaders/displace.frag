void main() {
    vec2 uv = dropUV(v_uv);
    float t = u_time * 0.6;
    vec2 p = uv * 3.0;
    vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p + q * 2.5 + t * 0.8), fbm(p + q * 2.5 + vec2(8.1, 3.7)));
    vec2 off = (r - 0.5) * 0.5 * u_int * (0.6 + u_pa.y);
    vec3 col = texture(u_tex, clamp(uv + off, 0.0, 1.0)).rgb;
    float m = length(off);
    col = mix(col, ramp(fract(m * 3.0 + u_time * 0.1)), clamp(m * 2.5 * u_int, 0.0, 0.85));
    col = hue(col, (r.x - 0.5) * 2.0 * u_int);
    col *= 1.0 + 0.5 * u_pa.x;
    col = mix(col, vec3(1.0), u_strobe * 0.35);
    FragColor = vec4(col, 1.0);
}
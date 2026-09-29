void main() {
    vec2 uv = dropUV(v_uv);
    float tk = floor(u_time * (8.0 + u_regime * 8.0));
    float sel = hash(vec2(floor(uv.y * 8.0), tk * 1.3));
    float rows = sel < 0.4 ? 120.0 : (sel < 0.75 ? 40.0 : 8.0);
    float bl = floor(uv.y * rows);
    float g = step(0.5, hash(vec2(bl, tk)));
    float amp = rows > 100.0 ? 0.01 : (rows > 20.0 ? 0.06 : 0.25);
    float sh = (hash(vec2(bl, tk * 1.7)) - 0.5) * amp * 2.0 * u_int * g;
    vec2 guv = clamp(uv + vec2(sh, 0.0), 0.0, 1.0);
    float rs = 0.004 + 0.02 * u_high;
    vec3 c;
    c.r = texture(u_tex, guv + vec2(rs, 0.0)).r;
    c.g = texture(u_tex, guv).g;
    c.b = texture(u_tex, guv - vec2(rs, 0.0)).b;
    if (hash(vec2(bl, tk * 0.5)) > 0.8) c = c.bgr;
    c *= 0.9 + 0.1 * step(0.5, fract(uv.y * u_res.y * 0.5));
    c = mix(c, vec3(1.0), u_strobe * 0.35);
    c = mix(c, 1.0 - c, u_flash * 0.6);
    FragColor = vec4(c, 1.0);
}
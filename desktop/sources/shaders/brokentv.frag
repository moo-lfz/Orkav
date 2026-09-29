void main() {
    vec2 uv = dropUV(v_uv);
    vec2 id;
    float d = voronoi(uv * vec2(6.0, 5.0), id);
    float tk = floor(u_time * 14.0);
    float sh = (hash(vec2(floor(uv.y * 24.0), tk)) - 0.5) * 0.4 * u_int;
    vec2 off = vec2(sh, 0.0) + (vec2(hash(id), hash(id + 3.0)) - 0.5) * 0.1 * u_int * step(0.6, hash(id + tk));
    vec2 tuv = clamp(uv + off, 0.0, 1.0);
    vec3 cur = texture(u_tex, tuv).rgb;
    vec3 pr = texture(u_prev, tuv + vec2(0.0, 0.004)).rgb;
    vec3 col = max(cur, pr * (0.5 + 0.4 * u_vol));
    col += (hash(uv * u_res.y + u_time) - 0.5) * 0.18;
    float bar = smoothstep(0.45, 0.5, abs(fract(uv.y - u_time * 0.15) - 0.5));
    col *= 0.85 + 0.3 * bar;
    col = mix(col, 1.0 - col, u_flash * 0.6);
    col = hue(col, sin(u_time * 0.7) * 0.4);
    FragColor = vec4(col, 1.0);
}
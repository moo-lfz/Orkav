void main() {
    vec2 uv = dropUV(v_uv);
    vec4 cur = texture(u_tex, uv);
    vec2 w = warp(uv, u_time * 0.7, 0.1 * u_int * (0.4 + u_pa.x));
    vec4 pr = texture(u_prev, w);
    float d = length(cur.rgb - pr.rgb);
    float m = smoothstep(0.04, 0.4, d);
    vec3 col = mix(cur.rgb, pr.rgb, clamp(m * (0.5 + 0.6 * u_pa.w), 0.0, 1.0));
    vec4 pr2 = texture(u_prev, uv + vec2(0.0, 0.01) * u_int * m);
    col = mix(col, pr2.rgb, m * 0.4);
    col = mix(col, ramp(fract(m * 2.0 + u_time * 0.05)), 0.4 * u_int);
    col = hue(col, sin(u_time * 0.4) * 0.8 * u_int);
    float rs = 0.003 + 0.015 * u_pa.z;
    col.r = mix(col.r, texture(u_tex, uv + vec2(rs, 0.0)).r, 0.6);
    col.b = mix(col.b, texture(u_tex, uv - vec2(rs, 0.0)).b, 0.6);
    col = mix(col, vec3(1.0), u_strobe * 0.35);
    FragColor = vec4(col, 1.0);
}
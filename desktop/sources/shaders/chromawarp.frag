// Convenzione: scrivi solo il main() (e eventuali tue funzioni).
// Hai gia' disponibili: u_tex (scena), u_prev (frame prima), u_res,
// u_time (beat), u_int (seed 0..1), u_bass/u_mid/u_high/u_vol,
// u_drop + u_dscroll (pixel dropping), u_flash, e le helper
// hash(), vnoise(), dropUV().
void main(){
  vec2 uv = dropUV(v_uv);
  // warp curvo pilotato dai bassi
  vec2 off = vec2(vnoise(uv * 4.0 + u_time), vnoise(uv * 5.0 - u_time)) - 0.5;
  off *= 0.15 * u_int * (0.4 + u_bass);
  vec3 col;
  col.r = texture2D(u_tex, uv + off + vec2(0.006 * u_high, 0.0)).r;
  col.g = texture2D(u_tex, uv + off).g;
  col.b = texture2D(u_tex, uv + off - vec2(0.006 * u_high, 0.0)).b;
  // respiro sul beat
  col = mix(col, 1.0 - col, step(0.86, sin(u_time * 3.14)) * 0.8);
  gl_FragColor = vec4(col, 1.0);
}
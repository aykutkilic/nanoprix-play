// The city walls (tools/walls.mjs): limestone in courses, with bands of red brick every few metres as the Byzantines built them,
// darker and greener towards the foot, crenellated along the top; the towers a storey higher, with slits for windows.
import * as THREE from './vendor/three.module.min.js';
import { noiseTexture } from './realism.js';
import { weathered } from './weather.js';

export function buildWalls(W) {
  const D0 = W.A.walls; if (!D0) return; const G = (W.A.topkapi && W.A.topkapi.wallGaps) || [], gone = G.length && ((x, z) => G.some(([gx, gz, r]) => Math.hypot(gx - x, gz - z) < r)); // (open where the palace's gates stand in a wall's line – OSM draws Bâb-ı Hümâyun as wall: tools/topkapi.mjs)
  const D = gone ? { ...D0, walls: D0.walls.flatMap((run) => { const out = []; let cur = []; for (const p of run) { if (gone(p[0], p[1])) { if (cur.length > 1) out.push(cur); cur = []; } else cur.push(p); } if (cur.length > 1) out.push(cur); return out; }), towers: D0.towers.filter((t) => !gone(t.x, t.z)) } : D0;
  const pos = [], nor = [], uv = [], idx = [], quad = (a, b, c, d, n, u0, u1, v0, v1) => { const k = pos.length / 3; pos.push(...a, ...b, ...c, ...d); for (let i = 0; i < 4; i++) nor.push(...n); uv.push(u0, v0, u1, v0, u0, v1, u1, v1); idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); };
  // a block: four sides and a top, its stones laid along u (in units of the world)
  const block = (x, z, y0, y1, along, w, d, u = 0) => { const c = Math.cos(along), s = Math.sin(along), P = (a, b, y) => [x + a * s + b * c, y, z + a * c - b * s], A = w / 2, B = d / 2; for (const [p, q, n, u0] of [[[-A, B], [A, B], [c, 0, -s], u], [[A, -B], [-A, -B], [-c, 0, s], u + w], [[A, B], [A, -B], [s, 0, c], u + w], [[-A, -B], [-A, B], [-s, 0, -c], u]]) { const l = Math.hypot(q[0] - p[0], q[1] - p[1]); quad(P(...p, y0), P(...q, y0), P(...p, y1), P(...q, y1), n, u0, u0 + l, y0, y1); } quad(P(-A, B, y1), P(A, B, y1), P(-A, -B, y1), P(A, -B, y1), [0, 1, 0], u, u + w, y1, y1 + d); };
  for (const run of D.walls) {
    let u = 0; for (let i = 0; i + 1 < run.length; i++) {
      const [ax, az, ay, land] = run[i], [bx, bz, by] = run[i + 1], l = Math.hypot(bx - ax, bz - az); if (l < 1e-3) continue; const h = land ? D.land : D.sea, T = land ? 0.56 : 0.42, along = Math.atan2(bx - ax, bz - az), nx = Math.cos(along) * (T / 2), nz = -Math.sin(along) * (T / 2), y0a = ay - 0.4, y0b = by - 0.4;
      // the two faces, the walk along the top
      for (const sd of [1, -1]) quad([ax + nx * sd, y0a, az + nz * sd], [bx + nx * sd, y0b, bz + nz * sd], [ax + nx * sd, ay + h, az + nz * sd], [bx + nx * sd, by + h, bz + nz * sd], [Math.cos(along) * sd, 0, -Math.sin(along) * sd], sd > 0 ? u : u + l, sd > 0 ? u + l : u, -0.4, h);
      quad([ax + nx, ay + h, az + nz], [bx + nx, by + h, bz + nz], [ax - nx, ay + h, az - nz], [bx - nx, by + h, bz - nz], [0, 1, 0], u, u + l, h, h + T);
      // merlons on the outer edge, a gap between each
      for (let s = 0.06; s < l - 0.06; s += 0.17) { const t = s / l, x = ax + (bx - ax) * t + nx * 0.78, z = az + (bz - az) * t + nz * 0.78, y = ay + (by - ay) * t + h; block(x, z, y, y + 0.1, along, 0.085, T * 0.22, u + s); }
      u += l;
    }
    // its ends: closed
    for (const k of [0, run.length - 1]) { const [x, z, y, land] = run[k], o = run[k ? k - 1 : 1], along = Math.atan2(o[0] - x, o[1] - z), T = land ? 0.46 : 0.34; block(x, z, y - 0.4, y + (land ? D.land : D.sea), along, 0.06, T, 0); }
  }
  // towers: their own outline, a storey over the wall, merlons round the top, slits in the sides
  const slits = [];
  for (const t of D.towers) {
    const q = t.q, n = q.length, y0 = t.y - 0.4, y1 = t.y + t.h; let u = 0;
    let A = 0; for (let i = 0; i < n; i++) { const b = q[(i + 1) % n]; A += q[i][0] * b[1] - b[0] * q[i][1]; } const sg = A > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) { const a = q[i], b = q[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-3) continue; const nx = ((b[1] - a[1]) / l) * sg, nz = (-(b[0] - a[0]) / l) * sg; quad([t.x + a[0], y0, t.z + a[1]], [t.x + b[0], y0, t.z + b[1]], [t.x + a[0], y1, t.z + a[1]], [t.x + b[0], y1, t.z + b[1]], [nx, 0, nz], u, u + l, -0.4, t.h); for (let s = 0.06; s < l - 0.04; s += 0.17) { const k = s / l; block(t.x + a[0] + (b[0] - a[0]) * k, t.z + a[1] + (b[1] - a[1]) * k, y1, y1 + 0.1, Math.atan2(b[0] - a[0], b[1] - a[1]), 0.085, 0.08, u + s); } if (l > 0.5) for (const f of [0.35, 0.7]) slits.push([t.x + (a[0] + b[0]) / 2 + nx * 0.012, t.y + t.h * f, t.z + (a[1] + b[1]) / 2 + nz * 0.012, Math.atan2(nx, nz)]); u += l; }
    // its top: a flat roof of stone
    let cx = 0, cz = 0; for (const p of q) { cx += p[0] / n; cz += p[1] / n; } for (let i = 0; i < n; i++) { const a = q[i], b = q[(i + 1) % n], k = pos.length / 3; pos.push(t.x + cx, y1, t.z + cz, t.x + a[0], y1, t.z + a[1], t.x + b[0], y1, t.z + b[1]); for (let j = 0; j < 3; j++) nor.push(0, 1, 0); uv.push(0, y1, 0.3, y1, 0.6, y1 + 0.3); idx.push(k, ...(sg > 0 ? [k + 2, k + 1] : [k + 1, k + 2])); }
  }
  // every face turned the way its normal says, whichever way round a wall or a tower's outline was drawn (else one side is not drawn)
  for (let t = 0; t < idx.length; t += 3) { const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3], ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]; if ((uy * vz - uz * vy) * nor[a] + (uz * vx - ux * vz) * nor[a + 1] + (ux * vy - uy * vx) * nor[a + 2] < 0) { idx[t + 1] = c / 3; idx[t + 2] = b / 3; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uNoise = { value: noiseTexture() }; s.uniforms.uNight = W.night;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vS; varying vec3 vW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = uv; vW = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D uNoise; uniform float uNight; varying vec2 vS; varying vec3 vW;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <map_fragment>', `
        float px = max(fwidth(vS.x), fwidth(vS.y)), near = smoothstep(0.08, 0.02, px);
        // courses of squared limestone, every so often five courses of brick
        float band = fract(vS.y / 0.46), brick = step(0.78, band); float ch = mix(0.062, 0.022, brick), row = floor(vS.y / ch), q = vS.x / mix(0.13, 0.06, brick) + row * 0.5, col = floor(q);
        float t = h21(vec2(col, row)), joint = min(min(fract(q), 1.0 - fract(q)) * mix(0.13, 0.06, brick), min(fract(vS.y / ch), 1.0 - fract(vS.y / ch)) * ch);
        vec3 stone = mix(vec3(0.56, 0.52, 0.44), vec3(0.70, 0.66, 0.57), mix(0.5, t, near)), red = mix(vec3(0.42, 0.20, 0.13), vec3(0.55, 0.29, 0.19), mix(0.5, t, near));
        vec3 c = mix(stone, red, brick) * (1.0 - 0.38 * smoothstep(0.007 + px, 0.002, joint) * near);
        vec4 n1 = texture2D(uNoise, vW.xz * 0.12 + vW.y * 0.2), n2 = texture2D(uNoise, vec2(vS.x * 0.5, vS.y * 0.9));
        c *= 0.78 + n1.r * 0.3; c *= 1.0 - 0.32 * smoothstep(0.5, 0.0, vS.y) * n2.g; // (grimy towards the foot)
        c = mix(c, vec3(0.25, 0.30, 0.17), smoothstep(0.62, 0.8, n2.b) * smoothstep(0.9, 0.0, vS.y) * 0.55); // (moss, weeds)
        c = mix(c, c * 0.55, smoothstep(0.68, 0.85, n1.g) * 0.6); // (where it has fallen, the core shows)
        diffuseColor.rgb = c;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.7, 0.4) * uNight * 0.22 * smoothstep(1.2, 0.0, vS.y);'); // (floodlit from below)
  };
  const mesh = new THREE.Mesh(g, weathered(m, { snow: 0.9, wet: 0.3, shine: 0.5 })); mesh.castShadow = mesh.receiveShadow = true; W.still.add(mesh);
  if (slits.length) { const sg = new THREE.PlaneGeometry(0.035, 0.16), sm = new THREE.MeshBasicMaterial({ color: '#16120e' }), im = new THREE.InstancedMesh(sg, sm, slits.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0); slits.forEach(([x, y, z, a], k) => { M.compose(new THREE.Vector3(x, y, z), Q.setFromAxisAngle(UP, a), new THREE.Vector3(1, 1, 1)); im.setMatrixAt(k, M); }); W.still.add(im); }
}

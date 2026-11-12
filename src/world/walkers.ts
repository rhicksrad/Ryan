import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCK, type CityPlan } from './cityplan';
import { mulberry32 } from './rng';

/**
 * Street life. The README-quoting citizens are few and each is its own object;
 * these are the rest of the town, walking laps of their block's sidewalk. They
 * are one instanced mesh, so a couple of hundred of them cost a single draw
 * call. Downtown is busy, the neighbourhoods are quiet.
 */
export function createWalkers(plan: CityPlan): { mesh: THREE.InstancedMesh; update: (t: number) => void } {
  const rand = mulberry32(1909);

  // One body: legs, torso, head. Vertex shade keeps the legs dark and the head
  // light whatever coat color the instance brings.
  const part = (geo: THREE.BufferGeometry, y: number, shade: number) => {
    const g = geo.toNonIndexed();
    g.translate(0, y, 0);
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3).fill(shade);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const body = mergeGeometries([
    part(new THREE.CylinderGeometry(0.15, 0.17, 0.6, 6), 0.3, 0.32),
    part(new THREE.CapsuleGeometry(0.2, 0.36, 2, 7), 0.88, 1),
    part(new THREE.SphereGeometry(0.16, 8, 6), 1.36, 1.5)
  ])!;

  interface Walker { x: number; z: number; half: number; lap: number; speed: number; phase: number; scale: number }
  const walkers: Walker[] = [];
  for (const b of plan.blocks) {
    const busy = b.kind === 'plaza' ? 12 : b.paved ? 7 : b.kind === 'park' ? 4 : 2;
    for (let i = 0; i < busy; i += 1) {
      // Two lanes of foot traffic: one near the kerb, one near the buildings.
      const half = BLOCK / 2 - (b.kind === 'plaza' ? 1.2 + rand() * 4 : 0.45 + rand() * 0.5);
      walkers.push({
        x: b.x,
        z: b.z,
        half,
        lap: rand() * 8 * half,
        speed: (0.55 + rand() * 0.6) * (rand() < 0.5 ? 1 : -1),
        phase: rand() * 100,
        scale: 0.9 + rand() * 0.22
      });
    }
  }

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(body, material, walkers.length);
  mesh.userData.dynamic = true; // keeps them out of the static shadow map
  mesh.frustumCulled = false;
  const coats = [0x8a3b3b, 0x33507a, 0x4a6b4f, 0x77705f, 0xb9a36a, 0x5a4a6e, 0xc8c2b4, 0x2c3340, 0xa5683e, 0x4f7f86];
  const color = new THREE.Color();
  walkers.forEach((_, i) => mesh.setColorAt(i, color.setHex(coats[Math.floor(rand() * coats.length)])));

  const dummy = new THREE.Object3D();
  const update = (t: number) => {
    walkers.forEach((w, i) => {
      // Where on the square lap: four sides of length 2 * half, taken in turn.
      const side = 2 * w.half;
      const lap = (((w.lap + t * w.speed) % (4 * side)) + 4 * side) % (4 * side);
      const leg = Math.floor(lap / side);
      const along = (lap % side) - w.half;
      const [px, pz, heading] =
        leg === 0 ? [along, -w.half, Math.PI / 2] : leg === 1 ? [w.half, along, 0] : leg === 2 ? [-along, w.half, -Math.PI / 2] : [-w.half, -along, Math.PI];
      dummy.position.set(w.x + px, 0.17 + Math.abs(Math.sin(t * 7 * Math.abs(w.speed) + w.phase)) * 0.04, w.z + pz);
      dummy.rotation.y = heading + (w.speed < 0 ? Math.PI : 0);
      dummy.scale.setScalar(w.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { mesh, update };
}

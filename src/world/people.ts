import * as THREE from 'three';
import type { Project, District } from '../data';
import { tierOf } from '../data';
import { rngFor } from './rng';

export interface Person {
  project: Project;
  district: District;
  group: THREE.Group;
  pickMeshes: THREE.Mesh[];
  /** Which README quote this citizen recites. */
  quoteIndex: number;
  center: THREE.Vector2;
  radius: number;
  angle: number;
  speed: number;
  bobSeed: number;
}

const SKIN_TONES = [0xd9a878, 0xb07b50, 0x8a5a3a, 0xe8c39a, 0x6b4429];
const PANTS = [0x2a3050, 0x3a3a44, 0x40342c, 0x2c3c34];

/**
 * A citizen of Project City. Each one is a walking README — click to hear
 * a line from their project's documentation.
 */
export function createPerson(
  project: Project,
  district: District,
  lotX: number,
  lotZ: number,
  orbitRadius: number,
  quoteIndex: number
): Person {
  const rand = rngFor(`${project.id}-person-${quoteIndex}`);
  const group = new THREE.Group();

  const scale = 0.92 + rand() * 0.2;
  const skin = SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)];
  const pants = PANTS[Math.floor(rand() * PANTS.length)];
  const shirt = new THREE.Color(district.color).lerp(new THREE.Color('#666a80'), 0.35 + rand() * 0.3);

  const legMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.55, 6), legMat);
  legs.position.y = 0.28;
  group.add(legs);

  const torsoMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.42, 3, 8), torsoMat);
  torso.position.y = 0.85;
  group.add(torso);

  const headMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), headMat);
  head.position.y = 1.34;
  group.add(head);

  // Some citizens carry a glowing README.
  if (rand() < 0.5) {
    const doc = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.3, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0xf2f5ff,
        emissive: 0xaab8ff,
        emissiveIntensity: 0.7,
        roughness: 0.5
      })
    );
    doc.position.set(0.28, 0.92, 0.12);
    doc.rotation.y = -0.5;
    group.add(doc);
  }

  group.scale.setScalar(scale);

  // Generous invisible hit target — citizens are small and they keep walking.
  const proxy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 2.2, 6),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  proxy.position.y = 1;
  group.add(proxy);

  const pickMeshes: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.userData.personProjectId = project.id;
      obj.userData.quoteIndex = quoteIndex;
      pickMeshes.push(obj);
    }
  });

  return {
    project,
    district,
    group,
    pickMeshes,
    quoteIndex,
    center: new THREE.Vector2(lotX, lotZ),
    radius: orbitRadius * (0.85 + rand() * 0.3),
    angle: rand() * Math.PI * 2,
    speed: (0.12 + rand() * 0.16) * (rand() < 0.5 ? 1 : -1),
    bobSeed: rand() * 100
  };
}

/** Stroll in a lazy loop around the building; bob a little; face forward. */
export function updatePerson(person: Person, t: number, dt: number): void {
  person.angle += person.speed * dt;
  const x = person.center.x + Math.cos(person.angle) * person.radius;
  const z = person.center.y + Math.sin(person.angle) * person.radius;
  person.group.position.set(x, 0.14 + Math.abs(Math.sin(t * 6 + person.bobSeed)) * 0.035, z);
  // Face the direction of travel (tangent of the loop).
  person.group.rotation.y = -person.angle + (person.speed > 0 ? 0 : Math.PI);
}

/** How many citizens a project attracts. Bigger projects draw a crowd. */
export function citizenCount(project: Project): number {
  const tier = tierOf(project.commits);
  return tier >= 4 ? 3 : tier >= 2 ? 2 : 1;
}

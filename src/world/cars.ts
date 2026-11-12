import * as THREE from 'three';
import { mulberry32 } from './rng';
import { bakeStatic } from './bake';
import { ROAD, RIVER_WIDTH, type CityPlan, type RoadStrip } from './cityplan';

interface Car {
  group: THREE.Group;
  road: RoadStrip;
  /** Position along the road, 0..length. */
  distance: number;
  speed: number;
  /** +1 or -1 travel direction; picks the lane. */
  direction: number;
}

export interface Traffic {
  group: THREE.Group;
  headlightMaterials: THREE.MeshStandardMaterial[];
  update: (dt: number) => void;
}

const BODY_COLORS = [0x8a2f3c, 0x2f4c8a, 0x3c6b4a, 0x555c74, 0x8a7a2f, 0x6a3c8a];

const CAR_BODY = new THREE.BoxGeometry(1.5, 0.4, 0.7);
const CAR_CABIN = new THREE.BoxGeometry(0.75, 0.32, 0.62);
const CAR_HEAD = new THREE.BoxGeometry(0.08, 0.1, 0.14);
const CAR_TAIL = new THREE.BoxGeometry(0.06, 0.09, 0.13);
const cabinMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.3, metalness: 0.5 });
const shadowMat = new THREE.MeshStandardMaterial({ color: 0x08090c, roughness: 1 });
const bodyMats = new Map<number, THREE.MeshStandardMaterial>();

function createCar(
  rand: () => number,
  headMat: THREE.MeshStandardMaterial,
  tailMat: THREE.MeshStandardMaterial
): THREE.Group {
  const group = new THREE.Group();
  const color = BODY_COLORS[Math.floor(rand() * BODY_COLORS.length)];

  let bodyMat = bodyMats.get(color);
  if (!bodyMat) {
    bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 });
    bodyMats.set(color, bodyMat);
  }
  const body = new THREE.Mesh(CAR_BODY, bodyMat);
  body.position.y = 0.32;
  group.add(body);
  // A dark slab underneath stands in for the contact shadow moving things do not cast.
  const under = new THREE.Mesh(CAR_BODY, shadowMat);
  under.scale.set(1.08, 0.06, 1.2);
  under.position.set(0.05, 0.02, 0.03);
  group.add(under);

  const cabin = new THREE.Mesh(CAR_CABIN, cabinMat);
  cabin.position.set(-0.1, 0.62, 0);
  group.add(cabin);

  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(CAR_HEAD, headMat);
    head.position.set(0.76, 0.32, side * 0.22);
    group.add(head);
    const tail = new THREE.Mesh(CAR_TAIL, tailMat);
    tail.position.set(-0.76, 0.32, side * 0.22);
    group.add(tail);
  }
  bakeStatic(group);
  return group;
}

/** Bridge decks sit higher than the road — ease cars up and over the river. */
function roadHeightAt(road: RoadStrip, worldAlong: number, riverX: number): number {
  if (!road.horizontal) return 0.06;
  const dist = Math.abs(worldAlong - riverX);
  const ramp = RIVER_WIDTH / 2 + 5;
  if (dist > ramp) return 0.06;
  const k = 1 - dist / ramp;
  return 0.06 + 0.5 * Math.sin(k * Math.PI * 0.5);
}

export function createTraffic(plan: CityPlan): Traffic {
  const rand = mulberry32(2026);
  const group = new THREE.Group();
  group.userData.dynamic = true;
  // One shared pair of lamp materials, so day/night only has two things to dim.
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff4d0,
    emissive: 0xffedb8,
    emissiveIntensity: 2.6,
    roughness: 0.3
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff4030,
    emissive: 0xff2018,
    emissiveIntensity: 1.6,
    roughness: 0.3
  });
  const headlightMaterials = [headMat, tailMat];
  const cars: Car[] = [];

  for (const road of plan.roads) {
    const count = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i += 1) {
      const car = createCar(rand, headMat, tailMat);
      const entry: Car = {
        group: car,
        road,
        distance: rand() * road.length,
        speed: 5.5 + rand() * 4,
        direction: rand() < 0.5 ? 1 : -1
      };
      group.add(car);
      cars.push(entry);
    }
  }

  const update = (dt: number) => {
    for (const car of cars) {
      car.distance += car.speed * dt;
      if (car.distance > car.road.length) car.distance -= car.road.length;
      const along = car.distance - car.road.length / 2;
      const lane = car.direction * ROAD / 4;
      if (car.road.horizontal) {
        const x = car.road.x + along * car.direction;
        car.group.position.set(x, roadHeightAt(car.road, x, plan.riverX), car.road.z + lane);
        car.group.rotation.y = car.direction > 0 ? 0 : Math.PI;
      } else {
        const z = car.road.z + along * car.direction;
        car.group.position.set(car.road.x - lane, 0.06, z);
        car.group.rotation.y = car.direction > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
    }
  };

  return { group, headlightMaterials, update };
}

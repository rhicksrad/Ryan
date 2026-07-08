import * as THREE from 'three';
import { mulberry32 } from './rng';
import { ROAD, RIVER_CENTER_X, RIVER_WIDTH, type CityPlan, type RoadStrip } from './cityplan';

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

function createCar(rand: () => number, headlights: THREE.MeshStandardMaterial[]): THREE.Group {
  const group = new THREE.Group();
  const color = BODY_COLORS[Math.floor(rand() * BODY_COLORS.length)];

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.4, 0.7),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 })
  );
  body.position.y = 0.32;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.32, 0.62),
    new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.3, metalness: 0.5 })
  );
  cabin.position.set(-0.1, 0.62, 0);
  group.add(cabin);

  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff4d0,
    emissive: 0xffedb8,
    emissiveIntensity: 2.6,
    roughness: 0.3
  });
  headlights.push(headMat);
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff4030,
    emissive: 0xff2018,
    emissiveIntensity: 1.6,
    roughness: 0.3
  });
  headlights.push(tailMat);
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.14), headMat);
    head.position.set(0.76, 0.32, side * 0.22);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.13), tailMat);
    tail.position.set(-0.76, 0.32, side * 0.22);
    group.add(tail);
  }
  return group;
}

/** Bridge decks sit higher than the road — ease cars up and over the river. */
function roadHeightAt(road: RoadStrip, worldAlong: number): number {
  if (!road.horizontal) return 0.06;
  const dist = Math.abs(worldAlong - RIVER_CENTER_X);
  const ramp = RIVER_WIDTH / 2 + 5;
  if (dist > ramp) return 0.06;
  const k = 1 - dist / ramp;
  return 0.06 + 0.5 * Math.sin(k * Math.PI * 0.5);
}

export function createTraffic(plan: CityPlan): Traffic {
  const rand = mulberry32(2026);
  const group = new THREE.Group();
  const headlightMaterials: THREE.MeshStandardMaterial[] = [];
  const cars: Car[] = [];

  for (const road of plan.roads) {
    const count = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i += 1) {
      const car = createCar(rand, headlightMaterials);
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
        car.group.position.set(x, roadHeightAt(car.road, x), car.road.z + lane);
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

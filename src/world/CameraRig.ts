import { Matrix4, Quaternion, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RouteName } from '../types';

interface Pose {
  position: Vector3;
  target: Vector3;
  quaternion: Quaternion;
}

interface AnimateOptions {
  immediate?: boolean;
  duration?: number;
}

export class CameraRig {
  private poses = new Map<RouteName, Pose>();
  private startPosition = new Vector3();
  private endPosition = new Vector3();
  private startTarget = new Vector3();
  private endTarget = new Vector3();
  private startQuaternion = new Quaternion();
  private endQuaternion = new Quaternion();
  private elapsed = 0;
  private duration = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private matrixHelper = new Matrix4();

  constructor(private camera: PerspectiveCamera, private controls: OrbitControls) {}

  setReducedMotion(value: boolean) {
    this.reducedMotion = value;
  }

  addPose(route: RouteName, position: Vector3, target: Vector3) {
    const quaternion = new Quaternion();
    this.matrixHelper.lookAt(position, target, new Vector3(0, 1, 0));
    quaternion.setFromRotationMatrix(this.matrixHelper);
    const pose: Pose = {
      position: position.clone(),
      target: target.clone(),
      quaternion
    };
    this.poses.set(route, pose);
  }

  animateTo(route: RouteName, options: AnimateOptions = {}) {
    const pose = this.poses.get(route);
    if (!pose) return;

    this.startPosition.copy(this.camera.position);
    this.startTarget.copy(this.controls.target);
    this.startQuaternion.copy(this.camera.quaternion);

    this.endPosition.copy(pose.position);
    this.endTarget.copy(pose.target);
    this.endQuaternion.copy(pose.quaternion);

    if (options.immediate || this.reducedMotion) {
      this.duration = 0;
      this.applyPose(1);
      return;
    }

    this.elapsed = 0;
    this.duration = options.duration ?? 1.6;
  }

  update(delta: number) {
    if (this.duration <= 0) return;
    this.elapsed = Math.min(this.elapsed + delta, this.duration);
    const t = this.elapsed / this.duration;
    const eased = this.easeInOut(t);
    this.applyPose(eased);
    if (this.elapsed >= this.duration) {
      this.duration = 0;
    }
  }

  private applyPose(alpha: number) {
    this.camera.position.lerpVectors(this.startPosition, this.endPosition, alpha);
    this.controls.target.lerpVectors(this.startTarget, this.endTarget, alpha);
    const quat = new Quaternion();
    quat.slerpQuaternions(this.startQuaternion, this.endQuaternion, alpha);
    this.camera.quaternion.copy(quat);
    this.camera.updateMatrixWorld();
    this.controls.update();
  }

  private easeInOut(t: number) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}

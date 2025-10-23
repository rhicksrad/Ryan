import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { RouteName } from '../ui/Router';

export type CameraRoute = Extract<RouteName, '#home' | '#cooking' | '#it' | '#gardening' | '#ai' | '#music' | '#gaming'>;

interface Pose {
  position: Vector3;
  quaternion: Quaternion;
  target: Vector3;
}

interface CameraRigOptions {
  camera: PerspectiveCamera;
  prefersReducedMotion: boolean;
  onTargetChange: (target: Vector3) => void;
}

export class CameraRig {
  private readonly camera: PerspectiveCamera;
  private readonly prefersReducedMotion: boolean;
  private readonly onTargetChange: (target: Vector3) => void;
  private poses: Record<CameraRoute, Pose>;
  private startPose: Pose;
  private targetPose: Pose;
  private transition = 1;
  private readonly duration = 1.2;
  private currentTarget: Vector3;

  constructor(options: CameraRigOptions) {
    this.camera = options.camera;
    this.prefersReducedMotion = options.prefersReducedMotion;
    this.onTargetChange = options.onTargetChange;
    this.currentTarget = new Vector3();

    this.poses = {
      '#home': this.createPose(new Vector3(0, 6, 14), new Vector3(0, 2, 0)),
      '#cooking': this.createPose(new Vector3(10, 4, 4), new Vector3(8, 1.5, 0)),
      '#it': this.createPose(new Vector3(4, 5, -11), new Vector3(6, 1.5, -8)),
      '#gardening': this.createPose(new Vector3(-11, 4, 5), new Vector3(-8, 1.5, 3)),
      '#ai': this.createPose(new Vector3(-7.1, 2.2, -5.1), new Vector3(-7.7, 1.2, -5.7)),
      '#music': this.createPose(new Vector3(0, 5, 12), new Vector3(0, 2, 10)),
      '#gaming': this.createPose(new Vector3(7.5, 4.2, -11.2), new Vector3(5.2, 1.6, -8.4))
    };

    this.startPose = this.poses['#home'];
    this.targetPose = this.startPose;
    this.applyPose(this.startPose);
  }

  private createPose(position: Vector3, target: Vector3): Pose {
    const direction = new Vector3().copy(target).sub(position).normalize();
    const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), direction);
    return {
      position,
      quaternion,
      target
    };
  }

  private captureCurrentPose(): Pose {
    return {
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone(),
      target: this.currentTarget.clone()
    };
  }

  private applyPose(pose: Pose): void {
    this.camera.position.copy(pose.position);
    this.camera.quaternion.copy(pose.quaternion);
    this.currentTarget.copy(pose.target);
    this.onTargetChange(pose.target.clone());
  }

  animateTo(route: CameraRoute): void {
    const pose = this.poses[route];
    this.targetPose = pose;
    if (this.prefersReducedMotion) {
      this.startPose = this.captureCurrentPose();
      this.applyPose(pose);
      this.transition = 1;
      return;
    }
    this.startPose = this.captureCurrentPose();
    this.transition = 0;
  }

  jumpTo(route: CameraRoute): void {
    const pose = this.poses[route];
    this.startPose = this.captureCurrentPose();
    this.targetPose = pose;
    this.applyPose(pose);
    this.transition = 1;
  }

  update(delta: number): void {
    if (this.transition >= 1) {
      return;
    }
    this.transition = Math.min(1, this.transition + delta / this.duration);
    const eased = this.easeInOut(this.transition);
    this.camera.position.lerpVectors(this.startPose.position, this.targetPose.position, eased);
    this.camera.quaternion.slerpQuaternions(this.startPose.quaternion, this.targetPose.quaternion, eased);
    const target = new Vector3().lerpVectors(this.startPose.target, this.targetPose.target, eased);
    this.currentTarget.copy(target);
    this.onTargetChange(target);
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
}

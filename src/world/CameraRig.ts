import { PerspectiveCamera, Vector3 } from 'three';

type TargetName =
  | 'home'
  | 'cooking'
  | 'it'
  | 'gardening'
  | 'ai'
  | 'music';

type CameraPose = {
  position: Vector3;
  target: Vector3;
  zoom: number;
};

const poses: Record<TargetName, CameraPose> = {
  home: {
    position: new Vector3(0, 14, 22),
    target: new Vector3(0, 0, 0),
    zoom: 1
  },
  cooking: {
    position: new Vector3(14, 8, 6),
    target: new Vector3(8, 0, 0),
    zoom: 1
  },
  it: {
    position: new Vector3(-14, 9, 8),
    target: new Vector3(-8, 0, 0),
    zoom: 1
  },
  gardening: {
    position: new Vector3(6, 9, -14),
    target: new Vector3(0, 0, -8),
    zoom: 1
  },
  ai: {
    position: new Vector3(-6, 10, -12),
    target: new Vector3(-2, 1, -6),
    zoom: 1
  },
  music: {
    position: new Vector3(0, 8, 16),
    target: new Vector3(0, 0, 6),
    zoom: 1
  }
};

interface AnimateOptions {
  immediate?: boolean;
  duration?: number;
}

export class CameraRig {
  private currentTarget: TargetName = 'home';
  private progress = 1;
  private startPosition = new Vector3();
  private startTarget = new Vector3();
  private destinationPosition = poses.home.position.clone();
  private destinationTarget = poses.home.target.clone();
  private duration = 1;

  constructor(private camera: PerspectiveCamera, private reducedMotion: () => boolean) {
    const pose = poses.home;
    this.camera.position.copy(pose.position);
    this.camera.lookAt(pose.target);
  }

  animateTo(name: TargetName, opts: AnimateOptions = {}): void {
    this.currentTarget = name;
    const pose = poses[name];
    this.duration = opts.duration ?? 1.25;
    this.startPosition.copy(this.camera.position);
    this.startTarget.copy(this.destinationTarget);
    this.destinationPosition = pose.position.clone();
    this.destinationTarget = pose.target.clone();
    this.progress = opts.immediate || this.reducedMotion() ? 1 : 0;
    if (this.progress === 1) {
      this.camera.position.copy(this.destinationPosition);
      this.camera.lookAt(this.destinationTarget);
    }
  }

  update(delta: number): void {
    if (this.progress >= 1) return;
    const step = Math.min(1, this.progress + delta / this.duration);
    this.progress = step;
    const position = this.startPosition.clone().lerp(this.destinationPosition, step);
    const target = this.startTarget.clone().lerp(this.destinationTarget, step);
    this.camera.position.copy(position);
    this.camera.lookAt(target);
  }

  get current(): TargetName {
    return this.currentTarget;
  }
}

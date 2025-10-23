export function supports3D(): boolean {
  try {
    const canvas = document.createElement('canvas');
    if (window.WebGL2RenderingContext) {
      const gl2 = canvas.getContext('webgl2');
      if (gl2) {
        gl2.getExtension('EXT_color_buffer_float');
        return true;
      }
    }
    const gl =
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl') ||
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false });
    return !!gl;
  } catch (error) {
    console.warn('WebGL check failed', error);
    return false;
  }
}

export function supports3D(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { stencil: false, antialias: false });
    if (!gl) return false;
    const required = ['EXT_color_buffer_float', 'OES_texture_float_linear'];
    for (const ext of required) {
      if (!gl.getExtension(ext)) {
        return false;
      }
    }
    return true;
  } catch (error) {
    console.warn('WebGL2 check failed', error);
    return false;
  }
}

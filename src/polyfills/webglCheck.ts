export function supports3D(): boolean {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return false;
  const requiredExtensions = ['EXT_color_buffer_float', 'OES_element_index_uint'];
  const available = requiredExtensions.every((ext) => !!gl.getExtension(ext));
  return available;
}

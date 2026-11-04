// Normalize GPU textures to PMA while preserving each atlas page's source format.
// This keeps multiply/screen correct at transparent texels, without rewriting PNGs.
window.SpineBlendCompatibility = (() => {
  const installed = new WeakMap();
  const converters = new WeakSet();
  const sourceFormat = Symbol('sourcePma');
  function configure(runtime, textures, pages) {
    const graphics = runtime.webgl || runtime;
    const Texture = graphics.GLTexture;
    if (!Texture) throw new Error('The runtime has no WebGL texture loader.');
    let state = installed.get(Texture);
    if (!state) {
      state = { sources: new Map() };
      installed.set(Texture, state);
      const update = Texture.prototype.update;
      Texture.prototype.update = function (...args) {
        const image = this.getImage();
        if (!(sourceFormat in this)) this[sourceFormat] = state.sources.get(image.src) === true;
        const gl = this.context?.gl || this.gl;
        const previous = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
        const disable = Texture.DISABLE_UNPACK_PREMULTIPLIED_ALPHA_WEBGL;
        try {
          // Some upstream loaders explicitly reset this flag inside update().
          Texture.DISABLE_UNPACK_PREMULTIPLIED_ALPHA_WEBGL = false;
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !this[sourceFormat]);
          return update.apply(this, args);
        } finally {
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previous);
          Texture.DISABLE_UNPACK_PREMULTIPLIED_ALPHA_WEBGL = disable;
        }
      };
    }
    if (!converters.has(graphics)) {
      converters.add(graphics);
      const screen = runtime.BlendMode?.Screen ?? 3;
      const converter = graphics.WebGLBlendModeConverter;
      if (converter?.getDestGLBlendMode) {
        const destination = converter.getDestGLBlendMode;
        converter.getDestGLBlendMode = mode => mode === screen ? 0x0301 : destination.call(converter, mode);
      } else if (graphics.getDestGLBlendMode) {
        const destination = graphics.getDestGLBlendMode;
        graphics.getDestGLBlendMode = (gl, mode) => mode === screen ? gl.ONE_MINUS_SRC_COLOR : destination(gl, mode);
      }
    }
    state.sources = new Map(pages.map(page => [textures[page.name], page.pma === true]));
  }
  return { configure };
})();

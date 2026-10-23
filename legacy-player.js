/* UI adapter for the isolated Spine 3.x runtimes in vendor/. */
class LegacySpinePlayer {
  constructor(parent, options) {
    this.parent = parent;
    this.options = options;
    this.disposed = false;
    this.paused = false;
    this.speed = 1;
    this.textures = [];
    this.dom = document.createElement('div');
    this.dom.className = 'legacy-player';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'legacy-player-canvas';
    this.dom.append(this.canvas);
    parent.append(this.dom);
    this.ready = this.load();
  }

  async load() {
    const s = this.options.runtime;
    const older = ['3.0', '3.1', '3.2', '3.3', '3.4'].includes(this.options.series);
    if (!s?.SkeletonJson || (!s?.SkeletonBinary && !older)) throw new Error(`The Spine ${this.options.series} runtime could not be loaded.`);
    const images = new Map();
    await Promise.all(Object.entries(this.options.textures).map(async ([name, uri]) => {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error(`Could not decode atlas image: ${name}`));
        image.src = uri;
      });
      images.set(name, image);
    }));
    if (this.disposed) return;
    this.context = older ? { gl: this.canvas.getContext('webgl', { alpha: false }) }
      : new s.webgl.ManagedWebGLRenderingContext(this.canvas, { alpha: false });
    if (!this.context.gl) throw new Error('WebGL is unavailable. Enable hardware acceleration to preview this file.');
    this.sceneRenderer = new s.webgl.SceneRenderer(this.canvas, older ? this.context.gl : this.context, true);
    this.atlas = new s.TextureAtlas(this.options.atlasText, name => {
      const image = images.get(name);
      if (!image) throw new Error(`Missing atlas image: ${name}`);
      const texture = new s.webgl.GLTexture(older ? this.context.gl : this.context, image);
      this.textures.push(texture);
      return texture;
    });
    const loader = new (s.AtlasAttachmentLoader || s.TextureAtlasAttachmentLoader)(this.atlas);
    let data;
    if (older) {
      const json = this.options.isJson ? this.options.json : window.OldSpineDecoder.decode(
        Uint8Array.from(atob(this.options.skeletonDataURI.split(',')[1]), c => c.charCodeAt(0)), this.options.series);
      data = new s.SkeletonJson(loader).readSkeletonData(Number(this.options.series) <= 3.2 ? window.OldSpineDecoder.normalize32(json) : json);
    } else if (this.options.series === '3.5' && !this.options.isJson) {
      data = new s.SkeletonJson(loader).readSkeletonData(window.OldSpineDecoder.decode(Uint8Array.from(atob(this.options.skeletonDataURI.split(',')[1]), c=>c.charCodeAt(0)), '3.5'));
    } else if (this.options.isJson) {
      data = new s.SkeletonJson(loader).readSkeletonData(this.options.json);
    } else {
      const base64 = this.options.skeletonDataURI.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      data = new s.SkeletonBinary(loader).readSkeletonData(this.options.series === '3.8' ? bytes : bytes.buffer);
    }
    this.skeleton = new s.Skeleton(data);
    if (data.defaultSkin) this.skeleton.setSkin(data.defaultSkin);
    const stateData = new s.AnimationStateData(data);
    stateData.defaultMix = 0.2;
    this.animationState = new s.AnimationState(stateData);
    this.makeControls();
    const name = this.options.chooseAnimation(data.animations.map(animation => animation.name));
    if (name) this.setAnimation(name);
    else this.fit();
    this.lastTime = performance.now();
    this.drawFrame();
    this.options.success?.(this, name);
  }

  makeControls() {
    const controls = document.createElement('div');
    controls.className = 'legacy-controls';
    const addSelect = (label, values, change) => {
      const select = document.createElement('select');
      select.setAttribute('aria-label', label);
      for (const value of values) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.append(option);
      }
      select.addEventListener('change', () => change(select.value));
      controls.append(select);
      return select;
    };
    if (this.skeleton.data.skins.length > 1) {
      addSelect('Skin', this.skeleton.data.skins.map(skin => skin.name), name => {
        this.skeleton.setSkinByName(name);
        this.skeleton.setSlotsToSetupPose();
        this.fit();
      });
    }
    this.dom.append(controls);
  }

  setAnimation(name) {
    this.animationState.setAnimation(0, name, true);

    this.fit();
  }

  fit() {
    const s = this.options.runtime;
    const offset = new s.Vector2(), size = new s.Vector2();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const animation = this.animationState.getCurrent(0)?.animation;
    const samples = animation ? 60 : 1;
    this.skeleton.setToSetupPose();
    for (let i = 0; i < samples; i++) {
      if (animation) {
        if (['3.0', '3.1', '3.2', '3.3', '3.4'].includes(this.options.series)) animation.apply(this.skeleton, 0, animation.duration * i / samples, false, []);
        else animation.apply(this.skeleton, 0, animation.duration * i / samples, false, [], 1,
          s.MixPose?.setup ?? s.MixBlend.setup, s.MixDirection.mixIn ?? s.MixDirection.in);
      }
      this.skeleton.updateWorldTransform();
      this.skeleton.getBounds(offset, size, []);
      if (Number.isFinite(offset.x) && Number.isFinite(size.x) && size.x > 0 && size.y > 0) {
        minX = Math.min(minX, offset.x); minY = Math.min(minY, offset.y);
        maxX = Math.max(maxX, offset.x + size.x); maxY = Math.max(maxY, offset.y + size.y);
      }
    }
    this.bounds = Number.isFinite(minX) ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2,
      width: Math.max(maxX - minX, 1) * 1.2, height: Math.max(maxY - minY, 1) * 1.2 } : { x: 0, y: 0, width: 200, height: 200 };
    this.skeleton.setToSetupPose();
    if (animation) { this.animationState.clearTracks(); this.animationState.setAnimation(0, animation.name, true); }
    this.animationState.apply(this.skeleton);
    this.skeleton.updateWorldTransform();
  }

  drawFrame() {
    if (this.disposed) return;
    try {
      const now = performance.now(), delta = Math.min((now - this.lastTime) / 1000, 0.1) * this.speed;
      this.lastTime = now;
      if (!this.paused) {
        this.animationState.update(delta);
        this.animationState.apply(this.skeleton);
        this.skeleton.update(delta);
        this.skeleton.updateWorldTransform();
      }
      const width = Math.max(this.canvas.clientWidth, 1), height = Math.max(this.canvas.clientHeight, 1);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const renderWidth = Math.round(width * pixelRatio), renderHeight = Math.round(height * pixelRatio);
      if (this.canvas.width !== renderWidth) this.canvas.width = renderWidth;
      if (this.canvas.height !== renderHeight) this.canvas.height = renderHeight;
      const gl = this.context.gl, camera = this.sceneRenderer.camera, bounds = this.bounds;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(17 / 255, 24 / 255, 39 / 255, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const scale = Math.max(bounds.width / width, bounds.height / height);
      camera.setViewport(width * scale, height * scale);
      camera.position.x = bounds.x; camera.position.y = bounds.y;
      this.sceneRenderer.begin();
      this.sceneRenderer.drawSkeleton(this.skeleton, this.options.premultipliedAlpha);
      this.sceneRenderer.end();
      this.frameId = requestAnimationFrame(() => this.drawFrame());
    } catch (error) {
      this.options.error?.(this, error.message);
      this.dispose();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.sceneRenderer?.dispose();
    for (const texture of this.textures) texture.dispose();
    // Release the context rather than accumulating a context on every selection.
    this.context?.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.dom.remove();
  }
}
window.LegacySpinePlayer = LegacySpinePlayer;

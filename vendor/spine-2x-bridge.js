/* WebGL/UI adapter for the official 2.x cores. Animation, IK, flips, FFD,
 * and world transforms remain in their native runtime. See README.md. */
(function () {
  for (const s of [window.spine21].filter(Boolean)) {
    if (s.webgl) continue;
    const graphics = window.spine34;
    s.Vector2 = graphics.Vector2;
    s.TextureAtlas = graphics.TextureAtlas;
    const setAnimation = s.AnimationState.prototype.setAnimation;
    s.AnimationState.prototype.setAnimation = function (track, animation, loop) {
      if (typeof animation === 'string') {
        const name = animation;
        animation = this.data.skeletonData.findAnimation(name);
        if (!animation) throw new Error('Animation not found: ' + name);
      }
      return setAnimation.call(this, track, animation, loop);
    };
    function geometry(skeleton, slot) {
      const attachment = slot.attachment;
      if (!attachment || !attachment.rendererObject) return null;
      const region = attachment.type === s.AttachmentType.region;
      const positions = new Float32Array(region ? 8 : attachment.uvs.length);
      if (region) attachment.computeVertices(skeleton.x, skeleton.y, slot.bone, positions);
      else attachment.computeWorldVertices(skeleton.x, skeleton.y, slot, positions);
      return { attachment, positions, triangles: region ? [0, 1, 2, 2, 3, 0] : attachment.triangles };
    }
    s.Skeleton.prototype.getBounds = function (offset, size) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const slot of this.drawOrder) {
        const item = geometry(this, slot); if (!item) continue;
        for (let i = 0; i < item.positions.length; i += 2) {
          const x = item.positions[i], y = item.positions[i + 1];
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
      offset.x = minX; offset.y = minY; size.x = maxX - minX; size.y = maxY - minY;
    };
    class SceneRenderer extends graphics.webgl.SceneRenderer {
      drawSkeleton(skeleton, premultipliedAlpha) {
        this.enableRenderer(this.batcher);
        for (const slot of skeleton.drawOrder) {
          const item = geometry(skeleton, slot); if (!item) continue;
          const { attachment: a, positions, triangles } = item;
          if (!positions.every(Number.isFinite)) continue;
          const alpha = skeleton.a * slot.a * a.a;
          const multiplier = premultipliedAlpha ? alpha : 1;
          const r = skeleton.r * slot.r * a.r * multiplier;
          const g = skeleton.g * slot.g * a.g * multiplier;
          const b = skeleton.b * slot.b * a.b * multiplier;
          const vertices = new Float32Array(positions.length * 4);
          for (let i = 0; i < positions.length; i += 2) {
            vertices.set([positions[i], positions[i + 1], r, g, b, alpha, a.uvs[i], a.uvs[i + 1]], i * 4);
          }
          const gl = this.gl;
          this.batcher.setBlendMode(premultipliedAlpha ? gl.ONE : gl.SRC_ALPHA, slot.data.additiveBlending ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
          this.batcher.draw(a.rendererObject.texture, vertices, triangles);
        }
      }
    }
    s.webgl = { ...graphics.webgl, SceneRenderer };
  }
})();

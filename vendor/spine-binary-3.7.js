/* Spine 3.7 binary reader: port of the 3.6 reader with the official 3.7 format changes.
 * See vendor/README.md, LICENSE.spine-3.6, and LICENSE.spine-3.7. */
(function (spine) {
	var BinaryReader = (function () {
		function BinaryReader(data) {
			this.offset = 0;
			this.size = data.byteLength;
			this.buffer = new Uint8Array(data);
			this.floatBuf = new ArrayBuffer(4);
			this.floatBufIn = new Uint8Array(this.floatBuf);
			this.floatBufOut = new Float32Array(this.floatBuf);
			this.doubleBuf = new ArrayBuffer(8);
			this.doubleBufIn = new Uint8Array(this.doubleBuf);
			this.doubleBufOut = new Float64Array(this.doubleBuf);
		}
		BinaryReader.prototype.readByte = function () {
			if (this.offset >= this.size) throw new Error("Truncated Spine 3.7 binary data.");
			return this.buffer[this.offset++];
		};
		BinaryReader.prototype.readSByte = function () {
			var byte = this.readByte();
			if (byte > 127)
				byte -= 256;
			return byte;
		};
		BinaryReader.prototype.readBool = function () {
			return this.readByte() != 0;
		};
		BinaryReader.prototype.readShort = function () {
			var result = this.readByte();
			result <<= 8;
			result |= this.readByte();
			return result;
		};
		BinaryReader.prototype.readInt = function () {
			var result = this.readByte();
			result <<= 8;
			result |= this.readByte();
			result <<= 8;
			result |= this.readByte();
			result <<= 8;
			result |= this.readByte();
			return result;
		};
		BinaryReader.prototype.readVarInt = function (optimizePositive) {
			if (optimizePositive === void 0) { optimizePositive = true; }
			var b = this.readByte();
			var value = b & 0x7f;
			if (b & 0x80) {
				b = this.readByte();
				value |= (b & 0x7f) << 7;
				if (b & 0x80) {
					b = this.readByte();
					value |= (b & 0x7f) << 14;
					if (b & 0x80) {
						b = this.readByte();
						value |= (b & 0x7f) << 21;
						if (b & 0x80) {
							b = this.readByte();
							value |= (b & 0x7f) << 28;
						}
					}
				}
			}
			if (!optimizePositive)
				value = ((value >>> 1) ^ -(value & 1));
			return value;
		};
		BinaryReader.prototype.readFloat = function () {
			this.floatBufIn[3] = this.readByte();
			this.floatBufIn[2] = this.readByte();
			this.floatBufIn[1] = this.readByte();
			this.floatBufIn[0] = this.readByte();
			return this.floatBufOut[0];
		};
		BinaryReader.prototype.readString = function () {
			var length = this.readVarInt();
			if (length == 0)
				return null;
			if (length < 1 || this.offset + length - 1 > this.size) throw new Error("Invalid Spine 3.7 binary string length.");
			var strBuf = new Uint8Array(this.buffer.buffer.slice(this.offset, this.offset + length - 1));
			this.offset += length - 1;
			return decodeURIComponent(escape(String.fromCharCode.apply(null, strBuf)));
		};
		BinaryReader.prototype.readColor = function () {
			var color = [
				this.readByte() / 255,
				this.readByte() / 255,
				this.readByte() / 255,
				this.readByte() / 255
			];
			if (color[0] == 1 &&
				color[1] == 1 &&
				color[2] == 1 &&
				color[3] == 1)
				color = null;
			return color;
		};
		return BinaryReader;
	}());
	var SkeletonBinary = (function () {
		function SkeletonBinary(attachmentLoader) {
			this.scale = 1;
			this.linkedMeshes = new Array();
			this.attachmentLoader = attachmentLoader;
		}
		SkeletonBinary.prototype.readSkeletonData = function (buf) {
			var scale = this.scale;
			var skeletonData = new spine.SkeletonData();
			var reader = new BinaryReader(buf);
			skeletonData.hash = reader.readString();
			skeletonData.version = reader.readString();
			skeletonData.width = reader.readFloat();
			skeletonData.height = reader.readFloat();
			var nonessential = reader.readBool();
			if (nonessential) {
				skeletonData.fps = reader.readFloat();
				skeletonData.imagesPath = reader.readString();
				skeletonData.audioPath = reader.readString();
			}
			for (var i = 0, boneCount = reader.readVarInt(); i < boneCount; i++) {
				var boneName = reader.readString();
				var parent_2 = null;
				if (i > 0) {
					var parentIndex = reader.readVarInt();
					parent_2 = skeletonData.bones[parentIndex];
					if (parent_2 == null)
						throw new Error("Parent bone not found: " + parentIndex);
				}
				var data = new spine.BoneData(i, boneName, parent_2);
				data.rotation = reader.readFloat();
				data.x = reader.readFloat() * scale;
				data.y = reader.readFloat() * scale;
				data.scaleX = reader.readFloat();
				data.scaleY = reader.readFloat();
				data.shearX = reader.readFloat();
				data.shearY = reader.readFloat();
				data.length = reader.readFloat() * scale;
				data.transformMode = reader.readByte();
				if (nonessential)
					reader.readColor();
				skeletonData.bones.push(data);
			}
			for (var i = 0, slotCount = reader.readVarInt(); i < slotCount; i++) {
				var slotName = reader.readString();
				var boneIndex = reader.readVarInt();
				var boneData = skeletonData.bones[boneIndex];
				if (boneData == null)
					throw new Error("Slot bone not found: " + boneIndex);
				var data = new spine.SlotData(i, slotName, boneData);
				var color = reader.readColor();
				if (color != null)
					data.color.set(color[0], color[1], color[2], color[3]);
				var dark = reader.readColor();
				if (dark != null) {
					data.darkColor = new spine.Color(1, 1, 1, 1);
					data.darkColor.set(dark[0], dark[1], dark[2], dark[3]);
				}
				data.attachmentName = reader.readString();
				data.blendMode = reader.readByte();
				skeletonData.slots.push(data);
			}
			for (var i = 0, ikCount = reader.readVarInt(); i < ikCount; i++) {
				var data = new spine.IkConstraintData(reader.readString());
				data.order = reader.readVarInt();
				for (var j = 0, boneCount = reader.readVarInt(); j < boneCount; j++) {
					var boneIndex = reader.readVarInt();
					var bone = skeletonData.bones[boneIndex];
					if (bone == null)
						throw new Error("IK bone not found: " + boneIndex);
					data.bones.push(bone);
				}
				var targetIndex = reader.readVarInt();
				data.target = skeletonData.bones[targetIndex];
				if (data.target == null)
					throw new Error("IK target bone not found: " + targetIndex);
				data.mix = reader.readFloat();
				data.bendDirection = reader.readSByte();
				data.compress = reader.readBool();
				data.stretch = reader.readBool();
				data.uniform = reader.readBool();
				skeletonData.ikConstraints.push(data);
			}
			for (var i = 0, transformCount = reader.readVarInt(); i < transformCount; i++) {
				var data = new spine.TransformConstraintData(reader.readString());
				data.order = reader.readVarInt();
				for (var j = 0, boneCount = reader.readVarInt(); j < boneCount; j++) {
					var boneIndex = reader.readVarInt();
					var bone = skeletonData.bones[boneIndex];
					if (bone == null)
						throw new Error("Transform constraint bone not found: " + boneIndex);
					data.bones.push(bone);
				}
				var targetIndex = reader.readVarInt();
				data.target = skeletonData.bones[targetIndex];
				if (data.target == null)
					throw new Error("Transform constraint target bone not found: " + targetIndex);
				data.local = reader.readBool();
				data.relative = reader.readBool();
				data.offsetRotation = reader.readFloat();
				data.offsetX = reader.readFloat();
				data.offsetY = reader.readFloat();
				data.offsetScaleX = reader.readFloat();
				data.offsetScaleY = reader.readFloat();
				data.offsetShearY = reader.readFloat();
				data.rotateMix = reader.readFloat();
				data.translateMix = reader.readFloat();
				data.scaleMix = reader.readFloat();
				data.shearMix = reader.readFloat();
				skeletonData.transformConstraints.push(data);
			}
			for (var i = 0, pathCount = reader.readVarInt(); i < pathCount; i++) {
				var data = new spine.PathConstraintData(reader.readString());
				data.order = reader.readVarInt();
				for (var j = 0, boneCount = reader.readVarInt(); j < boneCount; j++) {
					var boneIndex = reader.readVarInt();
					var bone = skeletonData.bones[boneIndex];
					if (bone == null)
						throw new Error("Transform constraint bone not found: " + boneIndex);
					data.bones.push(bone);
				}
				var targetIndex = reader.readVarInt();
				data.target = skeletonData.slots[targetIndex];
				if (data.target == null)
					throw new Error("Path target slot not found: " + targetIndex);
				data.positionMode = reader.readByte();
				data.spacingMode = reader.readByte();
				data.rotateMode = reader.readByte();
				data.offsetRotation = reader.readFloat();
				data.position = reader.readFloat();
				if (data.positionMode == spine.PositionMode.Fixed)
					data.position *= scale;
				data.spacing = reader.readFloat();
				if (data.spacingMode == spine.SpacingMode.Length || data.spacingMode == spine.SpacingMode.Fixed)
					data.spacing *= scale;
				data.rotateMix = reader.readFloat();
				data.translateMix = reader.readFloat();
				skeletonData.pathConstraints.push(data);
			}
			var defaultSkin = new spine.Skin('default');
			for (var i = 0, slotCount = reader.readVarInt(); i < slotCount; i++) {
				var slotIndex = reader.readVarInt();
				for (var j = 0, attachmentCount = reader.readVarInt(); j < attachmentCount; j++) {
					var placeholderName = reader.readString();
					var attachment = this.readAttachment(reader, defaultSkin, slotIndex, placeholderName, skeletonData, nonessential);
					if (attachment != null)
						defaultSkin.addAttachment(slotIndex, placeholderName, attachment);
				}
			}
			skeletonData.skins.push(defaultSkin);
			skeletonData.defaultSkin = defaultSkin;
			for (var i = 0, skinCount = reader.readVarInt(); i < skinCount; i++) {
				var skin = new spine.Skin(reader.readString());
				for (var j = 0, slotCount = reader.readVarInt(); j < slotCount; j++) {
					var slotIndex = reader.readVarInt();
					for (var k = 0, attachmentCount = reader.readVarInt(); k < attachmentCount; k++) {
						var placeholderName = reader.readString();
						var attachment = this.readAttachment(reader, skin, slotIndex, placeholderName, skeletonData, nonessential);
						if (attachment != null)
							skin.addAttachment(slotIndex, placeholderName, attachment);
					}
				}
				skeletonData.skins.push(skin);
			}
			for (var i = 0, n = this.linkedMeshes.length; i < n; i++) {
				var linkedMesh = this.linkedMeshes[i];
				var skin = linkedMesh.skin == null ? skeletonData.defaultSkin : skeletonData.findSkin(linkedMesh.skin);
				if (skin == null)
					throw new Error("Skin not found: " + linkedMesh.skin);
				var parent_3 = skin.getAttachment(linkedMesh.slotIndex, linkedMesh.parent);
				if (parent_3 == null)
					throw new Error("Parent mesh not found: " + linkedMesh.parent);
				linkedMesh.mesh.setParentMesh(parent_3);
				linkedMesh.mesh.updateUVs();
			}
			this.linkedMeshes.length = 0;
			for (var i = 0, eventCount = reader.readVarInt(); i < eventCount; i++) {
				var data = new spine.EventData(reader.readString());
				data.intValue = reader.readVarInt(false);
				data.floatValue = reader.readFloat();
				data.stringValue = reader.readString();
				data.audioPath = reader.readString();
				if (data.audioPath != null) { data.volume = reader.readFloat(); data.balance = reader.readFloat(); }
				skeletonData.events.push(data);
			}
			for (var i = 0, animationCount = reader.readVarInt(); i < animationCount; i++) {
				var animationName = reader.readString();
				this.readAnimation(reader, animationName, skeletonData);
			}
			return skeletonData;
		};
		SkeletonBinary.prototype.readAttachment = function (reader, skin, slotIndex, placeholderName, skeletonData, nonessential) {
			var scale = this.scale;
			var name = reader.readString();
			if (!name) {
				name = placeholderName;
			}
			var type = reader.readByte();
			switch (type) {
				case spine.AttachmentType.Region: {
					var path = reader.readString();
					if (!path)
						path = name;
					var region = this.attachmentLoader.newRegionAttachment(skin, name, path);
					if (region == null)
						return null;
					region.path = path;
					region.rotation = reader.readFloat();
					region.x = reader.readFloat() * scale;
					region.y = reader.readFloat() * scale;
					region.scaleX = reader.readFloat();
					region.scaleY = reader.readFloat();
					region.width = reader.readFloat() * scale;
					region.height = reader.readFloat() * scale;
					var color = reader.readColor();
					if (color != null)
						region.color.set(color[0], color[1], color[2], color[3]);
					region.updateOffset();
					return region;
				}
				case spine.AttachmentType.BoundingBox: {
					var box = this.attachmentLoader.newBoundingBoxAttachment(skin, name);
					if (box == null)
						return null;
					var vertexCount = reader.readVarInt();
					this.readVertices(reader, box, vertexCount);
					if (nonessential) {
						var color = reader.readColor();
						if (color != null)
							box.color.set(color[0], color[1], color[2], color[3]);
					}
					return box;
				}
				case spine.AttachmentType.Mesh: {
					var path = reader.readString();
					if (!path)
						path = name;
					var mesh = this.attachmentLoader.newMeshAttachment(skin, name, path);
					if (mesh == null)
						return null;
					mesh.path = path;
					var color = reader.readColor();
					if (color != null)
						mesh.color.set(color[0], color[1], color[2], color[3]);
					var uvs = [];
					for (var i = 0, uvCount = reader.readVarInt(); i < uvCount; i++) {
						uvs.push(reader.readFloat());
						uvs.push(reader.readFloat());
					}
					var triangles = [];
					for (var i = 0, triangleCount = reader.readVarInt(); i < triangleCount; i++) {
						triangles.push(reader.readShort());
					}
					mesh.triangles = triangles;
					mesh.regionUVs = uvs;
					this.readVertices(reader, mesh, uvs.length / 2);
					mesh.updateUVs();
					mesh.hullLength = reader.readVarInt() * 2;
					if (nonessential) {
						var edges = [];
						for (var i = 0, edgeCount = reader.readVarInt(); i < edgeCount; i++) {
							edges.push(reader.readShort());
						}
						var width = reader.readFloat();
						var height = reader.readFloat();
					}
					return mesh;
				}
				case spine.AttachmentType.LinkedMesh: {
					var path = reader.readString();
					if (!path)
						path = name;
					var mesh = this.attachmentLoader.newMeshAttachment(skin, name, path);
					if (mesh == null)
						return null;
					mesh.path = path;
					var color = reader.readColor();
					if (color != null)
						mesh.color.set(color[0], color[1], color[2], color[3]);
					var skinName = reader.readString();
					var parent_4 = reader.readString();
					var inheritDeform = reader.readBool();
					mesh.inheritDeform = inheritDeform;
					this.linkedMeshes.push(new LinkedMesh(mesh, skinName, slotIndex, parent_4));
					if (nonessential) {
						var width = reader.readFloat();
						var height = reader.readFloat();
					}
					return mesh;
				}
				case spine.AttachmentType.Path: {
					var path = this.attachmentLoader.newPathAttachment(skin, name);
					if (path == null)
						return null;
					path.closed = reader.readBool();
					path.constantSpeed = reader.readBool();
					var vertexCount = reader.readVarInt();
					this.readVertices(reader, path, vertexCount);
					var lengths = spine.Utils.newArray(vertexCount / 3, 0);
					for (var i = 0; i < lengths.length; i++)
						lengths[i] = reader.readFloat() * scale;
					path.lengths = lengths;
					if (nonessential) {
						var color = reader.readColor();
						if (color != null)
							path.color.set(color[0], color[1], color[2], color[3]);
					}
					return path;
				}
				case spine.AttachmentType.Point: {
					var point = this.attachmentLoader.newPointAttachment(skin, name);
					if (point == null)
						return null;
					point.rotation = reader.readFloat();
					point.x = reader.readFloat() * scale;
					point.y = reader.readFloat() * scale;
					if (nonessential) {
						var color = reader.readColor();
						if (color != null)
							point.color.set(color[0], color[1], color[2], color[3]);
					}
					return point;
				}
				case 6: { // Clipping has wire type 6; the 3.7 TS enum omits this entry.
					var clip = this.attachmentLoader.newClippingAttachment(skin, name);
					if (clip == null)
						return null;
					var end = reader.readVarInt();
					var slot = skeletonData.slots[end];
					if (slot == null)
						throw new Error("Clipping end slot not found: " + end);
					clip.endSlot = slot;
					var vertexCount = reader.readVarInt();
					this.readVertices(reader, clip, vertexCount);
					if (nonessential) {
						var color = reader.readColor();
						if (color != null)
							clip.color.set(color[0], color[1], color[2], color[3]);
					}
					return clip;
				}
			}
			return null;
		};
		SkeletonBinary.prototype.readVertices = function (reader, attachment, verticesLength) {
			var scale = this.scale;
			attachment.worldVerticesLength = verticesLength * 2;
			var weighted = reader.readBool();
			if (!weighted) {
				var vertices = new Array();
				for (var i = 0; i < verticesLength; i++) {
					vertices.push(reader.readFloat());
					vertices.push(reader.readFloat());
				}
				var scaledVertices = spine.Utils.toFloatArray(vertices);
				if (scale != 1) {
					for (var i = 0, n = vertices.length; i < n; i++)
						scaledVertices[i] *= scale;
				}
				attachment.vertices = scaledVertices;
				return;
			}
			var weights = new Array();
			var bones = new Array();
			for (var i = 0, n = verticesLength; i < n; i++) {
				var boneCount = reader.readVarInt();
				bones.push(boneCount);
				for (var j = 0; j < boneCount; j++) {
					bones.push(reader.readVarInt());
					weights.push(reader.readFloat() * scale);
					weights.push(reader.readFloat() * scale);
					weights.push(reader.readFloat());
				}
			}
			attachment.bones = bones;
			attachment.vertices = spine.Utils.toFloatArray(weights);
		};
		SkeletonBinary.prototype.readAnimation = function (reader, name, skeletonData) {
			var scale = this.scale;
			var timelines = new Array();
			var duration = 0;
			for (var i = 0, slotCount = reader.readVarInt(); i < slotCount; i++) {
				var slotIndex = reader.readVarInt();
				for (var ii = 0, timelineCount = reader.readVarInt(); ii < timelineCount; ii++) {
					var timelineName = reader.readByte() + 4;
					var frameCount = reader.readVarInt();
					if (timelineName == spine.TimelineType.attachment) {
						var timeline = new spine.AttachmentTimeline(frameCount);
						timeline.slotIndex = slotIndex;
						var frameIndex = 0;
						for (var i_8 = 0; i_8 < frameCount; i_8++) {
							timeline.setFrame(frameIndex++, reader.readFloat(), reader.readString());
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[timeline.getFrameCount() - 1]);
					}
					else if (timelineName == spine.TimelineType.color) {
						var timeline = new spine.ColorTimeline(frameCount);
						timeline.slotIndex = slotIndex;
						var frameIndex = 0;
						for (var i_9 = 0; i_9 < frameCount; i_9++) {
							var time = reader.readFloat();
							var color = reader.readColor();
							if (!color)
								color = [1, 1, 1, 1];
							timeline.setFrame(frameIndex, time, color[0], color[1], color[2], color[3]);
							if (frameIndex < frameCount - 1)
								this.readCurve(reader, timeline, frameIndex);
							frameIndex++;
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[(timeline.getFrameCount() - 1) * spine.ColorTimeline.ENTRIES]);
					}
					else if (timelineName == spine.TimelineType.deform) {
						var timeline = new spine.TwoColorTimeline(frameCount);
						timeline.slotIndex = slotIndex;
						var frameIndex = 0;
						for (var i_10 = 0; i_10 < frameCount; i_10++) {
							var time = reader.readFloat();
							var light = reader.readColor();
							var dark = reader.readColor();
							if (!light)
								light = [1, 1, 1, 1];
							if (!dark)
								dark = [1, 1, 1, 1];
							timeline.setFrame(frameIndex, time, light[0], light[1], light[2], light[3], dark[0], dark[1], dark[2]);
							if (frameIndex < frameCount - 1)
								this.readCurve(reader, timeline, frameIndex);
							frameIndex++;
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[(timeline.getFrameCount() - 1) * spine.TwoColorTimeline.ENTRIES]);
					}
					else
						throw new Error("Invalid timeline type for a slot: " + timelineName + " (" + slotIndex + ")");
				}
			}
			for (var i = 0, boneCount = reader.readVarInt(); i < boneCount; i++) {
				var boneIndex = reader.readVarInt();
				for (var ii = 0, timelineCount = reader.readVarInt(); ii < timelineCount; ii++) {
					var timelineName = reader.readByte();
					var frameCount = reader.readVarInt();
					if (timelineName === spine.TimelineType.rotate) {
						var timeline = new spine.RotateTimeline(frameCount);
						timeline.boneIndex = boneIndex;
						var frameIndex = 0;
						for (var i_11 = 0; i_11 < frameCount; i_11++) {
							timeline.setFrame(frameIndex, reader.readFloat(), reader.readFloat());
							if (frameIndex < frameCount - 1)
								this.readCurve(reader, timeline, frameIndex);
							frameIndex++;
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[(timeline.getFrameCount() - 1) * spine.RotateTimeline.ENTRIES]);
					}
					else if (timelineName === spine.TimelineType.translate || timelineName === spine.TimelineType.scale || timelineName === spine.TimelineType.shear) {
						var timeline = null;
						var timelineScale = 1;
						if (timelineName === spine.TimelineType.scale)
							timeline = new spine.ScaleTimeline(frameCount);
						else if (timelineName === spine.TimelineType.shear)
							timeline = new spine.ShearTimeline(frameCount);
						else {
							timeline = new spine.TranslateTimeline(frameCount);
							timelineScale = scale;
						}
						timeline.boneIndex = boneIndex;
						var frameIndex = 0;
						for (var i_12 = 0; i_12 < frameCount; i_12++) {
							var time = reader.readFloat();
							var x = reader.readFloat(), y = reader.readFloat();
							timeline.setFrame(frameIndex, time, x * timelineScale, y * timelineScale);
							if (frameIndex < frameCount - 1)
								this.readCurve(reader, timeline, frameIndex);
							frameIndex++;
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[(timeline.getFrameCount() - 1) * spine.TranslateTimeline.ENTRIES]);
					}
					else
						throw new Error("Invalid timeline type for a bone: " + timelineName + " (" + boneIndex + ")");
				}
			}
			for (var i = 0, count = reader.readVarInt(); i < count; i++) {
				var ikConstraintIndex = reader.readVarInt();
				var frameCount = reader.readVarInt();
				var timeline = new spine.IkConstraintTimeline(frameCount);
				timeline.ikConstraintIndex = ikConstraintIndex;
				var frameIndex = 0;
				for (var i_13 = 0; i_13 < frameCount; i_13++) {
					timeline.setFrame(frameIndex, reader.readFloat(), reader.readFloat(), reader.readSByte(), reader.readBool(), reader.readBool());
					if (frameIndex < frameCount - 1)
						this.readCurve(reader, timeline, frameIndex);
					frameIndex++;
				}
				timelines.push(timeline);
				duration = Math.max(duration, timeline.frames[(timeline.getFrameCount() - 1) * spine.IkConstraintTimeline.ENTRIES]);
			}
			for (var i = 0, count = reader.readVarInt(); i < count; i++) {
				var transformConstraintIndex = reader.readVarInt();
				var frameCount = reader.readVarInt();
				var timeline = new spine.TransformConstraintTimeline(frameCount);
				timeline.transformConstraintIndex = transformConstraintIndex;
				var frameIndex = 0;
				for (var i_14 = 0; i_14 < frameCount; i_14++) {
					timeline.setFrame(frameIndex, reader.readFloat(), reader.readFloat(), reader.readFloat(), reader.readFloat(), reader.readFloat());
					if (frameIndex < frameCount - 1)
						this.readCurve(reader, timeline, frameIndex);
					frameIndex++;
				}
				timelines.push(timeline);
				duration = Math.max(duration, timeline.frames[(timeline.getFrameCount() - 1) * spine.TransformConstraintTimeline.ENTRIES]);
			}
			for (var i = 0, count = reader.readVarInt(); i < count; i++) {
				var index = reader.readVarInt();
				var data = skeletonData.pathConstraints[index];
				for (var ii = 0, nn = reader.readVarInt(); ii < nn; ii++) {
					var timelineName = reader.readByte() + 11;
					var frameCount = reader.readVarInt();
					if (timelineName === spine.TimelineType.pathConstraintPosition || timelineName === spine.TimelineType.pathConstraintSpacing) {
						var timeline = null;
						var timelineScale = 1;
						if (timelineName === spine.TimelineType.pathConstraintSpacing) {
							timeline = new spine.PathConstraintSpacingTimeline(frameCount);
							if (data.spacingMode == spine.SpacingMode.Length || data.spacingMode == spine.SpacingMode.Fixed)
								timelineScale = scale;
						}
						else {
							timeline = new spine.PathConstraintPositionTimeline(frameCount);
							if (data.positionMode == spine.PositionMode.Fixed)
								timelineScale = scale;
						}
						timeline.pathConstraintIndex = index;
						var frameIndex = 0;
						for (var i_15 = 0; i_15 < frameCount; i_15++) {
							timeline.setFrame(frameIndex, reader.readFloat(), reader.readFloat() * timelineScale);
							if (frameIndex < frameCount - 1)
								this.readCurve(reader, timeline, frameIndex);
							frameIndex++;
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[(timeline.getFrameCount() - 1) * spine.PathConstraintPositionTimeline.ENTRIES]);
					}
					else if (timelineName === spine.TimelineType.pathConstraintMix) {
						var timeline = new spine.PathConstraintMixTimeline(frameCount);
						timeline.pathConstraintIndex = index;
						var frameIndex = 0;
						for (var i_16 = 0; i_16 < frameCount; i_16++) {
							timeline.setFrame(frameIndex, reader.readFloat(), reader.readFloat(), reader.readFloat());
							if (frameIndex < frameCount - 1)
								this.readCurve(reader, timeline, frameIndex);
							frameIndex++;
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[(timeline.getFrameCount() - 1) * spine.PathConstraintMixTimeline.ENTRIES]);
					}
				}
			}
			for (var i = 0, count = reader.readVarInt(); i < count; i++) {
				var skinIndex = reader.readVarInt();
				var skin = skeletonData.skins[skinIndex];
				if (skin == null)
					throw new Error("Skin not found: " + skinIndex);
				for (var ii = 0, nn = reader.readVarInt(); ii < nn; ii++) {
					var slotIndex = reader.readVarInt();
					for (var iii = 0, nnn = reader.readVarInt(); iii < nnn; iii++) {
						var attachmentName = reader.readString();
						var attachment = skin.getAttachment(slotIndex, attachmentName);
						if (attachment == null)
							throw new Error("Deform attachment not found: " + attachmentName);
						var weighted = attachment.bones != null;
						var vertices = attachment.vertices;
						var deformLength = weighted ? vertices.length / 3 * 2 : vertices.length;
						var frameCount = reader.readVarInt();
						var timeline = new spine.DeformTimeline(frameCount);
						timeline.slotIndex = slotIndex;
						timeline.attachment = attachment;
						var frameIndex = 0;
						for (var j = 0; j < frameCount; j++) {
							var time = reader.readFloat();
							var end = reader.readVarInt();
							var deform = void 0;
							if (end == 0)
								deform = weighted ? spine.Utils.newFloatArray(deformLength) : vertices;
							else {
								deform = spine.Utils.newFloatArray(deformLength);
								var start = reader.readVarInt();
								end += start;
								if (scale == 1) {
									for (var v = start; v < end; v++)
										deform[v] = reader.readFloat();
								}
								else {
									for (var v = start; v < end; v++)
										deform[v] = reader.readFloat() * scale;
								}
								if (!weighted) {
									for (var v = 0, vn = deform.length; v < vn; v++)
										deform[v] += vertices[v];
								}
							}
							timeline.setFrame(frameIndex, time, deform);
							if (frameIndex < frameCount - 1)
								this.readCurve(reader, timeline, frameIndex);
							frameIndex++;
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[timeline.getFrameCount() - 1]);
					}
				}
			}
			var drawOrderCount = reader.readVarInt();
			if (drawOrderCount > 0) {
				var timeline = new spine.DrawOrderTimeline(drawOrderCount);
				var slotCount = skeletonData.slots.length;
				for (var i = 0; i < drawOrderCount; i++) {
					var time = reader.readFloat();
					var offsetCount = reader.readVarInt();
					var drawOrder = spine.Utils.newArray(slotCount, -1);
					var unchanged = new Array(slotCount - offsetCount);
					var originalIndex = 0, unchangedIndex = 0;
					for (var ii = 0; ii < offsetCount; ii++) {
						var slotIndex = reader.readVarInt();
						while (originalIndex != slotIndex)
							unchanged[unchangedIndex++] = originalIndex++;
						drawOrder[originalIndex + reader.readVarInt()] = originalIndex++;
					}
					while (originalIndex < slotCount)
						unchanged[unchangedIndex++] = originalIndex++;
					for (var ii = slotCount - 1; ii >= 0; ii--)
						if (drawOrder[ii] == -1)
							drawOrder[ii] = unchanged[--unchangedIndex];
					timeline.setFrame(i, time, drawOrder);
				}
				timelines.push(timeline);
				duration = Math.max(duration, timeline.frames[timeline.getFrameCount() - 1]);
			}
			var eventCount = reader.readVarInt();
			if (eventCount > 0) {
				var timeline = new spine.EventTimeline(eventCount);
				for (var i = 0; i < eventCount; i++) {
					var time = reader.readFloat();
					var eventIndex = reader.readVarInt();
					var eventData = skeletonData.events[eventIndex];
					if (eventData == null)
						throw new Error("Event not found: " + eventIndex);
					var event_4 = new spine.Event(spine.Utils.toSinglePrecision(time), eventData);
					event_4.intValue = reader.readVarInt(false);
					event_4.floatValue = reader.readFloat();
					event_4.stringValue = reader.readBool() ? reader.readString() : eventData.stringValue;
					if (eventData.audioPath != null) { event_4.volume = reader.readFloat(); event_4.balance = reader.readFloat(); }
					timeline.setFrame(i, event_4);
				}
				timelines.push(timeline);
				duration = Math.max(duration, timeline.frames[timeline.getFrameCount() - 1]);
			}
			if (isNaN(duration)) {
				throw new Error("Error while parsing animation, duration is NaN");
			}
			skeletonData.animations.push(new spine.Animation(name, timelines, duration));
		};
		SkeletonBinary.prototype.readCurve = function (reader, timeline, frameIndex) {
			var type = reader.readByte();
			if (type === spine.CurveTimeline.STEPPED)
				timeline.setStepped(frameIndex);
			else if (type === spine.CurveTimeline.BEZIER) {
				timeline.setCurve(frameIndex, reader.readFloat(), reader.readFloat(), reader.readFloat(), reader.readFloat());
			}
		};
		return SkeletonBinary;
	}());
	spine.SkeletonBinary = SkeletonBinary;
	var LinkedMesh = (function () {
		function LinkedMesh(mesh, skin, slotIndex, parent) {
			this.mesh = mesh;
			this.skin = skin;
			this.slotIndex = slotIndex;
			this.parent = parent;
		}
		return LinkedMesh;
	}());

})(window.spine37);

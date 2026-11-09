/** Render inside the actor transform, sharing one crop and outline in DOM and video. */
export function paintFace(context, atlas, face) {
  if (!face || !atlas) return;
  const [sx, sy, sw, sh] = face.sourceRect, [dx, dy, dw, dh] = face.targetRect;
  const scaleX = atlas.width / face.atlasSize[0], scaleY = atlas.height / face.atlasSize[1];
  context.save(); context.beginPath();
  face.clip.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
  context.closePath();
  if (face.fill) { context.fillStyle = face.fill; context.fill(); }
  context.clip();
  context.drawImage(atlas, sx * scaleX, sy * scaleY, sw * scaleX, sh * scaleY, dx, dy, dw, dh);
  context.restore();
}

export function faceMarkup(face, id, baseURI) {
  if (!face) return '';
  const [x, y, width, height] = face.targetRect, points = face.clip.map(point => point.join(',')).join(' ');
  const href = new URL(face.atlas, baseURI).href.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return `<svg class="scene-face" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="${id}"><polygon points="${points}"/></clipPath></defs><g clip-path="url(#${id})">${face.fill ? `<polygon points="${points}" fill="${face.fill}"/>` : ''}<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${face.sourceRect.join(' ')}" preserveAspectRatio="none"><image width="${face.atlasSize[0]}" height="${face.atlasSize[1]}" href="${href}"/></svg></g></svg>`;
}

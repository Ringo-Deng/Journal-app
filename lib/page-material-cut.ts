import type { Book, Piece, Spread } from './journal';

export type PageMaterialCutPlacement = {
  /** Center offset from the original image center, normalized by its width/height. */
  centerX: number;
  centerY: number;
  /** Rotated output bounds, normalized by the original image width/height. */
  width: number;
  height: number;
};

export type PageMaterialCutOutput = {
  src: string;
  width: number;
  height: number;
  name: string;
  placement: PageMaterialCutPlacement;
};

export type PageMaterialCutTarget = {
  sessionId: string;
  bookId: string;
  spreadId: string;
  piece: Piece;
  sourceSrc: string;
  sourceBox?: { x: number; y: number; width: number; height: number };
  pieceHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  name: string;
};

function targetSpread(book: Book, spreadId: string) {
  if (book.flyleaf?.id === spreadId) return book.flyleaf;
  return book.spreads.find((spread) => spread.id === spreadId);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  return value;
}

function samePiece(left: Piece, right: Piece) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

export function assertPageMaterialCutTarget(
  books: Book[],
  target: PageMaterialCutTarget,
  outputCount: number,
) {
  if (!Number.isInteger(outputCount) || outputCount < 1 || outputCount > 48)
    throw Error('裁片数量无效，请返回纸面后重新裁切。');
  const book = books.find((candidate) => candidate.id === target.bookId);
  const spread = book ? targetSpread(book, target.spreadId) : undefined;
  const piece = spread?.elements.find((candidate) => candidate.id === target.piece.id);
  if (!book || !spread || !piece)
    throw Error('原素材已不在当前纸面，裁切结果没有覆盖任何内容。');
  if (!samePiece(piece, target.piece))
    throw Error('原素材在裁切期间已有修改，请返回纸面后重新打开自由裁切。');
  if (spread.elements.length - 1 + outputCount > 300)
    throw Error('当前跨页的素材数量将超过上限，请减少裁片或换到新页。');
  return { book, spread, piece };
}

function finitePlacement(placement: PageMaterialCutPlacement) {
  return (
    Number.isFinite(placement.centerX) &&
    Number.isFinite(placement.centerY) &&
    Number.isFinite(placement.width) &&
    Number.isFinite(placement.height) &&
    Math.abs(placement.centerX) <= 64 &&
    Math.abs(placement.centerY) <= 64 &&
    placement.width > 0 &&
    placement.height > 0 &&
    placement.width <= 4 &&
    placement.height <= 4
  );
}

export function pageMaterialCutPieces(
  target: PageMaterialCutTarget,
  outputs: PageMaterialCutOutput[],
  makeId: () => string,
) {
  const sourceBox = target.sourceBox || {
    x: target.piece.x,
    y: target.piece.y,
    width: target.piece.w,
    height: target.pieceHeight,
  };
  if (
    outputs.length < 1 ||
    outputs.length > 48 ||
    !Number.isFinite(target.canvasWidth) ||
    !Number.isFinite(target.canvasHeight) ||
    !Number.isFinite(target.pieceHeight) ||
    target.canvasWidth <= 0 ||
    target.canvasHeight <= 0 ||
    target.pieceHeight <= 0 ||
    !Number.isFinite(target.piece.x) ||
    !Number.isFinite(target.piece.y) ||
    !Number.isFinite(target.piece.w) ||
    target.piece.w < 1 ||
    target.piece.w > 100 ||
    !Number.isFinite(sourceBox.x) ||
    !Number.isFinite(sourceBox.y) ||
    !Number.isFinite(sourceBox.width) ||
    !Number.isFinite(sourceBox.height) ||
    sourceBox.width <= 0 ||
    sourceBox.height <= 0 ||
    outputs.some(
      (output) =>
        !/^\/uploads\/[a-f0-9-]+\.(?:jpg|png|webp)$/.test(output.src) ||
        !Number.isFinite(output.width) ||
        !Number.isFinite(output.height) ||
        output.width < 1 ||
        output.height < 1 ||
        output.width > 20000 ||
        output.height > 20000 ||
        !finitePlacement(output.placement),
    )
  )
    throw Error('裁片数据不完整，原素材没有被修改。');

  const original = target.piece,
    rotation = Number.isFinite(original.rotation) ? original.rotation : 0,
    radians = (rotation * Math.PI) / 180,
    cosine = Math.cos(radians),
    sine = Math.sin(radians),
    originalWidth = (sourceBox.width / 100) * target.canvasWidth,
    originalHeight = (sourceBox.height / 100) * target.canvasHeight,
    sourceCenter = {
      x: (sourceBox.x / 100) * target.canvasWidth + originalWidth / 2,
      y: (sourceBox.y / 100) * target.canvasHeight + originalHeight / 2,
    },
    parentWidth = (original.w / 100) * target.canvasWidth,
    parentHeight = (target.pieceHeight / 100) * target.canvasHeight,
    parentCenter = {
      x: (original.x / 100) * target.canvasWidth + parentWidth / 2,
      y: (original.y / 100) * target.canvasHeight + parentHeight / 2,
    },
    sourceOffset = {
      x: sourceCenter.x - parentCenter.x,
      y: sourceCenter.y - parentCenter.y,
    },
    originalCenter = {
      x: parentCenter.x + sourceOffset.x * cosine - sourceOffset.y * sine,
      y: parentCenter.y + sourceOffset.x * sine + sourceOffset.y * cosine,
    },
    flipX = original.flipX ? -1 : 1,
    flipY = original.flipY ? -1 : 1;

  const mapped = outputs.map((output, index) => {
    const localX = output.placement.centerX * originalWidth * flipX,
      localY = output.placement.centerY * originalHeight * flipY,
      centerX = originalCenter.x + localX * cosine - localY * sine,
      centerY = originalCenter.y + localX * sine + localY * cosine,
      width = output.placement.width * originalWidth,
      height = output.placement.height * originalHeight;
    return { output, index, centerX, centerY, width, height };
  });
  const absoluteCosine = Math.abs(cosine),
    absoluteSine = Math.abs(sine),
    safeBounds = mapped.map((item) => {
      const rotatedWidth = item.width * absoluteCosine + item.height * absoluteSine,
        rotatedHeight = item.width * absoluteSine + item.height * absoluteCosine,
        safeWidth = Math.max(item.width, rotatedWidth),
        safeHeight = Math.max(item.height, rotatedHeight);
      return {
        left: item.centerX - safeWidth / 2,
        right: item.centerX + safeWidth / 2,
        top: item.centerY - safeHeight / 2,
        bottom: item.centerY + safeHeight / 2,
      };
    }),
    bounds = {
      left: Math.min(...safeBounds.map((item) => item.left)),
      right: Math.max(...safeBounds.map((item) => item.right)),
      top: Math.min(...safeBounds.map((item) => item.top)),
      bottom: Math.max(...safeBounds.map((item) => item.bottom)),
    },
    baselineRotatedWidth = originalWidth * absoluteCosine + originalHeight * absoluteSine,
    baselineRotatedHeight = originalWidth * absoluteSine + originalHeight * absoluteCosine,
    baselineSafeWidth = Math.max(originalWidth, baselineRotatedWidth),
    baselineSafeHeight = Math.max(originalHeight, baselineRotatedHeight),
    allowed = {
      left: Math.min(0, originalCenter.x - baselineSafeWidth / 2),
      right: Math.max(target.canvasWidth, originalCenter.x + baselineSafeWidth / 2),
      top: Math.min(0, originalCenter.y - baselineSafeHeight / 2),
      bottom: Math.max(target.canvasHeight, originalCenter.y + baselineSafeHeight / 2),
    },
    groupWidth = bounds.right - bounds.left,
    groupHeight = bounds.bottom - bounds.top,
    rawScale = Math.min(
      1,
      (allowed.right - allowed.left) / groupWidth,
      (allowed.bottom - allowed.top) / groupHeight,
      target.canvasWidth / Math.max(...mapped.map((item) => item.width)),
      target.canvasHeight / Math.max(...mapped.map((item) => item.height)),
    ),
    scale = rawScale < 1 ? rawScale * (1 - 1e-9) : 1,
    pivotX = (bounds.left + bounds.right) / 2,
    pivotY = (bounds.top + bounds.bottom) / 2,
    fitted = mapped.map((item) => ({
      ...item,
      centerX: pivotX + (item.centerX - pivotX) * scale,
      centerY: pivotY + (item.centerY - pivotY) * scale,
      width: item.width * scale,
      height: item.height * scale,
    })),
    fittedBounds = fitted.map((item) => {
      const rotatedWidth = item.width * absoluteCosine + item.height * absoluteSine,
        rotatedHeight = item.width * absoluteSine + item.height * absoluteCosine,
        safeWidth = Math.max(item.width, rotatedWidth),
        safeHeight = Math.max(item.height, rotatedHeight);
      return {
        left: item.centerX - safeWidth / 2,
        right: item.centerX + safeWidth / 2,
        top: item.centerY - safeHeight / 2,
        bottom: item.centerY + safeHeight / 2,
      };
    }),
    fittedUnion = {
      left: Math.min(...fittedBounds.map((item) => item.left)),
      right: Math.max(...fittedBounds.map((item) => item.right)),
      top: Math.min(...fittedBounds.map((item) => item.top)),
      bottom: Math.max(...fittedBounds.map((item) => item.bottom)),
    },
    offsetX = fittedUnion.left < allowed.left
      ? allowed.left - fittedUnion.left
      : fittedUnion.right > allowed.right
        ? allowed.right - fittedUnion.right
        : 0,
    offsetY = fittedUnion.top < allowed.top
      ? allowed.top - fittedUnion.top
      : fittedUnion.bottom > allowed.bottom
        ? allowed.bottom - fittedUnion.bottom
        : 0;

  return fitted.map((item): Piece => {
    const widthPercent = (item.width / target.canvasWidth) * 100,
      heightPercent = (item.height / target.canvasHeight) * 100,
      minimumX = (allowed.left / target.canvasWidth) * 100,
      maximumX = (allowed.right / target.canvasWidth) * 100 - widthPercent,
      minimumY = (allowed.top / target.canvasHeight) * 100,
      maximumY = (allowed.bottom / target.canvasHeight) * 100 - heightPercent;
    if (widthPercent < 1 || heightPercent < 0.25)
      throw Error('有裁片回到纸面后会小于最小可编辑尺寸，请删除过细裁片或将裁片靠近后重试。');
    const x = ((item.centerX + offsetX - item.width / 2) / target.canvasWidth) * 100,
      y = ((item.centerY + offsetY - item.height / 2) / target.canvasHeight) * 100;
    return {
      ...original,
      id: item.index ? makeId() : original.id,
      src: item.output.src,
      assetId: undefined,
      artLabel: item.output.name,
      x: Math.max(minimumX, Math.min(maximumX, x)),
      y: Math.max(minimumY, Math.min(maximumY, y)),
      w: Math.min(100, widthPercent),
      h: Math.min(100, heightPercent),
      rotation,
      stretch: true,
      material: original.material === 'tape' ? undefined : original.material,
      attachedTo: item.index ? undefined : original.attachedTo,
    };
  });
}

export function assertPageMaterialCutPlacements(
  target: PageMaterialCutTarget,
  placements: PageMaterialCutPlacement[],
) {
  pageMaterialCutPieces(
    target,
    placements.map((placement, index) => ({
      src: `/uploads/${String(index).padStart(8, '0')}.png`,
      width: 1,
      height: 1,
      name: '裁片预检',
      placement,
    })),
    () => 'placement-preview',
  );
}

function replaceSpread(book: Book, spreadId: string, replacement: Spread) {
  if (book.flyleaf?.id === spreadId) return { ...book, flyleaf: replacement };
  return {
    ...book,
    spreads: book.spreads.map((spread) => (spread.id === spreadId ? replacement : spread)),
  };
}

export function applyPageMaterialCut(
  books: Book[],
  target: PageMaterialCutTarget,
  outputs: PageMaterialCutOutput[],
  makeId: () => string,
) {
  const { book, spread } = assertPageMaterialCutTarget(books, target, outputs.length),
    pieces = pageMaterialCutPieces(target, outputs, makeId),
    index = spread.elements.findIndex((piece) => piece.id === target.piece.id),
    replacement = {
      ...spread,
      elements: [...spread.elements.slice(0, index), ...pieces, ...spread.elements.slice(index + 1)],
    },
    nextBook = replaceSpread(book, target.spreadId, replacement);
  return {
    books: books.map((candidate) => (candidate.id === book.id ? nextBook : candidate)),
    pieces,
  };
}

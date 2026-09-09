export type TextStyleRun = { start: number; end: number; color: string };

export type DecoratedTextSegment = {
  start: number;
  end: number;
  text: string;
  color?: string;
  highlight?: string;
};

const HEX_COLOR = /^#[a-f0-9]{6}$/i;

export function validTextRuns(text: string, runs?: TextStyleRun[]): TextStyleRun[] {
  return (runs || []).filter(
    (run) =>
      Number.isInteger(run.start) &&
      Number.isInteger(run.end) &&
      run.start >= 0 &&
      run.end <= text.length &&
      run.end > run.start &&
      HEX_COLOR.test(run.color),
  );
}

export function decoratedTextSegments(
  text: string,
  colorRuns?: TextStyleRun[],
  highlightRuns?: TextStyleRun[],
): DecoratedTextSegment[] {
  if (!text) return [];
  const colors = validTextRuns(text, colorRuns);
  const highlights = validTextRuns(text, highlightRuns);
  if (!colors.length && !highlights.length)
    return [{ start: 0, end: text.length, text }];
  const stops = [
    ...new Set([
      0,
      text.length,
      ...colors.flatMap((run) => [run.start, run.end]),
      ...highlights.flatMap((run) => [run.start, run.end]),
    ]),
  ].sort((a, b) => a - b);
  return stops.slice(0, -1).map((start, index) => {
    const end = stops[index + 1];
    const color = colors.findLast((run) => run.start <= start && run.end >= end)?.color;
    const highlight = highlights.findLast(
      (run) => run.start <= start && run.end >= end,
    )?.color;
    return { start, end, text: text.slice(start, end), color, highlight };
  });
}

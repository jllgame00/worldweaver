// Screen and standalone SVG labels share the same pre-render width estimate.
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined,{granularity:'grapheme'}) : undefined;
export function* glyphs(text: string) {
  if (segmenter) {
    for (const part of segmenter.segment(text)) yield part.segment;
  } else yield* text;
}
export function textWidth(text: string, size: number) {
  let width = 0;
  for (const char of text) width += char.codePointAt(0)! > 255 ? 1 : .64;
  return width * size;
}
export function fittedLabel(text:string, emLimit:number) {
  if (textWidth(text,1) <= emLimit) return text;
  let prefix = '', units = 1;
  for (const char of glyphs(text)) {
    units += textWidth(char,1);
    if (units > emLimit) break;
    prefix += char;
  }
  const boundary = prefix.lastIndexOf(' ');
  if (boundary > prefix.length * .7) prefix = prefix.slice(0,boundary);
  return prefix.trimEnd() + '…';
}

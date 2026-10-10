export interface ScrollAnchor {
  id: string | null;
  offset: number;
  top: number;
}
export function captureAnchor(scroller: HTMLElement): ScrollAnchor {
  const top = scroller.getBoundingClientRect().top;
  const cards = scroller.querySelectorAll<HTMLElement>('[data-note-id]');
  const visible = [...cards].find(
    (card) => card.getBoundingClientRect().bottom > top + 1,
  );
  return {
    id: visible?.dataset.noteId ?? null,
    offset: visible ? visible.getBoundingClientRect().top - top : 0,
    top: scroller.scrollTop,
  };
}
export function restoreAnchor(
  scroller: HTMLElement,
  anchor: ScrollAnchor,
): void {
  // At the beginning, preserve access to the scrolling composer rather than
  // anchoring the first card below it (whose position changes as writing expands).
  if (anchor.top === 0) {
    scroller.scrollTop = 0;
    return;
  }
  const card = [
    ...scroller.querySelectorAll<HTMLElement>('[data-note-id]'),
  ].find((node) => node.dataset.noteId === anchor.id);
  if (card)
    scroller.scrollTop +=
      card.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      anchor.offset;
  else scroller.scrollTop = anchor.top;
}

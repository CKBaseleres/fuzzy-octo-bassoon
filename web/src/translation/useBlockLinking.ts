import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * Links the text cards and their regions on the Image (ticket 06, spec "Image
 * result screen"). Blocks are identified by paragraph index.
 *
 * - **Preview**: a mouse over a card or a region, or keyboard focus on a card.
 * - **Selected block**: persistent; click/tap or Enter/Space on a card toggles
 *   it, a tap on a region selects its card, a click anywhere else clears it.
 * - The **active** block (highlighted region and card) is the preview if there
 *   is one, else the selected block.
 *
 * Hover only counts for a mouse (`pointerType === 'mouse'`): touch browsers
 * emulate a sticky hover after a tap, which would keep a cleared block lit.
 * Likewise focus that comes from a pointer press does not preview, so tapping
 * a selected card again visibly clears it.
 */
export function useBlockLinking() {
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const pressing = useRef(false);
  const cards = useRef<(HTMLLIElement | null)[]>([]);

  const active = hovered ?? focused ?? selected;

  useEffect(() => {
    const clearOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.('[data-card], [data-region]')) setSelected(null);
    };
    document.addEventListener('click', clearOnOutsideClick);
    return () => document.removeEventListener('click', clearOnOutsideClick);
  }, []);

  const toggle = (i: number) => setSelected((s) => (s === i ? null : i));
  const unless = (i: number) => (current: number | null) => (current === i ? null : current);

  const revealCard = (i: number) => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    cards.current[i]?.scrollIntoView?.({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const cardRef = (i: number) => (element: HTMLLIElement | null) => {
    cards.current[i] = element;
  };

  const cardProps = (i: number) => ({
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') setHovered(i);
    },
    onPointerLeave: () => setHovered(unless(i)),
    onPointerDown: () => {
      pressing.current = true;
    },
    onFocus: () => {
      if (!pressing.current) setFocused(i);
    },
    onBlur: () => setFocused(unless(i)),
    onClick: () => {
      pressing.current = false;
      toggle(i);
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle(i);
      }
    },
  });

  const regionProps = (i: number) => ({
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      setHovered(i);
      revealCard(i);
    },
    onPointerLeave: () => setHovered(unless(i)),
    onClick: () => {
      setSelected(i);
      revealCard(i);
    },
  });

  return { active, selected, cardRef, cardProps, regionProps };
}

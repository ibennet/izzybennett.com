// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { initIngredientPopovers } from './ingredient-popover';

/** Build the same trigger markup lib/ingredients.ts injects into step HTML. */
function trigger(id: number, label: string): string {
  return (
    `<span class="ing-ref">` +
    `<button type="button" class="ing-ref-btn" aria-expanded="false" aria-describedby="ing-pop-${id}">${label}</button>` +
    `<span role="tooltip" id="ing-pop-${id}" class="ing-pop">stuff</span>` +
    `</span>`
  );
}

function setup(...labels: string[]) {
  document.body.innerHTML =
    labels.map((l, i) => trigger(i, l)).join(' and ') + '<p id="outside">elsewhere</p>';
  initIngredientPopovers();
  const refs = Array.from(document.querySelectorAll<HTMLElement>('.ing-ref'));
  const btns = refs.map((r) => r.querySelector<HTMLButtonElement>('.ing-ref-btn')!);
  return { refs, btns };
}

const isOpen = (ref: HTMLElement) => ref.hasAttribute('data-open');

describe('initIngredientPopovers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('opens on click and reflects state in aria-expanded', () => {
    const { refs, btns } = setup('flour');
    expect(isOpen(refs[0])).toBe(false);

    btns[0].click();
    expect(isOpen(refs[0])).toBe(true);
    expect(btns[0].getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles closed on a second click', () => {
    const { refs, btns } = setup('flour');
    btns[0].click();
    btns[0].click();
    expect(isOpen(refs[0])).toBe(false);
    expect(btns[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('opening one popover closes any other', () => {
    const { refs, btns } = setup('flour', 'sugar');
    btns[0].click();
    expect(isOpen(refs[0])).toBe(true);

    btns[1].click();
    expect(isOpen(refs[1])).toBe(true);
    expect(isOpen(refs[0])).toBe(false); // first auto-closed
  });

  it('closes when clicking outside any trigger', () => {
    const { refs, btns } = setup('flour');
    btns[0].click();
    expect(isOpen(refs[0])).toBe(true);

    document.getElementById('outside')!.click();
    expect(isOpen(refs[0])).toBe(false);
  });

  it('Escape closes the open popover and returns focus to its button', () => {
    const { refs, btns } = setup('flour');
    btns[0].click();
    expect(isOpen(refs[0])).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isOpen(refs[0])).toBe(false);
    expect(document.activeElement).toBe(btns[0]);
  });

  it('is a no-op when there are no triggers', () => {
    document.body.innerHTML = '<p>nothing here</p>';
    expect(() => initIngredientPopovers()).not.toThrow();
  });
});

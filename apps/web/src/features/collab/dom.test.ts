import { afterEach, describe, expect, it } from '@jest/globals';
import { isInDropdown, isInteractive, isModalOpen, isTextEntry, pastedImageName } from './dom';

function el(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.querySelector('[data-t]') as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isTextEntry', () => {
  it('accepts text fields and rejects everything else', () => {
    expect(isTextEntry(el('<input data-t type="text" />'))).toBe(true);
    expect(isTextEntry(el('<input data-t type="search" />'))).toBe(true);
    expect(isTextEntry(el('<input data-t type="checkbox" />'))).toBe(false);
    expect(isTextEntry(el('<textarea data-t></textarea>'))).toBe(true);
    expect(isTextEntry(el('<select data-t></select>'))).toBe(true);
    expect(isTextEntry(el('<div data-t contenteditable="true"></div>'))).toBe(true);
    expect(isTextEntry(el('<button data-t>x</button>'))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
    expect(isTextEntry(window)).toBe(false);
  });
});

describe('isInteractive', () => {
  it('detects controls and elements inside them', () => {
    expect(isInteractive(el('<button><span data-t>x</span></button>'))).toBe(true);
    expect(isInteractive(el('<a href="/x" data-t>x</a>'))).toBe(true);
    expect(isInteractive(el('<div role="menuitem" data-t>x</div>'))).toBe(true);
    expect(isInteractive(el('<table><tr data-t tabindex="0"><td>x</td></tr></table>'))).toBe(false);
    expect(isInteractive(null)).toBe(false);
  });
});

describe('isModalOpen', () => {
  it('sees open dialogs except those that keep the page shortcuts', () => {
    el('<div data-t></div>');
    expect(isModalOpen()).toBe(false);
    el('<div data-t role="dialog" data-state="open"></div>');
    expect(isModalOpen()).toBe(true);
    el('<div data-t role="dialog" data-state="closed"></div>');
    expect(isModalOpen()).toBe(false);
    el('<div data-t role="dialog" data-state="open" data-page-shortcuts></div>');
    expect(isModalOpen()).toBe(false);
    el('<div data-t role="alertdialog" data-state="open"></div>');
    expect(isModalOpen()).toBe(true);
  });
});

describe('isInDropdown', () => {
  it('detects menus, listboxes and popovers', () => {
    expect(isInDropdown(el('<div role="menu"><div data-t>x</div></div>'))).toBe(true);
    expect(isInDropdown(el('<div data-radix-popper-content-wrapper><p data-t>x</p></div>'))).toBe(
      true,
    );
    expect(isInDropdown(el('<div><p data-t>x</p></div>'))).toBe(false);
    expect(isInDropdown(null)).toBe(false);
  });
});

describe('pastedImageName', () => {
  it('names a pasted image after the time and its type', () => {
    const at = new Date(2026, 9, 28, 14, 5, 3);
    expect(pastedImageName(new Blob([], { type: 'image/jpeg' }), at)).toBe(
      'screenshot-20261028-140503.jpg',
    );
    expect(pastedImageName(new Blob([], { type: 'image/x-icon' }), at)).toBe(
      'screenshot-20261028-140503.png',
    );
  });
});

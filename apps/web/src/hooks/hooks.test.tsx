import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { useDebouncedCallback, useDebouncedValue } from './use-debounce';
import { useDisclosure } from './use-disclosure';
import { useMediaQuery, up } from './use-media-query';
import { useModalTarget } from './use-modal-target';

describe('useDebouncedValue / useDebouncedCallback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates the value after the delay only', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 200), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'ab' });
    expect(result.current).toBe('a');
    act(() => jest.advanceTimersByTime(200));
    expect(result.current).toBe('ab');
  });

  it('calls the callback once with the last arguments, supports flush and cancel', () => {
    const fn = jest.fn<(q: string) => void>();
    const { result } = renderHook(() => useDebouncedCallback(fn, 100));
    act(() => {
      result.current.run('a');
      result.current.run('ab');
    });
    act(() => jest.advanceTimersByTime(100));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('ab');

    act(() => {
      result.current.run('x');
      result.current.flush();
    });
    expect(fn).toHaveBeenLastCalledWith('x');

    act(() => {
      result.current.run('y');
      result.current.cancel();
      jest.advanceTimersByTime(500);
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('useDisclosure', () => {
  it('opens, closes and toggles', () => {
    const { result } = renderHook(() => useDisclosure());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1].open());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1].toggle());
    expect(result.current[0]).toBe(false);
  });
});

describe('useModalTarget', () => {
  it('keeps the target while closing and changes the key on every open', () => {
    const { result } = renderHook(() => useModalTarget<{ id: number }>());
    act(() => result.current.open({ id: 1 }));
    const firstKey = result.current.key;
    act(() => result.current.close());
    expect(result.current.opened).toBe(false);
    expect(result.current.target).toEqual({ id: 1 });
    act(() => result.current.open({ id: 2 }));
    expect(result.current.key).toBe(firstKey + 1);
  });
});

describe('useMediaQuery', () => {
  it('reads window.matchMedia', () => {
    const spy = jest.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: up('md'),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as MediaQueryList);
    const { result } = renderHook(() => useMediaQuery(up('md')));
    expect(result.current).toBe(true);
    expect(spy).toHaveBeenCalledWith('(min-width: 768px)');
  });
});

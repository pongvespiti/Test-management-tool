import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { UserMenu } from '@/components/layout/user-menu';
import { PageHeader } from '@/components/common/page-header';
import { projectNav } from '@/components/layout/nav-config';
import { openUrl } from '@/features/cases/test-utils';
import { makeProject, renderWithProviders } from '@/test/render';
import { translate } from '.';
import { TH } from './th';

beforeEach(() => {
  window.localStorage.clear();
  openUrl('/projects/3/defects');
});
afterEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = '';
});

describe('translate', () => {
  it('translates known text into Thai and leaves other text and English alone', () => {
    expect(translate('th', 'Defects')).toBe('ข้อบกพร่อง');
    expect(translate('th', 'My own plan name')).toBe('My own plan name');
    expect(translate('en', 'Defects')).toBe('Defects');
  });

  it('has a Thai wording for every menu group and item', () => {
    const missing = projectNav(3, true)
      .flatMap((s) => [s.title, ...s.items.map((i) => i.label)])
      .filter((text) => !(text in TH));
    expect(missing).toEqual([]);
  });
});

const as = () => ({ project: makeProject({ myRole: 'tester' }) });

describe('language switch', () => {
  it('is English until chosen, then Thai in the menu and page titles, and is remembered', async () => {
    const { user, unmount } = renderWithProviders(
      <>
        <UserMenu />
        <AppSidebar />
        <PageHeader title="Defects" />
      </>,
      as(),
    );
    expect(screen.getByRole('link', { name: 'Defects' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Defects' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Account menu/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: /ภาษาไทย/ }));

    expect(screen.getByRole('link', { name: 'ข้อบกพร่อง' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ข้อบกพร่อง' })).toBeInTheDocument();
    expect(screen.getByText('การทดสอบ')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('th');
    expect(window.localStorage.getItem('tmt.locale')).toBe('th');
    unmount();

    // A new visit starts in the remembered language.
    renderWithProviders(<PageHeader title="Defects" />, as());
    expect(await screen.findByRole('heading', { name: 'ข้อบกพร่อง' })).toBeInTheDocument();
  });

  it('does not translate a title that is not on the list or is not plain text', async () => {
    window.localStorage.setItem('tmt.locale', 'th');
    renderWithProviders(
      <>
        <PageHeader title="Smoke 1.2 — unit" />
        <PageHeader title={<em>Defects</em>} />
      </>,
      as(),
    );
    expect(await screen.findByRole('heading', { name: 'Smoke 1.2 — unit' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Defects' })).toBeInTheDocument();
  });

  it('keeps working when the browser refuses storage', async () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      renderWithProviders(<PageHeader title="Defects" />, as());
      expect(screen.getByRole('heading', { name: 'Defects' })).toBeInTheDocument();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

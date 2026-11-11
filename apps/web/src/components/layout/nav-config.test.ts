import { describe, expect, it } from '@jest/globals';
import { isNavItemActive, navSections, projectNav } from './nav-config';

describe('navigation config', () => {
  it('shows the project groups of the mockup inside a project', () => {
    const sections = projectNav(3);
    expect(sections.map((s) => s.title)).toEqual(['Testing', 'Library', 'Project']);
    expect(sections[0]!.items.map((i) => i.label)).toEqual([
      'Dashboard',
      'My work',
      'Test plans',
      'Defects',
      'Reports',
    ]);
    expect(sections[1]!.items.map((i) => i.href)).toContain('/projects/3/settings/suites');
  });

  it('adds the Team page for managers and leads only', () => {
    const labels = (show: boolean) => projectNav(3, show)[0]!.items.map((i) => i.label);
    expect(labels(false)).not.toContain('Team');
    expect(labels(true)).toEqual([
      'Dashboard',
      'My work',
      'Team',
      'Test plans',
      'Defects',
      'Reports',
    ]);
    expect(projectNav(3, true)[0]!.items[2]!.href).toBe('/projects/3/team');
  });

  it('shows the workspace outside projects and the admin section to admins only', () => {
    expect(navSections(null, false).map((s) => s.title)).toEqual(['Workspace']);
    expect(navSections(null, true).map((s) => s.title)).toEqual(['Workspace', 'Admin']);
    expect(navSections(3, true).map((s) => s.title)).toEqual([
      'Testing',
      'Library',
      'Project',
      'Admin',
    ]);
  });

  it('marks the dashboard only on exact match and plans also for runs', () => {
    const [testing] = projectNav(3);
    const [dashboard, , plans] = testing!.items;
    expect(isNavItemActive('/projects/3', dashboard!)).toBe(true);
    expect(isNavItemActive('/projects/3/plans', dashboard!)).toBe(false);
    expect(isNavItemActive('/projects/3/plans/9', plans!)).toBe(true);
    expect(isNavItemActive('/projects/3/runs/7/report', plans!)).toBe(true);
    expect(isNavItemActive('/projects/3/defects', plans!)).toBe(false);
  });
});

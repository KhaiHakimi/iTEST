import {describe, expect, it} from 'vitest';
import {FindingStoreService} from '../src/report/finding-store.service.js';
import type {NewFinding} from '../src/report/interfaces/finding.interface.js';

const finding = (overrides: Partial<NewFinding> = {}): NewFinding => ({
  source: 'console',
  severity: 'medium',
  title: 'Console error',
  pageUrl: 'http://localhost/',
  detail: 'boom',
  ...overrides,
});

describe('FindingStoreService', () => {
  it('merges repeats of the same problem on the same page', () => {
    const store = new FindingStoreService();
    store.add(finding({evidence: 'a.js:1'}));
    store.add(finding({evidence: 'a.js:2'}));

    const all = store.all();

    expect(all).toHaveLength(1);
    expect(all[0]?.occurrences).toBe(2);
  });

  it('keeps the same problem on different pages apart', () => {
    const store = new FindingStoreService();
    store.add(finding({pageUrl: 'http://localhost/a'}));
    store.add(finding({pageUrl: 'http://localhost/b'}));

    expect(store.all()).toHaveLength(2);
  });

  it('sorts the most severe first', () => {
    const store = new FindingStoreService();
    store.add(finding({severity: 'low', title: 'low'}));
    store.add(finding({severity: 'critical', title: 'critical'}));
    store.add(finding({severity: 'medium', title: 'medium'}));

    expect(store.all().map(f => f.severity)).toEqual([
      'critical',
      'medium',
      'low',
    ]);
  });

  it('truncates very long details', () => {
    const store = new FindingStoreService();
    store.add(finding({detail: 'x'.repeat(10_000)}));

    expect(store.all()[0]?.detail.length).toBeLessThan(2_100);
  });
});

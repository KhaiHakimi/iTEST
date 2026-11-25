import {describe, expect, it} from 'vitest';
import {ActionGuardService} from '../src/agent/action-guard.service.js';
import type {PageObservation} from '../src/agent/interfaces/agent.interface.js';
import {UrlAllowlistService} from '../src/shared/url-allowlist.service.js';

const BASE = 'http://127.0.0.1:4173';
const guard = new ActionGuardService(new UrlAllowlistService(BASE), BASE);

const observation: PageObservation = {
  url: `${BASE}/dashboard`,
  title: 'Dashboard',
  text: '',
  rawText: '',
  elements: [
    {ref: 'e1', role: 'link', name: 'Start application', disabled: false},
    {ref: 'e2', role: 'button', name: 'Delete account', disabled: false},
    {ref: 'e3', role: 'textbox', name: 'CGPA', value: '', disabled: false},
    {ref: 'e4', role: 'button', name: 'Send application', disabled: false},
    {ref: 'e5', role: 'button', name: 'Save', disabled: true},
    {
      ref: 'e6',
      role: 'combobox',
      name: 'State',
      options: ['Selangor', 'Johor'],
      disabled: false,
    },
    {ref: 'e7', role: 'button', name: 'Log out', disabled: false},
  ],
};

describe('ActionGuardService', () => {
  it('allows ordinary clicks and fills on listed elements', () => {
    expect(guard.check({type: 'click', ref: 'e1'}, observation, [])).toEqual({
      allowed: true,
    });
    expect(
      guard.check({type: 'fill', ref: 'e3', value: '3.50'}, observation, []),
    ).toEqual({allowed: true});
  });

  it('refuses dangerous buttons unless the goal allows the word', () => {
    expect(
      guard.check({type: 'click', ref: 'e2'}, observation, []),
    ).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('delete'),
    });
    expect(
      guard.check({type: 'click', ref: 'e7'}, observation, []),
    ).toMatchObject({allowed: false});
    expect(
      guard.check({type: 'click', ref: 'e4'}, observation, []),
    ).toMatchObject({allowed: false});
    expect(
      guard.check({type: 'click', ref: 'e4'}, observation, ['send']),
    ).toEqual({allowed: true});
  });

  it('refuses refs that are not on the page, and disabled elements', () => {
    expect(
      guard.check({type: 'click', ref: 'e99'}, observation, []),
    ).toMatchObject({allowed: false});
    expect(
      guard.check({type: 'click', ref: 'e5'}, observation, []),
    ).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('disabled'),
    });
  });

  it('refuses typing into elements that are not text fields', () => {
    expect(
      guard.check({type: 'fill', ref: 'e1', value: 'x'}, observation, []),
    ).toMatchObject({allowed: false});
  });

  it('only selects options that exist', () => {
    expect(
      guard.check({type: 'select', ref: 'e6', value: 'Johor'}, observation, []),
    ).toEqual({allowed: true});
    expect(
      guard.check({type: 'select', ref: 'e6', value: 'Perak'}, observation, []),
    ).toMatchObject({allowed: false});
  });

  it('keeps navigation on the application under test', () => {
    expect(
      guard.check({type: 'navigate', path: '/apply'}, observation, []),
    ).toEqual({allowed: true});
    for (const path of [
      'https://evil.example/collect',
      '//evil.example/collect',
      'javascript:alert(1)',
    ]) {
      expect(
        guard.check({type: 'navigate', path}, observation, []),
      ).toMatchObject({allowed: false});
    }
  });
});

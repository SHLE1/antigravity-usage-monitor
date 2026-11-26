import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_QUOTA_DISPLAY_MODE,
  normalizeFullSettings,
  normalizeQuotaDisplayMode,
} from '../backend/settings-schema.mjs';
import {
  buildExportableSettingsJson,
  parseImportedSettingsJson,
} from '../src/core/settingsBackup.js';
import { createMockDom } from './mock-dom.mjs';

test('quotaDisplayMode defaults to used, normalizes valid/invalid inputs, and round-trips through settings backup', () => {
  assert.equal(DEFAULT_QUOTA_DISPLAY_MODE, 'used');
  assert.equal(normalizeQuotaDisplayMode(undefined), 'used');
  assert.equal(normalizeQuotaDisplayMode('invalid'), 'used');
  assert.equal(normalizeQuotaDisplayMode('remaining'), 'remaining');
  assert.equal(normalizeQuotaDisplayMode(' REMAINING '), 'remaining');

  const def = normalizeFullSettings({});
  assert.equal(def.quotaDisplayMode, 'used');

  const rem = normalizeFullSettings({ quotaDisplayMode: 'remaining' });
  assert.equal(rem.quotaDisplayMode, 'remaining');

  const exportedRem = buildExportableSettingsJson(rem);
  const parsedRem = parseImportedSettingsJson(exportedRem);
  assert.equal(parsedRem.ok, true);
  assert.equal(parsedRem.patch.quotaDisplayMode, 'remaining');

  const exportedUsed = buildExportableSettingsJson(def);
  const parsedUsed = parseImportedSettingsJson(exportedUsed);
  assert.equal(parsedUsed.ok, true);
  assert.equal(parsedUsed.patch.quotaDisplayMode, 'used');
});

test('QuotaPoolsWidget renders remaining percentage, remaining bar fill, and legend in remaining mode (zh-CN & en-US)', async () => {
  const { document } = createMockDom();
  const origDocument = globalThis.document;
  const origWindow = globalThis.window;
  globalThis.document = document;
  globalThis.window = {
    innerWidth: 960,
    innerHeight: 720,
    addEventListener() {},
    removeEventListener() {},
    location: { origin: 'http://127.0.0.1:0', href: 'http://127.0.0.1:0/' },
  };

  try {
    const [{ setI18nLanguage }, { QuotaPoolsWidget }] = await Promise.all([
      import('../src/i18n/index.js'),
      import('../src/components/widgets/QuotaPoolsWidget.js'),
    ]);

    const widget = QuotaPoolsWidget();
    const basePools = [
      {
        poolKey: 'Gemini',
        poolLabel: 'Gemini',
        family: 'Gemini',
        usedPct: 7.6,
        remainingPct: 92.4,
        reservedPct: 1.5,
        reservedLeaseCount: 1,
        resetTime: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
        weeklyUsedPct: 86.0,
        weeklyRemainingPct: 14.0,
        weeklyReservedPct: 0.5,
        weeklyReservedLeaseCount: 1,
        weeklyResetTime: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      },
    ];
    const baseData = {
      account: { tierName: 'Google AI Pro', planName: 'Pro' },
      quotas: { pools: basePools, weekly: { isOfficial: true } },
    };

    // zh-CN remaining mode with reservation OFF
    setI18nLanguage('zh-CN');
    widget.refs.update({
      data: {
        ...baseData,
        settings: { experimentalQuotaReservation: false, quotaDisplayMode: 'remaining' },
      },
      minuteTick: 1,
    });
    const metasZh = widget.el.querySelectorAll('.quota-win-meta');
    assert.equal(metasZh.length, 2);
    assert.match(metasZh[0].textContent, /· 剩余 92\.4%$/);
    assert.match(metasZh[1].textContent, /· 剩余 14\.0%$/);

    const fillsZh = widget.el.querySelectorAll('.progress-fill');
    assert.equal(fillsZh[0].style.getPropertyValue('--fill-w'), '92.4%');
    assert.equal(fillsZh[0].classList.contains('tone-warn'), false);
    assert.equal(fillsZh[0].classList.contains('tone-danger'), false);
    assert.equal(fillsZh[1].style.getPropertyValue('--fill-w'), '14%');
    assert.equal(fillsZh[1].classList.contains('tone-danger'), true);

    // zh-CN remaining mode with reservation ON: legend switches to 剩余 / 预占, reserved bar sits next to remaining
    widget.refs.update({
      data: {
        ...baseData,
        settings: { experimentalQuotaReservation: true, quotaDisplayMode: 'remaining' },
      },
      minuteTick: 1,
    });
    const legendEl = widget.el.querySelector('.quota-reserve-legend');
    assert.equal(legendEl.hidden, false);
    assert.match(legendEl.textContent, /剩余/);
    assert.match(legendEl.textContent, /预占/);
    const rsvBars = widget.el.querySelectorAll('.progress-fill-reserved');
    assert.equal(fillsZh[0].style.getPropertyValue('--fill-w'), '92.4%');
    assert.equal(rsvBars[0].style.getPropertyValue('--reserved-w'), '1.5%');
    assert.equal(rsvBars[0].classList.contains('is-active'), true);

    // en-US remaining mode
    setI18nLanguage('en-US');
    widget.refs.update({
      data: {
        ...baseData,
        settings: { experimentalQuotaReservation: true, quotaDisplayMode: 'remaining' },
      },
      minuteTick: 2,
    });
    const metasEn = widget.el.querySelectorAll('.quota-win-meta');
    assert.match(metasEn[0].textContent, /· 92\.4% left$/);
    assert.match(metasEn[1].textContent, /· 14\.0% left$/);
    assert.match(legendEl.textContent, /Remaining/);
    assert.match(legendEl.textContent, /Reserved/);

    // Switch back to used mode restores original display
    setI18nLanguage('zh-CN');
    widget.refs.update({
      data: {
        ...baseData,
        settings: { experimentalQuotaReservation: false, quotaDisplayMode: 'used' },
      },
      minuteTick: 3,
    });
    assert.match(metasZh[0].textContent, /· 已用 7\.6%$/);
    assert.equal(fillsZh[0].style.getPropertyValue('--fill-w'), '7.6%');

    widget.destroy();
  } finally {
    globalThis.document = origDocument;
    globalThis.window = origWindow;
  }
});

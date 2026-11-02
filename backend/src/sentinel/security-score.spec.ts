import { computeSecurityScore } from './security-score';

describe('computeSecurityScore', () => {
  const ready = (sentinelsWithPhone: number) =>
    computeSecurityScore({
      hasVerifiedPhone: true,
      hasLeadWithPhone: true,
      sentinelsWithPhone,
    });

  it('starts at zero, listing everything missing', () => {
    expect(
      computeSecurityScore({
        hasVerifiedPhone: false,
        hasLeadWithPhone: false,
        sentinelsWithPhone: 0,
      }),
    ).toEqual({
      score: 0,
      level: 'notReady',
      ready: false,
      missing: ['phone', 'lead', 'sentinel'],
    });
  });

  it('adds a third of the minimum per condition', () => {
    expect(
      computeSecurityScore({
        hasVerifiedPhone: true,
        hasLeadWithPhone: false,
        sentinelsWithPhone: 0,
      }).score,
    ).toBe(11);
    expect(
      computeSecurityScore({
        hasVerifiedPhone: true,
        hasLeadWithPhone: true,
        sentinelsWithPhone: 1,
      }),
    ).toEqual({
      score: 22,
      level: 'notReady',
      ready: false,
      missing: ['sentinel'],
    });
  });

  it('counts a Sentinel without a Lead towards the other-Sentinel condition', () => {
    expect(
      computeSecurityScore({
        hasVerifiedPhone: true,
        hasLeadWithPhone: false,
        sentinelsWithPhone: 1,
      }).missing,
    ).toEqual(['lead']);
  });

  it('stays below the minimum without a verified phone, however many Sentinels', () => {
    expect(
      computeSecurityScore({
        hasVerifiedPhone: false,
        hasLeadWithPhone: true,
        sentinelsWithPhone: 15,
      }),
    ).toMatchObject({ score: 22, level: 'notReady', missing: ['phone'] });
  });

  it.each([
    [2, 33, 'minimum'],
    [3, 39, 'fair'],
    [5, 51, 'fair'],
    [6, 57, 'good'],
    [9, 74, 'good'],
    [10, 80, 'great'],
    [19, 98, 'great'],
    [20, 100, 'excellent'],
    [30, 100, 'excellent'],
  ])('%i Sentinels score %i (%s)', (sentinels, score, level) => {
    expect(ready(sentinels)).toEqual({
      score,
      level,
      ready: true,
      missing: [],
    });
  });
});

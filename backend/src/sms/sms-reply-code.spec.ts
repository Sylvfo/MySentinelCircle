import { freeSlot, parseReplyCode, replyCode } from './sms-reply-code';

describe('SMS reply codes', () => {
  it('builds the two-digit code', () => {
    expect(replyCode(2, 1)).toBe('21');
  });

  it('takes the smallest free slot, the last one when all are taken', () => {
    expect(freeSlot([])).toBe(1);
    expect(freeSlot([1, 2, null])).toBe(3);
    expect(freeSlot([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(9);
  });

  it('reads a choice or a free answer after the code', () => {
    expect(parseReplyCode('212')).toEqual({ code: '21', reply: '2' });
    expect(parseReplyCode(' 111 ')).toEqual({ code: '11', reply: '1' });
    expect(parseReplyCode('21 au marché')).toEqual({
      code: '21',
      reply: 'au marché',
    });
  });

  it('leaves everything else to the usual reading', () => {
    for (const text of [
      '1',
      'OUI',
      'STOP',
      '2125',
      '410',
      '201',
      'au marché',
    ]) {
      expect(parseReplyCode(text)).toBeNull();
    }
  });
});

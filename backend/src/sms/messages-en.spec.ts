import { Gender } from '@prisma/client';
import {
  alertQuestionSms,
  otpSms,
  sentinelInvitationSms,
  smsLang,
  stopChoiceSms,
} from './messages';
import { parseAlertReply } from '../alert/alert-replies';

// Every SMS also exists in English, still plain ASCII.
describe('SMS in English', () => {
  const ascii = /^[\x20-\x7E\n]*$/;

  it('reads the stored language, French unless English', () => {
    expect(smsLang('en')).toBe('en');
    expect(smsLang('fr')).toBe('fr');
    expect(smsLang(null)).toBe('fr');
    expect(smsLang(undefined)).toBe('fr');
  });

  it('writes the invitation and the code in English', () => {
    const invitation = sentinelInvitationSms('Lea', 'en');
    expect(invitation).toContain('Lea chose you as a Sentinel');
    expect(invitation).toContain('Reply YES to accept, NO to decline');
    expect(invitation).toMatch(ascii);
    expect(otpSms('123456', 'en')).toContain('sign-in code: 123456');
  });

  it('asks an alert question in English, about her by default', () => {
    const sms = alertQuestionSms('Chloe Martin', 'CAN_VISIT', undefined, 'en');
    expect(sms).toContain('alert Chloe Martin');
    expect(sms).toContain('Can you go and see her?');
    expect(sms).toContain('Or reply: 1 Yes, 2 Later, 3 No');
    expect(sms).toMatch(ascii);
    expect(
      alertQuestionSms(
        'Hugo',
        'SEEMED_OK',
        { firstName: 'Hugo', gender: Gender.MALE },
        'en',
      ),
    ).toContain('Did he seem to be doing well?');
  });

  it('lists the STOP choices with "or"', () => {
    expect(stopChoiceSms(['Lea', 'Hugo'], 'en')).toContain(
      'Reply STOP 1 or STOP 2.',
    );
  });

  it('understands English replies to a question', () => {
    expect(parseAlertReply('later', 'CAN_VISIT')).toBe('LATER');
    expect(parseAlertReply("I don't know", 'SEEMED_OK')).toBe('DONT_KNOW');
    expect(parseAlertReply('This week', 'LAST_NEWS')).toBe('THIS_WEEK');
  });
});

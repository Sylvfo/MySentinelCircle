import { Gender } from '@prisma/client';
import {
  alertQuestionSms,
  otpSms,
  sentinelInvitationSms,
  smsLang,
  stopChoiceSms,
  watchAlertSms,
  watchAlertToOwnerSms,
  watchAllGoodReminderSms,
  watchStepReminderSms,
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

  it('writes the Watch Mode SMS in both languages, plain ASCII', () => {
    const due = { time: '13:00', date: null };
    const alertAt = { time: '15:00', date: '11.11' };
    const fr = watchStepReminderSms('Refuge du Lac', due, alertAt, null, 'fr');
    expect(fr).toContain('etes-vous bien arrive.e a l\'etape "Refuge du Lac"');
    expect(fr).toContain('Sans reponse a 11.11 a 15:00');
    expect(
      watchStepReminderSms('Lac', due, alertAt, Gender.FEMALE, 'fr'),
    ).toContain('bien arrivee');
    const en = watchStepReminderSms('Gîte du Col', due, alertAt, null, 'en');
    expect(en).toContain('have you reached the step "Gite du Col"');
    expect(en).toContain('Without an answer by 11.11 at 15:00');

    const missed = {
      kind: 'STEP' as const,
      place: 'Col',
      due,
      tripName: 'Été',
    };
    const long = 'é'.repeat(400);
    const all = [
      fr,
      en,
      watchAllGoodReminderSms(alertAt, 'fr'),
      watchAllGoodReminderSms(alertAt, 'en'),
      watchAlertSms('Léa Martin', missed, 'Appeler le refuge', 'fr'),
      watchAlertSms('Léa Martin', missed, long, 'en'),
      watchAlertSms('Léa', { kind: 'ALL_GOOD', due }, '', 'fr'),
      watchAlertToOwnerSms('fr'),
      watchAlertToOwnerSms('en'),
    ];
    for (const text of all) expect(text).toMatch(ascii);
    expect(all[4]).toContain('alerte pour Lea Martin');
    expect(all[4]).toContain('Que faire : Appeler le refuge');
    // Long instructions are cut, the rest is in the app.
    expect(all[5]).toContain('...');
    expect(all[6]).not.toContain('Que faire');
  });
});

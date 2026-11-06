import { isProduction, maskEmail, maskPhone } from './log-redact';

describe('log-redact', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = env;
  });

  it('masks the middle of a phone number', () => {
    expect(maskPhone('+41791234567')).toBe('+41•••••67');
  });

  it('fully masks a very short phone value', () => {
    expect(maskPhone('123')).toBe('•••');
  });

  it('keeps only the first letter and the domain of an email', () => {
    expect(maskEmail('sylvie@example.ch')).toBe('s•••@example.ch');
  });

  it('fully masks something that is not an email', () => {
    expect(maskEmail('nope')).toBe('•••');
  });

  it('detects production from NODE_ENV', () => {
    process.env.NODE_ENV = 'production';
    expect(isProduction()).toBe(true);
    process.env.NODE_ENV = 'development';
    expect(isProduction()).toBe(false);
  });
});

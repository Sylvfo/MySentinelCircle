import { ipPrefix } from './login-log.service';

describe('ipPrefix', () => {
  it('keeps the network of an IPv4 address, not the device', () => {
    expect(ipPrefix('203.0.113.42')).toBe('203.0.113.x');
    expect(ipPrefix('::ffff:203.0.113.42')).toBe('203.0.113.x');
  });

  it('keeps the first three blocks of an IPv6 address', () => {
    expect(ipPrefix('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe(
      '2001:db8:85a3::/48',
    );
  });

  it('says local for this machine, nothing when unknown', () => {
    expect(ipPrefix('::1')).toBe('local');
    expect(ipPrefix(undefined)).toBeNull();
    expect(ipPrefix('not-an-ip')).toBeNull();
  });
});

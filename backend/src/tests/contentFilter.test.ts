import { describe, expect, it } from '@jest/globals';
import { detectContactSharing } from '@yourapp/content-filter';

describe('Content Filter — Detection', () => {

  describe('Phone numbers', () => {
    it('detects 11-digit Nigerian number: 08123456789', () => {
      const res = detectContactSharing('My number is 08123456789');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('phone');
    });

    it('detects number with spaces: 0812 345 6789', () => {
      const res = detectContactSharing('Call me on 0812 345 6789');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('phone');
    });

    it('detects number with dashes: 0812-345-6789', () => {
      const res = detectContactSharing('My number 0812-345-6789 is ready');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('phone');
    });

    it('detects number with country code: +2348123456789', () => {
      const res = detectContactSharing('Add +2348123456789');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('phone');
    });

    it('does NOT flag a price like 1000', () => {
      const res = detectContactSharing('It costs 1000');
      expect(res.detected).toBe(false);
    });

    it('does NOT flag a credit amount like 500', () => {
      const res = detectContactSharing('Please send 500 credits');
      expect(res.detected).toBe(false);
    });
  });

  describe('WhatsApp detection', () => {
    it('detects: whatsapp', () => {
      const res = detectContactSharing('let is talk on whatsapp');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: WhatsApp', () => {
      const res = detectContactSharing('add me on WhatsApp');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: wh4tsapp', () => {
      const res = detectContactSharing('my wh4tsapp is...');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: w h a t s a p p (spaced)', () => {
      const res = detectContactSharing('hmu on w h a t s a p p');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: w.h.a.t.s.a.p.p (dotted)', () => {
      const res = detectContactSharing('w.h.a.t.s.a.p.p');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: watsup', () => {
      const res = detectContactSharing('my watsup');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: w-h-a-t-s-a-p-p (dashed)', () => {
      const res = detectContactSharing('w-h-a-t-s-a-p-p');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: whats app', () => {
      const res = detectContactSharing('whats app please');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: hit me on wa', () => {
      const res = detectContactSharing('hit me on wa');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });
  });

  describe('Snapchat detection', () => {
    it('detects: snapchat', () => {
      const res = detectContactSharing('snapchat username');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: snap me', () => {
      const res = detectContactSharing('snap me now');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: my snap', () => {
      const res = detectContactSharing('my snap is sweet');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: sn4pchat', () => {
      const res = detectContactSharing('add sn4pchat');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: s.n.a.p.c.h.a.t', () => {
      const res = detectContactSharing('s.n.a.p.c.h.a.t');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });
  });

  describe('Instagram detection', () => {
    it('detects: instagram', () => {
      const res = detectContactSharing('on instagram');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: insta', () => {
      const res = detectContactSharing('check insta');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: @username', () => {
      const res = detectContactSharing('follow me @cute_girl');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: follow me on ig', () => {
      const res = detectContactSharing('follow me on ig');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: dm me on instagram', () => {
      const res = detectContactSharing('dm me on instagram');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });
  });

  describe('Telegram detection', () => {
    it('detects: telegram', () => {
      const res = detectContactSharing('my telegram link');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: t.e.l.e.g.r.a.m', () => {
      const res = detectContactSharing('my t.e.l.e.g.r.a.m');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: t3l3gram', () => {
      const res = detectContactSharing('my t3l3gram is hot');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });

    it('detects: telg', () => {
      const res = detectContactSharing('my telg');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('platform');
    });
  });

  describe('Email detection', () => {
    it('detects: user@gmail.com', () => {
      const res = detectContactSharing('email is user@gmail.com');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('email');
    });

    it('detects: user [at] gmail.com (bracket bypass)', () => {
      const res = detectContactSharing('my email: user [at] gmail.com');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('email');
    });

    it('detects: user (at) gmail.com (paren bypass)', () => {
      const res = detectContactSharing('user (at) gmail.com');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('email');
    });

    it('detects: user@domain dot com', () => {
      const res = detectContactSharing('user@domain dot com');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('email');
    });
  });

  describe('Off-platform phrases', () => {
    it('detects: reach me outside', () => {
      const res = detectContactSharing('reach me outside');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('offplatform');
    });

    it('detects: contact me off this app', () => {
      const res = detectContactSharing('contact me off this app');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('offplatform');
    });

    it('detects: let\'s chat outside', () => {
      const res = detectContactSharing("let's chat outside");
      expect(res.detected).toBe(true);
      expect(res.category).toBe('offplatform');
    });

    it('detects: text me', () => {
      const res = detectContactSharing('text me');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('offplatform');
    });

    it('detects: my number is', () => {
      const res = detectContactSharing('my number is');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('offplatform');
    });

    it('detects: hit me up', () => {
      const res = detectContactSharing('hit me up');
      expect(res.detected).toBe(true);
      expect(res.category).toBe('offplatform');
    });
  });

  describe('Safe messages — no false positives', () => {
    it('does NOT flag: Hey! How are you?', () => {
      const res = detectContactSharing('Hey! How are you?');
      expect(res.detected).toBe(false);
    });

    it('does NOT flag: I charge 100 credits per session', () => {
      const res = detectContactSharing('I charge 100 credits per session');
      expect(res.detected).toBe(false);
    });

    it('does NOT flag: Sounds good to me', () => {
      const res = detectContactSharing('Sounds good to me');
      expect(res.detected).toBe(false);
    });

    it('does NOT flag: Let\'s meet in the hookup section', () => {
      const res = detectContactSharing("Let's meet in the hookup section");
      expect(res.detected).toBe(false);
    });

    it('does NOT flag: I\'m online now', () => {
      const res = detectContactSharing("I'm online now");
      expect(res.detected).toBe(false);
    });

    it('does NOT flag: 500 diamonds', () => {
      const res = detectContactSharing('500 diamonds');
      expect(res.detected).toBe(false);
    });

    it('does NOT flag: Address of my thoughts: I like you', () => {
      const res = detectContactSharing('Address of my thoughts: I like you');
      expect(res.detected).toBe(false);
    });
  });
});

import { describe, expect, it } from '@jest/globals';
import { JUNIT_LONG_NAME, NESTED_XML, PYTEST_XML } from '../../../test/unit/fixtures.js';
import { decodeBuffer, decodeXmlEntities, parseJunitXml } from './junit-parse.js';

function badXmlOf(xml: string | Buffer): { code?: string; message: string } {
  try {
    parseJunitXml(xml);
  } catch (e) {
    return e as { code?: string; message: string };
  }
  throw new Error('should throw');
}

describe('JUnit parser', () => {
  it('reads pytest output: outcomes, messages, times, properties and suite names', () => {
    const tests = parseJunitXml(PYTEST_XML);
    expect(tests).toHaveLength(6);
    expect(tests.map((t) => t.outcome)).toEqual(['ok', 'ng', 'skipped', 'ok', 'ok', 'ng']);
    expect(tests[1]!.message).toBe(
      'AssertionError: expected 0x01\ntests/test_modbus.py:12: in test_read\n    assert value == 1\nE   assert 0 == 1',
    );
    expect(tests[2]!.message).toBe('requires hardware');
    expect(tests[5]!.message).toBe(
      'ConnectionError\nTraceback (most recent call last): <socket> refused',
    );
    expect(tests[5]!.properties).toEqual({ tmt_id: 'adp_006' });
    expect(tests[0]).toMatchObject({
      timeSec: 0.5,
      suiteName: 'pytest',
      classname: 'tests.test_auth',
    });
  });

  it('flattens nested suites and keeps the innermost suite name', () => {
    const tests = parseJunitXml(NESTED_XML);
    expect(tests.map((t) => [t.name.slice(0, 12), t.suiteName])).toEqual([
      ['shows error ', 'Login screen'],
      ['remembers us', 'Login screen'],
      ['opens', 'Mobile App'],
      ['opens', 'Mobile App'],
      [JUNIT_LONG_NAME.slice(0, 12), 'Mobile App'],
      ['no suite nam', ''],
    ]);
  });

  it('decodes BOMs and keeps CDATA raw (failure bodies capped at 2 000 chars)', () => {
    const body = 'y'.repeat(3000);
    const xml = `<testsuite name="s"><testcase name="t"><failure message="m"><![CDATA[${body}&amp;]]></failure></testcase></testsuite>`;
    const [t] = parseJunitXml(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(xml)]));
    expect(t!.message).toBe(`m\n${'y'.repeat(2000)}`);
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]);
    expect(parseJunitXml(utf16)).toHaveLength(1);
  });

  it('rejects DOCTYPE/entities, malformed XML, files without tests and too many tests', () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]><testsuite><testcase name="&lol2;"/></testsuite>`;
    const cases: [string, RegExp][] = [
      [bomb, /DOCTYPE/],
      ['<testsuite><testcase name="a"></testsuite>', /not valid XML/],
      ['<testsuite name="x"></testsuite>', /no <testcase>/],
      ['   ', /empty/],
      [
        `<testsuites><testsuite>${'<testcase name="t"/>'.repeat(20_001)}</testsuite></testsuites>`,
        /limit is 20000/,
      ],
    ];
    for (const [xml, message] of cases) {
      const e = badXmlOf(xml);
      expect(e.code).toBe('BAD_XML');
      expect(e.message).toMatch(message);
    }
    // Exactly the limit is fine.
    expect(
      parseJunitXml(`<testsuite>${'<testcase name="t"/>'.repeat(20_000)}</testsuite>`),
    ).toHaveLength(20_000);
  });

  it('reads errors, skipped bodies, class attributes and odd times', () => {
    const [a, b, c] = parseJunitXml(
      `<testsuites name="root"><testcase class="pkg.T" name=" spaced " time="1,5"><skipped>  later  </skipped></testcase>` +
        `<testcase name="e" time="-1"><error/></testcase><testcase name="t" time="1,234.5"/></testsuites>`,
    );
    expect(a).toMatchObject({
      name: 'spaced',
      classname: 'pkg.T',
      outcome: 'skipped',
      message: 'later',
      timeSec: 1.5,
      suiteName: 'root',
    });
    expect(b).toMatchObject({ outcome: 'ng', message: null, timeSec: null });
    expect(c!.timeSec).toBe(1234.5);
  });

  it('decodes only predefined entities and valid character references', () => {
    expect(decodeXmlEntities('a &lt;b&gt; &amp; &quot;c&quot; &apos;d&apos;')).toBe(
      `a <b> & "c" 'd'`,
    );
    expect(decodeXmlEntities('&#65;&#x42;&#xD800;&#0;&nbsp;')).toBe('AB&#xD800;&#0;&nbsp;');
    expect(decodeXmlEntities('plain')).toBe('plain');
    expect(decodeBuffer('﻿<a/>')).toBe('<a/>');
    expect(
      decodeBuffer(
        Buffer.concat([
          Buffer.from([0xfe, 0xff]),
          Buffer.from([0, 0x3c, 0, 0x61, 0, 0x2f, 0, 0x3e]),
        ]),
      ),
    ).toBe('<a/>');
  });
});

/**
 * JUnit XML parsing (ADR-010). Accepts `<testsuites>` or `<testsuite>` roots with nested suites
 * (flattened). DOCTYPE/ENTITY declarations are refused and entities are never expanded
 * (`processEntities: false`); only the five predefined XML entities and character references are
 * decoded here.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { unprocessable, type AppException } from '../../common/errors/app.exception.js';

export const MAX_JUNIT_TESTS = 20_000;
/** Characters of a failure body copied into the actual result. */
export const FAILURE_BODY_CHARS = 2000;

export type JunitOutcome = 'ok' | 'ng' | 'skipped';

export interface JunitTest {
  name: string;
  classname: string | null;
  /** Name of the nearest enclosing `<testsuite>` ('' when unnamed). */
  suiteName: string;
  outcome: JunitOutcome;
  /** Failure/error: message + first 2 000 chars of the body; skipped: its message. */
  message: string | null;
  /** `time` in seconds, when present. */
  timeSec: number | null;
  /** `<properties>` of the test case, names lower-cased. */
  properties: Record<string, string>;
}

export function badXml(message: string, details?: unknown): AppException {
  return unprocessable('BAD_XML', message, details);
}

const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

/** Decodes the predefined XML entities and numeric character references (nothing else). */
export function decodeXmlEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,4});/g, (whole, ref: string) => {
    if (ref.startsWith('#')) {
      const hex = ref[1] === 'x' || ref[1] === 'X';
      const code = parseInt(ref.slice(hex ? 2 : 1), hex ? 16 : 10);
      const valid = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[ref] ?? whole;
  });
}

/** Text of an upload: UTF-8 (BOM stripped) or UTF-16 with a byte order mark. */
export function decodeBuffer(input: Buffer | string): string {
  if (typeof input === 'string') return input.replace(/^﻿/, '');
  if (input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) {
    return input.subarray(3).toString('utf8');
  }
  if (input[0] === 0xff && input[1] === 0xfe) return new TextDecoder('utf-16le').decode(input);
  if (input[0] === 0xfe && input[1] === 0xff) return new TextDecoder('utf-16be').decode(input);
  return input.toString('utf8');
}

/**
 * Element of fast-xml-parser's `preserveOrder` output: `{ [tag]: children, ':@'?: attributes }`;
 * text nodes are `{ '#text': string }` and CDATA sections `{ '#cdata': [{ '#text': string }] }`.
 */
type OrderedNode = Record<string, unknown>;

function isNode(v: unknown): v is OrderedNode {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function tagOf(node: OrderedNode): string | null {
  for (const key of Object.keys(node)) if (key !== ':@') return key;
  return null;
}

function childrenOf(node: OrderedNode): OrderedNode[] {
  const tag = tagOf(node);
  const value = tag ? node[tag] : undefined;
  return Array.isArray(value) ? value.filter(isNode) : [];
}

function childElements(node: OrderedNode, ...tags: string[]): OrderedNode[] {
  return childrenOf(node).filter((c) => tags.includes(tagOf(c) ?? ''));
}

function attr(node: OrderedNode, name: string): string | null {
  const attrs = node[':@'];
  if (!isNode(attrs)) return null;
  const v = attrs[`@_${name}`];
  if (v === undefined || v === null || v === true) return null;
  return decodeXmlEntities(String(v));
}

/** Text content of an element: decoded text plus raw CDATA sections, in document order. */
function textOf(node: OrderedNode): string {
  let out = '';
  for (const child of childrenOf(node)) {
    const tag = tagOf(child);
    if (tag === '#text') out += decodeXmlEntities(String(child['#text'] ?? ''));
    else if (tag === '#cdata') {
      for (const part of childrenOf(child)) out += String(part['#text'] ?? '');
    }
  }
  return out;
}

function parseTime(raw: string | null): number | null {
  if (raw === null) return null;
  const s = raw.trim();
  const n = Number(s.includes('.') ? s.replace(/,/g, '') : s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function failureText(el: OrderedNode): string | null {
  const message = (attr(el, 'message') ?? '').trim();
  const body = textOf(el).trim().slice(0, FAILURE_BODY_CHARS);
  const parts = [message, body].filter((p) => p !== '');
  return parts.length ? parts.join('\n') : null;
}

function propertiesOf(tc: OrderedNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const group of childElements(tc, 'properties')) {
    for (const p of childElements(group, 'property')) {
      const name = attr(p, 'name')?.trim().toLowerCase();
      if (!name) continue;
      out[name] = (attr(p, 'value') ?? textOf(p)).trim();
    }
  }
  return out;
}

function toTest(tc: OrderedNode, suiteName: string): JunitTest {
  const failures = childElements(tc, 'failure', 'error');
  const skipped = childElements(tc, 'skipped');
  let outcome: JunitOutcome = 'ok';
  let message: string | null = null;
  if (failures.length > 0) {
    outcome = 'ng';
    message = failureText(failures[0]!);
  } else if (skipped.length > 0) {
    outcome = 'skipped';
    const s = skipped[0]!;
    message = (attr(s, 'message') ?? textOf(s)).trim() || null;
  }
  return {
    name: (attr(tc, 'name') ?? '').trim(),
    classname: attr(tc, 'classname')?.trim() || attr(tc, 'class')?.trim() || null,
    suiteName,
    outcome,
    message,
    timeSec: parseTime(attr(tc, 'time')),
    properties: propertiesOf(tc),
  };
}

/** Collects the test cases below `nodes` in document order; nested suites are flattened. */
function collect(nodes: OrderedNode[], suiteName: string, out: JunitTest[]): void {
  for (const node of nodes) {
    const tag = tagOf(node);
    if (tag === 'testcase') {
      out.push(toTest(node, suiteName));
    } else if (tag === 'testsuite') {
      collect(childrenOf(node), attr(node, 'name')?.trim() || suiteName, out);
    } else if (tag === 'testsuites') {
      collect(childrenOf(node), suiteName || attr(node, 'name')?.trim() || '', out);
    }
  }
}

/**
 * Parses a JUnit XML document. Throws 422 BAD_XML when the file is not well-formed, declares a
 * DOCTYPE or entities, has no `<testcase>` or more than 20 000 of them.
 */
export function parseJunitXml(input: Buffer | string): JunitTest[] {
  const xml = decodeBuffer(input);
  if (xml.trim() === '') throw badXml('The file is empty');
  // Markup outside CDATA sections and comments (failure output may legitimately contain "<!DOCTYPE").
  const markup = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  if (/<!DOCTYPE/i.test(markup) || /<!ENTITY/i.test(markup)) {
    throw badXml('DOCTYPE and entity declarations are not allowed in JUnit files');
  }
  const declared = markup.match(/<testcase[\s/>]/g)?.length ?? 0;
  if (declared > MAX_JUNIT_TESTS) {
    throw badXml(`The file has ${declared} test cases — the limit is ${MAX_JUNIT_TESTS}`, {
      tests: declared,
      max: MAX_JUNIT_TESTS,
    });
  }
  const valid = XMLValidator.validate(xml, { allowBooleanAttributes: true });
  if (valid !== true) {
    throw badXml(`The file is not valid XML (line ${valid.err.line}): ${valid.err.msg}`, {
      line: valid.err.line,
      column: valid.err.col,
    });
  }
  let doc: unknown;
  try {
    doc = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: false,
      processEntities: false,
      htmlEntities: false,
      ignoreDeclaration: true,
      ignorePiTags: true,
      cdataPropName: '#cdata',
      preserveOrder: true,
      stopNodes: ['*.system-out', '*.system-err'],
    }).parse(xml);
  } catch (e) {
    throw badXml(`The file could not be parsed: ${(e as Error).message}`);
  }
  const tests: JunitTest[] = [];
  if (Array.isArray(doc)) collect(doc.filter(isNode), '', tests);
  if (tests.length === 0) throw badXml('The file has no <testcase> elements');
  if (tests.length > MAX_JUNIT_TESTS) {
    throw badXml(`The file has ${tests.length} test cases — the limit is ${MAX_JUNIT_TESTS}`);
  }
  return tests;
}

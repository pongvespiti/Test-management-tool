/**
 * Notification texts as message keys + values, written in English and Thai. The API stores the
 * key and values with each notification (and the English text as its title and body), and the
 * web app shows them in the reader's language. A value can itself be a message (`what` below).
 */

export type MessageLocale = 'en' | 'th';

export interface Message {
  key: MessageKey;
  vars?: Record<string, string | number | Message>;
}

/** Title and optional body of a notification. */
export interface NotificationMessage {
  title: Message;
  body?: Message | null;
}

const T = <K extends string>(t: Record<K, { en: string; th: string }>) => t;

export const MESSAGES = T({
  run_assigned: {
    en: 'Run {code} · {suite} was given to you',
    th: 'คุณได้รับมอบหมายรอบ {code} · {suite}',
  },
  run_assigned_plain: { en: 'Run {code} was given to you', th: 'คุณได้รับมอบหมายรอบ {code}' },
  runs_handed_one: {
    en: '1 run handed to you in {release}',
    th: 'คุณได้รับมอบหมาย 1 รอบใน {release}',
  },
  runs_handed_many: {
    en: '{n} runs handed to you in {release}',
    th: 'คุณได้รับมอบหมาย {n} รอบใน {release}',
  },
  run_due_soon: { en: '{code} · {suite} is due soon', th: '{code} · {suite} ใกล้ถึงกำหนดส่ง' },
  run_overdue: { en: '{code} · {suite} is overdue', th: '{code} · {suite} เลยกำหนดส่งแล้ว' },
  run_due_body: { en: '{docNo}, due {due}', th: '{docNo} กำหนดส่ง {due}' },
  defect_retest: {
    en: '{key} is resolved — ready for retest',
    th: '{key} แก้ไขแล้ว พร้อมให้ทดสอบซ้ำ',
  },
  requirement_changed: {
    en: '{key} changed — check its cases',
    th: '{key} มีการเปลี่ยนแปลง ตรวจเคสที่เกี่ยวข้อง',
  },
  requirement_cases_one: { en: '1 case tests it', th: 'มี 1 เคสที่ทดสอบข้อนี้' },
  requirement_cases_many: { en: '{n} cases test it', th: 'มี {n} เคสที่ทดสอบข้อนี้' },
  stand_what_install: { en: 'Install {model} at {code}', th: 'ติดตั้ง {model} ที่ {code}' },
  stand_what_replace: { en: 'Replace {model} at {code}', th: 'เปลี่ยนเป็นรุ่น {model} ที่ {code}' },
  stand_what_uninstall: { en: 'Uninstall at {code}', th: 'ถอดแอร์ที่ {code}' },
  stand_request: { en: '{actor}: {what} on {date}', th: '{actor} ขอ: {what} วันที่ {date}' },
  stand_accepted: {
    en: '{what} accepted for {date} by {actor}',
    th: '{actor} รับงาน {what} วันที่ {date}',
  },
  stand_rejected: { en: '{what} rejected by {actor}', th: '{actor} ปฏิเสธงาน {what}' },
  stand_done: { en: '{what} done by {actor}', th: '{actor} ทำงาน {what} เสร็จแล้ว' },
  stand_cancelled: { en: '{what} cancelled by {actor}', th: '{actor} ยกเลิกคำขอ {what}' },
  text: { en: '{text}', th: '{text}' },
});

export type MessageKey = keyof typeof MESSAGES;

/** The message in `locale`; unknown keys fall back to an empty string. */
export function renderMessage(m: Message, locale: MessageLocale = 'en'): string {
  const template = MESSAGES[m.key]?.[locale] ?? MESSAGES[m.key]?.en ?? '';
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = m.vars?.[name];
    if (v === undefined || v === null) return whole;
    return typeof v === 'object' ? renderMessage(v, locale) : String(v);
  });
}

/** A plain text (user-written body such as a defect title) as a message. */
export const textMessage = (text: string): Message => ({ key: 'text', vars: { text } });

import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { th } from 'date-fns/locale/th';
import { useCallback, useMemo } from 'react';
import { confirmAction } from '@/components/common/confirm-host';
import { formatDate, formatRelative } from '@/lib/format';
import { useLocale, type Locale } from '@/lib/i18n';

/**
 * Thai wording of the Test stands page (English is the source text). Technicians work only on
 * this page, so all of it is translated, not only the title. `{name}` marks a value filled in.
 */
export const STANDS_TH: Readonly<Record<string, string>> = {
  // page
  Lab: 'ห้องแล็บ',
  'Test stands': 'สแตนด์ทดสอบ',
  'Which AC model is on which stand, who has a stand booked, and install / uninstall requests to technicians':
    'แอร์รุ่นไหนติดอยู่ stand ไหน ใครจอง stand ไว้ และคำขอให้ช่างติดตั้ง / ถอดแอร์',
  'Book a stand': 'จอง stand',
  'Request technician': 'ขอช่าง',
  'New zone': 'เพิ่มโซน',
  View: 'มุมมอง',
  Stands: 'Stand',
  Bookings: 'การจอง',
  Requests: 'คำขอช่าง',
  Import: 'นำเข้า',
  'Find a model': 'ค้นหารุ่น',
  'Find a model, e.g. ACU-35': 'ค้นหารุ่น เช่น ACU-35',
  Language: 'ภาษา',

  // board
  'No stand has {model}': 'ไม่มี stand ที่มี {model}',
  'No test stands yet': 'ยังไม่มี stand',
  'Not installed and not booked anywhere. Try part of the model name.':
    'ไม่ได้ติดตั้งและไม่มีการจองที่ไหนเลย ลองพิมพ์ชื่อรุ่นเพียงบางส่วน',
  'Add the zones and stands of the lab, or import the stand sheet (Import tab).':
    'เพิ่มโซนและ stand ของแล็บ หรือนำเข้าชีต Stand (แท็บนำเข้า)',
  'A technician or an administrator adds the stands of the lab.':
    'ช่างหรือผู้ดูแลระบบเป็นผู้เพิ่ม stand ของแล็บ',
  '{n} stand': '{n} stand',
  '{n} stands': '{n} stand',
  Stand: 'Stand',
  'Rename {name}': 'เปลี่ยนชื่อ {name}',
  'Delete {name}': 'ลบ {name}',
  'zone {name}': 'โซน {name}',
  '{name} deleted.': 'ลบ {name} แล้ว',
  'Could not delete the zone': 'ลบโซนไม่ได้',
  'No stands in this zone yet.': 'โซนนี้ยังไม่มี stand',
  'Stand {code}: {model}': 'Stand {code}: {model}',
  empty: 'ว่าง',
  Empty: 'ว่าง',
  'Open technician requests': 'คำขอช่างที่ยังเปิดอยู่',
  'In charge: {name}': 'ผู้รับผิดชอบ: {name}',
  '{model} until {date}': '{model} ถึง {date}',
  '{project} from {date}': '{project} ตั้งแต่ {date}',
  Free: 'ว่าง ไม่มีการจอง',

  // timeline
  'Earlier weeks': 'สัปดาห์ก่อนหน้า',
  'This week': 'สัปดาห์นี้',
  'Later weeks': 'สัปดาห์ถัดไป',
  '{code} booked by {project} for {model}, {from} to {to}':
    '{code} จองโดย {project} ทดสอบ {model} {from} ถึง {to}',

  // requests
  Install: 'ติดตั้ง',
  Uninstall: 'ถอด',
  Replace: 'เปลี่ยนรุ่น',
  Requested: 'รอช่างรับ',
  Accepted: 'ช่างรับแล้ว',
  Rejected: 'ปฏิเสธ',
  Done: 'เสร็จแล้ว',
  Cancelled: 'ยกเลิก',
  'Request filters': 'ตัวกรองคำขอ',
  'Whose requests': 'คำขอของใคร',
  'Sent to me': 'ส่งถึงฉัน',
  Mine: 'ของฉัน',
  Everyone: 'ทุกคน',
  'Request status': 'สถานะคำขอ',
  Open: 'ยังไม่เสร็จ',
  All: 'ทั้งหมด',
  'No open requests': 'ไม่มีคำขอที่ค้างอยู่',
  'No requests': 'ไม่มีคำขอ',
  'Requests to install or uninstall units on stands show up here, with a notification.':
    'คำขอให้ติดตั้งหรือถอดแอร์บน stand จะแสดงที่นี่ พร้อมแจ้งเตือนที่กระดิ่ง',
  'Ask a technician to install, uninstall or replace a unit from a stand card or the button above.':
    'ขอช่างติดตั้ง ถอด หรือเปลี่ยนรุ่นแอร์ได้จากการ์ด stand หรือปุ่มด้านบน',
  'Stand requests': 'คำขอช่าง',
  'at {code} · {zone}': 'ที่ {code} · {zone}',
  'On {date}': 'วันที่ {date}',
  '(asked for {date})': '(ขอไว้วันที่ {date})',
  'Asked for {date}': 'ขอวันที่ {date}',
  'Technician:': 'ช่าง:',
  'Updated {when}': 'อัปเดต {when}',
  Accept: 'รับงาน',
  Reject: 'ปฏิเสธ',
  'Cancel request': 'ยกเลิกคำขอ',
  'Request cancelled.': 'ยกเลิกคำขอแล้ว',
  'Could not cancel the request': 'ยกเลิกคำขอไม่ได้',
  'Accept request': 'รับงาน',
  'Reject request': 'ปฏิเสธคำขอ',
  'Mark as done': 'ปิดงานว่าเสร็จแล้ว',
  'Request accepted.': 'รับงานแล้ว',
  'Request rejected.': 'ปฏิเสธคำขอแล้ว',
  'Done — the stand is updated.': 'เสร็จแล้ว ข้อมูล stand อัปเดตแล้ว',
  'Say why, so the requester can plan again': 'ใส่เหตุผล เพื่อให้ผู้ขอวางแผนใหม่ได้',
  'Could not update the request': 'อัปเดตคำขอไม่ได้',
  '{what} at {code}, asked by {name} for {date}.': '{what} ที่ {code} ขอโดย {name} วันที่ {date}',
  ' The stand will show as empty.': ' stand จะแสดงว่าว่าง',
  ' The stand will show {model}.': ' stand จะแสดงรุ่น {model}',
  'Day you will do it': 'วันที่จะทำ',
  Reason: 'เหตุผล',
  'Note (optional)': 'หมายเหตุ (ไม่บังคับ)',
  Cancel: 'ยกเลิก',

  // detail
  'In charge: {name}. ': 'ผู้รับผิดชอบ: {name} ',
  'Updated by {name} {when}.': 'อัปเดตโดย {name} {when}',
  Book: 'จอง',
  'Update stand': 'แก้ข้อมูล stand',
  Delete: 'ลบ',
  'stand {code} with its bookings and requests': 'stand {code} พร้อมการจองและคำขอทั้งหมด',
  '{code} deleted.': 'ลบ {code} แล้ว',
  'Could not delete the stand': 'ลบ stand ไม่ได้',
  'Bookings from today': 'การจองตั้งแต่วันนี้',
  'Free — no bookings.': 'ว่าง ไม่มีการจอง',
  Change: 'แก้ไข',
  'Cancel booking': 'ยกเลิกการจอง',
  'booking of {project}': 'การจองของ {project}',
  'Booking cancelled.': 'ยกเลิกการจองแล้ว',
  'Could not cancel the booking': 'ยกเลิกการจองไม่ได้',
  'Technician requests': 'คำขอช่าง',

  // forms
  'Choose …': 'เลือก …',
  'Zone renamed.': 'เปลี่ยนชื่อโซนแล้ว',
  'Zone {name} added.': 'เพิ่มโซน {name} แล้ว',
  'Another zone has this name': 'มีโซนชื่อนี้แล้ว',
  'Could not save the zone': 'บันทึกโซนไม่ได้',
  'An area of the lab with test stands.': 'พื้นที่หนึ่งของแล็บที่มี stand ทดสอบ',
  Save: 'บันทึก',
  'Add zone': 'เพิ่มโซน',
  Name: 'ชื่อ',
  'New stand': 'เพิ่ม stand',
  'Edit {code}': 'แก้ไข {code}',
  'Keep the model installed up to date so testers can find it.':
    'อัปเดตรุ่นที่ติดอยู่ให้ตรงของจริง เพื่อให้คนทดสอบค้นหาเจอ',
  'Add stand': 'เพิ่ม stand',
  '{code} saved.': 'บันทึก {code} แล้ว',
  'Stand {code} added.': 'เพิ่ม stand {code} แล้ว',
  'Another stand has this code': 'มี stand รหัสนี้แล้ว',
  'Could not save the stand': 'บันทึก stand ไม่ได้',
  'Stand code': 'รหัส stand',
  Zone: 'โซน',
  'Model installed': 'รุ่นที่ติดอยู่',
  'In charge': 'ผู้รับผิดชอบ',
  Note: 'หมายเหตุ',
  'Booking of {code}': 'การจอง {code}',
  "Reserve a stand for your project's tests. Days that overlap another booking are refused.":
    'จอง stand ให้งานทดสอบของโปรเจกต์ ระบบไม่ให้จองวันที่ชนกับการจองอื่น',
  'Booking saved.': 'บันทึกการจองแล้ว',
  'Stand booked.': 'จอง stand แล้ว',
  'Could not save the booking': 'บันทึกการจองไม่ได้',
  Project: 'โปรเจกต์',
  'Choose the stand and the project': 'เลือก stand และโปรเจกต์',
  'Model to test': 'รุ่นที่จะทดสอบ',
  From: 'ตั้งแต่',
  'To (included)': 'ถึง (รวมวันนี้)',
  '{code} ({model})': '{code} ({model})',
  '{code} (empty)': '{code} (ว่าง)',
  'Request a technician': 'ขอช่าง',
  'The technician gets a notification, then accepts (maybe on another day) or rejects. You are notified at each step.':
    'ช่างจะได้แจ้งเตือน แล้วรับงาน (อาจเลือกวันอื่น) หรือปฏิเสธ คุณจะได้แจ้งเตือนทุกขั้น',
  'Send request': 'ส่งคำขอ',
  'Request sent to {name}.': 'ส่งคำขอถึง {name} แล้ว',
  'Could not send the request': 'ส่งคำขอไม่ได้',
  Work: 'งาน',
  Technician: 'ช่าง',
  'No technicians yet': 'ยังไม่มีบัญชีช่าง',
  'Choose the stand and the technician': 'เลือก stand และช่าง',
  'Model to install': 'รุ่นที่จะติดตั้ง',
  'Enter the model to install': 'ใส่รุ่นที่จะติดตั้ง',
  Day: 'วันที่',
  'Project (optional)': 'โปรเจกต์ (ไม่บังคับ)',
  'No project': 'ไม่ระบุโปรเจกต์',
  'Note for the technician': 'หมายเหตุถึงช่าง',

  // import
  New: 'ใหม่',
  Changed: 'เปลี่ยน',
  Same: 'เหมือนเดิม',
  'Stand sheet (.xlsx)': 'ชีต Stand (.xlsx)',
  'The sheet named “Stand” (or the first sheet): each block has Stand No., Model Name and In charge in its first column and the stands to the right, under a “Zone …” heading. Request, Replace and Target are kept as the stand’s note. Stands are matched by code.':
    'ชีตชื่อ “Stand” (หรือชีตแรก): แต่ละบล็อกมี Stand No., Model Name และ In charge ในคอลัมน์แรก และ stand อยู่ทางขวา ใต้หัวข้อ “Zone …” ค่า Request, Replace และ Target เก็บเป็นหมายเหตุของ stand จับคู่ stand ด้วยรหัส',
  'Could not read the file': 'อ่านไฟล์ไม่ได้',
  'Stand sheet imported: {created} new, {updated} changed{zones}.':
    'นำเข้าชีต Stand แล้ว: ใหม่ {created} เปลี่ยน {updated}{zones}',
  ', {n} new zones': ' โซนใหม่ {n}',
  'Could not import the stand sheet': 'นำเข้าชีต Stand ไม่ได้',
  '{n} stands read: ': 'อ่านได้ {n} stand: ',
  '{n} new': 'ใหม่ {n}',
  '{n} changed': 'เปลี่ยน {n}',
  '{n} the same': 'เหมือนเดิม {n}',
  'Nothing to change': 'ไม่มีอะไรต้องเปลี่ยน',
  'Apply {n} changes': 'บันทึก {n} รายการ',
  Discard: 'ทิ้ง',
  Model: 'รุ่น',
  '{code} is booked for {project} from {from} to {to}':
    '{code} มีการจองของ {project} ตั้งแต่ {from} ถึง {to}',
  Required: 'จำเป็นต้องกรอก',
  'Enter a valid date': 'ใส่วันที่ให้ถูกต้อง',
  'Invalid format': 'รูปแบบไม่ถูกต้อง',
  'The end date is before the start date': 'วันสิ้นสุดอยู่ก่อนวันเริ่ม',
  'Delete {what}?': 'ลบ{what}?',
  'This cannot be undone.': 'ลบแล้วกู้คืนไม่ได้',
};

export type StandsT = (text: string, vars?: Record<string, string | number>) => string;

export function standsText(
  locale: Locale,
  text: string,
  vars?: Record<string, string | number>,
): string {
  let s = locale === 'th' ? (STANDS_TH[text] ?? text) : text;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** `t('Book')` → "จอง" in Thai; `t('Edit {code}', { code })` fills the value in. */
export function useStandsT(): StandsT {
  const { locale } = useLocale();
  return useCallback((text, vars) => standsText(locale, text, vars), [locale]);
}

/** Dates in the page's language: `Nov 16, 2026` / `16 พ.ย. 2026`, and `3 hours ago` / `3 ชั่วโมงที่แล้ว`. */
export function useStandsDates() {
  const { locale } = useLocale();
  return useMemo(() => {
    const thai = locale === 'th';
    const parse = (v: string | null | undefined) => (v ? parseISO(v) : null);
    return {
      date: (v: string | null | undefined) => {
        const d = parse(v);
        if (!d || !isValid(d)) return '—';
        return thai ? format(d, 'd MMM yyyy', { locale: th }) : formatDate(v);
      },
      relative: (v: string | null | undefined) => {
        const d = parse(v);
        if (!d || !isValid(d)) return '—';
        return thai ? formatDistanceToNow(d, { addSuffix: true, locale: th }) : formatRelative(v);
      },
      /** date-fns locale for calendars (undefined = English). */
      locale: thai ? th : undefined,
      /** `16 Nov` / `16 พ.ย.` for timeline headers. */
      short: (v: string) => format(parseISO(v), 'd MMM', thai ? { locale: th } : undefined),
    };
  }, [locale]);
}

/** Delete confirmation in the page's language. */
export function confirmStandDelete(
  t: StandsT,
  what: string,
  onConfirm: () => void | Promise<unknown>,
): void {
  confirmAction({
    title: t('Delete {what}?', { what }),
    message: t('This cannot be undone.'),
    confirmLabel: t('Delete'),
    cancelLabel: t('Cancel'),
    danger: true,
    onConfirm,
  });
}

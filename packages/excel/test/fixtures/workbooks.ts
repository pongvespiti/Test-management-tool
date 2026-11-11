/**
 * Synthetic fixture workbooks that mimic the layouts of the team's Excel files (structure only —
 * every text here is invented). Built in memory with ExcelJS so no binary fixtures are committed.
 */
import { ExcelJS, type CellValue, type Workbook, type Worksheet } from '../../src/cjs';

type SheetState = 'visible' | 'hidden' | 'veryHidden';

function put(ws: Worksheet, address: string, value: CellValue, numFmt?: string): void {
  const cell = ws.getCell(address);
  cell.value = value;
  if (numFmt) cell.numFmt = numFmt;
}

async function toBuffer(wb: Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ------------------------------------------------------------------ unit operation

/** Env block of the unit-operation layout (labels in K7:K29, values in L). */
export const UNIT_ENV: [string, CellValue][] = [
  ['Platform', 'Android'],
  ['Brand', 'Brand X'],
  ['Mobile model', 'Phone 1'],
  ['OS(ver)', 16],
  ['Unit Type', 'Type A'],
  ['Unit Model', 'MODEL-01'],
  ['SSID', 'AP-0001'],
  ['ADP&FW', 'Gen 4'],
  ['FW version', '1.2.3'],
  ['Server(env)', 'Dev'],
  ['Apperance Mode', 'Light mode'],
  ['Language', 'EN'],
  ['Resolution', '1080 x 2400'],
  ['Router', 'Router-1'],
  ['App version', '1.0.0'],
  ['SW ID', 1000001],
  ['EPPROM ID', 'EP-01'],
  ['SW OD', 2000001],
  ['EEPROM OD', 'EP-OD-01'],
  ['Tester', 'Tester One'],
  ['Tested date', new Date(Date.UTC(2026, 8, 25))],
  ['Judgement', null],
  ['Remark', null],
];

interface UnitRow {
  /** Category text; undefined = empty cell. */
  cat?: string;
  /** Merge the category cell over this many rows (master keeps `cat`, may be empty). */
  catRows?: number;
  no: number;
  topic: string;
  type?: string;
  pre: string;
  proc: string;
  exp: CellValue;
  actual?: string;
}

function unitSheet(wb: Workbook, name: string, state: SheetState, rows: UnitRow[]): Worksheet {
  const ws = wb.addWorksheet(name, { state });
  put(ws, 'C4', 'Test ID');
  ws.mergeCells('C4:D4');
  put(ws, 'E4', 'Scenario Name');
  put(ws, 'G4', 'Judgement explanation');
  ws.mergeCells('G4:I4');
  put(ws, 'C5', 'UT_02');
  ws.mergeCells('C5:D5');
  put(ws, 'E5', 'Unit operation test (sample)');
  ws.mergeCells('E5:F5');
  put(ws, 'G5', 'Operating the unit from the app is possible');
  ws.mergeCells('G5:I5');
  ws.mergeCells('C7:J29'); // picture area
  UNIT_ENV.forEach(([label, value], i) => {
    put(ws, `K${7 + i}`, label);
    if (value !== null) put(ws, `L${7 + i}`, value, value instanceof Date ? 'mm-dd-yy' : undefined);
  });
  const headers: [string, string][] = [
    ['C30', 'Category'],
    ['D30', 'No.'],
    ['E30', 'Test Topic'],
    ['F30', 'Type'],
    ['G30', 'Pre condition'],
    ['H30', 'Test procedure'],
    ['I30', 'Expected Result\n'],
    ['L30', 'Actual result'],
  ];
  for (const [a, v] of headers) put(ws, a, v);
  ws.mergeCells('I30:K30');
  rows.forEach((row, i) => {
    const r = 31 + i;
    if (row.cat !== undefined) put(ws, `C${r}`, row.cat);
    if (row.catRows && row.catRows > 1) ws.mergeCells(`C${r}:C${r + row.catRows - 1}`);
    put(ws, `D${r}`, row.no);
    put(ws, `E${r}`, row.topic);
    if (row.type !== undefined) put(ws, `F${r}`, row.type);
    put(ws, `G${r}`, row.pre);
    put(ws, `H${r}`, row.proc);
    put(ws, `I${r}`, row.exp);
    ws.mergeCells(`I${r}:K${r}`);
    if (row.actual) put(ws, `L${r}`, row.actual);
  });
  return ws;
}

/** Rows of the main ("Online") fixture sheet; header row 30, data from row 31. */
export const UNIT_ONLINE_ROWS: UnitRow[] = [
  {
    cat: 'Login',
    no: 1,
    topic: 'Login with account',
    type: 'Normal',
    pre: 'Not logged in',
    proc: '1. Open app\r\n2. Log in',
    exp: 'App result\n\nLogin successful',
  },
  {
    cat: 'Unit control \nof Cool mode',
    catRows: 3,
    no: 2,
    topic: 'Power (Unit)',
    type: 'Normal',
    pre: 'Unit Power = OFF',
    proc: 'AC Power = ON',
    exp: 'Unit Power = ON',
  },
  {
    no: 3,
    topic: 'Mode',
    type: 'Normal',
    pre: 'Default settings',
    proc: 'Tap mode = Cool',
    exp: { richText: [{ text: 'Mode = ' }, { font: { bold: true }, text: 'Cool' }] },
  },
  {
    no: 4,
    topic: 'Temperature (Minimum)',
    type: 'normal',
    pre: 'Default settings',
    proc: 'Temp = 16',
    exp: 'Temp = 16',
  },
  {
    cat: 'Display unit',
    no: 5,
    topic: 'Temperature Fahrenheit',
    pre: 'AC Power = ON',
    proc: 'Change display to F',
    exp: 'Display temperature F',
  },
  {
    no: 6,
    topic: 'Temperature Celsius',
    type: 'Normal',
    pre: 'AC Power = ON',
    proc: 'Change display to C',
    exp: 'Display temperature C',
  },
  {
    cat: '',
    catRows: 2,
    no: 7,
    topic: 'Weekly schedule adding (No.1)',
    type: 'Normal',
    pre: 'AC Power = OFF',
    proc: 'Add a schedule',
    exp: 'Schedule shown',
  },
  {
    no: 8,
    topic: 'Weekly schedule adding (No.2)',
    pre: 'AC Power = OFF',
    proc: 'Add a schedule',
    exp: 'Schedule shown',
  },
  {
    no: 9,
    topic: 'Weekly schedule (Deletable)',
    type: 'Normal',
    pre: 'From previous step',
    proc: 'Delete a task',
    exp: 'Task removed',
  },
  {
    cat: 'Child lock',
    no: 10,
    topic: 'Child lock (Enable)',
    type: 'Abnormal',
    pre: 'Child lock = Disable',
    proc: 'Enable child lock',
    exp: 'Locked = Enable',
    actual: 'N/A',
  },
];

export async function unitOperationWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet('Summary_Unit operation');
  put(summary, 'B2', 'Summary of unit operation test');
  const sumHeaders = ['No.', 'Test ID', 'Scenario', 'Tester', 'Date', 'Judgement'];
  sumHeaders.forEach((h, i) => put(summary, `${String.fromCharCode(66 + i)}5`, h));
  put(summary, 'B6', 1);
  put(summary, 'C6', 'UT_02');
  put(summary, 'D6', 'Online mode');
  put(summary, 'G6', 'Pass');

  unitSheet(wb, 'MODE A (Router)', 'hidden', [
    { cat: 'Login', no: 1, topic: 'Login', type: 'Normal', pre: 'p', proc: 'q', exp: 'r' },
    { cat: 'Login', no: 2, topic: 'Logout', type: 'Normal', pre: 'p', proc: 'q', exp: 'r' },
    { cat: 'Mode', no: 3, topic: 'Mode', type: 'Normal', pre: 'p', proc: 'q', exp: 'r' },
  ]);
  unitSheet(wb, 'MODE B (AP)', 'visible', UNIT_ONLINE_ROWS.slice(0, 4));
  unitSheet(wb, 'MODE C (Online)', 'visible', UNIT_ONLINE_ROWS);

  const refer = wb.addWorksheet('refer');
  put(refer, 'C3', 'Doc no.');
  put(refer, 'E3', 'QA-0000');
  put(refer, 'C5', 'Approved');
  put(refer, 'E5', 'Checked');
  put(refer, 'G5', 'Made');
  return toBuffer(wb);
}

// ------------------------------------------------------------------ adapter

export async function adapterWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet('Summary_Adapter');
  put(summary, 'B2', 'Summary');
  const ws = wb.addWorksheet('GRP_01_KR');
  put(ws, 'C3', 'Adapter connection test (sample)');
  ws.mergeCells('C3:G3');
  ws.mergeCells('I3:J3');
  ws.mergeCells('C6:J22'); // picture area
  const env: [string, string | null][] = [
    ['Router', 'Router-1'],
    ['Wi-Fi Adapter', 'Gen 4'],
    ['SSID', 'AP-0002'],
    ['FW version', null],
    ['SW ID', null],
    ['EPROM ID', null],
    ['SW OD', null],
    ['EPROM OD', null],
    ['Unit Type', null],
    ['Unit Model', 'M-1'],
    ['Mobile', null],
    ['OS Ver', null],
    ['App ver.', null],
    ['Tester', null],
    ['Datetime', null],
    ['Judgement', null],
    ['Remark', null],
  ];
  env.forEach(([label, value], i) => {
    put(ws, `K${6 + i}`, label);
    if (value !== null) put(ws, `L${6 + i}`, value);
  });
  const headers = [
    'Test ID',
    'Case ID',
    'Test Topic',
    'Test Case Type',
    'Precondition',
    'Test Procedures',
    'Expected Result',
    'Actual Result',
    'Remark',
  ];
  headers.forEach((h, i) => put(ws, `${String.fromCharCode(67 + i)}24`, h));
  ws.mergeCells('K24:L24');

  let r = 25;
  const sectionRow = (name: string) => {
    put(ws, `C${r}`, name);
    ws.mergeCells(`C${r}:L${r}`);
    r++;
  };
  const groupRow = (code: string, name: string) => {
    put(ws, `C${r}`, code);
    put(ws, `D${r}`, name);
    ws.mergeCells(`D${r}:L${r}`);
    r++;
  };
  const caseRow = (code: string, topic: string, type: string, remark?: string) => {
    put(ws, `D${r}`, code);
    put(ws, `E${r}`, topic);
    put(ws, `F${r}`, type);
    put(ws, `G${r}`, '1. Adapter is ON\n2. Router is ON');
    put(ws, `H${r}`, `1. Press the button for 5 seconds\n2. Check ${topic.toLowerCase()}`);
    put(ws, `I${r}`, 'Adapter Operation\nWi-Fi = ON');
    if (remark) put(ws, `K${r}`, remark);
    ws.mergeCells(`K${r}:L${r}`);
    r++;
  };
  sectionRow('Normal Case');
  groupRow('GRP_01_001', 'Connection & operation');
  caseRow('GRP_01_001_01', 'Adapter initialization', 'Normal');
  caseRow('GRP_01_001_02', 'Turn off Wi-Fi adapter', 'Normal', 'http://(ip)/config/');
  caseRow('GRP_01_001_03', 'Turn on Wi-Fi adapter', 'Normal');
  groupRow('GRP_01_002', 'Pairing method');
  caseRow('GRP_01_002_01', 'Pairing by button', 'Normal');
  caseRow('GRP_01_002_02', 'Pairing timeout', 'Normal');
  caseRow('GRP_01_002_02', 'Pairing with special characters', 'Normal');
  sectionRow('Abnormal Case');
  groupRow('GRP_02_001', 'Network change');
  caseRow('GRP_02_001_01', 'Router SSID renamed', 'Abnormal');
  caseRow('GRP_02_001_02', 'Router password changed', 'Abnormal');

  wb.addWorksheet('refer');
  return toBuffer(wb);
}

// ------------------------------------------------------------------ modbus (system + function)

export async function modbusWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  // Modbus function check: unlabeled merged category column B, header row 13.
  const mbf = wb.addWorksheet('MBF_01');
  put(mbf, 'B3', 'Test ID');
  put(mbf, 'C3', 'Scenario Name');
  mbf.mergeCells('C3:D3');
  put(mbf, 'E3', 'Overall Judgement');
  put(mbf, 'F3', 'Judgement explanation');
  put(mbf, 'B4', 'MBF_01');
  put(mbf, 'C4', 'Modbus function check');
  mbf.mergeCells('C4:D4');
  mbf.mergeCells('B5:F12'); // picture area
  [
    'Register',
    'Name function',
    'Expected result',
    'Actual result',
    'Result (OK/NG, etc.)',
    'Remark',
    'Judgement',
  ].forEach((h, i) => put(mbf, `${String.fromCharCode(67 + i)}13`, h));
  put(mbf, 'B14', 'Unit info');
  mbf.mergeCells('B14:B16');
  put(mbf, 'C14', '0002', '@');
  put(mbf, 'D14', 'Modbus SW ver');
  put(mbf, 'E14', 1, '0.0');
  put(mbf, 'F14', '1.0', '@');
  put(mbf, 'C15', '0003, 0004');
  put(mbf, 'D15', 'Adapter SW ver');
  put(mbf, 'E15', 'Dev: 1.2.3');
  put(mbf, 'C16', '1006');
  put(mbf, 'D16', 'Indoor temp exist ');
  put(mbf, 'E16', '0: Not supported\n1: Supported');
  put(mbf, 'F16', 1);
  put(mbf, 'B17', 'Functional');
  mbf.mergeCells('B17:B20');
  put(mbf, 'C17', '1001');
  put(mbf, 'D17', 'Mode exist auto');
  put(mbf, 'E17', '0: Not supported\n1: Supported');
  put(mbf, 'C18', '1001');
  put(mbf, 'D18', 'Mode exist cool');
  put(mbf, 'E18', '0: Not supported\n1: Supported');
  put(mbf, 'D19', 'Flap auto control (UD)');
  put(mbf, 'H19', 'Device not support');
  put(mbf, 'C20', '1004');
  put(mbf, 'D20', 'Fan speed steps');
  put(mbf, 'E20', '0: Not supported\n5: Five steps');
  put(mbf, 'F20', 5);
  put(mbf, 'H20', 'Fan speed 1-5');

  const reg = wb.addWorksheet('Modbus');
  ['Register', 'Name', 'R/W'].forEach((h, i) => put(reg, `${String.fromCharCode(66 + i)}2`, h));
  put(reg, 'B3', '2001');
  put(reg, 'C3', 'Power');
  put(reg, 'D3', 'R/W');

  // Modbus system test: merged "Test topic" in B, header row 8.
  const mbs = wb.addWorksheet('MBS_01');
  put(mbs, 'B5', 'Test ID');
  put(mbs, 'C5', 'Scenario Name');
  put(mbs, 'D5', 'Overall Judgement');
  mbs.mergeCells('D5:E5');
  put(mbs, 'F5', 'Judgement explanation');
  put(mbs, 'B6', 'MBS_01');
  put(mbs, 'C6', 'Modbus System test');
  put(mbs, 'F6', 'Operate the unit through Modbus');
  put(mbs, 'L7', 'For checker');
  [
    'Test topic',
    'Function',
    'Register',
    'Pre-conditions',
    'Test step',
    'Modbus Test method',
    'Expected result of controller',
    'Expected result of device',
    'Result (OK/NG, etc.)',
    'Remark',
    'Judgement',
  ].forEach((h, i) => put(mbs, `${String.fromCharCode(66 + i)}8`, h));
  const sys = (
    r: number,
    fn: string,
    register: number | null,
    extra: Partial<Record<'E' | 'F' | 'G' | 'H' | 'I' | 'K', string>> = {},
  ) => {
    put(mbs, `C${r}`, fn);
    if (register !== null) put(mbs, `D${r}`, register);
    const defaults = {
      E: 'Power on.',
      F: `Click ${fn} on the tool`,
      G: 'set -> get',
      H: 'Adapter accepts the command',
      I: 'Device responds',
    };
    for (const [col, v] of Object.entries({ ...defaults, ...extra })) put(mbs, `${col}${r}`, v);
  };
  put(mbs, 'B9', 'Operation status');
  mbs.mergeCells('B9:B10');
  sys(9, 'Power ON', 2001);
  sys(10, 'Power OFF', 2001);
  put(mbs, 'B11', 'Mode');
  sys(11, 'Cool', 2001);
  put(mbs, 'B12', 'Humidity setting\n(some device support)');
  mbs.mergeCells('B12:B15');
  put(mbs, 'D12', 2003);
  mbs.mergeCells('D12:D15');
  const notSupported = { E: '-', F: '-', G: '-', H: '-', I: '-', K: 'Device not support' };
  sys(12, '0 (off)', null, notSupported);
  sys(13, '0', null, notSupported);
  sys(14, '1', null, notSupported);
  sys(15, 'CONTINUE.', null, notSupported);
  put(mbs, 'B16', 'Air flow');
  mbs.mergeCells('B16:B18');
  sys(16, 'L', 2004);
  sys(17, 'M', 2004);
  sys(18, 'H', 2004);

  const refer = wb.addWorksheet('refer');
  put(refer, 'C3', 'Doc no.');
  const cover = wb.addWorksheet('Cover Page', { state: 'hidden' });
  put(cover, 'C3', 'Cover');
  const env = wb.addWorksheet('env', { state: 'veryHidden' });
  put(env, 'B2', 'Platform');
  return toBuffer(wb);
}

// ------------------------------------------------------------------ generic CSV (TestRail-like)

export const TESTRAIL_CSV = [
  'ID,Title,Section,Section Depth,Type,Priority,Preconditions,Steps,Expected Result,References',
  'C101,Login with valid account,Login,0,Functional,High,User exists,"1. Open app',
  '2. Enter ""user"" and password","Home page, with greeting",REQ-1',
  'C102,Login with wrong password,Login,0,Functional,Medium,User exists,"1. Open app',
  '2. Enter a wrong password",Error message is shown,',
  'C103,Logout,Account,0,Regression,Low,,Tap logout,Login page is shown,REQ-2',
  '',
].join('\r\n');

export function testRailCsv(): Buffer {
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(TESTRAIL_CSV, 'utf8')]);
}

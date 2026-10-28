export const numericFields = ['deposit', 'rent', 'fee', 'area', 'commute'] as const;
export type NumericField = typeof numericFields[number];
export type Room = {
  id: string; createdAt: number; name: string; location: string;
  deposit: number; rent: number; fee: number; area: number; commute: number;
  builtYear?: number | null;
  floor: '' | '단층' | '복층'; link: string; memo: string; favorite: boolean; example: boolean;
};
export type RoomDraft = Record<NumericField | 'name' | 'location' | 'floor' | 'link' | 'memo' | 'builtYear', string>;
export const conditionFields = ['maxDeposit', 'maxMonthly', 'maxCommute', 'minArea', 'minBuiltYear'] as const;
export type ConditionKey = typeof conditionFields[number];
export type Conditions = Record<ConditionKey, number | null>;
export type ConditionDraft = Record<ConditionKey, string>;
export type Data = { version: 1; rooms: Room[]; conditions: Conditions; examplesVersion?: 2 | 3 };
export const emptyConditions: Conditions = { maxDeposit: null, maxMonthly: null, maxCommute: null, minArea: null, minBuiltYear: null };
export const emptyDraft: RoomDraft = { name: '', location: '', deposit: '', rent: '', fee: '', area: '', commute: '', floor: '', link: '', memo: '', builtYear: '' };
export const emptyData = (): Data => ({ version: 1, rooms: [], conditions: { ...emptyConditions } });
export const format = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 10 });
export type AreaUnit = 'sqm' | 'pyeong';
export const toPyeong = (area: number) => area * 0.3025;
export const areaText = (area: number, unit: AreaUnit) => unit === 'sqm' ? `${format(area)}㎡` : `약 ${toPyeong(area).toLocaleString('ko-KR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}평`;
export const currentYear = () => Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date()));
export function buildingText(year: number | null | undefined, referenceYear = currentYear()) {
  if (year == null) return '준공연도 미입력';
  return `${year}년 준공 · ${referenceYear - year}년 경과 (${referenceYear - year + 1}년차)`;
}

// Decimal-string addition prevents 0.1 + 0.2 from failing an inclusive 0.3 boundary.
function decimalParts(value: number): [bigint, number] {
  const [mantissa, exponent = '0'] = value.toString().split('e');
  const [integer, fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponent);
  const digits = BigInt(integer + fraction);
  return scale < 0 ? [digits * 10n ** BigInt(-scale), 0] : [digits, scale];
}
export function monthlyCost(room: Pick<Room, 'rent' | 'fee'>): number {
  const [a, sa] = decimalParts(room.rent);
  const [b, sb] = decimalParts(room.fee);
  const scale = Math.max(sa, sb);
  const digits = (a * 10n ** BigInt(scale - sa) + b * 10n ** BigInt(scale - sb)).toString().padStart(scale + 1, '0');
  return Number(scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits);
}
export const conditionLabels: Record<ConditionKey, { label: string; unit: string }> = {
  maxDeposit: { label: '최대 보증금', unit: '만 원' }, maxMonthly: { label: '최대 월 고정비', unit: '만 원' },
  maxCommute: { label: '최대 통학시간', unit: '분' }, minArea: { label: '최소 전용면적', unit: '㎡' },
  minBuiltYear: { label: '최소 준공연도', unit: '년' },
};
export function evaluate(room: Room, conditions: Conditions) {
  const values: Record<ConditionKey, number | null> = { maxDeposit: room.deposit, maxMonthly: monthlyCost(room), maxCommute: room.commute, minArea: room.area, minBuiltYear: room.builtYear ?? null };
  return conditionFields.flatMap(key => {
    const limit = conditions[key];
    const value = values[key];
    return limit === null ? [] : [{ key, label: conditionLabels[key].label, unit: conditionLabels[key].unit, limit, value, pass: value !== null && (key === 'minArea' || key === 'minBuiltYear' ? value >= limit : value <= limit) }];
  });
}
export function validLink(link: string): boolean {
  if (!link) return true;
  try { return /^https?:\/\//i.test(link) && ['http:', 'https:'].includes(new URL(link).protocol); } catch { return false; }
}
export function linkLabel(link: string): string {
  if (!link || !validLink(link)) return '매물 페이지 열기';
  const host = new URL(link).hostname.toLowerCase();
  if (host === 'land.naver.com' || host.endsWith('.land.naver.com')) return '네이버 부동산에서 보기';
  if (host === 'naver.me') return '네이버 공유 링크 열기';
  if (host === 'zigbang.com' || host.endsWith('.zigbang.com')) return '직방에서 보기';
  return '매물 페이지 열기';
}
function numberError(raw: string, positive = false, integer = false): string | undefined {
  if (!raw.trim()) return positive ? '0보다 큰 면적을 입력해 주세요.' : '값을 입력해 주세요. 0도 입력할 수 있습니다.';
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER) return '표현 가능한 유효한 숫자를 입력해 주세요.';
  if (positive ? n <= 0 : n < 0) return positive ? '0보다 큰 면적을 입력해 주세요.' : '0 이상의 값을 입력해 주세요.';
  if (integer && !Number.isInteger(n)) return '분 단위의 정수를 입력해 주세요.';
}
export function validateRoom(draft: RoomDraft, referenceYear = currentYear()): Partial<Record<keyof RoomDraft, string>> {
  const errors: Partial<Record<keyof RoomDraft, string>> = {};
  if (!draft.name.trim()) errors.name = '매물 이름을 입력해 주세요.';
  numericFields.forEach(key => {
    const error = numberError(draft[key], key === 'area', key === 'commute');
    if (error) errors[key] = error;
  });
  if (!validLink(draft.link.trim())) errors.link = 'http:// 또는 https://로 시작하는 올바른 주소를 입력해 주세요.';
  if (!['', '단층', '복층'].includes(draft.floor)) errors.floor = '단층 또는 복층을 선택해 주세요.';
  if (draft.builtYear.trim() && (!/^\d{4}$/.test(draft.builtYear.trim()) || Number(draft.builtYear) < 1000 || Number(draft.builtYear) > referenceYear)) errors.builtYear = `1000~${referenceYear}년 사이의 네 자리 준공연도를 입력해 주세요. 미래 연도는 입력할 수 없습니다.`;
  return errors;
}
export function validateConditions(draft: ConditionDraft, referenceYear = currentYear()) {
  const errors: Partial<Record<ConditionKey, string>> = {};
  conditionFields.forEach(key => {
    if (draft[key].trim()) {
      const error = key === 'minBuiltYear'
        ? (!/^\d{4}$/.test(draft[key].trim()) || Number(draft[key]) < 1000 || Number(draft[key]) > referenceYear ? `1000~${referenceYear}년 사이의 네 자리 준공연도를 입력해 주세요.` : undefined)
        : numberError(draft[key], key === 'minArea', key === 'maxCommute');
      if (error) errors[key] = error;
    }
  });
  return errors;
}
export function toRoom(draft: RoomDraft, previous?: Room): Room {
  return { id: previous?.id ?? crypto.randomUUID(), createdAt: previous?.createdAt ?? Date.now(),
    name: draft.name.trim(), location: draft.location.trim(), deposit: Number(draft.deposit), rent: Number(draft.rent),
    fee: Number(draft.fee), area: Number(draft.area), commute: Number(draft.commute), floor: draft.floor as Room['floor'],
    link: draft.link.trim(), memo: draft.memo.trim(), builtYear: draft.builtYear.trim() ? Number(draft.builtYear) : null, favorite: previous?.favorite ?? false, example: previous?.example ?? false };
}
export function roomDraft(room: Room): RoomDraft {
  return Object.fromEntries(Object.keys(emptyDraft).map(key => [key, String(room[key as keyof Room] ?? '')])) as RoomDraft;
}
export function conditionsDraft(conditions: Conditions): ConditionDraft {
  return Object.fromEntries(conditionFields.map(key => [key, conditions[key] === null ? '' : String(conditions[key])])) as ConditionDraft;
}
export function parseConditions(draft: ConditionDraft): Conditions {
  return Object.fromEntries(conditionFields.map(key => [key, draft[key].trim() ? Number(draft[key]) : null])) as Conditions;
}
export type Sort = 'newest' | 'monthly' | 'commute' | 'area' | 'builtNewest' | 'builtOldest';
export function visibleRooms(data: Data, sort: Sort, favorites: boolean, matches: boolean) {
  return data.rooms.filter(room => (!favorites || room.favorite) && (!matches || evaluate(room, data.conditions).every(c => c.pass)))
    .sort((a, b) => {
      if (sort === 'builtNewest' || sort === 'builtOldest') {
        if (a.builtYear == null && b.builtYear != null) return 1;
        if (a.builtYear != null && b.builtYear == null) return -1;
        const yearDifference = (a.builtYear ?? 0) - (b.builtYear ?? 0);
        if (yearDifference) return sort === 'builtNewest' ? -yearDifference : yearDifference;
      }
      const difference = sort === 'monthly' ? monthlyCost(a) - monthlyCost(b) : sort === 'commute' ? a.commute - b.commute : sort === 'area' ? b.area - a.area : b.createdAt - a.createdAt;
      return difference || b.createdAt - a.createdAt || a.id.localeCompare(b.id);
    });
}
export function toggleSelection(ids: string[], id: string): { ids: string[]; error?: string } {
  if (ids.includes(id)) return { ids: ids.filter(value => value !== id) };
  return ids.length >= 3 ? { ids, error: '비교는 최대 3개까지 가능합니다. 선택한 매물을 먼저 해제해 주세요.' } : { ids: [...ids, id] };
}
export function addExamples(rooms: Room[]): Room[] {
  const examples: Room[] = [
    { name: '응암 A', location: '응암', deposit: 2000, rent: 55, fee: 10, area: 20, commute: 38, builtYear: 2018 },
    { name: '염창 B', location: '염창', deposit: 1000, rent: 65, fee: 10, area: 19, commute: 40, builtYear: 2012 },
    { name: '연희 C', location: '연희', deposit: 3000, rent: 63, fee: 7, area: 22, commute: 25, builtYear: 2020 },
    { name: '상수 D', location: '상수', deposit: 1500, rent: 48, fee: 7, area: 17, commute: 45, builtYear: 2008 },
    { name: '신촌 E', location: '신촌', deposit: 3000, rent: 78, fee: 8, area: 24, commute: 12, builtYear: 2022 },
    { name: '망원 F', location: '망원', deposit: 2500, rent: 68, fee: 9, area: 28, commute: 32, builtYear: 2015 },
  ].map((room, index) => ({ ...room, id: `example-${index + 1}`, createdAt: 1700000000000 + index, floor: '단층', link: '', memo: '비교 연습을 위한 가상 매물입니다.', favorite: false, example: true }));
  const updated = rooms.map(room => {
    const template = examples.find(example => example.id === room.id);
    return room.example && template && room.builtYear == null ? { ...room, builtYear: template.builtYear } : room;
  });
  const missing = examples.filter(example => !rooms.some(room => room.id === example.id));
  return missing.length || updated.some((room, index) => room !== rooms[index]) ? [...updated, ...missing] : rooms;
}

// Upgrade an existing sample collection once; later user deletions and cleared years remain intact.
export function upgradeExamples(data: Data): Data {
  if (data.examplesVersion === 3 || data.examplesVersion === undefined && data.rooms.length > 0 && !data.rooms.some(room => room.example && ['example-1', 'example-2', 'example-3'].includes(room.id))) return data;
  return { ...data, rooms: addExamples(data.rooms), examplesVersion: 3 };
}

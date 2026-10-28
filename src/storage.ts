import { emptyData, numericFields, conditionFields, roomDraft, validateRoom, validateConditions, conditionsDraft, type Data, type Room, type Conditions } from './domain';
export const STORAGE_KEY = 'bang-gijun:v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export function isData(value: unknown): value is Data {
  if (!value || typeof value !== 'object') return false;
  const data = value as Data;
  if (data.version !== 1 || !Array.isArray(data.rooms) || !data.conditions || typeof data.conditions !== 'object') return false;
  if (data.examplesVersion !== undefined && data.examplesVersion !== 2 && data.examplesVersion !== 3) return false;
  const conditions = data.conditions as Conditions;
  if (!conditionFields.every(key => conditions[key] === null || typeof conditions[key] === 'number' && Number.isFinite(conditions[key]))) return false;
  if (Object.keys(validateConditions(conditionsDraft(conditions))).length) return false;
  const ids = new Set<string>();
  return data.rooms.every((room: Room) => {
    if (!room || typeof room !== 'object' || typeof room.id !== 'string' || !room.id || ids.has(room.id)) return false;
    ids.add(room.id);
    if (typeof room.createdAt !== 'number' || !Number.isFinite(room.createdAt) || typeof room.favorite !== 'boolean' || typeof room.example !== 'boolean') return false;
    if (!['name', 'location', 'floor', 'link', 'memo'].every(key => typeof room[key as keyof Room] === 'string')) return false;
    if (!numericFields.every(key => typeof room[key] === 'number' && Number.isFinite(room[key]))) return false;
    // v1 records without this optional field remain readable without rewriting storage.
    if (room.builtYear != null && typeof room.builtYear !== 'number') return false;
    return Object.keys(validateRoom(roomDraft(room))).length === 0;
  });
}
export function readData(storage?: StoragePort): { data: Data; error?: string } {
  try {
    const raw = (storage ?? window.localStorage).getItem(STORAGE_KEY);
    if (raw === null) return { data: emptyData() };
    let parsed: unknown = JSON.parse(raw);
    // Add only the newly introduced condition in memory; never overwrite the original on load.
    if (parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 1 && 'conditions' in parsed && parsed.conditions && typeof parsed.conditions === 'object' && !Array.isArray(parsed.conditions) && !('minBuiltYear' in parsed.conditions)) {
      parsed = { ...parsed, conditions: { ...parsed.conditions, minBuiltYear: null } };
    }
    if (!isData(parsed)) throw new Error('Invalid data');
    return { data: parsed };
  } catch {
    return { data: emptyData(), error: '저장 데이터를 읽을 수 없습니다. 손상되었거나 브라우저에서 저장소 접근을 차단했습니다. 기존 데이터는 덮어쓰지 않았습니다.' };
  }
}
export function writeData(data: Data, storage?: StoragePort): string | undefined {
  try { (storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch { return '저장하지 못했습니다. 브라우저 저장 공간이나 개인정보 설정을 확인한 뒤 다시 시도해 주세요. 변경 사항은 적용되지 않았습니다.'; }
}

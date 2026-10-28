import { describe, expect, it } from 'vitest';
import { addExamples, emptyData, emptyDraft, evaluate, monthlyCost, parseConditions, toggleSelection, validateConditions, validateRoom, visibleRooms, type Conditions } from './domain';
import { isData, readData, writeData } from './storage';
import { areaText, toPyeong, buildingText, roomDraft, upgradeExamples, linkLabel, type Room } from './domain';

// Keep a legacy three-room fixture for existing calculation/missing-year scenarios.
const rooms: Room[] = addExamples([]).slice(0, 3).map(room => ({ ...room, builtYear: undefined }));
const conditions: Conditions = { maxDeposit: 2000, maxMonthly: 65, maxCommute: 38, minArea: 20, minBuiltYear: null };
describe('준공연도와 면적 단위', () => {
  it('면적 환산은 표시만 반올림하며 원본 면적과 경계 판정을 보존', () => {
    expect(toPyeong(20)).toBe(6.05);
    expect(areaText(20, 'pyeong')).toBe('약 6.05평');
    expect(areaText(19, 'pyeong')).toBe('약 5.75평');
    expect(areaText(20, 'sqm')).toBe('20㎡');
    expect(rooms[0].area).toBe(20);
    expect(evaluate(rooms[0], conditions).every(c => c.pass)).toBe(true);
  });
  it('준공한 해는 0년 경과·1년차이고 기준 연도가 바뀌면 자동 계산', () => {
    expect(buildingText(2026, 2026)).toBe('2026년 준공 · 0년 경과 (1년차)');
    expect(buildingText(2020, 2026)).toBe('2020년 준공 · 6년 경과 (7년차)');
    expect(buildingText(2020, 2027)).toContain('7년 경과 (8년차)');
    expect(buildingText(undefined, 2026)).toBe('준공연도 미입력');
  });
  it('준공연도는 선택 입력이며 미래·소수·잘못된 연도를 거부', () => {
    const draft = roomDraft(rooms[0]);
    for (const year of ['', '2020', '2026']) expect(validateRoom({ ...draft, builtYear: year }, 2026).builtYear).toBeUndefined();
    for (const year of ['0', '-1', '999', '2027', '2020.5', 'abcd']) expect(validateRoom({ ...draft, builtYear: year }, 2026).builtYear).toBeTruthy();
  });
  it('준공연도 없는 기존 v1 저장 데이터와 ID·관심·조건을 그대로 읽음', () => {
    const legacy = { ...emptyData(), rooms: [{ ...rooms[0], favorite: true }], conditions };
    const raw = JSON.stringify(legacy);
    const result = readData({ getItem: () => raw, setItem: () => { throw Error('자동 저장 금지'); } });
    expect(result.error).toBeUndefined(); expect(result.data).toEqual(legacy);
    expect(roomDraft(result.data.rooms[0]).builtYear).toBe('');
    expect(isData({ ...legacy, rooms: [{ ...rooms[0], builtYear: '2020' }] })).toBe(false);
    expect(isData({ ...legacy, rooms: [{ ...rooms[0], builtYear: 2020.5 }] })).toBe(false);
  });
  it('최소 준공연도 경계와 미입력을 구분하고 관심·충족 필터를 조합', () => {
    const data = { ...emptyData(), conditions: { ...emptyData().conditions, minBuiltYear: 2020 }, rooms: [{ ...rooms[0], builtYear: 2019 }, { ...rooms[1], builtYear: 2020, favorite: true }, rooms[2], { ...rooms[0], id: 'new', builtYear: 2021 }] };
    expect(data.rooms.map(room => evaluate(room, data.conditions)[0].pass)).toEqual([false, true, false, true]);
    expect(evaluate(rooms[2], data.conditions)[0].value).toBeNull();
    expect(visibleRooms(data, 'newest', true, true).map(r => r.name)).toEqual(['염창 B']);
    expect(visibleRooms(data, 'newest', false, true)).toHaveLength(2);
    expect(evaluate(rooms[0], emptyData().conditions)).toEqual([]);
  });
  it('최소 준공연도 조건은 빈 값 허용, 미래·소수·0·음수 거부', () => {
    const draft = { maxDeposit: '', maxMonthly: '', maxCommute: '', minArea: '', minBuiltYear: '' };
    for (const year of ['', '2020', '2026']) expect(validateConditions({ ...draft, minBuiltYear: year }, 2026)).toEqual({});
    for (const year of ['2027', '2020.5', '0', '-1', '999']) expect(validateConditions({ ...draft, minBuiltYear: year }, 2026).minBuiltYear).toBeTruthy();
    expect(parseConditions(draft).minBuiltYear).toBeNull();
    expect(parseConditions({ ...draft, minBuiltYear: '2020' }).minBuiltYear).toBe(2020);
  });
  it('이전 4개 조건 데이터는 다른 값과 원본을 보존하며 새 조건만 보완', () => {
    const legacy = { ...emptyData(), rooms, conditions: { maxDeposit: 2000, maxMonthly: 65, maxCommute: 38, minArea: 20 } };
    const raw = JSON.stringify(legacy);
    const result = readData({ getItem: () => raw, setItem: () => { throw Error('자동 덮어쓰기 금지'); } });
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({ ...legacy, conditions: { ...legacy.conditions, minBuiltYear: null } });
    expect(readData({ getItem: () => JSON.stringify({ ...legacy, conditions: { ...legacy.conditions, minBuiltYear: '2020' } }), setItem: () => {} }).error).toBeTruthy();
  });
  it('준공연도 양방향 정렬에서 미입력은 항상 마지막', () => {
    const data = { ...emptyData(), rooms: [{ ...rooms[0], builtYear: 2019 }, { ...rooms[1], builtYear: 2020 }, rooms[2]] };
    expect(visibleRooms(data, 'builtNewest', false, false).map(r => r.name)).toEqual(['염창 B', '응암 A', '연희 C']);
    expect(visibleRooms(data, 'builtOldest', false, false).map(r => r.name)).toEqual(['응암 A', '염창 B', '연희 C']);
  });
});
describe('계산과 조건', () => {
  it('월 고정비는 보증금을 제외한 월세 + 관리비', () => expect(monthlyCost(rooms[0])).toBe(65));
  it('모든 경계값이 정확히 같으면 충족', () => expect(evaluate(rooms[0], conditions).every(c => c.pass)).toBe(true));
  it('각 조건 미충족을 구분', () => expect(evaluate(rooms[1], conditions).map(c => c.pass)).toEqual([true, false, false, false]));
  it('빈 조건을 제외하고 0 조건을 유지', () => {
    const parsed = parseConditions({ maxDeposit: '', maxMonthly: '0', maxCommute: '', minArea: '', minBuiltYear: '' });
    expect(evaluate(rooms[0], parsed)).toHaveLength(1);
    expect(evaluate(rooms[0], emptyData().conditions)).toEqual([]);
    expect(parsed.maxMonthly).toBe(0);
  });
  it('소수 금액 경계와 아주 작은 값을 정확히 비교', () => {
    expect(monthlyCost({ rent: 0.1, fee: 0.2 })).toBe(0.3);
    expect(evaluate({ ...rooms[0], rent: 0.1, fee: 0.2 }, { ...emptyData().conditions, maxMonthly: 0.3 })[0].pass).toBe(true);
    expect(monthlyCost({ rent: 1e-7, fee: 2e-7 })).toBe(3e-7);
    expect(evaluate({ ...rooms[0], rent: 0.30000001, fee: 0 }, { ...emptyData().conditions, maxMonthly: 0.3 })[0].pass).toBe(false);
  });
});
describe('입력 검증', () => {
  it('저장 링크의 호스트에 따라 플랫폼 표시', () => {
    for (const host of ['land.naver.com', 'new.land.naver.com', 'm.land.naver.com', 'fin.land.naver.com']) expect(linkLabel(`https://${host}/`)).toBe('네이버 부동산에서 보기');
    expect(linkLabel('https://naver.me/')).toBe('네이버 공유 링크 열기');
    for (const host of ['zigbang.com', 'www.zigbang.com', 'm.zigbang.com']) expect(linkLabel(`https://${host}/`)).toBe('직방에서 보기');
    expect(linkLabel('https://example.com/')).toBe('매물 페이지 열기');
  });
  it('유사 호스트와 경로의 플랫폼 이름을 신뢰하지 않고 잘못된 링크도 안전하게 처리', () => {
    for (const link of ['https://zigbang.com.example.com/', 'https://notzigbang.com/', 'https://example.com/land.naver.com', 'https://land.naver.com@other.example.com/', 'javascript:alert(1)', 'not a url', '']) expect(linkLabel(link)).toBe('매물 페이지 열기');
  });
  const valid = { ...emptyDraft, name: '방', deposit: '0', rent: '0.1', fee: '0', area: '0.5', commute: '0' };
  it('빈 값과 0 구분, 금액·면적 소수 허용', () => {
    expect(validateRoom(valid)).toEqual({});
    expect(validateRoom({ ...valid, deposit: '' }).deposit).toBeTruthy();
  });
  it('음수, 0 면적, 무한값, 빈 이름 거부', () => {
    expect(validateRoom({ ...valid, name: ' ', rent: '-1', area: '0', commute: '-1', fee: 'Infinity' })).toMatchObject({ name: expect.any(String), rent: expect.any(String), area: expect.any(String), commute: expect.any(String), fee: expect.any(String) });
  });
  it('http/https만 허용', () => {
    for (const link of ['javascript:alert(1)', 'data:text/html,test', 'ftp://host', 'test.com', 'https://']) expect(validateRoom({ ...valid, link }).link).toBeTruthy();
    for (const link of ['', 'https://example.com/room', 'http://example.com']) expect(validateRoom({ ...valid, link }).link).toBeUndefined();
  });
  it('조건 공백 허용, 음수·0 면적 거부', () => {
    expect(validateConditions({ maxDeposit: '', maxMonthly: '0', maxCommute: '', minArea: '', minBuiltYear: '' })).toEqual({});
    expect(Object.keys(validateConditions({ maxDeposit: '-1', maxMonthly: '', maxCommute: '1.5', minArea: '0', minBuiltYear: '' }))).toHaveLength(3);
  });
});
describe('목록과 비교', () => {
  it('예시 중복 방지와 수정한 사용자 데이터 보존', () => {
    const edited = [{ ...rooms[0], name: '내가 수정한 예시' }, { ...rooms[0], id: 'user-room', example: false }];
    const result = addExamples(edited);
    expect(result).toHaveLength(7);
    expect(result[0].name).toBe('내가 수정한 예시');
    expect(addExamples(result)).toEqual(result);
  });
  it('새 예시는 고유 ID 6개와 유효한 가상 준공연도를 포함', () => {
    const samples = addExamples([]);
    expect(samples).toHaveLength(6);
    expect(new Set(samples.map(room => room.id)).size).toBe(6);
    expect(samples.map(room => room.builtYear)).toEqual([2018, 2012, 2020, 2008, 2022, 2015]);
    expect(samples.every(room => room.example && room.link === '' && Object.keys(validateRoom(roomDraft(room))).length === 0)).toBe(true);
  });
  it('기존 예시를 한 번 업데이트하고 개인 매물·수정·관심·조건 보존', () => {
    const personal = { ...rooms[0], id: 'personal', example: false };
    const original = { ...emptyData(), conditions, rooms: [{ ...rooms[0], rent: 60, favorite: true, memo: '직접 수정' }, { ...rooms[1], builtYear: 2010 }, rooms[2], personal] };
    const upgraded = upgradeExamples(original);
    expect(upgraded.rooms).toHaveLength(7);
    expect(upgraded.rooms[0]).toMatchObject({ id: 'example-1', rent: 60, favorite: true, memo: '직접 수정', builtYear: 2018 });
    expect(upgraded.rooms[1].builtYear).toBe(2010);
    expect(upgraded.rooms[3]).toBe(personal);
    expect(upgraded.conditions).toBe(conditions);
    expect(original.rooms).toHaveLength(4);
    expect(original.rooms[0].builtYear).toBeUndefined();
    expect(upgradeExamples(upgraded)).toBe(upgraded);
  });
  it('업데이트 후 삭제·연도 비우기를 되돌리지 않고 처음 빈 목록 유지', () => {
    const upgraded = upgradeExamples({ ...emptyData(), rooms });
    const edited = { ...upgraded, rooms: upgraded.rooms.filter(room => room.id !== 'example-6').map(room => ({ ...room, builtYear: null })) };
    expect(upgradeExamples(edited)).toBe(edited);
    const empty = emptyData(); expect(upgradeExamples(empty)).toBe(empty);
    const personalOnly = { ...empty, rooms: [{ ...rooms[0], id: 'personal', example: false }] };
    expect(upgradeExamples(personalOnly)).toBe(personalOnly);
  });
  it('비교 최대 3개, 해제 가능', () => {
    expect(toggleSelection(['a', 'b', 'c'], 'd').error).toBeTruthy();
    expect(toggleSelection(['a', 'b', 'c'], 'b').ids).toEqual(['a', 'c']);
  });
  it('모든 정렬과 관심·조건 필터', () => {
    const data = { ...emptyData(), rooms: rooms.map((r, i) => ({ ...r, favorite: i === 0 })), conditions };
    expect(visibleRooms(data, 'newest', false, false).map(r => r.name)).toEqual(['연희 C', '염창 B', '응암 A']);
    expect(visibleRooms(data, 'monthly', false, false).map(r => r.name)).toEqual(['응암 A', '연희 C', '염창 B']);
    expect(visibleRooms(data, 'commute', false, false)[0].name).toBe('연희 C');
    expect(visibleRooms(data, 'area', false, false)[0].name).toBe('연희 C');
    expect(visibleRooms(data, 'newest', true, false)).toHaveLength(1);
    expect(visibleRooms(data, 'newest', false, true).map(r => r.name)).toEqual(['응암 A']);
    expect(data.rooms.map(r => r.name)).toEqual(['응암 A', '염창 B', '연희 C']);
  });
});
describe('저장 복구와 실패', () => {
  it('전체 데이터를 저장하고 다시 읽음', () => {
    let raw: string | null = null;
    const storage = { getItem: () => raw, setItem: (_: string, value: string) => { raw = value; } };
    const data = { ...emptyData(), rooms, conditions };
    expect(writeData(data, storage)).toBeUndefined(); expect(readData(storage).data).toEqual(data);
  });
  it('잘못된 JSON 및 스키마는 안전한 빈 상태와 오류를 반환', () => {
    for (const raw of ['{broken', 'null', '{"version":1,"rooms":[],"conditions":{}}']) {
      const result = readData({ getItem: () => raw, setItem: () => { throw Error('덮어쓰면 안 됨'); } });
      expect(result.data.rooms).toEqual([]); expect(result.error).toBeTruthy();
    }
    expect(isData({ ...emptyData(), rooms: [rooms[0], rooms[0]] })).toBe(false);
    expect(isData({ ...emptyData(), rooms: [{ ...rooms[0], link: 'javascript:alert(1)' }] })).toBe(false);
  });
  it('읽기·쓰기 접근 차단 시 예외를 외부로 던지지 않음', () => {
    const storage = { getItem: () => { throw Error('Blocked'); }, setItem: () => { throw Error('QuotaExceeded'); } };
    expect(readData(storage).error).toBeTruthy();
    expect(writeData(emptyData(), storage)).toContain('저장하지 못했습니다');
  });
});

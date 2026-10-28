import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { addExamples, conditionFields, conditionLabels, conditionsDraft, emptyDraft, evaluate, format, monthlyCost, numericFields, parseConditions, roomDraft, toRoom, toggleSelection, validateConditions, validateRoom, visibleRooms, type Data, type Room, type RoomDraft, type Sort } from './domain';
import { readData, writeData } from './storage';
import { areaText, buildingText, currentYear, upgradeExamples, type AreaUnit } from './domain';
import RoomLink, { SavedRoomLink } from './RoomLink';

function Icon({ kind = 'home' }: { kind?: 'home' | 'compare' }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{kind === 'home' ? <><path d="m3 10 9-7 9 7v11H3Z"/><path d="M9 21v-8h6v8"/></> : <><rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/><path d="M5 9h3M5 13h3m8-4h3m-3 4h3"/></>}</svg>;
}
function Field({ id, label, unit, error, optional, children }: { id: string; label: string; unit?: string; error?: string; optional?: boolean; children: ReactNode }) {
  return <div className="field"><label htmlFor={id}>{label} {unit && <span>({unit})</span>} {optional && <small>선택</small>}</label>{children}{error && <span id={`${id}-error`} className="field-error">{error}</span>}</div>;
}
function ConditionStatus({ room, data }: { room: Room; data: Data }) {
  const checks = evaluate(room, data.conditions);
  if (!checks.length) return <p className="no-conditions">비교 조건을 설정해 주세요</p>;
  const passed = checks.filter(check => check.pass).length;
  return <div className="condition-status"><p className={passed === checks.length ? 'all-pass' : ''}>설정한 조건 {checks.length}개 중 <strong>{passed}개 충족</strong></p><ul>{checks.map(check => <li key={check.key} className={check.pass ? 'pass' : 'fail'}><span>{check.value === null ? '? 확인 불가' : check.pass ? '✓ 충족' : '− 미충족'}</span> {check.label} {check.key === 'minBuiltYear' ? check.limit : format(check.limit)}{check.unit}{check.key === 'minBuiltYear' && ' 이상'}{check.value === null && ' · 준공연도 미입력'}</li>)}</ul></div>;
}
const numberLabels = { deposit: ['보증금', '만 원'], rent: ['월세', '만 원'], fee: ['관리비', '만 원'], area: ['전용면적', '㎡'], commute: ['통학시간', '분'] };

function RoomForm({ initial, onSave, onClose }: { initial: Room | null; onSave: (room: Room) => boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<RoomDraft>(initial ? roomDraft(initial) : { ...emptyDraft });
  const [errors, setErrors] = useState<Partial<Record<keyof RoomDraft, string>>>({});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { form.current?.querySelector<HTMLInputElement>('input')?.focus(); }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateRoom(draft); setErrors(result);
    if (Object.keys(result).length) { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    onSave(toRoom(draft, initial ?? undefined));
  }
  const input = (key: keyof RoomDraft) => ({ id: `room-${key}`, value: draft[key], 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `room-${key}-error` : undefined, onChange: (event: { target: { value: string } }) => setDraft({ ...draft, [key]: event.target.value }) });
  return <section className="panel room-editor" aria-labelledby="form-title"><div className="section-heading"><div><span className="eyebrow">매물 기록</span><h2 id="form-title">{initial ? '매물 수정' : '새 매물 등록'}</h2></div><button type="button" className="quiet" onClick={onClose}>닫기 ×</button></div><p className="muted">직접 확인한 정보를 적어 주세요. ‘선택’ 항목 외에는 모두 필수입니다.</p>
    <form ref={form} onSubmit={submit} noValidate><div className="form-grid">
      <Field id="room-name" label="매물 이름" error={errors.name}><input {...input('name')} required maxLength={100} placeholder="예: 학교 앞 햇살 원룸" /></Field>
      <Field id="room-location" label="동네 또는 위치" optional><input {...input('location')} maxLength={200} placeholder="예: 학교 정문 도보 5분" /></Field>
      {numericFields.map(key => <Field key={key} id={`room-${key}`} label={numberLabels[key][0]} unit={numberLabels[key][1]} error={errors[key]}><input {...input(key)} type="number" required min={0} step={key === 'commute' ? '1' : 'any'} inputMode={key === 'commute' ? 'numeric' : 'decimal'} placeholder={key === 'area' ? '0보다 큰 값' : '0 이상'} /></Field>)}
      <Field id="room-floor" label="단층/복층" optional><select {...input('floor')}><option value="">선택 안 함</option><option>단층</option><option>복층</option></select></Field>
      <Field id="room-builtYear" label="준공연도" unit="년" optional error={errors.builtYear}><input {...input('builtYear')} type="number" min="1000" max={currentYear()} step="1" inputMode="numeric" placeholder="예: 2020" /><small className="muted">정확한 날짜를 몰라도 연도만 입력하세요. 모르면 비워 두세요.</small></Field>
      <div className="field"><span className="muted small">전용면적 환산</span><span>{draft.area.trim() && Number.isFinite(Number(draft.area)) && Number(draft.area) > 0 ? `${areaText(Number(draft.area), 'sqm')} = ${areaText(Number(draft.area), 'pyeong')}` : '전용면적을 입력하면 평수를 보여드려요.'}</span></div>
      <div className="wide"><Field id="room-link" label="매물 링크" optional error={errors.link}><input {...input('link')} type="url" inputMode="url" placeholder="https://로 시작하는 매물 주소 붙여넣기" maxLength={2000} /><small className="muted">네이버 부동산·직방 등에서 주소를 복사해 붙여넣으세요. 저장 후 카드와 비교표에서 원문을 새 탭으로 열 수 있어요.</small></Field></div>
      <div className="wide"><Field id="room-memo" label="메모" optional><textarea {...input('memo')} rows={3} maxLength={5000} placeholder="채광, 소음, 수납 등 직접 느낀 장단점을 기록해 보세요." /></Field></div>
    </div><div className="form-actions"><span className="muted">월 고정비 = 월세 + 관리비 · 보증금 제외</span><button type="button" onClick={onClose}>취소</button><button className="primary" type="submit">{initial ? '수정 저장' : '매물 저장'}</button></div></form>
  </section>;
}

export default function App() {
  const [loaded] = useState(readData);
  const [data, setData] = useState(loaded.data);
  const [readError, setReadError] = useState(loaded.error);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<{ room: Room | null } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [conditionDraft, setConditionDraft] = useState(conditionsDraft(data.conditions));
  const [conditionErrors, setConditionErrors] = useState<ReturnType<typeof validateConditions>>({});
  const [sort, setSort] = useState<Sort>('newest');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('sqm');
  const [selected, setSelected] = useState<string[]>([]);
  const examplesChecked = useRef(false);
  useEffect(() => {
    if (examplesChecked.current || loaded.error) return;
    examplesChecked.current = true;
    const upgraded = upgradeExamples(loaded.data);
    if (upgraded === loaded.data) return;
    const failure = writeData(upgraded);
    if (failure) { setError(`예시 업데이트: ${failure} ‘예시 매물 불러오기’로 다시 시도할 수 있습니다.`); return; }
    setData(upgraded);
    setNotice('가상 예시 6개와 비어 있던 준공연도를 업데이트했습니다. 기존에 입력한 정보는 유지됩니다.');
  }, [loaded]);
  useEffect(() => {
    if (error) document.querySelector('.error-banner')?.scrollIntoView({ block: 'center' });
  }, [error]);
  const conditionCount = conditionFields.filter(key => data.conditions[key] !== null).length;
  const rooms = visibleRooms(data, sort, onlyFavorites, onlyMatches && conditionCount > 0);
  const comparison = selected.flatMap(id => data.rooms.find(room => room.id === id) ?? []);
  function commit(next: Data, message: string) {
    setNotice('');
    if (readError && !window.confirm('기존 데이터를 읽지 못했습니다. 현재 화면의 데이터로 저장소를 새로 시작할까요? 손상된 기존 데이터는 대체됩니다.')) return false;
    const failure = writeData(next);
    if (failure) { setError(failure); return false; }
    setData(next); setReadError(undefined); setError(''); setNotice(message); return true;
  }
  function openEditor(room: Room | null) { opener.current = document.activeElement as HTMLElement; setEditor({ room }); }
  function closeEditor() { setEditor(null); requestAnimationFrame(() => opener.current?.focus()); }
  function select(id: string) {
    const result = toggleSelection(selected, id); setSelected(result.ids);
    if (result.error) { setError(result.error); setNotice(''); } else setError('');
  }
  function remove(room: Room) {
    if (!window.confirm(`‘${room.name}’ 매물을 삭제할까요? 삭제하면 되돌릴 수 없습니다.`)) return;
    if (commit({ ...data, rooms: data.rooms.filter(item => item.id !== room.id) }, '매물을 삭제했습니다.')) {
      setSelected(selected.filter(id => id !== room.id));
      if (editor?.room?.id === room.id) closeEditor();
    }
  }
  function saveConditions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const errors = validateConditions(conditionDraft); setConditionErrors(errors);
    if (Object.keys(errors).length) { const form = event.currentTarget; requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    commit({ ...data, conditions: parseConditions(conditionDraft) }, '비교 조건을 저장했습니다.');
  }
  return <>
    <header className="topbar"><div className="topbar-inner"><a className="brand" href="#main" aria-label="방기준 홈"><span className="brand-icon"><Icon /></span><span>방기준<small>내 기준으로 고르는 자취방</small></span></a><button className="primary" onClick={() => openEditor(null)}>＋ 매물 추가</button></div></header>
    <main id="main">
      <div className="intro"><div><p className="eyebrow">나의 첫 독립, 나다운 기준</p><h1>살고 싶은 방의 기준을 세워요.</h1><p>비용부터 통학시간까지, 눈여겨본 방을 한곳에 모아 비교하세요.</p></div><div className="intro-mark" aria-hidden="true"><Icon kind="compare" /></div></div>
      <div className="feedback" aria-live="polite" role="status">{notice && <p className="success">✓ {notice}</p>}</div>
      {(readError || error) && <div className="error-banner" role="alert">{readError && <p>{readError}</p>}{error && <p>{error}</p>}</div>}
      {editor && <RoomForm key={editor.room?.id ?? 'new'} initial={editor.room} onClose={closeEditor} onSave={room => {
        const next = editor.room ? data.rooms.map(item => item.id === room.id ? room : item) : [...data.rooms, room];
        if (commit({ ...data, rooms: next }, editor.room ? '수정 내용을 저장했습니다.' : '새 매물을 저장했습니다.')) { closeEditor(); return true; } return false;
      }} />}
      <section className="panel criteria" aria-labelledby="criteria-title"><div className="section-heading"><div className="heading-with-icon"><span className="section-number">01</span><div><h2 id="criteria-title">내 조건 설정</h2><p>나에게 중요한 조건만 입력하세요. 빈 항목은 비교에서 제외됩니다.</p></div></div><span className="badge">{conditionCount}개 조건 적용 중</span></div>
        <form onSubmit={saveConditions} noValidate><div className="criteria-grid">{conditionFields.map(key => <Field key={key} id={`condition-${key}`} label={conditionLabels[key].label} unit={conditionLabels[key].unit} error={conditionErrors[key]}><input id={`condition-${key}`} type="number" inputMode={key === 'maxCommute' || key === 'minBuiltYear' ? 'numeric' : 'decimal'} min={key === 'minBuiltYear' ? 1000 : 0} max={key === 'minBuiltYear' ? currentYear() : undefined} step={key === 'maxCommute' || key === 'minBuiltYear' ? '1' : 'any'} placeholder={key === 'minBuiltYear' ? '예: 2020' : '제한 없음'} value={conditionDraft[key]} onChange={event => setConditionDraft({ ...conditionDraft, [key]: event.target.value })} aria-invalid={!!conditionErrors[key]} aria-describedby={[conditionErrors[key] ? `condition-${key}-error` : '', key === 'minBuiltYear' ? 'built-year-hint' : ''].filter(Boolean).join(' ') || undefined} />{key === 'minBuiltYear' && <small className="muted" id="built-year-hint">입력한 연도 포함, 그 이후 준공한 방. 비우면 제한 없음.</small>}</Field>)}</div>
        <div className="criteria-bottom"><p><span aria-hidden="true">ⓘ</span> 월 고정비는 <strong>월세 + 관리비</strong>입니다. 보증금은 포함하지 않습니다.</p><div className="button-group"><button type="button" className="quiet" onClick={() => { setConditionDraft(conditionsDraft(data.conditions)); setConditionErrors({}); }}>저장된 조건 불러오기</button><button type="submit" className="primary">조건 저장</button></div></div></form>
      </section>
      <section className="listing" aria-labelledby="list-title"><div className="section-heading"><div className="heading-with-icon"><span className="section-number">02</span><h2 id="list-title">내가 모은 매물 <span className="count">{data.rooms.length}</span></h2></div><button className="quiet sample-button" onClick={() => {
        const next = addExamples(data.rooms);
        if (next === data.rooms && data.examplesVersion === 3) { setNotice('예시 매물이 이미 모두 등록되어 있습니다.'); return; }
        commit({ ...data, rooms: next, examplesVersion: 3 }, '가상 예시 6개를 불러오고 비어 있던 준공연도를 채웠습니다. 직접 입력한 매물과 수정 정보는 유지됩니다.');
      }}>예시 매물 불러오기 ↗</button></div>
      <div className="toolbar"><div className="filters"><label><input type="checkbox" checked={onlyFavorites} onChange={e => setOnlyFavorites(e.target.checked)} />관심 매물만</label><label className={!conditionCount ? 'disabled' : ''}><input type="checkbox" checked={onlyMatches && conditionCount > 0} disabled={!conditionCount} onChange={e => setOnlyMatches(e.target.checked)} />모든 조건 충족</label></div><label className="sort-label">정렬<select aria-label="매물 정렬" value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="newest">최신 등록순</option><option value="monthly">월 고정비 낮은 순</option><option value="commute">통학시간 짧은 순</option><option value="area">면적 넓은 순</option><option value="builtNewest">준공연도 최신순</option><option value="builtOldest">준공연도 오래된 순</option></select></label></div>
      <div className="building-controls"><div className="unit-controls" role="group" aria-label="면적 표시 단위"><span>면적 표시</span><button type="button" aria-pressed={areaUnit === 'sqm'} onClick={() => setAreaUnit('sqm')}>㎡</button><button type="button" aria-pressed={areaUnit === 'pyeong'} onClick={() => setAreaUnit('pyeong')}>평</button></div></div>
      <p className="filter-hint">면적 입력·조건 판정은 ㎡ 기준입니다. 1㎡ = 0.3025평이며, 평 표시는 소수 둘째 자리까지 반올림합니다.<br/>{currentYear()}년 기준 경과 연수 = 현재 연도 − 준공연도 · 준공한 해가 1년차입니다. 월·일은 반영하지 않습니다.</p>
      {!conditionCount && <p className="filter-hint">조건을 저장하면 ‘모든 조건 충족’ 필터를 사용할 수 있어요.</p>}
      {data.rooms.length === 0 ? <div className="empty panel"><span className="empty-icon"><Icon /></span><h3>첫 번째 방을 기록해 보세요</h3><p>마음에 든 매물의 숫자와 장단점을 모으면<br/>내게 맞는 선택이 조금 더 선명해져요.</p><button className="primary" onClick={() => openEditor(null)}>＋ 첫 매물 등록</button><p className="small">먼저 둘러보고 싶다면 ‘예시 매물 불러오기’를 눌러 주세요.</p></div> : rooms.length === 0 ? <div className="empty panel"><h3>필터에 맞는 매물이 없어요</h3><p>관심 표시와 저장한 조건을 확인해 주세요.</p><button onClick={() => { setOnlyFavorites(false); setOnlyMatches(false); }}>필터 해제</button></div> : <><p className="result-count">전체 {data.rooms.length}개 중 {rooms.length}개 표시 · 비교할 매물을 최대 3개 선택하세요.</p><div className="room-grid">{rooms.map(room => <article className={`room-card ${selected.includes(room.id) ? 'selected' : ''}`} key={room.id} aria-label={room.name}>
        <div className="card-top"><span className="location">{room.location || '위치 미입력'}</span><button className={`favorite ${room.favorite ? 'active' : ''}`} aria-label={`${room.name} 관심 표시`} aria-pressed={room.favorite} onClick={() => commit({ ...data, rooms: data.rooms.map(item => item.id === room.id ? { ...item, favorite: !item.favorite } : item) }, room.favorite ? '관심 표시를 해제했습니다.' : '관심 매물로 저장했습니다.')}>{room.favorite ? '♥' : '♡'}</button></div>
        <div className="room-title"><h3>{room.name}</h3>{room.example && <span className="example-tag">가상 예시</span>}</div>
        <div className="monthly"><span>월 고정비</span><p><strong>{format(monthlyCost(room))}</strong> 만 원</p><small>월세 {format(room.rent)} + 관리비 {format(room.fee)}만 원</small></div>
        <dl className="room-facts"><div><dt>보증금</dt><dd>{format(room.deposit)}<small>만 원</small></dd></div><div><dt>전용면적</dt><dd>{areaText(room.area, areaUnit)}</dd></div><div><dt>통학시간</dt><dd>{format(room.commute)}<small>분</small></dd></div></dl>
        <p className="building-info">{buildingText(room.builtYear)}</p>
        <ConditionStatus room={room} data={data} />
        {(room.floor || room.memo) && <div className="room-details">{room.floor && <span className="floor-tag">{room.floor}</span>}{room.memo && <p>{room.memo}</p>}</div>}
        <RoomLink room={room} onSave={link => commit({ ...data, rooms: data.rooms.map(item => item.id === room.id ? { ...item, link } : item) }, link ? '매물 링크를 저장했습니다.' : '매물 링크를 제거했습니다.')} />
        <div className="card-actions"><label><input type="checkbox" checked={selected.includes(room.id)} onChange={() => select(room.id)} />비교 선택</label><div><button className="quiet" onClick={() => openEditor(room)}>수정</button><button className="quiet delete" onClick={() => remove(room)}>삭제</button></div></div>
      </article>)}</div></>}
      <p className="sample-note">예시 매물은 비교 연습용 가상 데이터이며 실제 매물 정보가 아닙니다.</p></section>
      <section className="panel comparison" id="comparison" aria-labelledby="comparison-title"><div className="section-heading"><div className="heading-with-icon"><span className="section-number">03</span><div><h2 id="comparison-title">나란히 비교하기 <span className="count">{comparison.length}/3</span></h2><p>같은 항목을 나란히 보고, 나에게 중요한 차이를 찾아보세요.</p></div></div>{comparison.length > 0 && <button className="quiet" onClick={() => setSelected([])}>선택 모두 해제</button>}</div>
      {!comparison.length ? <div className="compare-empty"><Icon kind="compare" /><p>매물 카드에서 ‘비교 선택’을 눌러 주세요.</p></div> : <><p className="small muted">표가 잘리면 좌우로 스크롤하세요. 보증금은 월 고정비에 포함되지 않습니다.</p><div className="table-scroll" role="region" aria-label="선택 매물 비교표" tabIndex={0}><table><caption className="sr-only">선택한 매물의 비용, 면적, 통학시간과 조건 비교</caption><thead><tr><th scope="col">비교 항목</th>{comparison.map(room => <th scope="col" key={room.id}><span>{room.name}</span>{room.example && <small>가상 예시</small>}<button className="quiet" aria-label={`${room.name} 비교 해제`} onClick={() => select(room.id)}>선택 해제 ×</button></th>)}</tr></thead><tbody>
      {([
        ['위치', (r: Room) => r.location || '미입력'], ['보증금', (r: Room) => `${format(r.deposit)}만 원`],
        ['월세', (r: Room) => `${format(r.rent)}만 원`], ['관리비', (r: Room) => `${format(r.fee)}만 원`],
        ['월 고정비', (r: Room) => `${format(monthlyCost(r))}만 원`], ['전용면적', (r: Room) => areaText(r.area, areaUnit)],
        ['준공연도·건물 연차', (r: Room) => buildingText(r.builtYear)],
        ['통학시간', (r: Room) => `${format(r.commute)}분`], ['단층/복층', (r: Room) => r.floor || '미선택'], ['메모', (r: Room) => r.memo || '미입력'],
      ] as [string, (room: Room) => string][]).map(([label, value]) => <tr key={label} className={label === '월 고정비' ? 'highlight-row' : ''}><th scope="row">{label}</th>{comparison.map(room => <td key={room.id}>{value(room)}</td>)}</tr>)}
      <tr><th scope="row">조건 충족 여부</th>{comparison.map(room => <td key={room.id}><ConditionStatus room={room} data={data} /></td>)}</tr>
      <tr><th scope="row">매물 원문 링크</th>{comparison.map(room => <td key={room.id}><SavedRoomLink link={room.link} /></td>)}</tr>
      </tbody></table></div></>}
      </section>
      <footer><span className="footer-brand">방기준</span><p>데이터는 이 브라우저에 저장되며 다른 기기와 공유되지 않습니다.</p><span>선택의 기준은, 나에게.</span></footer>
    </main>
    {comparison.length > 0 && <div className="compare-dock"><span><strong>{comparison.length}개</strong> 매물 선택됨 <small>최대 3개</small></span><a className="primary button-link" href="#comparison">비교표 보기 ↓</a></div>}
  </>;
}

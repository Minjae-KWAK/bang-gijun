import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { linkLabel, validLink, type Room } from './domain';

export function SavedRoomLink({ link }: { link: string }) {
  if (!link) return <span className="muted">링크 미등록</span>;
  return <a className="saved-room-link" href={link} target="_blank" rel="noopener noreferrer" title={link}>{linkLabel(link)} ↗ <small>(새 탭)</small></a>;
}

export default function RoomLink({ room, onSave }: { room: Room; onSave: (link: string) => boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(room.link);
  const [error, setError] = useState('');
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setDraft(room.link); setError(''); }, [room.link]);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  function close() {
    setEditing(false); setDraft(room.link); setError('');
    requestAnimationFrame(() => trigger.current?.focus());
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const link = draft.trim();
    if (!validLink(link)) {
      setError('http:// 또는 https://로 시작하는 올바른 주소를 붙여넣어 주세요.');
      input.current?.focus(); return;
    }
    if (onSave(link)) close();
  }
  return <div className="room-link-panel">
    <div className="room-link-heading"><span>매물 원문</span><button type="button" className="quiet" ref={trigger} aria-expanded={editing} aria-controls={`${id}-form`} onClick={() => editing ? close() : setEditing(true)}>{editing ? '링크 편집 닫기' : room.link ? '링크 수정' : '＋ 링크 추가'}</button></div>
    <SavedRoomLink link={room.link} />
    {editing && <form id={`${id}-form`} className="link-editor" onSubmit={submit} noValidate onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}>
      <label htmlFor={id}>{room.name} 매물 링크</label>
      <input ref={input} id={id} type="url" inputMode="url" autoComplete="off" spellCheck={false} maxLength={2000} value={draft} onChange={event => { setDraft(event.target.value); setError(''); }} placeholder="https://로 시작하는 매물 주소 붙여넣기" aria-invalid={!!error} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} />
      <small id={`${id}-hint`}>네이버 부동산·직방 등의 매물 페이지에서 주소를 복사해 붙여넣으세요. 비워서 저장하면 링크를 제거합니다.</small>
      {error && <span id={`${id}-error`} className="field-error" role="alert">{error}</span>}
      <div className="link-actions"><button type="button" onClick={close}>취소</button><button type="submit" className="primary">링크 저장</button></div>
    </form>}
  </div>;
}

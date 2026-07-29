// 상황 시뮬레이션 녹음 다시 듣기 — 이 기기(IndexedDB)에 저장된 클립만 보여준다.
//
// 이 목록의 오디오는 서버에 존재하지 않는다. 그래서 다른 기기에서 같은 소리 지도를 열면
// 목록이 비는데, 그건 사라진 게 아니라 원래 그 기기에만 있는 것이다 — 문구로 정확히 구분한다.

import { useState, useEffect, useCallback } from 'react';
import { Mic, Play, Trash2, Smartphone, Loader2 } from 'lucide-react';
import {
  RecordingMeta, listClipsBySoundMap, getClipBlob, deleteClip, deleteClipsBySoundMap,
  isRecordingStoreSupported,
} from '../utils/recordingStore';

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export default function RecordingList({ soundMapId }: { soundMapId: string }) {
  const [clips, setClips] = useState<RecordingMeta[] | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const refresh = useCallback(() => {
    if (!isRecordingStoreSupported() || !soundMapId) { setClips([]); return; }
    void listClipsBySoundMap(soundMapId).then(setClips);
  }, [soundMapId]);

  useEffect(refresh, [refresh]);

  if (clips === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
        <Loader2 size={13} className="animate-spin" /> 녹음을 불러오는 중...
      </div>
    );
  }

  // 녹음을 켜지 않았거나 다른 기기에서 열었을 때 — 둘 다 정상 상태라 조용히 안내만 한다.
  if (clips.length === 0) return null;

  async function removeOne(id: string) {
    await deleteClip(id);
    setClips(prev => (prev ?? []).filter(c => c.id !== id));
  }

  async function removeAll() {
    await deleteClipsBySoundMap(soundMapId);
    setClips([]);
    setConfirmClearAll(false);
  }

  return (
    <div className="mt-4 pt-3 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
          <Mic size={12} /> 내 녹음 다시 듣기 ({clips.length})
        </p>
        <button
          onClick={() => setConfirmClearAll(true)}
          className="ml-auto text-[11px] text-gray-400 hover:text-red-500 transition-colors"
        >
          전체 삭제
        </button>
      </div>

      <p className="flex items-center gap-1 text-[11px] text-gray-400 mb-2.5">
        <Smartphone size={11} className="shrink-0" />
        이 기기에만 저장돼 있어요. 서버에는 올라가지 않아요.
      </p>

      <div className="space-y-2">
        {clips.map(c => (
          <ClipRow key={c.id} clip={c} onDelete={() => removeOne(c.id)} />
        ))}
      </div>

      {confirmClearAll && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmClearAll(false)}
        >
          <div className="w-full max-w-xs bg-white rounded-2xl p-5 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-800 mb-1">녹음을 모두 지울까요?</p>
            <p className="text-xs text-gray-400 mb-4">{clips.length}개가 이 기기에서 사라져요. 되돌릴 수 없어요.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmClearAll(false)}
                className="flex-1 rounded-xl py-2.5 text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={removeAll}
                className="flex-1 rounded-xl py-2.5 text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                모두 삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClipRow({ clip, onDelete }: { clip: RecordingMeta; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // objectURL 은 만든 만큼 반드시 해제한다 — 안 하면 Blob 이 메모리에 계속 남는다.
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function load() {
    if (url || loading) return;
    setLoading(true);
    const blob = await getClipBlob(clip.id);
    setLoading(false);
    if (blob) setUrl(URL.createObjectURL(blob));
  }

  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-700 break-keep">{clip.text}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {clip.scenarioLabel} · {formatDuration(clip.durationMs)}
          </p>
        </div>
        <button
          onClick={onDelete}
          className="shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1"
          aria-label="이 녹음 삭제"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Blob 은 눌렀을 때만 메모리에 올린다 — 목록을 열자마자 전부 로드하면 무겁다 */}
      {url ? (
        <audio src={url} controls preload="none" className="w-full mt-2 h-8" />
      ) : (
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 mt-2 text-[11px] font-medium text-teal-700 disabled:text-gray-400"
        >
          {loading
            ? <><Loader2 size={12} className="animate-spin" /> 불러오는 중</>
            : <><Play size={12} /> 들어보기</>}
        </button>
      )}
    </div>
  );
}

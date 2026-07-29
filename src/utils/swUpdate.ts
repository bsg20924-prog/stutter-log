// 서비스 워커 업데이트 처리.
//
// 문제: vite-plugin-pwa 가 자동 주입하는 registerSW.js 는 등록만 하고 끝난다.
// sw.js 에 skipWaiting/clientsClaim 이 있어 새 워커는 활성화되지만,
// **이미 열린 페이지는 옛 JS 를 계속 실행한다.**
// 그래서 배포해도 탭을 전부 닫기 전까지 옛 화면이 보이고,
// 홈 화면에 설치한 PWA 는 더 오래 남는다.
//
// ⚠️ 그렇다고 무조건 새로고침하면 안 된다.
// 소리 지도는 카드 28장의 응답을 메모리에만 들고 있어서,
// 20장째에 새로고침되면 진행이 통째로 날아간다.
// 그래서 검사 중에는 미뤄 두고, 끝난 뒤에 반영한다.

let reloadBlocked = false;
let updatePending = false;
let reloaded = false;
const listeners = new Set<(pending: boolean) => void>();

function notify() {
  for (const fn of listeners) fn(updatePending);
}

/** 업데이트 대기 상태 구독 (배너 표시용) */
export function onUpdatePending(fn: (pending: boolean) => void): () => void {
  listeners.add(fn);
  fn(updatePending);
  return () => { listeners.delete(fn); };
}

export function isUpdatePending(): boolean {
  return updatePending;
}

function doReload() {
  if (reloaded) return;
  reloaded = true;
  window.location.reload();
}

/**
 * 진행 중인 작업이 있어 새로고침을 미뤄야 할 때 true 로 잡는다.
 * false 로 풀 때 대기 중인 업데이트가 있으면 그때 반영한다.
 */
export function blockReload(blocked: boolean): void {
  reloadBlocked = blocked;
  if (!blocked && updatePending) doReload();
}

/** 사용자가 배너를 눌렀을 때 */
export function applyUpdateNow(): void {
  doReload();
}

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;   // 1시간

export function setupServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // dev 서버에서는 워커를 쓰지 않는다 (vite.config 의 devOptions.enabled = false).
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(reg => {
      const check = () => { void reg.update().catch(() => {}); };
      // 주기적으로, 그리고 탭으로 돌아올 때마다 새 버전을 확인한다.
      window.setInterval(check, UPDATE_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    }).catch(() => {
      // 등록 실패해도 앱은 그대로 동작한다 (오프라인 캐시만 없을 뿐).
    });
  });

  // 새 워커가 페이지를 넘겨받는 순간 = 새 버전이 준비된 순간.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    updatePending = true;
    if (reloadBlocked) {
      notify();   // 검사 중 — 배너만 띄우고 기다린다
      return;
    }
    doReload();
  });
}

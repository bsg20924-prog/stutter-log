// 홈 화면 설치 안내 한 줄. 이미 설치했거나 닫은 뒤에는 다시 뜨지 않는다.
//
// Chrome/Android 계열은 beforeinstallprompt 를 가로채 우리 UI 로 설치를 띄우고,
// iOS 사파리는 그 이벤트가 없어서 '공유 → 홈 화면에 추가' 안내로 대체한다.

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

const DISMISS_KEY = 'stutter_install_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS 사파리 전용 플래그
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isStandalone()) {
      setHidden(true);   // 이미 앱으로 실행 중
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();   // 브라우저 기본 배너 대신 이 한 줄로 안내한다
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setHidden(true);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (isIos()) setIosHint(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // 저장에 실패해도 이번 세션 동안은 숨긴다
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  }

  if (hidden || (!deferred && !iosHint)) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl bg-gray-100/80 px-3 py-2">
      <Download size={14} className="shrink-0 text-teal-600" />
      <p className="flex-1 min-w-0 text-[11px] text-gray-500 leading-snug">
        {deferred
          ? '홈 화면에 추가하면 앱처럼 바로 열 수 있어요.'
          : '공유 버튼 → ‘홈 화면에 추가’ 하면 앱처럼 쓸 수 있어요.'}
      </p>
      {deferred && (
        <button
          onClick={install}
          className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
        >
          설치
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="설치 안내 닫기"
        className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

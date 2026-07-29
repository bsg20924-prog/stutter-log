import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { setupServiceWorker } from './utils/swUpdate';

// 새 배포를 실제로 화면에 반영하기 위한 등록 (vite.config 의 injectRegister: null 과 짝)
setupServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

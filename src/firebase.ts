import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
// undefined 필드를 Firestore에 쓰려 하면 SDK가 에러를 던짐 — 무시하도록 설정
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// 이 계정만 접근을 허용한다. 반드시 firestore.rules 의 이메일과 동일하게 유지할 것.
export const OWNER_EMAIL = 'bsg20924@gmail.com';

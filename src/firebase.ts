import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDlXYfzhT2vEcwt5NfDmfUa48URnCUIvb8',
  authDomain: 'stutter-log.firebaseapp.com',
  projectId: 'stutter-log',
  storageBucket: 'stutter-log.firebasestorage.app',
  messagingSenderId: '884423395147',
  appId: '1:884423395147:web:5a09492801d02e24e40ace',
};

const app = initializeApp(firebaseConfig);
// undefined 필드를 Firestore에 쓰려 하면 SDK가 에러를 던짐 — 무시하도록 설정
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// 이 계정만 접근을 허용한다. 반드시 firestore.rules 의 이메일과 동일하게 유지할 것.
export const OWNER_EMAIL = 'bsg20924@gmail.com';

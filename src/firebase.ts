import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';

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

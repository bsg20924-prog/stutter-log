import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDlXYfzhT2vEcwt5NfDmfUa48URnCUIvb8',
  authDomain: 'stutter-log.firebaseapp.com',
  projectId: 'stutter-log',
  storageBucket: 'stutter-log.firebasestorage.app',
  messagingSenderId: '884423395147',
  appId: '1:884423395147:web:5a09492801d02e24e40ace',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

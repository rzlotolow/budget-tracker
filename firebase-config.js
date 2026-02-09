import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const firebaseConfig = {
   apiKey: "AIzaSyBNpinIRnongANtCDKtT2tAyE1IQhLpNiU",
   authDomain: "budget-tracker-ce396.firebaseapp.com",
   projectId: "budget-tracker-ce396",
   storageBucket: "budget-tracker-ce396.firebasestorage.app",
   messagingSenderId: "248018551442",
   appId: "1:248018551442:web:9c3395587d1ff7d7971c4b"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

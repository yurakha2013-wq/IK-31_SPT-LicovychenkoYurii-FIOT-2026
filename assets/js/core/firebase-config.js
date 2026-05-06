
import { initializeApp }       from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore }        from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyA2OHUZpaYuObF6zwZXcdSeO2EfE2WV0Ss",
    authDomain:        "siafutracker.firebaseapp.com",
    projectId:         "siafutracker",
    storageBucket:     "siafutracker.firebasestorage.app",
    messagingSenderId: "281604476235",
    appId:             "1:281604476235:web:5588abd4f202564cc06cce",
    measurementId:     "G-067TPRZ52Q"
};

const app = initializeApp(firebaseConfig);

export const auth          = getAuth(app);
export const db            = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();


// public/firebase-setup.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export async function authenticateAndLoadData() {
    return new Promise((resolve, reject) => {
        signInAnonymously(auth).catch((error) => {
            console.error("Firebase Auth Error:", error);
            reject(error);
        });

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log("Logged in anonymously with UID:", user.uid);
                
                const userDocRef = doc(db, "players", user.uid);
                const userDoc = await getDoc(userDocRef);
                
                let savedData = { money: 0, lockLevel: 1, animals: [] };
                
                if (userDoc.exists()) {
                    savedData = userDoc.data();
                } else {
                    // First time playing, create save file
                    await setDoc(userDocRef, savedData);
                }
                
                resolve({ uid: user.uid, savedData });
            }
        });
    });
}

export async function savePlayerData(uid, data) {
    const userDocRef = doc(db, "players", uid);
    await setDoc(userDocRef, data, { merge: true });
}

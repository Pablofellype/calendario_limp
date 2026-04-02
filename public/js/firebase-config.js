import { initializeApp } from "firebase/app";
import {
    getFirestore,
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    setDoc,
    doc,
    onSnapshot,
    query,
    orderBy,
    where,
    getDocs,
    getDoc,
    arrayUnion,
    arrayRemove,
    collectionGroup,
    deleteField
} from "firebase/firestore";
import {
    getAuth,
    signInWithEmailAndPassword,
    signInWithCustomToken,
    signInAnonymously,
    signOut,
    onAuthStateChanged
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBMpxNUHou-mXL4lvWhSHiMWbhRWBjqGZg",
  authDomain: "calendariosemanal-03.firebaseapp.com",
  projectId: "calendariosemanal-03",
  storageBucket: "calendariosemanal-03.firebasestorage.app",
  messagingSenderId: "407070112925",
  appId: "1:407070112925:web:9dc553f40dab5b05206874"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export {
    app,
    db,
    auth,
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    setDoc,
    doc,
    onSnapshot,
    query,
    orderBy,
    where,
    getDocs,
    getDoc,
    arrayUnion,
    arrayRemove,
    collectionGroup,
    deleteField,
    signInWithEmailAndPassword,
    signInWithCustomToken,
    signInAnonymously,
    signOut,
    onAuthStateChanged
};
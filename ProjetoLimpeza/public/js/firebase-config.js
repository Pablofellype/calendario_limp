
// Importa as funções que precisamos dos SDKs (Versão Modular via CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
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
    collectionGroup // <--- ADICIONADO AQUI: Essencial para ler as subpastas
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- SUA CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyBMpxNUHou-mXL4lvWhSHiMWbhRWBjqGZg",
  authDomain: "calendariosemanal-03.firebaseapp.com",
  projectId: "calendariosemanal-03",
  storageBucket: "calendariosemanal-03.firebasestorage.app",
  messagingSenderId: "407070112925",
  appId: "1:407070112925:web:9dc553f40dab5b05206874"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Exporta o banco de dados e as funções para o app.js usar
export { 
    db, auth, 
    collection, addDoc, updateDoc, deleteDoc, setDoc, doc, onSnapshot, query, orderBy, where, getDocs, getDoc, collectionGroup, // <--- EXPORTADO AQUI TAMBÉM
    signInWithEmailAndPassword, signOut, onAuthStateChanged
};

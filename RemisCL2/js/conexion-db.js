// Importamos las funciones necesarias desde la SDK oficial
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  doc, 
  updateDoc, 
  query, 
  where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Tu configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCq8khvyFBzjdWgwqcTd-z6F7LGU1LvIOM",
  authDomain: "remises-campo-largo.firebaseapp.com",
  projectId: "remises-campo-largo",
  storageBucket: "remises-campo-largo.firebasestorage.app",
  messagingSenderId: "350428174839",
  appId: "1:350428174839:web:ce0d250c8cf78d37ceb6f2"
};

// Inicializamos la app y la base de datos Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
setPersistence(auth, browserSessionPersistence);

// Exportamos las herramientas para usarlas en los otros JS
export { app, db, auth, collection, addDoc, onSnapshot, doc, updateDoc, query, where };
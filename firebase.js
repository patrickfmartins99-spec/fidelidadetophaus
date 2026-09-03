// firebase.js
// Módulo 2: Configuração e Conexão com o Firebase

import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, get, push, remove, runTransaction } from "firebase/database";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    setPersistence,             
    browserSessionPersistence   
} from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDZBx7Vrsdfh" + "gOGxbDyDHAkfOhRvNiIg0Q",
    authDomain: "fidelidadetophausnavega.firebaseapp.com",
    databaseURL: "https://fidelidadetophausnavega-default-rtdb.firebaseio.com",
    projectId: "fidelidadetophausnavega",
    storageBucket: "fidelidadetophausnavega.firebasestorage.app"
};

// Inicialização das Instâncias Principais[span_0](start_span)[span_0](end_span)
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Inicialização Correta do Segundo Firebase App utilizando a API Modular (v10.8.1)
const secondaryApp = initializeApp(firebaseConfig, "SecondaryAppInstance");
const authSecundario = getAuth(secondaryApp);

// ====== ADICIONAR NO FINAL DO ARQUIVO firebase.js ======
window.firebaseRunTransaction = runTransaction;

// ==========================================================================
// EXPOSIÇÃO GLOBAL (Para uso nos outros módulos sem quebrar a arquitetura)
// ==========================================================================
window.firebaseApp = app;
window.db = db;
window.auth = auth;
window.authSecundario = authSecundario;

// Expondo as funções do SDK do Firebase que são usadas pelo sistema[span_1](start_span)[span_1](end_span)
window.firebaseRef = ref;
window.firebaseSet = set;
window.firebaseOnValue = onValue;
window.firebaseGet = get;
window.firebasePush = push;
window.firebaseRemove = remove;
window.firebaseSignIn = signInWithEmailAndPassword;
window.firebaseCreateUser = createUserWithEmailAndPassword;
window.firebaseSignOut = signOut;
window.firebaseOnAuthStateChanged = onAuthStateChanged;
window.firebaseSetPersistence = setPersistence;
window.firebaseBrowserSessionPersistence = browserSessionPersistence;


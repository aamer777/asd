// firebase.js — تهيئة Firebase (يُحمَّل أولاً)
import { initializeApp }     from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth }           from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore }      from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const cfg = {
  apiKey:            "AIzaSyCCPmhcxaq7-xGqnUBNR1vsFRsIWQjwchU",
  authDomain:        "asdf-736d2.firebaseapp.com",
  projectId:         "asdf-736d2",
  messagingSenderId: "462090265735",
  appId:             "1:462090265735:web:5fc5eeb8295bcea1568422"
};

const _app = initializeApp(cfg);

export const auth = getAuth(_app);
export const db   = getFirestore(_app);

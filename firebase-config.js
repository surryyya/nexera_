// Firebase Configuration Module
// File: firebase-config.js

const firebaseConfig = {
  apiKey: "AIzaSyC7aB2vFqupi2r3LeSVjB9tj89J_d0HT6w",
  authDomain: "nexera-2k25.firebaseapp.com",
  databaseURL: "https://nexera-2k25-default-rtdb.firebaseio.com",
  projectId: "nexera-2k25",
  // storageBucket is REMOVED - we don't need it!
  messagingSenderId: "246085170414",
  appId: "1:246085170414:web:14c775da04367f97d0afff",
  measurementId: "G-SQZ34JMR1F"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Reference to database only
const db = firebase.database(); 
const auth = firebase.auth();

console.log('✅ Firebase initialized successfully');
console.log('📊 Database URL:', firebaseConfig.databaseURL);
console.log('🔐 Project ID:', firebaseConfig.projectId);
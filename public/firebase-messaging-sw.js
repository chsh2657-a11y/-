// Scripts for firebase and firebase messaging
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object
const firebaseConfig = {
  apiKey: "YOUR_API_KEY", // Replace with your actual config
  authDomain: "mobile-factory-9ea67.firebaseapp.com",
  projectId: "mobile-factory-9ea67",
  storageBucket: "mobile-factory-9ea67.appspot.com",
  messagingSenderId: "721848974536",
  appId: "1:721848974536:web:df5330c41f6c0d508f39fd",
  measurementId: "G-N8E1486HB5"
};

firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload
  );
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/icon-192x192.png", // Or your app's icon
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

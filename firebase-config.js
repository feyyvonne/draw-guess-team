export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export function isFirebaseConfigured(config = firebaseConfig) {
  return Boolean(
    config.apiKey &&
    config.authDomain &&
    config.databaseURL &&
    config.projectId &&
    config.appId
  );
}

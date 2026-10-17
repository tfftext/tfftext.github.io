// Firebase web-app configuration is public by design. It is not an admin secret.
// Replace these sample values with the settings from Firebase Console > Project settings.
export const firebaseConfig = {
  apiKey: "AIzaSyDUeCxyThMv9IcznLMv-1NRwrU2dstwOVE",
  authDomain: "freepage11.firebaseapp.com",
  projectId: "freepage11",
  storageBucket: "freepage11.firebasestorage.app",
  messagingSenderId: "981312859235",
  appId: "1:981312859235:web:8046579152409bd6a3dc56"

};

export const DEFAULT_SCHEMA = {
  schemaVersion: 1,
  questions: [
    { id: "full-name", label: "Full name", type: "short", required: true, enabled: true, options: [] },
    { id: "gender", label: "Gender", type: "select", required: false, enabled: true, options: ["Female", "Male", "Other", "Prefer not to say"] },
    { id: "contact-number", label: "Contact number", type: "phone", required: true, enabled: true, options: [] },
    { id: "email-address", label: "Email address", type: "email", required: false, enabled: true, options: [] },
    { id: "help-topic", label: "What would you like help with?", type: "select", required: true, enabled: true, options: ["Understanding my CIBIL score", "Reviewing my credit report", "Improving my credit profile", "Loan eligibility", "Something else"] },
    { id: "preferred-time", label: "Preferred time to contact you", type: "select", required: false, enabled: true, options: ["Morning", "Afternoon", "Evening", "Any time"] },
    { id: "additional-message", label: "Anything else you would like us to know?", type: "long", required: false, enabled: true, options: [] }
  ]
};

export function isFirebaseConfigured() {
  return [firebaseConfig.apiKey, firebaseConfig.projectId, firebaseConfig.appId]
    .every((value) => typeof value === "string" && value.length > 0 && !value.startsWith("YOUR_"));
}

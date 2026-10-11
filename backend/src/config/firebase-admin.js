import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let isMockMode = false;
let db = null;
let auth = null;

try {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    // Initialise with service account JSON file
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId
    });
    console.log('[Firebase Admin] Successfully initialized with service account file.');
  } else if (projectId && clientEmail && privateKey) {
    // Initialise with individual env vars
    // Replace literal escaped \n with actual newlines if present
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
      }),
      projectId
    });
    console.log('[Firebase Admin] Successfully initialized with environment credentials.');
    // No credentials provided (Using Supabase as primary database)
    console.warn('[Firebase Notice] Supabase is primary backend. Firebase Admin credentials omitted.');
    isMockMode = true;
  }

  if (!isMockMode) {
    db = admin.firestore();
    auth = admin.auth();
  }
} catch (error) {
  console.warn('[Firebase Notice] Supabase primary mode active. Firebase admin skipped:', error.message);
  isMockMode = true;
}

export { admin, db, auth, isMockMode };
export default admin;

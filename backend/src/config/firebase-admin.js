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
  } else {
    // No credentials provided
    if (process.env.ALLOW_DEV_MOCK_AUTH === 'true' || process.env.NODE_ENV !== 'production') {
      console.warn('------------------------------------------------------------');
      console.warn('[Firebase Admin Warning] No live Firebase Admin credentials provided.');
      console.warn('Running with Mock/Development fallback database.');
      console.warn('To connect live Firestore and Firebase Auth, see README.md.');
      console.warn('------------------------------------------------------------');
      isMockMode = true;
    } else {
      throw new Error('Firebase Admin credentials are required in production mode.');
    }
  }

  if (!isMockMode) {
    db = admin.firestore();
    auth = admin.auth();
  }
} catch (error) {
  console.error('[Firebase Admin Init Error]:', error.message);
  if (process.env.ALLOW_DEV_MOCK_AUTH === 'true' || process.env.NODE_ENV !== 'production') {
    console.warn('[Firebase Admin] Falling back to Mock/Development mode due to initialization error.');
    isMockMode = true;
  } else {
    throw error;
  }
}

export { admin, db, auth, isMockMode };
export default admin;

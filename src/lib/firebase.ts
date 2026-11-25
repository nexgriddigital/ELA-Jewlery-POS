import { getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function provisionStaffAuthAccount(
  email: string,
  authPassword: string,
  displayName: string
): Promise<{ status: 'created' | 'already_exists' | 'provider_disabled' | 'failed'; code?: string }> {
  try {
    const existingSecondary = getApps().find((a) => a.name === 'ela-staff-provisioner');
    const secondaryApp = existingSecondary || initializeApp(firebaseConfig, 'ela-staff-provisioner');
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, authPassword);
    if (displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
    await signOut(secondaryAuth);
    return { status: 'created' };
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'auth/email-already-in-use') {
      return { status: 'already_exists', code };
    }
    if (code === 'auth/operation-not-allowed') {
      return { status: 'provider_disabled', code };
    }
    return { status: 'failed', code };
  }
}

export async function checkCloudConnection(): Promise<{ reachable: boolean; detail: string }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { reachable: true, detail: 'Connected to shared ELA Jewelry cloud database.' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
      // Server responded and enforced security rules -> Cloud Firestore is live & reachable
      return { reachable: true, detail: 'Cloud database online and ready for terminal sign-in.' };
    }
    if (msg.includes('the client is offline')) {
      return { reachable: false, detail: 'Cloud offline — local terminal sign-in available.' };
    }
    return { reachable: true, detail: 'Cloud endpoint checked.' };
  }
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

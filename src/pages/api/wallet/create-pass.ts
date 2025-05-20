import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react'; // Corrected import for client-side usage, for API routes use next-auth/next
import type { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { google } from 'googleapis';
import { JWT as GoogleAuthJWT } from 'google-auth-library';
import jwt from 'jsonwebtoken'; // For signing the "Add to Wallet" JWT
import fs from 'fs'; // To read the service account key file

// --- Environment Variable Checks ---
const GOOGLE_WALLET_ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID;
const GOOGLE_APPLICATION_CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const WALLET_SERVICE_ACCOUNT_EMAIL = process.env.WALLET_SERVICE_ACCOUNT_EMAIL;
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL; // Used for JWT 'origins'

if (!GOOGLE_WALLET_ISSUER_ID) {
  console.error("FATAL: GOOGLE_WALLET_ISSUER_ID environment variable is not set.");
  // Potentially throw an error or handle this more gracefully in a real app startup
}
if (!GOOGLE_APPLICATION_CREDENTIALS_PATH) {
  console.error("FATAL: GOOGLE_APPLICATION_CREDENTIALS environment variable (path to key file) is not set.");
}
if (!WALLET_SERVICE_ACCOUNT_EMAIL) {
  console.error("FATAL: WALLET_SERVICE_ACCOUNT_EMAIL environment variable is not set.");
}
if (!NEXT_PUBLIC_APP_URL) {
  console.error("FATAL: NEXT_PUBLIC_APP_URL environment variable is not set (needed for JWT origins).");
}

// --- Configuration ---
const CLASS_SUFFIX = 'HackWesternUserPass'; // Ensure this matches your class definition
const CLASS_ID = `${GOOGLE_WALLET_ISSUER_ID}.${CLASS_SUFFIX}`;

// --- Response interface ---
interface ApiResponse {
  message?: string;
  error?: string;
  saveToWalletUrl?: string;
  passData?: any; // For debugging if needed, remove in production
}

// --- Helper to get service account credentials ---
let serviceAccountCreds: any;
if (GOOGLE_APPLICATION_CREDENTIALS_PATH) {
  try {
    const keyFileContent = fs.readFileSync(GOOGLE_APPLICATION_CREDENTIALS_PATH, 'utf-8');
    serviceAccountCreds = JSON.parse(keyFileContent);
  } catch (err) {
    console.error("Error reading or parsing service account key file:", err);
    serviceAccountCreds = null; // Ensure it's null if loading fails
  }
} else {
  serviceAccountCreds = null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // Check for critical missing env vars per request
  if (!GOOGLE_WALLET_ISSUER_ID || !serviceAccountCreds || !WALLET_SERVICE_ACCOUNT_EMAIL || !NEXT_PUBLIC_APP_URL) {
    return res.status(500).json({ error: 'Server configuration error: Missing critical environment variables.' });
  }

  try {
    // 1. User Authentication
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.sub || !token.email) {
      return res.status(401).json({ error: 'Unauthorized: No session or missing user details.' });
    }
    const userId = token.sub;
    const tokenEmail = token.email;

    // 2. Fetch User Data from Database
    const dbUserArray = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!dbUserArray || dbUserArray.length === 0) {
      return res.status(404).json({ error: 'User not found in database.' });
    }
    const dbUser = dbUserArray[0];

    const capitalize = (s: string | null | undefined) => {
      if (!s) return 'Attendee';
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    };
    const userName = dbUser.name || tokenEmail?.split('@')[0] || 'Valued Attendee';
    const userType = capitalize(dbUser.type as string);
    const userEmail = dbUser.email || tokenEmail;

    // 3. Initialize Google Wallet API Client
    const authClient = new GoogleAuthJWT({
      keyFile: GOOGLE_APPLICATION_CREDENTIALS_PATH, // Path to key file
      // Alternatively, if key is directly in an env var (not recommended for full JSON):
      // email: serviceAccountCreds.client_email,
      // key: serviceAccountCreds.private_key,
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
    });

    const walletClient = google.walletobjects({
      version: 'v1',
      auth: authClient,
    });

    // 4. Construct Generic Object Payload
    const objectSuffix = `${userId.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${Date.now()}`; // Sanitize userId for object ID
    const objectId = `${GOOGLE_WALLET_ISSUER_ID}.${objectSuffix}`;

    const genericObjectPayload = {
      id: objectId,
      classId: CLASS_ID,
      cardTitle: { defaultValue: { language: 'en-US', value: userName } },
      subheader: { defaultValue: { language: 'en-US', value: 'User Badge' } },
      header: { defaultValue: { language: 'en-US', value: 'HackWestern Attendee' } },
      textModulesData: [
        { id: 'user_email', header: 'Email', body: userEmail },
        { id: 'user_role', header: 'Role', body: userType },
      ],
      logo: {
        sourceUri: { uri: 'https://raw.githubusercontent.com/HackWestern/hackwestern.com/main/public/logo-filled.png' },
        contentDescription: { defaultValue: { language: 'en-US', value: 'HackWestern Logo' } },
      },
      heroImage: {
        sourceUri: { uri: 'https://images.unsplash.com/photo-1504805572947-34fad45a28aa?q=80&w=2070&auto=format&fit=crop' },
        contentDescription: { defaultValue: { language: 'en-US', value: 'HackWestern Event Banner' } },
      },
      hexBackgroundColor: '#800020',
      linksModuleData: {
        uris: [{ uri: 'https://hackwestern.com', description: 'Visit HackWestern', id: 'hackwestern_website' }],
      },
      // Barcode can be added here if needed, e.g., for check-in
      // barcode: { type: 'QR_CODE', value: `USER_ID:${userId}` },
    };

    // 5. Insert the Generic Object via Google Wallet API
    let createdObject;
    try {
      const response = await walletClient.genericobject.insert({
        requestBody: genericObjectPayload,
      });
      createdObject = response.data;
      console.log(`Generic object ${createdObject.id} created successfully.`);
    } catch (apiError: any) {
      console.error('Google Wallet API error during object insertion:', apiError.response?.data || apiError.message);
      // Check if the object already exists (common scenario during testing/re-runs)
      if (apiError.code === 409) { // HTTP 409 Conflict indicates object already exists
        console.log(`Object with ID ${genericObjectPayload.id} already exists. Attempting to retrieve it.`);
        try {
            const existingObjectResponse = await walletClient.genericobject.get({ resourceId: genericObjectPayload.id });
            createdObject = existingObjectResponse.data;
            console.log(`Retrieved existing object ${createdObject.id}.`);
        } catch (getError: any) {
            console.error('Error retrieving existing object:', getError.response?.data || getError.message);
            return res.status(500).json({ error: 'Failed to create or retrieve pass object.', message: apiError.response?.data?.error?.message || apiError.message });
        }
      } else {
        return res.status(500).json({ error: 'Failed to create pass object.', message: apiError.response?.data?.error?.message || apiError.message });
      }
    }
    
    if (!createdObject) {
        return res.status(500).json({ error: 'Pass object could not be created or retrieved.' });
    }

    // 6. Generate "Add to Google Wallet" JWT
    const claims = {
      iss: WALLET_SERVICE_ACCOUNT_EMAIL,
      aud: 'google',
      typ: 'savetowallet',
      origins: [NEXT_PUBLIC_APP_URL], // Your website origin
      payload: {
        genericObjects: [
          {
            id: createdObject.id, // Use the ID from the created/retrieved object
            classId: createdObject.classId,
          },
        ],
      },
    };

    // Ensure private_key is correctly formatted
    const privateKey = serviceAccountCreds.private_key.replace(/\\n/g, '\n');
    const signedJwt = jwt.sign(claims, privateKey, { algorithm: 'RS256' });
    const saveUrl = `https://pay.google.com/gp/v/save/${signedJwt}`;

    // 7. Return the Signed JWT
    res.status(200).json({ saveToWalletUrl: saveUrl });

  } catch (error: any) {
    console.error('Error in /api/wallet/create-pass:', error);
    const errorMessage = error.message || 'An unknown error occurred';
    res.status(500).json({ error: 'Internal Server Error', message: errorMessage });
  }
}

// Instructions for User (ensure these are accurate for your project setup):
// 1. Ensure `googleapis`, `google-auth-library`, `jsonwebtoken` are installed.
// 2. Set up environment variables in `.env.local` (or your hosting provider's settings):
//    NEXTAUTH_SECRET=your_strong_secret_here
//    GOOGLE_WALLET_ISSUER_ID=your_issuer_id
//    GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json
//    WALLET_SERVICE_ACCOUNT_EMAIL=your-service-account-email@your-project-id.iam.gserviceaccount.com
//    NEXT_PUBLIC_APP_URL=https://yourdomain.com (your frontend URL)
// 3. The `CLASS_SUFFIX` ('HackWesternUserPass') must match your GenericClass definition.
// 4. The service account needs "Wallet Object Editor" role and API access.
// 5. The Google Wallet API must be enabled for your Google Cloud Project.
// 6. Ensure your GenericClass (CLASS_ID) has been created and approved by Google if for public use.
//    For testing, 'DRAFT' status is okay if the service account email is a test account in Wallet Console.

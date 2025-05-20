const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
// !!! REPLACE WITH YOUR ACTUAL VALUES !!!
const ISSUER_ID = 'YOUR_ISSUER_ID'; // Replace with your Google Wallet Issuer ID
const CLASS_SUFFIX = 'HackWesternUserPass'; // Suffix for your class
const CLASS_ID = `${ISSUER_ID}.${CLASS_SUFFIX}`;
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, 'service-account-key.json'); // Replace with the actual path to your key file if different

const WALLET_API_SCOPES = ['https://www.googleapis.com/auth/wallet_object.issuer'];

// --- Helper function to authenticate ---
async function authenticate() {
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_KEY_PATH,
    scopes: WALLET_API_SCOPES,
  });
  return await auth.getClient();
}

// --- Main function to create the class ---
async function createGenericClass() {
  try {
    const authClient = await authenticate();
    const walletobjects = google.walletobjects({
      version: 'v1',
      auth: authClient,
    });

    // --- Generic Class Definition ---
    const genericClass = {
      id: CLASS_ID,
      classTemplateInfo: {
        cardTemplateOverride: {
          cardRowTemplateInfos: [
            {
              // Primarily for the user's name
              threeItems: {
                startItem: {
                  firstValue: {
                    fields: [
                      {
                        fieldPath: "object.cardTitle.defaultValue.value", // Will be populated by object
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
      cardTitle: { // This will be overridden by the object's specific data
        defaultValue: {
          language: 'en-US',
          value: 'User Full Name Placeholder', // Placeholder, object will provide actual
        },
      },
      header: { // Can also be used for prominent text like name
        defaultValue: {
          language: 'en-US',
          value: 'HackWestern Attendee', // General header
        },
      },
      subheader: { // Optional, e.g., for event name
          defaultValue: {
              language: 'en-US',
              value: 'User Badge'
          }
      },
      logo: {
        sourceUri: {
          uri: 'https://raw.githubusercontent.com/HackWestern/hackwestern.com/main/public/logo-filled.png', // !!! REPLACE with your actual logo URL !!!
        },
        contentDescription: {
          defaultValue: {
            language: 'en-US',
            value: 'HackWestern Logo',
          },
        },
      },
      issuerName: 'HackWestern', // !!! REPLACE if different !!!
      reviewStatus: 'DRAFT', // Or "UNDER_REVIEW" to submit for Google's approval
      hexBackgroundColor: '#800020', // Example: Maroon, replace with HackWestern brand color
      textModulesData: [
        {
          id: 'user_email',
          header: 'Email',
          body: 'user.email@example.com', // Placeholder, object will provide actual
          defaultValue: { // Default for the body if not overridden by object (less common for dynamic data)
            language: 'en-US',
            value: 'N/A'
          }
        },
        {
          id: 'user_role',
          header: 'Role',
          body: 'Attendee Role', // Placeholder, object will provide actual
          defaultValue: {
            language: 'en-US',
            value: 'N/A'
          }
        },
      ],
      // Optional: Add links, hero image, etc. as needed
      // See: https://developers.google.com/wallet/reference/rest/v1/genericclass
    };

    console.log('Attempting to create class with payload:');
    console.log(JSON.stringify(genericClass, null, 2));

    const response = await walletobjects.genericclass.insert({
      requestBody: genericClass,
    });

    console.log(`Class ${response.data.id} created successfully (or already exists if no error).`);
    console.log('Class details:', response.data);
    console.log(`\nIMPORTANT: The classId to use for creating objects is: ${response.data.id}`);
    console.log("If you set reviewStatus to 'DRAFT', this class is only usable for testing with your developer account.");
    console.log("To make it publicly available, set reviewStatus to 'UNDER_REVIEW', then it must be approved by Google.");

  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      console.error('Error creating class:');
      console.error(JSON.stringify(error.response.data.error, null, 2));
      if (error.response.data.error.message.includes("already exists")) {
         console.warn(`\nWarning: Class with ID ${CLASS_ID} already exists. If you need to update it, use the .update() or .patch() method after fetching the existing class.`);
         console.log(`You can manage your classes here: https://pay.google.com/gp/m/issuer/${ISSUER_ID}`);
      }
    } else {
      console.error('An unexpected error occurred:', error.message || error);
    }
  }
}

// --- Run the script ---
createGenericClass();

import { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Head from 'next/head';
import { Button } from '@/components/ui/button';
// Ensure you have installed @google-pay/wallet-component-react
// npm install @google-pay/wallet-component-react
import GooglePayButton from '@google-pay/wallet-component-react';

interface ApiWalletResponse {
  saveToWalletUrl?: string;
  message?: string; // For errors or other info
  error?: string; // Explicit error message
}

const WalletPassPage = () => {
  const { data: session, status } = useSession();
  const [saveToWalletUrl, setSaveToWalletUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGeneratePass = async () => {
    setIsLoading(true);
    setError(null);
    setSaveToWalletUrl(null);

    try {
      const response = await fetch('/api/wallet/create-pass', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data: ApiWalletResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || `Error: ${response.status}`);
      }

      if (data.saveToWalletUrl) {
        setSaveToWalletUrl(data.saveToWalletUrl);
      } else {
        throw new Error('Save to Wallet URL not found in API response.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errorMessage);
      console.error('Error generating wallet pass:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p>Loading session...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen p-4 text-center">
        <Head>
          <title>Access Denied | HackWestern Pass</title>
        </Head>
        <h1 className="text-2xl font-semibold mb-4">Access Denied</h1>
        <p className="mb-6">Please sign in to generate your HackWestern digital pass.</p>
        <Button onClick={() => signIn()}>Sign In</Button>
      </div>
    );
  }

  // Note for developers: The JWT 'origins' claim, configured in the backend API
  // (via NEXT_PUBLIC_APP_URL), must match the domain where this Next.js page is hosted
  // for the "Add to Google Wallet" button to function correctly.
  return (
    <>
      <Head>
        <title>Your HackWestern Digital Pass</title>
        <meta name="description" content="Generate your personalized HackWestern Google Wallet pass." />
      </Head>
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl font-bold mb-6">Your HackWestern Digital Pass</h1>
          
          {saveToWalletUrl ? (
            <div className="mt-8 flex flex-col items-center">
              <p className="mb-6 text-lg text-gray-700 dark:text-gray-300">
                Your pass is ready! Click the button below to add it to your Google Wallet.
              </p>
              <GooglePayButton
                jwt={saveToWalletUrl.substring(saveToWalletUrl.lastIndexOf('/') + 1)}
                buttonType="add" // Standard "Add to Google Wallet" button
                buttonTheme="dark" // Or "light"
                buttonSizeMode="fill" // Or "static"
                buttonLocale="en" // Optional: defaults based on user's browser
                onLoadPaymentData={() => { /* Optional: Handle successful addition if needed */ }}
                onError={(err: any) => {
                  console.error('GooglePayButton error:', err);
                  setError(`Error adding to wallet: ${err.message || err.statusCode || 'Unknown error'}`);
                }}
                className="w-full max-w-xs" // Adjust styling as needed
              />
               <Button 
                variant="outline" 
                onClick={() => {
                  setSaveToWalletUrl(null); // Allow generating a new pass
                  setError(null); // Clear previous errors
                }} 
                className="mt-6"
              >
                Generate New Pass
              </Button>
            </div>
          ) : (
            <>
              <p className="mb-8 text-lg text-gray-700 dark:text-gray-300">
                Get your personalized digital pass for HackWestern! Click the button below to generate your pass.
              </p>
              <Button
                onClick={handleGeneratePass}
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? 'Generating...' : 'Generate My Wallet Pass'}
              </Button>
            </>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-100 text-red-700 border border-red-300 rounded-md">
              <p className="font-semibold">Error:</p>
              <p>{error}</p>
            </div>
          )}

           {!isLoading && !saveToWalletUrl && !error && (
            <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg shadow-sm text-left">
                <p className="text-blue-700 dark:text-blue-300">Click the "Generate My Wallet Pass" button to get started.</p>
            </div>
           )}
        </div>
      </main>
    </>
  );
};

export default WalletPassPage;

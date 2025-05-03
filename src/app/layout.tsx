import type {Metadata} from 'next';
// Removed Inter font import to resolve build error
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

// Removed font initialization

export const metadata: Metadata = {
  title: 'AI-ssistant', // Updated title
  description: 'Your comprehensive AI assistant', // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Removed font variable application from body */}
      <body className={`antialiased`}>
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}

import type {Metadata} from 'next';
import { Inter } from 'next/font/google'; // Import a standard Google Font
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

// Initialize the Inter font
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter', // Use a variable name for the font
});

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
      {/* Apply the font variable to the body */}
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}

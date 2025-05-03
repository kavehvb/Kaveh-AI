import type {Metadata} from 'next';
// Removed Inter font import to resolve build error
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster
import { Vazirmatn } from 'next/font/google' // Import Vazirmatn font

// Initialize Vazirmatn font with subsets needed
const vazirmatn = Vazirmatn({
  subsets: ['latin', 'arabic'], // Include Arabic subset for Persian characters
  display: 'swap', // Font display strategy
  variable: '--font-vazirmatn', // Optional: if you want to use it as a CSS variable
})

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
    // Apply Vazirmatn font class to the html tag
    <html lang="en" className={vazirmatn.className}>
      {/* Removed font variable application from body */}
      <body className={`antialiased`}>
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}

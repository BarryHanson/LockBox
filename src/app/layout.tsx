import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { RoleProvider } from "@/lib/context/role-context";
import { TwoFactorProvider } from "@/components/TwoFactorProvider";
import AppInitializer from "../components/AppInitializer";

// Remove the function call and use GeistSans directly
export const metadata: Metadata = {
  title: "ByteLock | Secure End-to-End Encrypted Password Manager",
  description: "Protect your passwords, cards, and sensitive data with military-grade end-to-end encryption.",
  keywords: ["password manager", "end-to-end encryption", "secure vault", "card storage", "privacy", "data protection"],
  icons: {
    icon: "/transparent_logo_no_text.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={GeistSans.variable}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            disableTransitionOnChange
          >
            <RoleProvider>
              <TwoFactorProvider>
                <AppInitializer>
                  {children}
                </AppInitializer>
              </TwoFactorProvider>
            </RoleProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
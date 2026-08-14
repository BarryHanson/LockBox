import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export const dynamic = 'force-dynamic';

const HIBP_API_KEY = process.env.HIBP_API_KEY;
const HIBP_API_URL = "https://haveibeenpwned.com/api/v3";

interface Breach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  AddedDate: string;
  ModifiedDate: string;
  PwnCount: number;
  Description: string;
  LogoPath: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsFabricated: boolean;
  IsSensitive: boolean;
  IsRetired: boolean;
  IsSpamList: boolean;
  IsMalware: boolean;
  IsStealerLog: boolean;
  IsSubscriptionFree: boolean;
}

interface Paste {
  Source: string;
  Id: string;
  Title: string;
  Date: string;
  EmailCount: number;
}

interface Stats {
  totalBreaches: number;
  totalPastes: number;
  compromisedEmails: number;
  totalEmails: number;
  safeEmails: number;
}

export async function GET() {
  try {
    const token = cookies().get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get user's email addresses
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get all passwords for user
    const passwords = await prisma.password.findMany({
      where: { userId },
      select: { username: true },
    });

    // Combine all email addresses (user's email + password usernames that look like emails)
    const emailAddresses = new Set([
      user.email,
      ...passwords
        .map((p) => p.username ?? '')
        .filter((username) => username.includes("@")),
    ]);

    if (!HIBP_API_KEY) {
      return NextResponse.json(
        { error: "HIBP API key not configured" },
        { status: 500 }
      );
    }

    // Query HIBP API for each email - first collect all breach data, then collect paste data
    // This two-phase approach ensures we don't lose breach data when pastes are processed
    
    // Phase 1: Get all breach data
    const breachResults = await Promise.all(
      Array.from(emailAddresses).map(async (email) => {
        try {
          // Breaches
          const breachesResponse = await fetch(
            `${HIBP_API_URL}/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
            {
              headers: {
                "hibp-api-key": HIBP_API_KEY,
                "user-agent": "SafeHouse-Privacy-Scanner",
              },
            }
          );

          let breaches: Breach[] = [];
          if (breachesResponse.ok) {
            const text = await breachesResponse.text();
            try {
              breaches = text ? JSON.parse(text) : [];
            } catch (e) {
              console.error(`Invalid JSON from HIBP API for ${email}:`, e);
            }
          } else if (breachesResponse.status !== 404) {
            console.error(
              `HIBP API error for ${email}:`,
              breachesResponse.status
            );
          }

          // Add minimal delay to respect rate limiting (0.8s between requests)
          await new Promise((resolve) => setTimeout(resolve, 800));

          // If we got rate limited, implement proper retry with exponential backoff
          if (breachesResponse.status === 429) {
            console.log(`Rate limited for ${email}, implementing retry with backoff...`);
            
            // Initialize retry variables
            let breachRetries = 0;
            const maxBreachRetries = 3;
            const breachRetryDelay = 2000; // ms
            
            // Try with exponential backoff
            while (breachRetries < maxBreachRetries) {
              breachRetries++;
              const backoffDelay = breachRetryDelay * Math.pow(2, breachRetries - 1);
              console.log(`Waiting ${backoffDelay}ms before breach retry ${breachRetries}/${maxBreachRetries} for ${email}`);
              
              await new Promise((resolve) => setTimeout(resolve, backoffDelay));
              
              const retryResponse = await fetch(
                `${HIBP_API_URL}/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
                {
                  headers: {
                    "hibp-api-key": HIBP_API_KEY,
                    "user-agent": "SafeHouse-Privacy-Scanner",
                  },
                }
              );
              
              if (retryResponse.ok) {
                const text = await retryResponse.text();
                try {
                  breaches = text ? JSON.parse(text) : [];
                  console.log(`Successfully retrieved ${breaches.length} breaches for ${email} after retry`);
                  break; // Exit retry loop on success
                } catch (e) {
                  console.error(`Invalid JSON from HIBP API retry for ${email}:`, e);
                }
              } else if (retryResponse.status !== 429) {
                console.log(`Non-rate-limit error on retry for ${email}: ${retryResponse.status}`);
                break; // Exit retry loop on non-rate-limit error
              }
              
              // If we're still rate limited and have more retries, continue the loop
              if (retryResponse.status === 429 && breachRetries < maxBreachRetries) {
                console.log(`Still rate limited on retry ${breachRetries} for ${email}, continuing...`);
                continue;
              }
            }
            
            if (breachRetries >= maxBreachRetries) {
              console.log(`Max breach retries reached for ${email}`);
            }
          }
          
          console.log(`Phase 1: Found ${breaches.length} breaches for ${email}`);
          if (breaches.length > 0) {
            console.log(`Phase 1: Breach names:`, breaches.map(b => b.Name).join(', '));
          }
          return {
            email,
            breaches,
          };
        } catch (error) {
          console.error(`Error checking breaches for ${email}:`, error);
          return {
            email,
            breaches: [],
          };
        }
      })
    );
    
    // Phase 2: Get paste data and combine with breach data
    const results = await Promise.all(
      breachResults.map(async ({ email, breaches }) => {
        try {
          // Add a delay before checking pastes to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
          
          // Initialize retries for paste checking
          let pasteRetries = 0;
          const maxPasteRetries = 3;
          const pasteRetryDelay = 1500; // ms
          let pastes: Paste[] = [];
          
          // Try to get pastes with retry logic
          while (true) {
            const pastesResponse = await fetch(
              `${HIBP_API_URL}/pasteaccount/${encodeURIComponent(email)}`,
              {
                headers: {
                  "hibp-api-key": HIBP_API_KEY,
                  "user-agent": "SafeHouse-Privacy-Scanner",
                },
              }
            );
            
            // Handle rate limiting with exponential backoff
            if (pastesResponse.status === 429) {
              console.log(`Rate limited when checking pastes for ${email}, retrying...`);
              pasteRetries++;
              
              if (pasteRetries <= maxPasteRetries) {
                // Exponential backoff for retries
                const backoffDelay = pasteRetryDelay * Math.pow(2, pasteRetries - 1);
                console.log(`Waiting ${backoffDelay}ms before retry ${pasteRetries}/${maxPasteRetries}`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
                continue;
              } else {
                console.log(`Max retries reached for ${email} pastes check`);
                break; // Exit the retry loop with empty pastes array
              }
            } else if (pastesResponse.ok) {
              // Successfully got pastes
              const text = await pastesResponse.text();
              try {
                pastes = text ? JSON.parse(text) : [];
                break; // Exit the retry loop with the pastes we found
              } catch (e) {
                console.error(`Invalid JSON from HIBP API for ${email} pastes:`, e);
                break; // Exit the retry loop with empty pastes array
              }
            } else {
              // Some other error occurred
              console.log(`Error checking pastes for ${email}: ${pastesResponse.status}`);
              break; // Exit the retry loop with empty pastes array
            }
          }
          console.log(`Phase 2: Processing ${email}: received ${breaches.length} breaches from phase 1`);
          if (breaches.length > 0) {
            console.log(`Phase 2: Breach names for ${email}:`, breaches.map(b => b.Name).join(', '));
          }
          console.log(`Phase 2: Found ${pastes.length} pastes for ${email}`);
          
          // Create a new breaches array to avoid reference issues
          const finalBreaches = [...breaches];
          console.log(`Phase 2: Final result for ${email}: ${finalBreaches.length} breaches and ${pastes.length} pastes`);

          return {
            email,
            breaches: finalBreaches,  // Use the copied array to avoid reference issues
            pastes,
          };
        } catch (error) {
          console.error(`Error checking pastes for ${email}:`, error);
          // Return the breaches we found earlier even if paste check fails
          // Create a new breaches array to avoid reference issues
          const finalBreaches = [...breaches];
          console.log(`Phase 2 (error recovery): Preserving ${finalBreaches.length} breaches for ${email}`);
          return {
            email,
            breaches: finalBreaches,
            pastes: []
          };
        }
      })
    );

    // Calculate statistics
    const stats: Stats = {
      totalBreaches: 0,
      totalPastes: 0,
      compromisedEmails: 0,
      totalEmails: emailAddresses.size,
      safeEmails: 0
    };

    // Process each result
    for (const result of results) {
      // Count all results since we've removed the error field
      const hasBreaches = (result.breaches?.length || 0) > 0;
      const hasPastes = (result.pastes?.length || 0) > 0;
      
      stats.totalBreaches += result.breaches?.length || 0;
      stats.totalPastes += result.pastes?.length || 0;
      
      if (hasBreaches || hasPastes) {
        stats.compromisedEmails++;
      }
    }

    // Calculate safe emails (those without breaches or pastes)
    stats.safeEmails = stats.totalEmails - stats.compromisedEmails;

    return NextResponse.json({ results, stats });
  } catch (error) {
    console.error("Privacy scan error:", error);
    return NextResponse.json(
      { error: "Failed to run privacy scan" },
      { status: 500 }
    );
  }
}

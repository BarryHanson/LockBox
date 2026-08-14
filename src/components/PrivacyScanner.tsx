import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import DOMPurify from 'dompurify';

interface Breach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  AddedDate: string;
  ModifiedDate: string;
  Description: string;
  DataClasses?: string[];
  PwnCount: number;
}

interface Paste {
  Source: string;
  Id: string;
  Title?: string;
  Date?: string;
  EmailCount: number;
}

interface ScanResult {
  email: string;
  breaches: Breach[];
  pastes: Paste[];
}

interface ScanStats {
  totalBreaches: number;
  totalPastes: number;
  totalEmails: number;
  compromisedEmails: number;
  safeEmails: number;
}

interface ScanResult {
  email: string;
  breaches: Breach[];
  pastes: Paste[];
}

export function PrivacyScanner() {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [showPastes, setShowPastes] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [breachPages, setBreachPages] = useState<Record<string, number>>({});
  const [lastScanTime, setLastScanTime] = useState<number | null>(null);

  const itemsPerPage = 10;

  // Auto-scan only once when component first mounts
  useEffect(() => {
    // Only scan if we don't have results yet AND no scan has been performed
    // This prevents rescanning if the component remounts but we already have data
    if (results.length === 0 && !lastScanTime) {
      console.log('Initial mount - performing first scan');
      handleScan();
    } else {
      console.log('Component mounted but scan not needed - using existing results');
    }
  }, []);

  // Reset page when new results come in
  useEffect(() => {
    setCurrentPage(1);
  }, [results]);

  useEffect(() => {
    const initialPages: Record<string, number> = {};
    results.forEach(result => {
      initialPages[result.email] = 1;
    });
    setBreachPages(initialPages);
  }, [results]);

  const totalPages = Math.ceil(results.length / itemsPerPage);
  const currentResults = results.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleScan = async () => {
    try {
      setScanning(true);
      setError(null);
      
      // Store current results before making a new request to ensure we can restore them if needed
      const previousResults = [...results];
      const previousStats = stats ? {...stats} : null;
      console.log('Backing up existing results before scan:', previousResults.length, 'emails');

      const response = await fetch('/api/privacy-scan', {
        method: 'GET',
        credentials: 'include'
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        console.error('Failed to parse response:', e);
        // Restore previous results on parse error
        if (previousResults.length > 0) {
          console.log('Restoring previous results after parse error');
          return; // Keep existing results and exit
        }
        throw new Error('Invalid response from server');
      }

      // Handle various error conditions while preserving existing data
      if (!response.ok || !data) {
        // If we get any error and have existing results, preserve them
        if (previousResults.length > 0) {
          console.log(`Error ${response.status} received, but preserving ${previousResults.length} existing results`);
          setError(`Error: ${data?.error || response.statusText || response.status}. Previous results preserved.`);
          return; // Exit early to keep existing results
        }
        throw new Error(data?.error || `Failed to perform scan (${response.status})`);
      }

      if (!data.results || !Array.isArray(data.results)) {
        // If invalid format but we have previous results, keep them
        if (previousResults.length > 0) {
          console.log('Invalid result format received, preserving previous results');
          setError('Invalid data received. Previous results preserved.');
          return; // Keep existing results and exit
        }
        throw new Error('Invalid scan results format');
      }
      
      // Verify the new results have actual breach/paste data before replacing existing results
      const newTotalBreaches = data.results.reduce((sum: number, result: ScanResult) => sum + (result.breaches?.length || 0), 0);
      const newTotalPastes = data.results.reduce((sum: number, result: ScanResult) => sum + (result.pastes?.length || 0), 0);
      
      // If new results have no breaches but previous results did, something might be wrong
      if (newTotalBreaches === 0 && 
          previousResults.length > 0 && 
          previousResults.some(result => (result.breaches?.length || 0) > 0)) {
        console.log('WARNING: New scan returned 0 breaches but previous scan had breaches - preserving previous results');
        setError('New scan returned incomplete data. Previous results preserved.');
        return; // Keep existing results with more data
      }

      // Process the results
      console.log('Received scan results:', data.results.length, 'emails checked');
      
      // Log detailed information about each result
      data.results.forEach((result: ScanResult, index: number) => {
        console.log(`Email ${index + 1}: ${result.email}`);
        console.log(`  Breaches: ${result.breaches?.length || 0}`, result.breaches);
        console.log(`  Pastes: ${result.pastes?.length || 0}`, result.pastes);
      });
      
      // Count total breaches and pastes for logging
      const totalBreaches = data.results.reduce((sum: number, result: ScanResult) => 
        sum + (result.breaches?.length || 0), 0);
      const totalPastes = data.results.reduce((sum: number, result: ScanResult) => 
        sum + (result.pastes?.length || 0), 0);
      
      console.log(`Total findings: ${totalBreaches} breaches and ${totalPastes} pastes`);
      
      // Make a deep copy of the results to avoid reference issues
      const deepCopyResults = JSON.parse(JSON.stringify(data.results));
      console.log('Deep copied results:', deepCopyResults);
      
      // Update state with the deep copied results
      setResults(deepCopyResults);
      setStats(data.stats);
      setLastScanTime(Date.now());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to perform scan');
    } finally {
      setScanning(false);
    }
  };

  // Calculate percentage for the gauge
  const compromisedPercentage = stats ? (stats.compromisedEmails / stats.totalEmails) * 100 : 0;
  const safePercentage = stats ? (stats.safeEmails / stats.totalEmails) * 100 : 0;



  return (
    <div className="space-y-6 relative">
      {scanning && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 bg-background/90 p-6 rounded-xl shadow-lg border border-orange-500/20">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 h-full w-full rounded-full border-2 border-orange-500/30"></div>
              <div className="absolute inset-0 h-full w-full rounded-full border-t-2 border-orange-500 animate-spin"></div>
              <div className="absolute inset-1 h-8 w-8 rounded-full border-r-2 border-orange-500/70 animate-spin animate-reverse"></div>
            </div>
            <p className="text-sm font-medium text-foreground">Scanning for breaches</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Privacy Scanner</h3>
          <p className="text-sm text-muted-foreground">
            Check if your email has been involved in any data breaches
          </p>
        </div>
        <div className="flex gap-4">
          {lastScanTime && (
            <p className="text-xs text-muted-foreground self-center">
              Last updated: {new Date(lastScanTime).toLocaleTimeString()}
            </p>
          )}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 font-medium"
          >
            {scanning ? 'Scanning...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          {error}
        </div>
      )}

      <div className="relative h-[200px] w-[400px] mx-auto">
        {/* Semi-circular gauge background */}
        <svg
          viewBox="0 0 200 100"
          className="absolute inset-0 w-full h-full"
        >
          {/* Background arc */}
          <path
            d="M20 100 A80 80 0 0 1 180 100"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="20"
            strokeLinecap="round"
          />
          
          {/* Compromised accounts arc (red) */}
          <motion.path
            d="M20 100 A80 80 0 0 1 180 100"
            fill="none"
            stroke="#ef4444"
            strokeWidth="20"
            strokeLinecap="round"
            strokeDasharray="251.2"
            strokeDashoffset={251.2 * (1 - compromisedPercentage / 100)}
            initial={{ strokeDashoffset: 251.2 }}
            animate={{ strokeDashoffset: 251.2 * (1 - compromisedPercentage / 100) }}
            transition={{ duration: 1, ease: "easeOut" }}
          />

          {/* Safe accounts arc (orange) */}
          <motion.path
            d="M20 100 A80 80 0 0 1 180 100"
            fill="none"
            stroke="#f97316"
            strokeWidth="20"
            strokeLinecap="round"
            strokeDasharray="251.2"
            strokeDashoffset={251.2 * (1 - safePercentage / 100)}
            initial={{ strokeDashoffset: 251.2 }}
            animate={{ strokeDashoffset: 251.2 * (1 - safePercentage / 100) }}
            transition={{ duration: 1, ease: "easeOut" }}
          />

          {/* Center text */}
          {stats && (
            <>
              <text
                x="100"
                y="70"
                textAnchor="middle"
                className="text-4xl font-bold"
                fill="currentColor"
              >
                {stats.compromisedEmails}
              </text>
              <text
                x="100"
                y="85"
                textAnchor="middle"
                className="text-sm"
                fill="currentColor"
              >
                of {stats.totalEmails} emails
              </text>
              <text
                x="100"
                y="100"
                textAnchor="middle"
                className="text-sm"
                fill="currentColor"
              >
                compromised
              </text>
            </>
          )}
        </svg>
      </div>

      {results.length > 0 && (
        <div className="space-y-6">
          {currentResults.map(({ email, breaches, pastes }) => (
            <div key={email} className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                  {email}
                  <span className={`text-sm px-2 py-1 rounded-full ${
                    breaches.length > 0 || pastes.length > 0
                      ? 'bg-destructive/10 text-destructive' 
                      : 'bg-green-500/10 text-green-500'
                  }`}>
                    {breaches.length > 0 || pastes.length > 0 ? 
                      `${breaches.length} breaches, ${pastes.length} pastes` : 
                      'Safe'}
                  </span>
                </h4>
                {pastes.length > 0 && (
                  <button
                    onClick={() => setShowPastes(prev => ({ ...prev, [email]: !prev[email] }))}
                    className="text-sm text-orange-500 hover:text-orange-600 transition-colors font-medium"
                  >
                    {showPastes[email] ? 'Hide' : 'Show'} Paste Details
                  </button>
                )}
              </div>
              
              <div className="space-y-4">
                {/* Breaches section */}
                <div className="space-y-2">
                  <h5 className="text-sm font-medium text-orange-500">Breaches ({breaches.length})</h5>
                  {breaches.length > 0 ? (
                    <>
                      {breaches
                        .slice(
                          (breachPages[email] - 1) * itemsPerPage,
                          breachPages[email] * itemsPerPage
                        )
                        .map((breach) => (
                          <div key={breach.Name} className="space-y-3 p-4 bg-muted/50 rounded-lg border border-orange-500/20">
                            <div className="flex items-center justify-between">
                              <h5 className="font-medium flex items-center gap-2 text-orange-500">
                                <a 
                                  href={`https://haveibeenpwned.com/Breach/${breach.Name}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline hover:text-orange-600 transition-colors flex items-center gap-1"
                                >
                                  {breach.Title || breach.Name}
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                    <polyline points="15 3 21 3 21 9"></polyline>
                                    <line x1="10" y1="14" x2="21" y2="3"></line>
                                  </svg>
                                </a>
                                {breach.PwnCount !== undefined && (
                                  <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">
                                    {breach.PwnCount.toLocaleString()} accounts affected
                                  </span>
                                )}
                              </h5>
                              {breach.BreachDate && (
                                <div className="flex flex-col items-end text-xs text-muted-foreground">
                                  <span>Breach date:</span>
                                  <span className="font-medium">
                                    {new Date(breach.BreachDate).toLocaleDateString(undefined, {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric'
                                    })}
                                  </span>
                                </div>
                              )}
                            </div>
                            
                            {breach.Description && (
                              <div className="space-y-1 pt-2">
                                <p className="text-sm text-foreground/90 leading-snug" 
                                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(breach.Description) }} />
                              </div>
                            )}
                            {!breach.Description && (
                              <div className="space-y-1 pt-2">
                                <p className="text-sm text-foreground/90 leading-snug italic">
                                  No description available for this breach.
                                </p>
                              </div>
                            )}

                            {breach.DataClasses && breach.DataClasses.length > 0 && (
                              <div className="space-y-2 pt-3">
                                <h6 className="text-xs font-medium text-muted-foreground">Compromised data:</h6>
                                <div className="flex flex-wrap gap-1.5">
                                  {breach.DataClasses.map((dataClass) => (
                                    <span
                                      key={dataClass}
                                      className="text-xs bg-muted px-2 py-0.5 rounded-full"
                                    >
                                      {dataClass}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      
                      {breaches.length > itemsPerPage && (
                        <div className="flex justify-center pt-2">
                          <div className="flex space-x-1">
                            <button
                              onClick={() => setBreachPages(prev => ({ ...prev, [email]: Math.max(1, prev[email] - 1) }))}
                              disabled={breachPages[email] === 1}
                              className="px-2 py-1 text-xs rounded-md bg-muted hover:bg-muted/80 disabled:opacity-50"
                            >
                              Previous
                            </button>
                            <span className="px-2 py-1 text-xs">
                              Page {breachPages[email]} of {Math.ceil(breaches.length / itemsPerPage)}
                            </span>
                            <button
                              onClick={() => setBreachPages(prev => ({ ...prev, [email]: Math.min(Math.ceil(breaches.length / itemsPerPage), prev[email] + 1) }))}
                              disabled={breachPages[email] >= Math.ceil(breaches.length / itemsPerPage)}
                              className="px-2 py-1 text-xs rounded-md bg-muted hover:bg-muted/80 disabled:opacity-50"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No breaches found for this email.</p>
                  )}
                </div>

                {/* Pastes section */}
                {pastes.length > 0 && showPastes[email] && (
                  <div className="space-y-2">
                    <h5 className="text-sm font-medium text-orange-500">Pastes</h5>
                    {pastes.map((paste) => (
                      <div
                        key={`${paste.Source}-${paste.Id}`}
                        className="p-4 bg-muted rounded-lg space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <h5 className="font-medium flex items-center gap-2 text-orange-500">
                            {paste.Title || paste.Id}
                            <span className="text-xs text-muted-foreground">
                              {paste.EmailCount} emails included
                            </span>
                          </h5>
                          {paste.Date && (
                            <span className="text-sm text-muted-foreground">
                              {new Date(paste.Date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Source: {paste.Source}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-input pt-4 mt-4">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

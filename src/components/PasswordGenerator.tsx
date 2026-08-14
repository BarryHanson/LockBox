"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CheckCircle, RefreshCw, Copy, X } from 'lucide-react';

interface PasswordGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPassword: (password: string) => void;
}

export function PasswordGenerator({ isOpen, onClose, onSelectPassword }: PasswordGeneratorProps) {
  const [password, setPassword] = useState('');
  const [passwordLength, setPasswordLength] = useState(16);
  const [useCapitals, setUseCapitals] = useState(true);
  const [useDigits, setUseDigits] = useState(true);
  const [useSymbols, setUseSymbols] = useState(true);
  const [passwordType, setPasswordType] = useState<'characters' | 'words'>('characters');
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('medium');

  // Generate password on mount and when options change
  useEffect(() => {
    generateNewPassword();
  }, [passwordLength, useCapitals, useDigits, useSymbols, passwordType]);

  // Calculate password strength
  useEffect(() => {
    if (password) {
      let strength = 'weak';
      
      if (passwordLength >= 12 && 
          ((useCapitals && useDigits) || 
           (useDigits && useSymbols) || 
           (useCapitals && useSymbols))) {
        strength = 'medium';
      }
      
      if (passwordLength >= 16 && useCapitals && useDigits && useSymbols) {
        strength = 'strong';
      }
      
      setPasswordStrength(strength as 'weak' | 'medium' | 'strong');
    }
  }, [password, passwordLength, useCapitals, useDigits, useSymbols]);

  const generateNewPassword = () => {
    if (passwordType === 'words') {
      generateWordBasedPassword();
    } else {
      generateCharacterPassword();
    }
  };

  const generateCharacterPassword = () => {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const symbols = '!@#$%^&*()-_=+[]{}|;:,.<>?/';
    
    let chars = lowercase;
    if (useCapitals) chars += uppercase;
    if (useDigits) chars += digits;
    if (useSymbols) chars += symbols;
    
    let result = '';
    const charsLength = chars.length;
    
    // Ensure we have at least one of each selected character type
    if (useCapitals) result += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    if (useDigits) result += digits.charAt(Math.floor(Math.random() * digits.length));
    if (useSymbols) result += symbols.charAt(Math.floor(Math.random() * symbols.length));
    
    // Fill the rest of the password
    const remainingLength = passwordLength - result.length;
    for (let i = 0; i < remainingLength; i++) {
      result += chars.charAt(Math.floor(Math.random() * charsLength));
    }
    
    // Shuffle the password
    result = result.split('').sort(() => 0.5 - Math.random()).join('');
    
    setPassword(result);
  };

  const generateWordBasedPassword = () => {
    // Simple word list for demonstration
    const words = [
      'apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape',
      'honey', 'kiwi', 'lemon', 'mango', 'nectarine', 'orange', 'peach',
      'quince', 'raspberry', 'strawberry', 'tangerine', 'watermelon'
    ];
    
    let result = '';
    const wordCount = Math.max(3, Math.floor(passwordLength / 5));
    
    for (let i = 0; i < wordCount; i++) {
      let word = words[Math.floor(Math.random() * words.length)];
      
      // Capitalize first letter if needed
      if (useCapitals) {
        word = word.charAt(0).toUpperCase() + word.slice(1);
      }
      
      result += word;
      
      // Add a digit if needed
      if (useDigits && (i < wordCount - 1 || wordCount === 1)) {
        result += Math.floor(Math.random() * 10);
      }
      
      // Add a symbol if needed
      if (useSymbols && i < wordCount - 1) {
        const symbols = '!@#$%^&*';
        result += symbols.charAt(Math.floor(Math.random() * symbols.length));
      }
    }
    
    setPassword(result);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(password);
  };

  const handleFillPassword = () => {
    onSelectPassword(password);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-background text-foreground border-border">
        <DialogHeader className="flex justify-between items-center">
          <DialogTitle>Password Generator</DialogTitle>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-full"
          >
            <X size={18} />
          </Button>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Password Display */}
          <div className="bg-muted p-4 rounded-lg text-center">
            <p className="text-xl font-mono break-all">{password}</p>
          </div>
          
          {/* Password Strength Indicator */}
          <div className="flex items-center gap-2">
            <CheckCircle 
              size={20} 
              className={passwordStrength === 'strong' ? 'text-green-500' : 'text-muted-foreground'} 
            />
            <span className={passwordStrength === 'strong' ? 'text-green-500' : 'text-muted-foreground'}>
              {passwordStrength === 'strong' ? 'Strong Password' : 
               passwordStrength === 'medium' ? 'Medium Password' : 'Weak Password'}
            </span>
            
            <div className="ml-auto flex gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={generateNewPassword}
                className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-full"
              >
                <RefreshCw size={18} />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={copyToClipboard}
                className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-full"
              >
                <Copy size={18} />
              </Button>
            </div>
          </div>
          
          {/* Fill Password Button */}
          <Button 
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleFillPassword}
          >
            Fill Password
          </Button>
          
          {/* Password Type Selection */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Type</span>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <input 
                  type="radio" 
                  id="characters" 
                  name="passwordType" 
                  checked={passwordType === 'characters'}
                  onChange={() => setPasswordType('characters')}
                  className="accent-primary"
                />
                <label htmlFor="characters" className="text-sm">Characters</label>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="radio" 
                  id="words" 
                  name="passwordType" 
                  checked={passwordType === 'words'}
                  onChange={() => setPasswordType('words')}
                  className="accent-primary"
                />
                <label htmlFor="words" className="text-sm">Words</label>
              </div>
            </div>
          </div>
          
          {/* Length Slider */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Length</span>
              <span className="text-sm">{passwordLength}</span>
            </div>
            <Slider
              value={[passwordLength]}
              min={8}
              max={32}
              step={1}
              onValueChange={(value: number[]) => setPasswordLength(value[0])}
              className="cursor-pointer"
            />
          </div>
          
          {/* Character Type Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="use-capitals" className="text-sm">Use capital letters (A-Z)</Label>
              <Switch
                id="use-capitals"
                checked={useCapitals}
                onCheckedChange={setUseCapitals}
                className="data-[state=checked]:bg-primary"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="use-digits" className="text-sm">Use digits (0-9)</Label>
              <Switch
                id="use-digits"
                checked={useDigits}
                onCheckedChange={setUseDigits}
                className="data-[state=checked]:bg-primary"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="use-symbols" className="text-sm">Use symbols (@!$%&*)</Label>
              <Switch
                id="use-symbols"
                checked={useSymbols}
                onCheckedChange={setUseSymbols}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

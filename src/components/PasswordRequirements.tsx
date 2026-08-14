"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { getPasswordRequirementStatus } from "@/lib/passwordValidation";

interface PasswordRequirementsProps {
  password: string;
  className?: string;
}

export function PasswordRequirements({ password, className = "" }: PasswordRequirementsProps) {
  const [requirements, setRequirements] = useState(getPasswordRequirementStatus(""));

  useEffect(() => {
    setRequirements(getPasswordRequirementStatus(password));
  }, [password]);

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-sm font-medium text-muted-foreground">Password must contain:</p>
      <ul className="space-y-1.5">
        {requirements.map((req) => (
          <li
            key={req.id}
            className={`flex items-center gap-2 text-sm transition-colors ${
              req.met ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {req.met ? (
              <Check className="h-4 w-4 flex-shrink-0" />
            ) : (
              <X className="h-4 w-4 flex-shrink-0" />
            )}
            <span>{req.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Checks if a string contains Persian (Arabic script) characters.
 * This is a simple heuristic and might not be 100% accurate for all cases,
 * especially mixed content or other languages using Arabic script.
 * @param text The string to check.
 * @returns True if Persian characters are detected, false otherwise.
 */
export function isPersian(text: string): boolean {
  if (!text) {
    return false;
  }
  // Unicode range for Arabic script (including Persian characters)
  const persianRegex = /[\u0600-\u06FF]/;
  return persianRegex.test(text);
}

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '00:00:00';
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  // Add a leading zero if the number is less than 10
  const pad = (num: number) => num.toString().padStart(2, '0');

  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
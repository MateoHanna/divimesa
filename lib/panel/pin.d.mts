export function generatePin(): string;
export function hashPin(pin: string): string;
export function verifyPin(pin: string, stored: string | null | undefined): boolean;
export const DUMMY_HASH: string;

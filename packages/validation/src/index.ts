import { z } from "zod";

/** Nigerian phone: +234XXXXXXXXXX (13 chars) or 0XXXXXXXXXX (11 digits). */
const nigerianPhone = z
  .string()
  .regex(/^(\+234\d{10}|0\d{10})$/, "Enter a valid Nigerian phone number");

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

/** Username: 3–20 chars, [a-z0-9_], starts with a letter or digit. DB enforces uniqueness + reserved names. */
const username = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_]{2,19}$/, "3–20 characters: lowercase letters, digits, underscores");

export const signupSchema = z.object({
  fullName: z.string().min(1),
  username,
  email: z.email(),
  phone: nigerianPhone,
  password: z.string().min(8),
  referralCode: z.string().optional(),
  acceptTerms: z.literal(true),
});

/** Positive integer amount in minor units (kobo). */
export const amountSchema = z.number().int().positive();

export const transactionPinSchema = z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits");

export const withdrawalSchema = z.object({
  amountMinor: z.number().int().positive(),
  destinationId: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type TransactionPin = z.infer<typeof transactionPinSchema>;
export type WithdrawalInput = z.infer<typeof withdrawalSchema>;

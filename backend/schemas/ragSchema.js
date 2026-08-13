import { z } from "zod";

export const askQuestionSchema = z.object({
  // z.number(): documentId must be a number.
  // .int(): document IDs are database primary keys, so decimals are invalid.
  // .positive(): IDs must be greater than 0.
  // This ensures values like 0, -1, and 1.5 are rejected.
  documentId: z.number()
    .int({ message: "Document ID must be an integer" })
    .positive({ message: "Document ID must be a positive number" }),

  // z.string(): question must be a string.
  // .trim(): remove leading/trailing whitespace before validation.
  // .min(1): prevents empty strings and strings containing only spaces.
  // Without .trim(), "   " would pass .min(1) because it has length > 0.
  question: z.string()
    .trim()
    .min(1, { message: "Question is required" }),
});
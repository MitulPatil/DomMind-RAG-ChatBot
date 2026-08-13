import { z } from "zod";

export const conversationParamsSchema = z.object({
  // z.coerce.number(): converts the string from req.params to a number.
  // Express always provides route parameters as strings.
  // Example: "123" → 123
  // .int(): IDs must be whole numbers.
  // .positive(): IDs must be greater than 0.
  documentId: z.coerce.number()
    .int({ message: "Document ID must be an integer" })
    .positive({ message: "Document ID must be a positive integer" }),

  // Same validation for conversationId.
  // Ensures values like "abc", 1.5, 0, and -5 are rejected.
  conversationId: z.coerce.number()
    .int({ message: "Conversation ID must be an integer" })
    .positive({ message: "Conversation ID must be a positive integer" }),
});

export const conversationDocumentIdParamSchema = z.object({
  documentId: z.coerce.number()
    .int({ message: "Document ID must be an integer" })
    .positive({ message: "Document ID must be a positive integer" }),
});


export const documentIdParamSchema = z.object({
  // z.coerce.number(): converts req.params.id from a string to a number.
  // .int(): document IDs must be whole numbers.
  // .positive(): IDs must be greater than 0.
  id: z.coerce.number()
    .int({ message: "Document ID must be an integer" })
    .positive({ message: "Document ID must be a positive integer" }),
});

export const chunkIdParamSchema = z.object({
  // z.coerce.number(): converts req.params.id from a string to a number.
  // .int(): document IDs must be whole numbers.
  // .positive(): IDs must be greater than 0.
  id: z.coerce.number()
    .int({ message: "Document ID must be an integer" })
    .positive({ message: "Document ID must be a positive integer" }),
});
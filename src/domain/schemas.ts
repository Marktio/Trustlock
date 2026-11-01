import { z } from "zod";
import { DomainError } from "./errors";

export const ALLOWED_EXTENSIONS = ["zip", "pdf", "png", "jpg", "jpeg", "docx", "txt"] as const;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const createContractSchema = z.object({
  title: z.string().trim().min(3, "Give the contract a title of at least 3 characters.").max(120, "Keep the title under 120 characters."),
  description: z.string().trim().min(1, "Describe the work.").max(2000, "Keep the description under 2,000 characters."),
  freelancerEmail: z.string().trim().toLowerCase().pipe(z.email("Enter the freelancer's email address.")),
  totalSC: z.string().trim().min(1, "Enter the contract total."),
  reviewPeriodDays: z.coerce.number().int("Use whole days.").min(1, "Review period is at least 1 day.").max(14, "Review period is at most 14 days."),
  revisionLimit: z.coerce.number().int("Use a whole number.").min(0, "Revisions cannot be negative.").max(5, "Allow at most 5 revisions."),
  milestones: z
    .array(
      z.object({
        title: z.string().trim().min(1, "Name each milestone.").max(120, "Keep milestone names under 120 characters."),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a due date for each milestone."),
        amountSC: z.string().trim().min(1, "Enter an amount for each milestone."),
      }),
    )
    .min(1, "Add at least one milestone.")
    .max(10, "A contract can have up to 10 milestones."),
});

const milestonesSchema = createContractSchema.shape.milestones;

/** The freelancer's counter-proposal: the terms they want changed, plus a note explaining why (FR-3.3). */
export const counterSchema = z.object({
  totalSC: createContractSchema.shape.totalSC,
  reviewPeriodDays: createContractSchema.shape.reviewPeriodDays,
  revisionLimit: createContractSchema.shape.revisionLimit,
  milestones: milestonesSchema,
  note: z.string().trim().min(3, "Tell the client why you are changing the terms.").max(500, "Keep the note under 500 characters."),
});

export const deliverSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "Choose a file to deliver.")
    .max(200, "That file name is too long.")
    .refine((n) => !/[\\/]|\.\./.test(n), "That file name is not allowed.")
    .refine((n) => ALLOWED_EXTENSIONS.includes(n.split(".").pop()?.toLowerCase() as (typeof ALLOWED_EXTENSIONS)[number]), `Use one of these file types: ${ALLOWED_EXTENSIONS.join(", ")}.`),
  sizeBytes: z.number().int().min(1, "That file is empty.").max(MAX_UPLOAD_BYTES, "Files can be up to 25 MB."),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, "The file fingerprint is missing."),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

const fileEntry = z.object({
  name: deliverSchema.shape.fileName,
  sizeBytes: deliverSchema.shape.sizeBytes,
  sha256: deliverSchema.shape.sha256,
});

export const MAX_EVIDENCE_FILES = 5;

/** Evidence is text, files or both. Files are recorded by name, size and SHA-256 fingerprint (FR-6.3). */
export const evidenceSchema = z
  .object({
    text: z.string().trim().max(1000, "Keep the text under 1,000 characters.").default(""),
    files: z.array(fileEntry).max(MAX_EVIDENCE_FILES, `You can attach up to ${MAX_EVIDENCE_FILES} files.`).default([]),
  })
  .refine((v) => v.text.length > 0 || v.files.length > 0, { message: "Write something or attach a file." });

export const infoRequestSchema = z.object({
  to: z.enum(["client", "freelancer"], { message: "Choose who you are asking." }),
  question: z.string().trim().min(3, "Write your question in at least 3 characters.").max(500, "Keep the question under 500 characters."),
});

export const staffSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120, "Keep the name under 120 characters."),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  role: z.enum(["arbitrator", "auditor"], { message: "Choose arbitrator or auditor." }),
});

/** Platform settings an administrator can change (FR-9.4). Money fields are typed in whole credits and converted by the service. */
export const settingsSchema = z
  .object({
    feePercent: z.coerce.number().min(0, "The fee cannot be negative.").max(20, "The fee can be at most 20%."),
    defaultReviewDays: z.coerce.number().int("Use whole days.").min(1, "Review period is at least 1 day.").max(14, "Review period is at most 14 days."),
    defaultRevisionLimit: z.coerce.number().int("Use a whole number.").min(0, "Revisions cannot be negative.").max(5, "Allow at most 5 revisions."),
    proposalDays: z.coerce.number().int("Use whole days.").min(1, "Proposals last at least 1 day.").max(30, "Proposals last at most 30 days."),
    fundingDays: z.coerce.number().int("Use whole days.").min(1, "Funding window is at least 1 day.").max(30, "Funding window is at most 30 days."),
    evidenceDays: z.coerce.number().int("Use whole days.").min(1, "Evidence window is at least 1 day.").max(14, "Evidence window is at most 14 days."),
    arbitrationDays: z.coerce.number().int("Use whole days.").min(1, "Arbitrators get at least 1 day.").max(30, "Arbitrators get at most 30 days."),
    topUpMinSC: z.string().trim().min(1, "Enter the smallest top-up."),
    topUpMaxSC: z.string().trim().min(1, "Enter the largest top-up."),
    topUpDailyMaxSC: z.string().trim().min(1, "Enter the daily top-up limit."),
  });

export const reasonSchema = z.string().trim().min(3, "Say why, in at least 3 characters.").max(500, "Keep the reason under 500 characters.");

export const messageSchema = z.string().trim().min(1, "Write a message first.").max(1000, "Keep messages under 1,000 characters.");

export const rulingSchema = z.object({
  decision: z.enum(["release", "refund", "split"], { message: "Choose a ruling." }),
  freelancerPercent: z.coerce.number().int("Use a whole percentage.").min(1, "A split gives the freelancer 1% to 99%.").max(99, "A split gives the freelancer 1% to 99%.").optional(),
  note: reasonSchema,
});

export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new DomainError("VALIDATION", result.error.issues[0]?.message ?? "Check the form and try again.");
  }
  return result.data;
}

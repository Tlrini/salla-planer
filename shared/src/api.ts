import { z } from 'zod';
import { CatalogItem, Hall, Project, User, UserRole } from './schemas.js';

/** Request/response shapes shared by the server routes and the web client. */

export const LoginBody = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const SessionUser = User.pick({ id: true, username: true, displayName: true, role: true });
export type SessionUser = z.infer<typeof SessionUser>;

export const UserCreate = z.object({
  username: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/),
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(6).max(200),
  role: UserRole,
});
export type UserCreate = z.infer<typeof UserCreate>;

export const UserUpdate = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  role: UserRole.optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).max(200).optional(),
});
export type UserUpdate = z.infer<typeof UserUpdate>;

export const ProjectInput = Project.pick({
  name: true,
  clientName: true,
  clientPhone: true,
  eventType: true,
  eventDate: true,
  guestTarget: true,
  status: true,
  hall: true,
  items: true,
  notes: true,
});
export type ProjectInput = z.infer<typeof ProjectInput>;

export const ProjectUpdate = ProjectInput.extend({ version: z.number().int().nonnegative() });
export type ProjectUpdate = z.infer<typeof ProjectUpdate>;

/** Project list row: everything except the items. */
export const ProjectSummary = Project.omit({ items: true }).extend({ itemCount: z.number().int() });
export type ProjectSummary = z.infer<typeof ProjectSummary>;

export const ProjectListQuery = z.object({
  query: z.string().max(200).optional(),
  status: Project.shape.status.optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
});
export type ProjectListQuery = z.infer<typeof ProjectListQuery>;

export const DuplicateBody = z
  .object({ name: z.string().trim().min(1).max(200).optional() })
  .optional();

export const ConflictResponse = z.object({
  error: z.literal('conflict'),
  updatedBy: z.string(),
  version: z.number().int(),
});
export type ConflictResponse = z.infer<typeof ConflictResponse>;

export const HallInput = z.object({ hall: Hall });
export type HallInput = z.infer<typeof HallInput>;

export const CatalogUpdate = CatalogItem.omit({ id: true, modelFile: true }).partial();
export type CatalogUpdate = z.infer<typeof CatalogUpdate>;

/** Max upload size for .glb models. */
export const MAX_MODEL_BYTES = 20 * 1024 * 1024;

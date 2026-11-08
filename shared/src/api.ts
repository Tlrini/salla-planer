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
  option: true,
  otherOptions: true,
  finalOptionId: true,
  viewpoints: true,
  pricing: true,
  guests: true,
  checklist: true,
  costs: true,
  annotations: true,
  notes: true,
});
export type ProjectInput = z.infer<typeof ProjectInput>;

export const ProjectUpdate = ProjectInput.extend({ version: z.number().int().nonnegative() });
export type ProjectUpdate = z.infer<typeof ProjectUpdate>;

/** Project list row: everything except the items (of any option). */
export const ProjectSummary = Project.omit({
  items: true,
  otherOptions: true,
  viewpoints: true,
  guests: true,
  checklist: true,
  annotations: true,
  costs: true,
}).extend({
  itemCount: z.number().int(),
  optionCount: z.number().int(),
  /** Quote total of the client's final option (the open one if none is chosen yet). */
  quoteTotal: z.number(),
  /** Option the client approved through a share link, and their unread comments. */
  clientApproved: z.string().optional(),
  clientComments: z.number().int().optional(),
});
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

/** Hall template body; with `version`, a stale save is refused with 409 like projects. */
export const HallInput = z.object({
  hall: Hall,
  version: z.number().int().nonnegative().optional(),
});
export type HallInput = z.infer<typeof HallInput>;

/** Admin catalog edit. `null` clears an optional number (stock no longer tracked, no cost). */
export const CatalogUpdate = CatalogItem.omit({ id: true, modelFile: true }).partial().extend({
  stock: CatalogItem.shape.stock.unwrap().nullable().optional(),
  cost: CatalogItem.shape.cost.unwrap().nullable().optional(),
});
export type CatalogUpdate = z.infer<typeof CatalogUpdate>;

/** POST /api/catalog/:id/model-from-library: draw a built-in chair/table with a scanned model. */
export const ModelFromLibrary = z.object({ libraryId: z.string().min(1).max(64) });
export type ModelFromLibrary = z.infer<typeof ModelFromLibrary>;

/** Max upload size for .glb models (admin model for a built-in type). */
export const MAX_MODEL_BYTES = 20 * 1024 * 1024;
/** Max upload size for a scanned decor (.glb from a phone scan app). */
export const MAX_LIBRARY_MODEL_BYTES = 100 * 1024 * 1024;
/** Max size of one rendered thumbnail PNG. */
export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

/** Fields an agent can set on a library decor (agency-wide, any agent may edit). */
export const LibraryUpdate = CatalogItem.pick({
  name: true,
  category: true,
  width: true,
  depth: true,
  height: true,
  shape2d: true,
  price: true,
  tabletop: true,
  stock: true,
  modelRotation: true,
  defaultColor: true,
  active: true,
  draft: true,
})
  .partial()
  .extend({
    // Library decor lives with the decorations, never as hall structure.
    category: CatalogItem.shape.category.exclude(['structure']).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    // null = stock no longer tracked.
    stock: CatalogItem.shape.stock.unwrap().nullable().optional(),
  });
export type LibraryUpdate = z.infer<typeof LibraryUpdate>;

/** Rendered images of a library decor, as PNG data URLs. */
export const LibraryImages = z.object({
  thumbnail: z.string().startsWith('data:image/png;base64,').max(3_000_000),
  topView: z.string().startsWith('data:image/png;base64,').max(3_000_000),
});
export type LibraryImages = z.infer<typeof LibraryImages>;

/** Project fields the server keeps in its `extra` JSON column. */
export const ProjectExtra = Project.pick({
  option: true,
  otherOptions: true,
  finalOptionId: true,
  viewpoints: true,
  pricing: true,
  guests: true,
  checklist: true,
  costs: true,
  annotations: true,
}).partial();
export type ProjectExtra = z.infer<typeof ProjectExtra>;

/** Agency details printed on contracts and PDF headers (admin edits them). */
export const AgencySettings = z.object({
  name: z.string().trim().max(120),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(60).optional(),
  email: z.string().trim().max(120).optional(),
  /** Albanian/Kosovo business number (NIPT / NUI). */
  nipt: z.string().trim().max(40).optional(),
  /** Contract terms (one paragraph per line); empty = the default terms. */
  contractTerms: z.string().max(8000).optional(),
  /**
   * "Start link" of the on/off server (AWS Lambda, docs/deploy-cloud.md §2.7). The app keeps a
   * copy in the browser and offers it when the server cannot be reached.
   */
  startLink: z
    .union([z.literal(''), z.string().trim().url().startsWith('https://').max(500)])
    .optional(),
});
export type AgencySettings = z.infer<typeof AgencySettings>;

/** A deleted project waiting in the bin ("Koshi"); removed for good after TRASH_DAYS. */
export const TrashedProject = z.object({
  id: z.string(),
  name: z.string(),
  clientName: z.string(),
  eventDate: z.string().optional(),
  status: Project.shape.status,
  deletedAt: z.string(),
  deletedBy: z.string(),
  /** When it disappears for good. */
  purgeAt: z.string(),
});
export type TrashedProject = z.infer<typeof TrashedProject>;
export const TRASH_DAYS = 30;

/** Client activity on share links the agency has not looked at yet (the bell). */
export const ClientNotice = z.object({
  projectId: z.string(),
  projectName: z.string(),
  kind: z.enum(['approved', 'comment']),
  /** Client's name. */
  by: z.string(),
  /** The approved option's name, or the start of the comment. */
  text: z.string(),
  at: z.string(),
});
export type ClientNotice = z.infer<typeof ClientNotice>;

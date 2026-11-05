import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB color');
const meters = z.number().finite().nonnegative();

export const FloorType = z.enum(['parket', 'mermer', 'pllake', 'tapet']);
export type FloorType = z.infer<typeof FloorType>;

export const EventType = z.enum(['dasme', 'fejese', 'event_kompanie', 'ditelindje', 'tjeter']);
export type EventType = z.infer<typeof EventType>;

export const ProjectStatus = z.enum(['draft', 'konfirmuar', 'instaluar']);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const CatalogCategory = z.enum([
  'tables',
  'stage',
  'floral',
  'lighting',
  'other',
  'structure',
]);
export type CatalogCategory = z.infer<typeof CatalogCategory>;

export const Item = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().finite(),
  width: meters,
  depth: meters,
  height: meters.optional(),
  color: hexColor,
  color2: hexColor.optional(),
  label: z.string().max(80).optional(),
  seats: z.number().int().nonnegative().optional(),
  locked: z.boolean().optional(),
});
export type Item = z.infer<typeof Item>;

export const Hall = z.object({
  name: z.string().min(1).max(120),
  width: z.number().positive().max(500),
  length: z.number().positive().max(500),
  height: z.number().positive().max(50),
  floor: FloorType,
  floorColor: hexColor,
  wallColor: hexColor,
  structure: z.array(Item),
});
export type Hall = z.infer<typeof Hall>;

export const Project = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  clientName: z.string().max(200),
  clientPhone: z.string().max(50).optional(),
  eventType: EventType,
  eventDate: z.string().optional(),
  guestTarget: z.number().int().nonnegative().optional(),
  status: ProjectStatus,
  hall: Hall,
  items: z.array(Item),
  notes: z.string().max(5000).optional(),
  createdBy: z.string(),
  updatedBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative(),
});
export type Project = z.infer<typeof Project>;

export const CatalogItem = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: CatalogCategory,
  width: meters,
  depth: meters,
  height: meters,
  shape2d: z.enum(['circle', 'rect']),
  resizable: z.enum(['none', 'width', 'both']),
  defaultSeats: z.number().int().nonnegative().optional(),
  seatRule: z.enum(['fixed', 'per_length']).optional(),
  /**
   * How chairs are drawn automatically around a table: evenly spaced ring, along both long
   * sides, or one side only (head table). Absent = no automatic chairs and no auto label.
   */
  chairLayout: z.enum(['ring', 'two_sides', 'one_side']).optional(),
  defaultColor: hexColor,
  defaultColor2: hexColor.optional(),
  price: z.number().nonnegative(),
  modelFile: z.string().optional(),
  active: z.boolean(),
});
export type CatalogItem = z.infer<typeof CatalogItem>;

export const UserRole = z.enum(['admin', 'agent']);
export type UserRole = z.infer<typeof UserRole>;

export const User = z.object({
  id: z.string().min(1),
  username: z.string().min(2).max(60),
  displayName: z.string().min(1).max(120),
  role: UserRole,
  active: z.boolean(),
  createdAt: z.string(),
});
export type User = z.infer<typeof User>;

/** A hall template stored on the server (Phase 3); `example` marks the built-in "Shembull" halls. */
export const HallTemplate = z.object({
  id: z.string().min(1),
  example: z.boolean(),
  hall: Hall,
});
export type HallTemplate = z.infer<typeof HallTemplate>;

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
  /** Tables: catalog id of the table-top decor standing on it (Beta 2), e.g. a scanned bouquet. */
  tableDecor: z.string().min(1).max(64).optional(),
  /**
   * Where the item is fixed: on a wall (flat against the nearest wall, facing the room) or
   * hanging from the ceiling. Missing = standing on the floor (or on a table).
   */
  mount: z.enum(['wall', 'ceiling']).optional(),
  /** Wall items: height of the item's bottom edge above the floor (m). */
  elevation: z.number().finite().min(0).max(30).optional(),
});
export type Item = z.infer<typeof Item>;
/** Where an item is placed: the floor (default), a wall or the ceiling. */
export type Mount = 'floor' | 'wall' | 'ceiling';

/** One design option of a project ("Opsioni A / B / C"): its own set of items. */
export const DesignOption = z.object({
  id: z.string().min(1).max(32),
  name: z.string().trim().min(1).max(40),
  items: z.array(Item),
});
export type DesignOption = z.infer<typeof DesignOption>;

/** A saved eye-level view in the hall (Beta 3): where the client stands and looks. */
export const Viewpoint = z.object({
  id: z.string().min(1).max(32),
  name: z.string().trim().min(1).max(60),
  /** Plan position (m). */
  x: z.number().finite(),
  y: z.number().finite(),
  /** Look direction: yaw clockwise from "up the plan" (−y), pitch up/down; degrees. */
  yaw: z.number().finite(),
  pitch: z.number().finite().min(-89).max(89),
});
export type Viewpoint = z.infer<typeof Viewpoint>;

/** Quote adjustments on top of the catalog prices: a discount and extra services. */
export const Pricing = z.object({
  /** Discount on the decor total, in percent (0–100). */
  discountPercent: z.number().min(0).max(100).optional(),
  /** Extra services, e.g. "Transport dhe montim". */
  extras: z
    .array(
      z.object({
        id: z.string().min(1).max(32),
        label: z.string().trim().max(120),
        amount: z.number().finite().min(-1_000_000).max(1_000_000),
      }),
    )
    .max(20)
    .optional(),
});
export type Pricing = z.infer<typeof Pricing>;

/** What an event costs the agency besides its own decor (transport, staff, fresh flowers…). */
export const ProjectCost = z.object({
  id: z.string().min(1).max(32),
  label: z.string().trim().max(120),
  amount: z.number().finite().min(0).max(1_000_000),
});
export type ProjectCost = z.infer<typeof ProjectCost>;

const shortId = z.string().min(1).max(32);

/** A wedding/event guest and the table they sit at (Item id of a table). */
export const Guest = z.object({
  id: shortId,
  name: z.string().trim().min(1).max(120),
  /** "Familja e nuses", "Kolegët"… guests of a group are seated together. */
  group: z.string().trim().max(60).optional(),
  tableId: z.string().max(64).optional(),
  note: z.string().max(200).optional(),
  rsvp: z.enum(['po', 'jo', 'pritet']).optional(),
});
export type Guest = z.infer<typeof Guest>;

export const ChecklistEntry = z.object({
  loaded: z.boolean().optional(),
  installed: z.boolean().optional(),
  returned: z.boolean().optional(),
});
export type ChecklistEntry = z.infer<typeof ChecklistEntry>;

/** Team checklist: per catalog type (load / install / return) plus free tasks. */
export const Checklist = z.object({
  lines: z.record(z.string().max(64), ChecklistEntry).optional(),
  tasks: z
    .array(
      z.object({
        id: shortId,
        text: z.string().trim().min(1).max(200),
        done: z.boolean(),
        assignee: z.string().trim().max(60).optional(),
      }),
    )
    .max(100)
    .optional(),
});
export type Checklist = z.infer<typeof Checklist>;

const coord = z.number().finite().min(-1000).max(1000);

/** Notes drawn on the plan: a measured distance, a text, or a coloured zone. */
export const Annotation = z.discriminatedUnion('kind', [
  z.object({ id: shortId, kind: z.literal('measure'), x1: coord, y1: coord, x2: coord, y2: coord }),
  z.object({
    id: shortId,
    kind: z.literal('text'),
    x: coord,
    y: coord,
    text: z.string().trim().min(1).max(200),
    /** Letter height in meters (scales with the plan). */
    size: z.number().min(0.1).max(3),
  }),
  z.object({
    id: shortId,
    kind: z.literal('zone'),
    x: coord,
    y: coord,
    width: z.number().positive().max(1000),
    height: z.number().positive().max(1000),
    color: hexColor,
    label: z.string().trim().max(80).optional(),
  }),
]);
export type Annotation = z.infer<typeof Annotation>;

export const OptionRef = DesignOption.pick({ id: true, name: true });
export type OptionRef = z.infer<typeof OptionRef>;

/** A photo/scan of the real floor plan drawn under the blueprint (meters, plan coordinates). */
export const Underlay = z.object({
  url: z.string().min(1).max(300),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(1000),
  height: z.number().positive().max(1000),
  opacity: z.number().min(0).max(1),
});
export type Underlay = z.infer<typeof Underlay>;

export const Hall = z.object({
  name: z.string().min(1).max(120),
  width: z.number().positive().max(500),
  length: z.number().positive().max(500),
  height: z.number().positive().max(50),
  floor: FloorType,
  floorColor: hexColor,
  wallColor: hexColor,
  structure: z.array(Item),
  underlay: Underlay.optional(),
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
  /** The items of the active design option (what the editor, 3D view and PDF show). */
  items: z.array(Item),
  /** Name of the active option; absent while the project has a single option. */
  option: OptionRef.optional(),
  /** The other, inactive design options. */
  otherOptions: z.array(DesignOption).max(12).optional(),
  /** Option the client chose ("Zgjidh si përfundimtar"). */
  finalOptionId: z.string().max(32).optional(),
  /** Saved eye-level views for walking the client through the hall. */
  viewpoints: z.array(Viewpoint).max(40).optional(),
  /** Discount and extra services for the quote (PDF, summary). */
  pricing: Pricing.optional(),
  /** Guest list and seating (which table each guest sits at). */
  guests: z.array(Guest).max(3000).optional(),
  /** Team checklist for loading, installing and returning the decor. */
  checklist: Checklist.optional(),
  /** The agency's own costs for this event (admins only; for the profit). */
  costs: z.array(ProjectCost).max(30).optional(),
  /** Measurements, texts and zones drawn on the plan. */
  annotations: z.array(Annotation).max(300).optional(),
  notes: z.string().max(5000).optional(),
  createdBy: z.string(),
  updatedBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative(),
});
export type Project = z.infer<typeof Project>;

const angle = z.number().finite().min(-360).max(360);
export const ModelRotation = z.object({ x: angle, y: angle, z: angle });
export type ModelRotation = z.infer<typeof ModelRotation>;

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
  /**
   * What one piece costs the agency per event (rental, flowers, wear); absent = 0. Only admins
   * see it: the server leaves it out of the catalog for agents.
   */
  cost: z.number().nonnegative().max(1_000_000).optional(),
  /** Pieces the agency owns; absent = not tracked. Used for availability on event dates. */
  stock: z.number().int().nonnegative().optional(),
  modelFile: z.string().optional(),
  active: z.boolean(),
  /** 'library' = a scanned decor uploaded by an agent (Beta 1); absent = built-in catalog item. */
  source: z.enum(['builtin', 'library']).optional(),
  /** Library items: display name and user id of the agent who uploaded it. */
  createdBy: z.string().optional(),
  createdById: z.string().optional(),
  /** Library items still being set up are hidden from the editor sidebar. */
  draft: z.boolean().optional(),
  /** Perspective thumbnail and top-down image (PNG URLs) rendered from the model. */
  thumbnail: z.string().optional(),
  topView: z.string().optional(),
  /** Can stand on a table (centerpieces, candles, scanned arrangements). */
  tabletop: z.boolean().optional(),
  /** Rotation (degrees, applied X then Y then Z) that makes an uploaded model upright and front-facing. */
  modelRotation: ModelRotation.optional(),
  /**
   * How an uploaded model fills the item's size: 'stretch' fits width × height × depth exactly
   * (default for built-in types), 'uniform' keeps the scan's real proportions using the height.
   */
  scaleMode: z.enum(['stretch', 'uniform']).optional(),
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
  /** Optimistic locking (like projects); absent on built-in seed data. */
  version: z.number().int().nonnegative().optional(),
  updatedBy: z.string().optional(),
});
export type HallTemplate = z.infer<typeof HallTemplate>;

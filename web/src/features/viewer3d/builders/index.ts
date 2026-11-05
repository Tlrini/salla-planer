import type { Builder } from './types';
import { TableRound } from './tableRound';
import { TableRect } from './tableRect';
import { LoungeSofa } from './loungeSofa';
import { CakeTable } from './cakeTable';
import { Stage } from './stage';
import { BackdropCurtain } from './backdropCurtain';
import { FlowerWall } from './flowerWall';
import { FlowerArch } from './flowerArch';
import { DanceFloor } from './danceFloor';
import { CarpetAisle } from './carpetAisle';
import { Centerpiece } from './centerpiece';
import { FlowerStand } from './flowerStand';
import { CandleGroup } from './candleGroup';
import { BalloonCluster } from './balloonCluster';
import { Plant } from './plant';
import { Chandelier } from './chandelier';
import { Uplight } from './uplight';
import { LightCurtain } from './lightCurtain';
import { PhotoCorner } from './photoCorner';
import { DjBooth } from './djBooth';
import { BarCounter } from './barCounter';

/**
 * Procedural builder per catalog type. Chairs are not here: all chairs (standalone and around
 * tables) are drawn by ChairInstances with InstancedMesh. Structure items are drawn by Hall3D.
 */
export const BUILDERS: Record<string, Builder> = {
  table_round_10: TableRound,
  table_round_8: TableRound,
  table_rect: TableRect,
  table_imperial: TableRect,
  table_head: TableRect,
  lounge_sofa: LoungeSofa,
  cake_table: CakeTable,
  stage: Stage,
  backdrop_curtain: BackdropCurtain,
  flower_wall: FlowerWall,
  flower_arch: FlowerArch,
  dance_floor: DanceFloor,
  carpet_aisle: CarpetAisle,
  centerpiece: Centerpiece,
  flower_stand: FlowerStand,
  candle_group: CandleGroup,
  balloon_cluster: BalloonCluster,
  plant: Plant,
  chandelier: Chandelier,
  uplight: Uplight,
  light_curtain: LightCurtain,
  photo_corner: PhotoCorner,
  dj_booth: DjBooth,
  bar_counter: BarCounter,
};

/** Fallback for catalog items added later by the admin without a dedicated builder. */
export { GenericBox } from './genericBox';

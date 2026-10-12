/** 데이터 계약 (data/*.json) */
export interface EventConfig {
  eventDate: string;
  eventDateLabel: string;
  timeZone: string;
  utcOffsetMinutes: number;
  location: {
    label: string;
    shortLabel: string;
    latitude: number;
    longitude: number;
    elevationM: number;
    isProvisional: boolean;
    note?: string;
  };
  slots: Array<{ id: string; localTime: string; localDate: string; labelKo: string }>;
  defaultSlotId: string;
  visibility: { quizMinAltitudeDeg: number; horizonAltitudeDeg: number };
  lowPerformanceMode: boolean;
  fortune: { titleDateLabel: string; resultTitle: string };
}

export interface ZodiacCard {
  id: string;
  nameKo: string;
  nameEn: string;
  birthRangeLabel: string;
  startMonthDay: [number, number];
  endMonthDay: [number, number];
  illustrationAsset: string;
  shortDescription: string;
  accent?: string;
}

export interface Fortune {
  id: string;
  zodiacId: string;
  message: string;
  smallAction: string;
}

export interface Constellation {
  id: string;
  iauAbbreviation: string;
  nameKo: string;
  nameEn: string;
  shortAnswer: string;
  aliases: string[];
  seasonTags: string[];
  seasonLabel: string;
  description: string;
  findTip: string;
  relatedNote?: string;
  starIds: string[];
  requiredStarIds: string[];
  anchorStarIds: string[];
  edges: [string, string][];
  starLabels?: Record<string, string>;
  shapeAsset: string;
}

export interface SlotStar {
  id: string;
  altitudeDeg: number;
  azimuthDeg: number;
  magnitude: number;
}

export interface ConstellationView {
  status: "visible" | "nearHorizon" | "belowHorizon";
  centerAltitudeDeg: number;
  centerAzimuthDeg: number;
  lowestRequiredAltitudeDeg: number;
  directionKo: string;
  heightKo: string;
  whereKo: string;
}

export interface SkySlot {
  id: string;
  labelKo: string;
  localISO: string;
  utcISO: string;
  isNextDay: boolean;
  sunAltitudeDeg: number;
  twilight: "civil" | "nautical" | "astronomical" | "night";
  twilightKo: string;
  moon: { altitudeDeg: number; azimuthDeg: number; fractionIlluminated: number };
  stars: SlotStar[];
  visibleConstellationIds: string[];
  nearHorizonConstellationIds: string[];
  belowHorizonConstellationIds: string[];
  quizEligibleConstellationIds: string[];
  constellationViews: Record<string, ConstellationView>;
}

export interface ConstellationFrame {
  centerRaDeg: number;
  centerDecDeg: number;
  viewBox: [number, number, number, number];
  unitsPerRadian: number;
  stars: Record<string, [number, number]>;
}

export interface SkyDataMetadata {
  generatedAt: string;
  configFingerprint: string;
  eventDate: string;
  timeZone: string;
  location: EventConfig["location"];
  slots: Array<{ id: string; localISO: string; utcISO: string }>;
  tools: Record<string, string>;
  catalog: Record<string, string | number>;
  method: Record<string, string>;
  twilight: Record<string, string>;
}

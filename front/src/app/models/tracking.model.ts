export type TrackingStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'ARRIVED' | 'CANCELLED' | 'UNKNOWN';

export interface TrainPosition {
  latitude: number;
  longitude: number;
  timestamp: string;
}

export interface StopInfo {
  stationName: string;
  stationId: string;
  latitude: number;
  longitude: number;
  scheduledDeparture: string | null;
  expectedDeparture: string | null;
  scheduledArrival: string | null;
  expectedArrival: string | null;
  departed: boolean;
  skipped: boolean;
}

export interface TrackingResponse {
  journeyId: string;
  trainNumber: string;
  date: string;
  status: TrackingStatus;
  currentPosition: TrainPosition | null;
  delayMinutes: number;
  eta: string | null;
  nextStop: StopInfo | null;
  destination: StopInfo | null;
  allStops: StopInfo[];
  lastUpdated: string;
  errorMessage: string | null;
}

export interface TrackJourneyRequest {
  trainNumber: string;
  date: string;
}

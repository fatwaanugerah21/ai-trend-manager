interface ITMUpdateSubscriberParams {
  identifier: string;
  symbol: string;
  rollWindowInHours: number;
  newSymbol?: string;
  newRollWindowInHours?: number;
  checkIntervalInMinutes: number;
}

interface ITMChangeSubscriberLastTrendSentParams {
  identifier: string;
  symbol: string;
  rollWindowInHours: number;
  lastTrendSent: Date;
}
interface IAddSubscriberSchema {
  identifier: string;
  symbol: string;
  rollWindowInHours: number;
  checkIntervalInMinutes: number;
}

interface IUpdateSubscriberSchema {
  identifier: string;
  symbol: string;
  rollWindowInHours: number;
  newSymbol: string;
  newRollWindowInHours: number;
  checkIntervalInMinutes: number;
  newCheckIntervalInMinutes: number;
}

interface IChangeSubscriberLastTrendSentSchema {
  identifier: string;
  symbol: string;
  rollWindowInHours: number;
  lastTrendSent: Date;
}

interface IDisableSubscriberSchema {
  identifier: string;
  symbol: string;
  rollWindowInHours: number;
  checkIntervalInMinutes: number;
  shouldDelete: boolean;
}
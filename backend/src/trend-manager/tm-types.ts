interface IPostResponse { isSuccess: boolean, msg?: string };

type TSubscriberCollection = { [symbol: string]: { [rollWindowInHours: number]: { [checkIntervalInMinutes: number]: ISubscriberDetail[] } } };


interface ITMAddSubsriberParams {
  identifier: string;
  symbol: string;
  rollWindowInHours: number;
  checkIntervalInMinutes: number;
}

interface ITMUpdateSubsriberParams {
  identifier: string;
  oldSymbol: string;
  oldRollWindowInHours: number;
  newSymbol: string;
  newRollWindowInHours: number;
  oldCheckIntervalInMinutes: number;
  newCheckIntervalInMinutes: number;
}

interface ITMChangeSubsriberLastSentParams {
  identifier: string;
  symbol: string;
  rollWindowInHours: number;
  checkIntervalInMinutes: number;
  newLastSent: Date;
}

type TCandlesTrend = "Kangaroo" | "Up" | "Down";

interface ITMSendTrendMsg {
  type: "ai-trend-update";
  data: {
    identifier: string;
    candlesImage: string;
    candlesTrend: TCandlesTrend;
    closePrice: number;
    rollWindowInHours: number;
    symbol: string;
  }
}

interface ICandlesData {
  candlesStartDate: Date;
  candlesEndDate: Date;
  candlesImage: Buffer;
  candlesTrend: TCandlesTrend;
  closePrice: number;
}

interface ISubscriberDetail {
  symbol: string;
  rollWindowInHours: number;
  identifier: string;
  wsClient: WebSocket;
  lastTrendSent: Date;
  checkIntervalInMinutes: number;
  isListening: boolean;
  removedAt?: Date;
}
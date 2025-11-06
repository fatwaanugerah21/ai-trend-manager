interface IPostResponse { isSuccess: boolean, msg?: string };


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
  checkIntervalInMinutes: number;
}

interface ITMChangeSubsriberLastSentParams {
  identifier: string;
  symbol: string;
  rollWindowInHours: number;
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
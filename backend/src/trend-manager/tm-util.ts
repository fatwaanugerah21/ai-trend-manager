import DatabaseService from "@/services/database.service";
import ExchangeService from "@/services/exchange-service/exchange-service";
import GrokAiService from "@/services/grok-ai.service";
import eventBus from "@/utils/event-bus.util";
import { generateImageOfCandles } from "@/utils/image-generator.util";
import { realtimeAiBreakoutTrend } from "db/schema";
import { and, eq } from "drizzle-orm";

class TMUtil {
  static getSubscribersClosesNextCheckInMinutes(subscribers: ISubscriberDetail[]) {
    const currDate = new Date();
    let curr_closestNextCheckInMinutes;
    for (const sub of subscribers) {
      if (!sub.isListening) continue;

      const nextCheckDueInMinutes = sub.checkIntervalInMinutes - Math.floor(((currDate.getTime() - sub.lastTrendSent.getTime()) / 60_000));
      if (!curr_closestNextCheckInMinutes || nextCheckDueInMinutes < curr_closestNextCheckInMinutes) curr_closestNextCheckInMinutes = nextCheckDueInMinutes;
    }

    return curr_closestNextCheckInMinutes;
  }

  static async saveTrendDataToDb(symbol: string, rollWindowInHours: number, candlesData: ICandlesData) {
    try {
      const isDataExist = await DatabaseService.db
        .select({ id: realtimeAiBreakoutTrend.id })
        .from(realtimeAiBreakoutTrend)
        .where(and(
          eq(realtimeAiBreakoutTrend.symbol, symbol),
          eq(realtimeAiBreakoutTrend.rollWindowInHours, rollWindowInHours),
          eq(realtimeAiBreakoutTrend.endDate, candlesData.candlesEndDate as any),
          eq(realtimeAiBreakoutTrend.startDate, candlesData.candlesStartDate as any),
        ));
      if (!!isDataExist.length) {
        console.log("=================================================");
        console.log(`Trying to save data of : {
symbol: ${symbol}
rollWindowInHours: ${rollWindowInHours}
endDate: ${candlesData.candlesEndDate}
startDate: ${candlesData.candlesStartDate}
}`);
        console.log("But it already exist, avoiding that");
        console.log("=================================================");
        console.log();

        return;
      }
      await DatabaseService.db.insert(realtimeAiBreakoutTrend).values({
        symbol: symbol,
        closePrice: candlesData.closePrice.toString(),
        rollWindowInHours: rollWindowInHours,
        endDate: candlesData.candlesEndDate as any,
        startDate: candlesData.candlesStartDate as any,
        trend: candlesData.candlesTrend,
      });
    } catch (error) {
      console.log("Failed to save on database: ", error);
    }
  }

  static sendTrendData(sub: ISubscriberDetail, candlesData: ICandlesData) {
    console.log("Sending data trend...");

    if (sub.wsClient.readyState !== sub.wsClient.OPEN) return;
    sub.wsClient.send(JSON.stringify({
      type: "ai-trend-update",
      data: {
        rollWindowInHours: sub.rollWindowInHours,
        symbol: sub.symbol,
        identifier: sub.identifier,
        candlesTrend: candlesData.candlesTrend,
        closePrice: candlesData.closePrice,
        candlesImage: candlesData.candlesImage.toString("base64"),
      }
    } as ITMSendTrendMsg));
  }

  static getWaitMsToNextMinuteZeroSeconds(delayInMin: number) {
    const now = new Date();

    const nextIntervalCheckMinutes = new Date(now.getTime());
    nextIntervalCheckMinutes.setSeconds(0, 0);

    if (now.getSeconds() > 0 || now.getMilliseconds() > 0) nextIntervalCheckMinutes.setMinutes(now.getMinutes() + delayInMin);
    const waitInMs = nextIntervalCheckMinutes.getTime() - now.getTime();

    return waitInMs;
  }

  static async waitForNextCheck(delayInMin: number) {
    const waitInMs = this.getWaitMsToNextMinuteZeroSeconds(delayInMin);

    await new Promise(resolve => { setTimeout(resolve, waitInMs) });
  }

  static logAllSubscribers(subscribers: TSubscriberCollection) {
    // Log all subscribers identifiers for every symbol and rollWindowInHours
    console.log("All subscribers: ");

    for (const [sym, rollMap] of Object.entries(subscribers)) {
      for (const [roll, intervalMap] of Object.entries(rollMap)) {
        for (const [checkIntervalInMinutes, subsArr] of Object.entries(intervalMap)) {
          const ids = subsArr.map(sub => sub.identifier).join(", ");
          console.log(
            `- symbol: ${sym}, rollWindowInHours: ${roll}, checkIntervalInMinutes: ${checkIntervalInMinutes}, identifiers: [${ids}]`
          );
        }
      }
    }
  }

  static async getCandlesData(symbol: string, candlesEndDate: Date, rollWindowInHours: number): Promise<ICandlesData> {
    const candlesStartDate = new Date(candlesEndDate.getTime() - (rollWindowInHours * 60 * 60 * 1000));
    const candles = await ExchangeService.getCandles(symbol, candlesStartDate, candlesEndDate, "1Min");

    const closePrice = candles[candles.length - 1]?.closePrice;
    const candlesImage = await generateImageOfCandles(symbol, candles);
    const candlesTrend = await GrokAiService.analyzeBreakOutTrend(candlesImage);

    return { candlesStartDate, candlesEndDate, candlesImage, candlesTrend, closePrice };
  }

  static getMinutesPassedAndCheckIntervalElapsed(subscriber: ISubscriberDetail): number {
    const now = new Date();
    now.setSeconds(0, 0);
    const lastTrendSent = subscriber.lastTrendSent;
    console.log("now: ", now);
    console.log("lastTrendSent: ", lastTrendSent);
    const minutesPassed = Math.floor((now.getTime() - lastTrendSent.getTime()) / (60_000));

    console.log("subscriber.checkIntervalInMinutes: ", subscriber.checkIntervalInMinutes);
    console.log("minutesPassed: ", minutesPassed);


    return Math.max(subscriber.checkIntervalInMinutes - minutesPassed, 0);
  }
}

export default TMUtil;
import DatabaseService from "@/services/database.service";
import eventBus from "@/utils/event-bus.util";
import { breakOutTrend } from "db/schema";
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

  static getWaitInMsForNextMinutes0Seconds(waitInMinutes: number) {
    const now = new Date();

    const nextIntervalCheckMinutes = new Date(now.getTime());
    nextIntervalCheckMinutes.setSeconds(0, 0);

    if (now.getSeconds() > 0 || now.getMilliseconds() > 0) nextIntervalCheckMinutes.setMinutes(now.getMinutes() + waitInMinutes);
    const waitInMs = nextIntervalCheckMinutes.getTime() - now.getTime();

    return waitInMs;
  }

  static async saveTrendDataToDb(symbol: string, rollWindowInHours: number, candlesData: ICandlesData) {
    try {
      const isDataExist = await DatabaseService.db
        .select({ id: breakOutTrend.id })
        .from(breakOutTrend)
        .where(and(
          eq(breakOutTrend.symbol, symbol),
          eq(breakOutTrend.rollWindowInHours, rollWindowInHours),
          eq(breakOutTrend.endDate, candlesData.candlesEndDate as any),
          eq(breakOutTrend.startDate, candlesData.candlesStartDate as any),
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
      await DatabaseService.db.insert(breakOutTrend).values({
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

  static async waitForNextCheck(delayInMin: number) {
    const waitInMs = TMUtil.getWaitInMsForNextMinutes0Seconds(delayInMin);

    let timer: NodeJS.Timeout;
    await new Promise(resolve => {
      const triggeredTs = +new Date();

      const onCheckTimer = (newWaitInMinutes: number) => {
        const newWaitInMs = TMUtil.getWaitInMsForNextMinutes0Seconds(newWaitInMinutes);

        console.log("newWaitInMs: ", newWaitInMs.toLocaleString());
        const nowTs = +new Date();
        const elapsed = nowTs - triggeredTs;
        const restWaitInMs = waitInMs - elapsed;
        console.log("restWaitInMs: ", restWaitInMs.toLocaleString());
        if (newWaitInMs < restWaitInMs) {
          const nextCheckDate = new Date(Date.now() + newWaitInMs);
          console.log(`Updating wait ms to: ${newWaitInMs.toLocaleString()} (next check at ${nextCheckDate.toLocaleString()})`);

          clearTimeout(timer);
          timer = setTimeout(() => {
            resolve(-1);
            eventBus.off("check-timer", onCheckTimer);
          }, newWaitInMs);
        }
      }

      timer = setTimeout(() => {
        resolve(-1);
        eventBus.off("check-timer", onCheckTimer);
      }, waitInMs);

      eventBus.on("check-timer", onCheckTimer)
    });
  }

  static logAllSubscribers(subscribers: { [symbol: string]: { [rollWindowInHours: number]: ISubscriberDetail[] } }) {
    // Log all subscribers identifiers for every symbol and rollWindowInHours
    const allSubsLog = Object.entries(subscribers).map(([sym, rollMap]) => {
      return Object.entries(rollMap).map(([roll, subs]) => {
        const ids = subs.map(sub => sub.identifier).join(", ");
        return `symbol: ${sym}, rollWindowInHours: ${roll}, identifiers: [${ids}]`;
      }).join("\n");
    }).join("\n");
    console.log("All trend subscribers by symbol and rollWindowInHours:\n" + allSubsLog);
  }
}

export default TMUtil;
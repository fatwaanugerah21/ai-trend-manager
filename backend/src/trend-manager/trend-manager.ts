import { WebSocket } from "@fastify/websocket";
import TMUtil from "./tm-util";

class TrendManager {
  private static subscribers: TSubscriberCollection = {};
  private static watchedTrend: { [symbol: string]: { [rollWindowInHours: number]: { [checkIntervalInMinutes: number]: boolean } } } = {};

  // INTERNAL WORKER
  private static async _ensureWatcher(symbol: string, rollWindowInHours: number, checkIntervalInMinutes: number) {
    this.watchedTrend[symbol] ??= {};
    this.watchedTrend[symbol][rollWindowInHours] ??= {};

    if (!this.watchedTrend[symbol][rollWindowInHours][checkIntervalInMinutes]) {
      this.watchedTrend[symbol][rollWindowInHours][checkIntervalInMinutes] = true;

      this.watchTrends(symbol, rollWindowInHours, checkIntervalInMinutes).finally(() => {
        this.watchedTrend[symbol][rollWindowInHours][checkIntervalInMinutes] = false;
      });
    }
  }

  private static async watchTrends(symbol: string, rollWindowInHours: number, checkIntervalInMinutes: number) {
    console.log(`Watching trend for ${symbol}-${rollWindowInHours}...`);

    let isWaitedForMinutesAligned = false;

    // Ensure the loop aligns with the correct N-minute boundary,
    // e.g., for every 3 minutes: 00:00, 00:03, 00:06, etc.
    //       for every 2 minutes: 00:00, 00:02, 00:04, etc.
    const now = new Date();

    let msToAlign = 0;
    const minute = now.getMinutes();
    const mod = minute % checkIntervalInMinutes;

    console.log("Current time, minute: ", minute);
    console.log("checkIntervalInMinutes: ", checkIntervalInMinutes);
    console.log("mod: ", mod);
    if (mod !== 0) {
      // Next aligned minute mark
      const minutesToAdd = checkIntervalInMinutes - mod;
      console.log("minutesToAdd: ", minutesToAdd);

      now.setMinutes(minute + minutesToAdd);
      msToAlign = TMUtil.getWaitMsToNextMinuteZeroSeconds(minutesToAdd);

      if (msToAlign > 0) {
        console.log(`Waiting for ${msToAlign}ms to align trend watcher loop for ${symbol} ${rollWindowInHours}h/${checkIntervalInMinutes}min to minute ${now.getMinutes().toString().padStart(2, "0")}`);
        await new Promise(resolve => setTimeout(resolve, msToAlign));
        isWaitedForMinutesAligned = true;
      }
    }

    // At this point, we're at a 0-aligned time, such as :00, :03, :06, etc.

    while (true) {
      const subscribers = this.subscribers[symbol]?.[rollWindowInHours]?.[checkIntervalInMinutes];
      if (!subscribers || subscribers.filter(s => s.isListening).length === 0) {
        console.log("No more subscribers for this symbol and rollWindowInHours, stopping trend watcher");
        return;
      }

      if (isWaitedForMinutesAligned) {
        isWaitedForMinutesAligned = false;
      } else {
        await TMUtil.waitForNextCheck(checkIntervalInMinutes || 1);
      }

      const candlesEndDate = new Date();
      const candlesData = await TMUtil.getCandlesData(symbol, candlesEndDate, rollWindowInHours);

      for (const sub of subscribers) {
        if (!sub.isListening) continue;

        if (sub.wsClient.readyState === sub.wsClient.CLOSED) {
          console.log(`${sub.identifier} wsClient is closed, but status is still listening, disabling it`);
          this.disableSubscriber(symbol, rollWindowInHours, checkIntervalInMinutes, sub.identifier);
          continue;
        }

        TMUtil.sendTrendData(sub, candlesData);
        sub.lastTrendSent = new Date(candlesEndDate);
        sub.lastTrendSent.setSeconds(0, 0);
      }

      TMUtil.saveTrendDataToDb(symbol, rollWindowInHours, candlesData);
    }
  }

  // EXPOSED FOR USED EXTERNALLY
  static get getSubscribers() {
    return this.subscribers;
  }

  static async addSubscriber(wsClient: WebSocket, params: ITMAddSubsriberParams): Promise<IPostResponse> {
    const { symbol, rollWindowInHours, checkIntervalInMinutes, identifier } = params;
    console.log("params: ", params);


    const now = new Date();
    now.setSeconds(0, 0);

    this.subscribers[symbol] ??= {};
    this.subscribers[symbol][rollWindowInHours] ??= {};
    this.subscribers[symbol][rollWindowInHours][checkIntervalInMinutes] ??= [];

    const subscribers = this.subscribers[symbol][rollWindowInHours][checkIntervalInMinutes];

    let subscriber = subscribers.find((s) => s.identifier === identifier);
    if (subscriber) {
      if (subscriber.isListening && subscriber.wsClient.readyState === subscriber.wsClient.OPEN) {
        const msg = "This subscriber is still listening, abort adding listener";
        console.log(msg);
        return { isSuccess: false, msg };
      }

      console.log("Re-listen identifier:", identifier);
      subscriber.isListening = true;
      subscriber.wsClient = wsClient;
      subscriber.checkIntervalInMinutes = checkIntervalInMinutes;

      const elapsed = now.getTime() - subscriber.lastTrendSent.getTime();
      const intervalInMs = subscriber.checkIntervalInMinutes * 60_000;

      console.log(`subscriber.lastTrendSent: ${subscriber.lastTrendSent}, elapsed: ${elapsed}ms, intervalInMs: ${intervalInMs}ms`);

      if (elapsed >= intervalInMs) {
        const candlesData = await TMUtil.getCandlesData(symbol, now, rollWindowInHours);
        TMUtil.sendTrendData(subscriber, candlesData);
        subscriber.lastTrendSent = now;
      }
    } else {
      subscriber = {
        identifier: identifier,
        symbol,
        rollWindowInHours,
        wsClient,
        lastTrendSent: now,
        checkIntervalInMinutes: checkIntervalInMinutes,
        isListening: true,
      };
      this.subscribers[symbol][rollWindowInHours][checkIntervalInMinutes].push(subscriber);

      const candlesData = await TMUtil.getCandlesData(symbol, now, rollWindowInHours);
      TMUtil.sendTrendData(subscriber, candlesData);
    }

    const lastTrendSent = subscriber.lastTrendSent;
    const minutesPassed = Math.floor((now.getTime() - lastTrendSent.getTime()) / (60_000));
    this._ensureWatcher(symbol, rollWindowInHours, Math.max(checkIntervalInMinutes - minutesPassed, 0));

    TMUtil.logAllSubscribers(this.subscribers);
    return { isSuccess: true, msg: "Success subscribe" };
  }

  static async updateSubscriber(params: ITMUpdateSubsriberParams): Promise<IPostResponse> {
    const now = new Date();
    now.setSeconds(0, 0);

    const { oldSymbol, oldRollWindowInHours, newSymbol, newRollWindowInHours, oldCheckIntervalInMinutes, newCheckIntervalInMinutes, identifier } = params;

    if (oldSymbol !== newSymbol || oldRollWindowInHours !== newRollWindowInHours || oldCheckIntervalInMinutes !== newCheckIntervalInMinutes) {
      const deletedSubscriber = this.disableSubscriber(oldSymbol, oldRollWindowInHours, oldCheckIntervalInMinutes, identifier, true);
      if (!deletedSubscriber) {
        console.log("Something went wrong while deleting the old subscriber data, old subscriber data not found");
        return { isSuccess: false, msg: "Old subscriber data not found" };
      }

      const subscriber = {
        wsClient: deletedSubscriber.wsClient,
        identifier: identifier,
        symbol: newSymbol,
        rollWindowInHours: newRollWindowInHours,
        lastTrendSent: now,
        checkIntervalInMinutes: newCheckIntervalInMinutes,
        isListening: true,
      };

      this.subscribers[newSymbol] ??= {};
      this.subscribers[newSymbol][newRollWindowInHours] ??= {};
      this.subscribers[newSymbol][newRollWindowInHours][newCheckIntervalInMinutes] ??= [];
      this.subscribers[newSymbol][newRollWindowInHours][newCheckIntervalInMinutes].push(subscriber);

      const candlesData = await TMUtil.getCandlesData(newSymbol, now, newRollWindowInHours);
      TMUtil.sendTrendData(subscriber, candlesData);

      this._ensureWatcher(newSymbol, newRollWindowInHours, newCheckIntervalInMinutes);

      return { isSuccess: true, msg: "Success" };
    }

    return { isSuccess: true, msg: "Nothing changed" }
  }

  static disableSubscriber(symbol: string, rollWindowInHours: number, checkIntervalInMinutes: number, identifier: string, shouldDelete?: boolean): ISubscriberDetail | undefined {
    if (!this.subscribers[symbol]) return undefined;

    const subs = this.subscribers[symbol][rollWindowInHours][checkIntervalInMinutes];
    if (!subs || !subs.length) return undefined;

    const idx = subs.findIndex(s => s.identifier === identifier);
    if (idx === -1) return undefined;

    const subscriber = subs[idx];
    if (!subscriber) return undefined;

    console.log(`Disabling subscriber: ${identifier}`);
    subscriber.isListening = false;
    subscriber.removedAt = new Date();

    if (shouldDelete) {
      this.subscribers[symbol][rollWindowInHours][checkIntervalInMinutes].splice(idx, 1);
    }

    console.log(`Subscriber disabled: ${identifier} at: ${subscriber.removedAt.toLocaleDateString()}`);
    return subscriber;
  }
}

export default TrendManager;
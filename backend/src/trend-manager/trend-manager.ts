import ExchangeService from "@/services/exchange-service/exchange-service";
import GrokAiService from "@/services/grok-ai.service";
import eventBus from "@/utils/event-bus.util";
import { generateImageOfCandles } from "@/utils/image-generator.util";
import { WebSocket } from "@fastify/websocket";
import TMUtil from "./tm-util";

interface IPostResponse { isSuccess: boolean, msg?: string };

class TrendManager {
  private static subscribers: { [symbol: string]: { [rollWindowInHours: number]: ISubscriberDetail[] } } = {}
  private static watchedTrend: { [symbol: string]: { [rollWindowInHours: number]: boolean } } = {};

  static get getSubscribers() {
    return this.subscribers;
  }

  static async addSubscriber(wsClient: WebSocket, params: ITMAddSubsriberParams): Promise<IPostResponse> {
    const { symbol, rollWindowInHours, checkIntervalInMinutes, identifier } = params;

    const now = new Date();
    now.setSeconds(0, 0);

    this.subscribers[symbol] ??= {};
    this.subscribers[symbol][rollWindowInHours] ??= [];

    const subscribers = this.subscribers[symbol][rollWindowInHours];

    let subscriber = subscribers.find((s) => s.identifier === identifier);
    if (subscriber) {
      if (subscriber.isListening &&
        subscriber.wsClient.readyState === subscriber.wsClient.OPEN
      ) {
        const msg = "This subscriber still listening abort add listener"
        console.log(msg);
        return { isSuccess: false, msg };
      }

      console.log("Re-listen identifier:", identifier);
      subscriber.isListening = true;
      subscriber.wsClient = wsClient;
      subscriber.checkIntervalInMinutes = checkIntervalInMinutes;

      const elapsed = now.getTime() - subscriber.lastTrendSent.getTime();
      const intervalInMs = subscriber.checkIntervalInMinutes * 60_000;

      console.log("subscriber.lastTrendSent: ", subscriber.lastTrendSent);
      console.log("elapsed: ", elapsed);
      console.log("intervalInMs: ", intervalInMs);

      if (elapsed >= intervalInMs) {
        const candlesData = await this._getCandlesData(symbol, now, rollWindowInHours);
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

      }
      this.subscribers[symbol][rollWindowInHours].push(subscriber);

      const candlesData = await this._getCandlesData(symbol, now, rollWindowInHours);
      TMUtil.sendTrendData(subscriber, candlesData);
    }

    const lastTrendSent = subscriber.lastTrendSent;
    const minutesPassed = Math.floor((now.getTime() - lastTrendSent.getTime()) / (60_000));
    this._ensureWatcher(symbol, rollWindowInHours, Math.max(checkIntervalInMinutes - minutesPassed, 0));

    TMUtil.logAllSubscribers(this.subscribers);
    return { isSuccess: true, msg: "Success subscribe" }
  }

  static async updateSubscriber(_: WebSocket, params: ITMUpdateSubsriberParams): Promise<IPostResponse> {
    const now = new Date();
    now.setSeconds(0, 0);

    const { oldSymbol, oldRollWindowInHours, newSymbol, newRollWindowInHours, checkIntervalInMinutes, identifier } = params;

    if (oldSymbol !== newSymbol || oldRollWindowInHours !== newRollWindowInHours) {
      const deletedSubscriber = this.disableSubscriber(oldSymbol, oldRollWindowInHours, identifier, true);
      if (!deletedSubscriber) {
        console.log("Something went wrong on deleting the old subscriber data, old subscriber data not found");
        return { isSuccess: false, msg: "old subscriber data not found" }
      }

      const subscriber = {
        wsClient: deletedSubscriber.wsClient,
        identifier: identifier,
        symbol: newSymbol,
        rollWindowInHours: newRollWindowInHours,
        lastTrendSent: now,
        checkIntervalInMinutes: checkIntervalInMinutes,
        isListening: true,
      }
      this.subscribers[oldSymbol] ??= {};
      this.subscribers[oldSymbol][oldRollWindowInHours] ??= [];

      this.subscribers[oldSymbol][oldRollWindowInHours].push(subscriber);

      return { isSuccess: true, msg: "Success" }
    } else {
      if (!this.subscribers[oldSymbol]) return { isSuccess: false, msg: "Subscribers is still empty" };

      const subscribers = this.subscribers[oldSymbol][oldRollWindowInHours]
      const idx = subscribers.findIndex(s => s.identifier === identifier);
      if (idx === -1) return { isSuccess: false, msg: "Subscriber with that identifier not found" };

      const subscriber = this.subscribers[oldSymbol][oldRollWindowInHours][idx];
      subscriber.checkIntervalInMinutes = checkIntervalInMinutes;

      this._ensureWatcher(oldSymbol, oldRollWindowInHours, this.getMinutesPassedAndCheckIntervalElapsed(subscriber));

      return { isSuccess: true, msg: "Success" }
    }
  }

  private static getMinutesPassedAndCheckIntervalElapsed(subscriber: ISubscriberDetail): number {
    const now = new Date();
    now.setSeconds(0, 0);
    const lastTrendSent = subscriber.lastTrendSent;
    const minutesPassed = Math.floor((now.getTime() - lastTrendSent.getTime()) / (60_000));

    return Math.max(subscriber.checkIntervalInMinutes - minutesPassed, 0);
  }

  static async changeSubscriberLastTrendSent(_: WebSocket, params: ITMChangeSubsriberLastSentParams): Promise<IPostResponse> {
    console.log("Changing subscriber last trend sent data: ", params);

    const subscriber = this.subscribers[params.symbol]?.[params.rollWindowInHours]?.find(s => s.identifier === params.identifier);
    if (!subscriber) return { isSuccess: false, msg: "Subscriber not found" };

    subscriber.lastTrendSent = new Date(params.newLastSent);
    subscriber.lastTrendSent.setSeconds(0, 0);

    this._ensureWatcher(params.symbol, params.rollWindowInHours, this.getMinutesPassedAndCheckIntervalElapsed(subscriber));

    return { isSuccess: true, msg: "Success update last trend sent" }
  }

  private static async _ensureWatcher(symbol: string, rollWindowInHours: number, checkIntervalInMinutes: number) {
    this.watchedTrend[symbol] ??= {};

    if (!this.watchedTrend[symbol][rollWindowInHours]) {
      this.watchedTrend[symbol][rollWindowInHours] = true;

      this.watchTrends(symbol, rollWindowInHours).finally(() => {
        this.watchedTrend[symbol][rollWindowInHours] = false;
      });
    } else {
      eventBus.emit("check-timer", checkIntervalInMinutes);
    }
  }

  static disableSubscriber(symbol: string, rollWindowInHours: number, identifier: string, shouldDelete?: boolean): ISubscriberDetail | undefined {
    if (!this.subscribers[symbol]) return undefined;

    const subs = this.subscribers[symbol][rollWindowInHours];
    if (!subs.length) return undefined;

    const idx = subs.findIndex(s => s.identifier === identifier);
    if (idx === -1) return undefined;

    const subscriber = subs[idx]
    if (!subscriber) return undefined;

    console.log(`Disabling subscriber: ${identifier}`);
    subscriber.isListening = false;
    subscriber.removedAt = new Date();

    if (shouldDelete) this.subscribers[symbol][rollWindowInHours].splice(idx);

    console.log(`Subscriber disabled: ${identifier} at: ${subscriber.removedAt.toLocaleDateString()}`);
    return subscriber;
  }

  private static async watchTrends(symbol: string, rollWindowInHours: number) {
    console.log(`Watching trend for ${symbol}-${rollWindowInHours}...`);

    while (true) {
      if (this.subscribers[symbol][rollWindowInHours].filter(s => s.isListening).length === 0) {
        console.log("No more subscribers for this symbol and rollWindowInHours stopping trend watcher");
        return;
      }

      const closestNextCheckInMinutes = TMUtil.getSubscribersClosesNextCheckInMinutes(this.subscribers[symbol][rollWindowInHours]);
      await TMUtil.waitForNextCheck(closestNextCheckInMinutes || 1);

      const candlesEndDate = new Date();
      const candlesData =
        await this._getCandlesData(symbol, candlesEndDate, rollWindowInHours);

      for (const sub of this.subscribers[symbol][rollWindowInHours]) {
        if (!sub.isListening) continue;
        if (sub.isListening && sub.wsClient.readyState === sub.wsClient.CLOSED) {
          console.log(`${sub.identifier} wsClient is off, but it's status is still listening disabling it`);
          this.disableSubscriber(symbol, rollWindowInHours, sub.identifier);
          continue;
        }

        const { checkIntervalInMinutes, lastTrendSent } = sub;

        const elapsed = candlesEndDate.getTime() - lastTrendSent.getTime();
        const intervalInMs = checkIntervalInMinutes * 60_000;

        if (elapsed < intervalInMs) continue;

        TMUtil.sendTrendData(sub, candlesData);
        sub.lastTrendSent = new Date(candlesEndDate);
        sub.lastTrendSent.setSeconds(0, 0);
      }

      TMUtil.saveTrendDataToDb(symbol, rollWindowInHours, candlesData);
    }
  }

  private static async _getCandlesData(symbol: string, candlesEndDate: Date, rollWindowInHours: number): Promise<ICandlesData> {
    console.log(`Getting candles data for ${symbol}-${candlesEndDate}-${rollWindowInHours}H...`);

    const candlesStartDate = new Date(candlesEndDate.getTime() - (rollWindowInHours * 60 * 60 * 1000));
    const candles = await ExchangeService.getCandles(symbol, candlesStartDate, candlesEndDate, "1Min");

    const closePrice = candles[candles.length - 1]?.closePrice;
    const candlesImage = await generateImageOfCandles(symbol, candles);
    const candlesTrend = await GrokAiService.analyzeBreakOutTrend(candlesImage);

    return { candlesStartDate, candlesEndDate, candlesImage, candlesTrend, closePrice: closePrice };
  }
}

export default TrendManager;
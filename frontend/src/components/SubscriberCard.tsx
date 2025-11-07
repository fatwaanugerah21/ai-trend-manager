"use client"

export interface ITrendSubscriber {
  identifier: string;
  checkIntervalInMinutes: number;
  isListening: boolean;
  lastTrendSent: Date;
  rollWindowInHours: number;
  symbol: string;
}

interface SubscriberCardProps {
  subscriber: ITrendSubscriber;
}

export default function SubscriberCard({ subscriber }: SubscriberCardProps) {
  return (
    <div
      className="bg-white rounded-lg shadow border border-gray-100 px-6 py-4"
      data-identifier={subscriber.identifier || subscriber.symbol}
    >
      <h2 className="text-sm font-mono font-semibold text-gray-900 mb-2 break-all">
        {subscriber.identifier} <span className="text-gray-400">-</span> (<span className="font-semibold text-gray-900">{subscriber.symbol}</span> {subscriber.rollWindowInHours}H)
      </h2>
      <div className={`flex flex-col sm:flex-row justify-between`}>
        <div className="flex flex-col text-sm text-gray-600 gap-1">
          <span className="text-sm text-gray-500">
            Last trend sent:{" "}
            {subscriber.lastTrendSent
              ? new Date(subscriber.lastTrendSent).toLocaleString()
              : "Never"}
          </span>
          <span className="text-sm text-gray-500">
            Next trend check:{" "}
            {subscriber.lastTrendSent
              ? new Date(
                new Date(subscriber.lastTrendSent).getTime() +
                subscriber.checkIntervalInMinutes * 60 * 1000
              ).toLocaleString()
              : "Unknown"}
          </span>
          <span>
            Status:{" "}
            <span
              className={
                subscriber.isListening
                  ? "text-gray-900 font-semibold"
                  : "text-gray-400 font-semibold"
              }
            >
              {subscriber.isListening ? "Listening" : "Inactive"}
            </span>
          </span>
        </div>
        <div className="flex flex-col sm:items-end text-sm text-gray-600 gap-1">
          <span>
            Check interval: <span className="font-medium">{subscriber.checkIntervalInMinutes} min</span>
          </span>
          <span>
            Roll window: <span className="font-medium">{subscriber.rollWindowInHours} hr</span>
          </span>
        </div>
      </div>
    </div>
  );
}

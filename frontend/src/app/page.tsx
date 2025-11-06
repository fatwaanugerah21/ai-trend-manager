"use client"
import { useEffect, useState } from "react";

const baseUrl = "http://127.0.0.1:8080";

async function fetchSubscribers(): Promise<ITrendSubscriber[]> {
  const data = await fetch(`${baseUrl}/trend-subscribers`)
  const jsonified = data.json()
  console.log("data: ", jsonified);

  return jsonified;
}

interface ITrendSubscriber {
  identifier: string;
  checkIntervalInMinutes: number,
  isListening: boolean,
  lastTrendSent: Date,
  rollWindowInHours: number,
  symbol: string,
}

export default function Home() {
  // Use a client component to auto-refresh every 1 minute 2 seconds (62,000 ms)
  const [subscribers, setSubscribers] = useState<ITrendSubscriber[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function refresh() {
      const data = await fetch(`${baseUrl}/trend-subscribers`);
      const jsonified = await data.json();
      if (isMounted) setSubscribers(jsonified);
    }

    refresh(); // initial fetch

    const interval = setInterval(refresh, 62_000); // 1 minute 2 seconds

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);
  console.log("subscribers: ", subscribers)

  return (
    <>
      <div className="max-w-2xl mx-auto py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold text-center tracking-tight flex-1">Trend Subscribers</h1>
          <form method="GET" className="ml-4">
            {/* Next.js page functions (app router) are server components  
                so we use client-side navigation for "refresh"
            */}
            <button
              type="submit"
              aria-label="Refresh"
              className="inline-flex items-center px-3 py-1.5 rounded border border-gray-200 bg-white text-sm font-medium hover:bg-gray-50 ml-2"
              title="Refresh"
            >
              🔄 Refresh
            </button>
          </form>
        </div>
        <div className="space-y-6">
          {subscribers.length === 0 ? (
            <div className="text-center text-gray-500 text-lg">No subscribers found.</div>
          ) : (
            subscribers.map((sub) => (
              <div
                key={sub.symbol + sub.identifier + sub.lastTrendSent}
                className="bg-white rounded-lg shadow border border-gray-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                data-identifier={sub.identifier || sub.symbol}
              >
                <div className="flex flex-col">
                  <span className="text-xl font-medium text-gray-900">{sub.symbol}</span>
                  <span className="text-xs text-gray-400">
                    Identifier: <span className="font-mono">{sub.identifier || "N/A"}</span>
                  </span>
                  <span className="text-sm text-gray-500">
                    Last trend sent:{" "}
                    {sub.lastTrendSent
                      ? new Date(sub.lastTrendSent).toLocaleString()
                      : "Never"}
                  </span>
                  <span className="text-sm text-gray-500">
                    Next trend check:{" "}
                    {sub.lastTrendSent
                      ? new Date(
                        new Date(sub.lastTrendSent).getTime() +
                        sub.checkIntervalInMinutes * 60 * 1000
                      ).toLocaleString()
                      : "Unknown"}
                  </span>
                </div>
                <div className="flex flex-col sm:items-end text-sm text-gray-600 gap-1">
                  <span>
                    Check interval: <span className="font-medium">{sub.checkIntervalInMinutes} min</span>
                  </span>
                  <span>
                    Roll window: <span className="font-medium">{sub.rollWindowInHours} hr</span>
                  </span>
                  <span>
                    Status:{" "}
                    <span className={
                      sub.isListening
                        ? "text-green-600 font-semibold"
                        : "text-gray-400 font-semibold"
                    }>
                      {sub.isListening ? "Listening" : "Inactive"}
                    </span>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

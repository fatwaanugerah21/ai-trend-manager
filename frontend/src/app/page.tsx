"use client"
import { useEffect, useState, useCallback } from "react";
import SubscriberCard, { type ITrendSubscriber } from "@/components/SubscriberCard";

const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

export default function Home() {
  // Use a client component to auto-refresh every 1 minute 2 seconds (62,000 ms)
  const [subscribers, setSubscribers] = useState<ITrendSubscriber[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSubscribers = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await fetch(`${baseUrl}/trend-subscribers`);
      const jsonified = await data.json();
      setSubscribers(jsonified);
    } catch (error) {
      console.error("Failed to fetch subscribers:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSubscribers(); // initial fetch

    const interval = setInterval(refreshSubscribers, 62_000); // 1 minute 2 seconds

    return () => {
      clearInterval(interval);
    };
  }, [refreshSubscribers]);

  return (
    <>
      <div className="max-w-2xl mx-auto py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold text-center tracking-tight flex-1">Trend Subscribers</h1>
          <button
            type="button"
            aria-label="Refresh"
            className="inline-flex items-center px-3 py-1.5 rounded border border-gray-200 bg-white text-sm font-medium hover:bg-gray-50 ml-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh"
            onClick={refreshSubscribers}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Loading...
              </>
            ) : (
              <>🔄 Refresh</>
            )}
          </button>
        </div>
        <div className="space-y-6">
          {isLoading && subscribers.length === 0 ? (
            <>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-lg shadow border border-gray-100 px-6 py-4 animate-pulse"
                >
                  <div className="h-5 bg-gray-200 rounded mb-2 w-3/4"></div>
                  <div className="flex flex-col sm:flex-row justify-between">
                    <div className="flex flex-col text-sm gap-1">
                      <div className="h-4 bg-gray-200 rounded w-full"></div>
                      <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                      <div className="h-4 bg-gray-200 rounded w-4/6"></div>
                    </div>
                    <div className="flex flex-col sm:items-end text-sm gap-1">
                      <div className="h-4 bg-gray-200 rounded w-32"></div>
                      <div className="h-4 bg-gray-200 rounded w-24"></div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : subscribers.length === 0 ? (
            <div className="text-center text-gray-500 text-lg">No subscribers found.</div>
          ) : (
            subscribers.map((sub) => (
              <SubscriberCard key={sub.symbol + sub.identifier + sub.lastTrendSent} subscriber={sub} />
            ))
          )}
        </div>
      </div>
    </>
  );
}

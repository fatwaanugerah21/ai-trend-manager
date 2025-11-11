"use client"

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";

interface EditableLastTrendSentProps {
  lastTrendSent: Date;
  identifier: string;
  onUpdate?: () => void;
  hideEditButton?: boolean;
  onEditingChange?: (isEditing: boolean) => void;
}

const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

export default function EditableLastTrendSent({
  lastTrendSent,
  identifier,
  onUpdate,
  hideEditButton = false,
  onEditingChange,
}: EditableLastTrendSentProps) {
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (onEditingChange) {
      onEditingChange(isEditing);
    }
  }, [isEditing, onEditingChange]);
  const [value, setValue] = useState(new Date(lastTrendSent).toISOString().slice(0, 16));
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setValue(new Date(lastTrendSent).toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16));
    }
  }, [lastTrendSent, isEditing]);

  const handleUpdate = async () => {
    if (!value) {
      setError("Last trend sent date is required");
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch(`${baseUrl}/trend-subscribers/${identifier}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lastTrendSent: new Date(value).toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update last trend sent");
      }

      setIsEditing(false);
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred while updating");
      console.error("Failed to update subscriber:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setValue(new Date(lastTrendSent).toISOString().slice(0, 16));
    setError(null);
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Last trend sent</label>
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm w-full sm:w-56"
            disabled={isUpdating}
          />
        </div>
        {error && <span className="text-xs text-red-600">{error}</span>}
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={isUpdating}
            className="h-7 px-2.5 text-xs"
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleUpdate}
            disabled={isUpdating}
            className="h-7 px-2.5 text-xs"
          >
            {isUpdating ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-gray-500">
        Last trend sent: {lastTrendSent ? new Date(lastTrendSent).toLocaleString() : "Never"}
      </span>
      {!hideEditButton && (
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setIsEditing(true)}
          className="h-6 w-6 p-1"
          aria-label="Update last trend sent"
          title="Update last trend sent"
        >
          <Edit className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}


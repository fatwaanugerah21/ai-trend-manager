"use client"

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";

interface EditableCheckIntervalProps {
  checkIntervalInMinutes: number;
  identifier: string;
  onUpdate?: () => void;
  hideEditButton?: boolean;
  onEditingChange?: (isEditing: boolean) => void;
}

const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

export default function EditableCheckInterval({
  checkIntervalInMinutes,
  identifier,
  onUpdate,
  hideEditButton = false,
  onEditingChange,
}: EditableCheckIntervalProps) {
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (onEditingChange) {
      onEditingChange(isEditing);
    }
  }, [isEditing, onEditingChange]);
  const [value, setValue] = useState(checkIntervalInMinutes.toString());
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setValue(checkIntervalInMinutes.toString());
    }
  }, [checkIntervalInMinutes, isEditing]);

  const handleUpdate = async () => {
    const newValue = parseInt(value, 10);

    if (isNaN(newValue) || newValue <= 0) {
      setError("Check interval must be a positive number");
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
          checkIntervalInMinutes: newValue,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update check interval");
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
    setValue(checkIntervalInMinutes.toString());
    setError(null);
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2 w-full sm:w-auto sm:items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Check interval (minutes)</label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            min="1"
            className="px-2 py-1 border border-gray-300 rounded text-sm w-full sm:w-36"
            disabled={isUpdating}
          />
        </div>
        {error && <span className="text-xs text-red-600">{error}</span>}
        <div className="flex gap-1.5 w-full sm:justify-end">
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
      {!hideEditButton && (
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setIsEditing(true)}
          className="h-6 w-6 p-1"
          aria-label="Update check interval"
          title="Update check interval"
        >
          <Edit className="h-3 w-3" />
        </Button>
      )}
      <span>
        Check interval: <span className="font-medium">{checkIntervalInMinutes} min</span>
      </span>
    </div>
  );
}


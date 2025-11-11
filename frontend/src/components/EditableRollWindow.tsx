"use client"

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";

interface EditableRollWindowProps {
  rollWindowInHours: number;
  identifier: string;
  onUpdate?: () => void;
  hideEditButton?: boolean;
  onEditingChange?: (isEditing: boolean) => void;
}

const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

export default function EditableRollWindow({
  rollWindowInHours,
  identifier,
  onUpdate,
  hideEditButton = false,
  onEditingChange,
}: EditableRollWindowProps) {
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (onEditingChange) {
      onEditingChange(isEditing);
    }
  }, [isEditing, onEditingChange]);
  const [value, setValue] = useState(rollWindowInHours.toString());
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setValue(rollWindowInHours.toString());
    }
  }, [rollWindowInHours, isEditing]);

  const handleUpdate = async () => {
    const newValue = parseFloat(value);

    if (isNaN(newValue) || newValue <= 0) {
      setError("Roll window must be a positive number");
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
          rollWindowInHours: newValue,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update roll window");
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
    setValue(rollWindowInHours.toString());
    setError(null);
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2 w-full sm:w-auto sm:items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Roll window (hours)</label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            min="0.1"
            step="0.1"
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
          aria-label="Update roll window"
          title="Update roll window"
        >
          <Edit className="h-3 w-3" />
        </Button>
      )}
      <span>
        Roll window: <span className="font-medium">{rollWindowInHours} hr</span>
      </span>
    </div>
  );
}


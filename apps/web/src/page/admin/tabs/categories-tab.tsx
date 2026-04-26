import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Check, Pencil, Plus, X } from "lucide-react";

import type { AdminCategory } from "../types";
import { SectionHeader } from "../ui";

type CategoriesTabProps = {
  categories: AdminCategory[];
  onToggleCategory: (id: string) => void;
  onRenameCategory: (id: string, name: string) => void;
  onAddCategory: (name: string) => void;
};

export function CategoriesTab({
  categories,
  onToggleCategory,
  onRenameCategory,
  onAddCategory,
}: CategoriesTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  const enabledCount = categories.filter((category) => category.isEnabled).length;

  const handleStartEdit = (category: AdminCategory) => {
    setEditingId(category.id);
    setEditName(category.name);
  };

  const handleSaveEdit = (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      return;
    }

    onRenameCategory(id, trimmed);
    setEditingId(null);
  };

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }

    onAddCategory(trimmed);
    setNewName("");
    setShowAdd(false);
  };

  return (
    <div>
      <SectionHeader
        title="Work categories"
        description="Manage the categories developers can log time against. Default categories can be disabled but not deleted."
        action={
          <Button
            size="sm"
            className="h-7 text-xs bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="size-3 mr-1" />
            Add category
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-8"></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-20">Enabled</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {showAdd && (
                <tr className="border-b bg-teal-50/40 dark:bg-teal-950/20">
                  <td className="px-4 py-2">
                    <div className="size-3 rounded-full bg-zinc-400" />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      autoFocus
                      className="h-7 text-xs w-48"
                      placeholder="Category name"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && handleAdd()}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs text-muted-foreground">Custom</span>
                  </td>
                  <td />
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="size-7" onClick={handleAdd}>
                        <Check className="size-3 text-teal-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => setShowAdd(false)}
                      >
                        <X className="size-3 text-muted-foreground" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}

              {categories.map((category) => (
                <tr
                  key={category.id}
                  className={cn(
                    "border-b last:border-b-0 transition-colors",
                    !category.isEnabled && "opacity-50",
                    "hover:bg-muted/30",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <div className={cn("size-3 rounded-full", category.color)} />
                  </td>

                  <td className="px-4 py-2.5">
                    {editingId === category.id ? (
                      <Input
                        autoFocus
                        className="h-7 text-xs w-48"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            handleSaveEdit(category.id);
                          }

                          if (event.key === "Escape") {
                            setEditingId(null);
                          }
                        }}
                      />
                    ) : (
                      <span className="text-sm font-medium">{category.name}</span>
                    )}
                  </td>

                  <td className="px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">
                      {category.isDefault ? "Default" : "Custom"}
                    </span>
                  </td>

                  <td className="px-4 py-2.5 text-center">
                    <Switch
                      checked={category.isEnabled}
                      onCheckedChange={() => onToggleCategory(category.id)}
                      className="scale-75"
                    />
                  </td>

                  <td className="px-4 py-2.5">
                    {editingId === category.id ? (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => handleSaveEdit(category.id)}
                        >
                          <Check className="size-3 text-teal-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="size-3 text-muted-foreground" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => handleStartEdit(category)}
                        disabled={!category.isEnabled}
                      >
                        <Pencil className="size-3" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-2">
        {enabledCount} of {categories.length} categories enabled
      </p>
    </div>
  );
}

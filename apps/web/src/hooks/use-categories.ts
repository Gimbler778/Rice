import { useQuery } from "@tanstack/react-query";
import { fetchCategories } from "@/api/categories-api";
import { authClient } from "@/lib/auth-client";

export function useCategories() {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    enabled: isAuthenticated,
  });

  return {
    categories: data?.categories ?? [],
    isLoading,
    error,
  };
}

export function useCategoryMapping() {
  const { categories } = useCategories();
  const badgeColorClasses: Record<string, string> = {
    slate: "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
    gray: "bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300",
    zinc: "bg-zinc-100 text-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300",
    neutral: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300",
    stone: "bg-stone-100 text-stone-800 dark:bg-stone-900/40 dark:text-stone-300",
    red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    orange: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    lime: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
    green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    teal: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
    cyan: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
    sky: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
    violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
    purple: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
    fuchsia: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
    pink: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
    rose: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  };

  const normalizeCategoryKey = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, "_");

  const getCategory = (id: string) => {
    const byId = categories.find((c) => c.id === id);
    if (byId) return byId;

    const normalized = normalizeCategoryKey(id);
    return categories.find(
      (c) => normalizeCategoryKey(c.name) === normalized,
    );
  };

  const getCategoryName = (id: string) => {
    const cat = getCategory(id);
    return cat ? cat.name : "Unknown category";
  };

  const getCategoryColor = (id: string) => {
    const cat = getCategory(id);
    return cat ? cat.color : "bg-zinc-400";
  };

  const getCategoryBadgeClass = (id: string) => {
    const color = getCategoryColor(id);
    // Simple mapping from base tailwind color to badge classes
    const match = color.match(/^bg-([a-z]+)/);
    const colorName = match?.[1];
    return badgeColorClasses[colorName ?? ""] ?? badgeColorClasses.zinc;
  };

  const enabledCategories = categories.filter((c) => c.isEnabled);

  return {
    getCategoryName,
    getCategoryColor,
    getCategoryBadgeClass,
    enabledCategories,
    categories,
  };
}

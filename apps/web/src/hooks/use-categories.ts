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

  const getCategoryName = (id: string) => {
    const cat = categories.find((c) => c.id === id);
    return cat ? cat.name : "Unknown category";
  };

  const getCategoryColor = (id: string) => {
    const cat = categories.find((c) => c.id === id);
    return cat ? cat.color : "bg-zinc-400";
  };

  const getCategoryBadgeClass = (id: string) => {
    const color = getCategoryColor(id);
    // Simple mapping from base tailwind color to badge classes
    const colorName = color.replace("bg-", "").split("-")[0];
    return `bg-${colorName}-100 text-${colorName}-800 dark:bg-${colorName}-900/40 dark:text-${colorName}-300`;
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

import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import type { AdminTab } from "@/lib/admin/types";

import { isValidAdminTab, TAB_PARAM_KEY } from "./admin-tab-config";

export function useAdminTabState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromQuery = searchParams.get(TAB_PARAM_KEY);
  const activeTab: AdminTab = isValidAdminTab(tabFromQuery) ? tabFromQuery : "categories";

  useEffect(() => {
    if (isValidAdminTab(tabFromQuery)) {
      return;
    }

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(TAB_PARAM_KEY, "categories");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams, tabFromQuery]);

  const setActiveTab = (nextTab: string) => {
    if (!isValidAdminTab(nextTab)) {
      return;
    }

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(TAB_PARAM_KEY, nextTab);
      return next;
    });
  };

  return {
    activeTab,
    setActiveTab,
  };
}

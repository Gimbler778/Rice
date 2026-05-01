import { Loader2 } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminTabPanels } from "@/lib/admin-tab-panels";
import { ADMIN_TABS } from "@/lib/admin-tab-config";
import { useAdminPanelData } from "@/lib/use-admin-panel-data";
import { useAdminTabState } from "@/lib/use-admin-tab-state";

export function AdminPage() {
  const { activeTab, setActiveTab } = useAdminTabState();
  const adminData = useAdminPanelData();

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 shrink-0">
        <h1 className="text-sm font-semibold">Admin panel</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage categories, users, teams, and org-wide policy.
        </p>
      </div>

      {adminData.globalStatus && (
        <div className="border-b bg-muted/30 px-6 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-3 animate-spin" />
            {adminData.globalStatus}
          </span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0">
        <div className="border-b px-6 shrink-0">
          <TabsList
            variant="line"
            className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none p-0 py-2"
          >
            {ADMIN_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="h-8 flex-none px-3 text-sm"
                >
                  <Icon className="size-4 shrink-0" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <AdminTabPanels
          currentUserId={adminData.currentUserId}
          categories={adminData.categories}
          users={adminData.users}
          teams={adminData.teams}
          policy={adminData.policy}
        />
      </Tabs>
    </div>
  );
}

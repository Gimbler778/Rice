import { useState } from "react";
import type { ReactNode } from "react";

import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import type { PolicySettings } from "../types";
import { SectionHeader } from "../ui";

type PolicyTabProps = {
  policy: PolicySettings;
  onPolicyChange: (updates: Partial<PolicySettings>) => void;
  onSave: () => void;
};

export function PolicyTab({ policy, onPolicyChange, onSave }: PolicyTabProps) {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Field = ({
    label,
    description,
    children,
  }: {
    label: string;
    description?: string;
    children: ReactNode;
  }) => (
    <div className="flex items-start justify-between gap-6 py-4 border-b last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );

  return (
    <div>
      <SectionHeader
        title="Policy settings"
        description="Configure organisation-wide defaults for reminders, submission cadence, and data handling."
      />

      <Card>
        <CardContent className="pt-4">
          <Field
            label="Daily reminder time"
            description="Sends a Resend email reminder to developers who haven't logged today. Weekdays only."
          >
            <Input
              type="time"
              className="h-8 text-xs w-32"
              value={policy.dailyReminderTime}
              onChange={(event) =>
                onPolicyChange({ dailyReminderTime: event.target.value })
              }
            />
          </Field>

          <Field
            label="Weekly submission reminder"
            description="Sends a Friday reminder email to developers who haven't submitted their week."
          >
            <div className="flex items-center gap-2">
              <Select
                value={policy.weeklyReminderDay}
                onValueChange={(value) => onPolicyChange({ weeklyReminderDay: value })}
              >
                <SelectTrigger className="h-8 text-xs w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["monday", "tuesday", "wednesday", "thursday", "friday"].map((day) => (
                    <SelectItem key={day} value={day} className="text-xs capitalize">
                      {day.charAt(0).toUpperCase() + day.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">at</span>
              <Input
                type="time"
                className="h-8 text-xs w-28"
                value={policy.weeklyReminderTime}
                onChange={(event) =>
                  onPolicyChange({ weeklyReminderTime: event.target.value })
                }
              />
            </div>
          </Field>

          <Field
            label="Submission cadence"
            description="How often developers are expected to submit their timesheets."
          >
            <Select
              value={policy.submissionCadence}
              onValueChange={(value) =>
                onPolicyChange({
                  submissionCadence: value as PolicySettings["submissionCadence"],
                })
              }
            >
              <SelectTrigger className="h-8 text-xs w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly" className="text-xs">
                  Weekly
                </SelectItem>
                <SelectItem value="biweekly" className="text-xs">
                  Bi-weekly
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Data retention"
            description="How long timesheet data is kept before being archived. Minimum 6 months."
          >
            <div className="flex items-center gap-2">
              <Select
                value={String(policy.dataRetentionMonths)}
                onValueChange={(value) =>
                  onPolicyChange({ dataRetentionMonths: Number(value) })
                }
              >
                <SelectTrigger className="h-8 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[6, 12, 18, 24, 36].map((months) => (
                    <SelectItem key={months} value={String(months)} className="text-xs">
                      {months} months
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Field>

          <Field
            label="Lock entries after approval"
            description="When a manager approves a week, the developer can no longer edit their entries."
          >
            <Switch
              checked={policy.lockAfterApproval}
              onCheckedChange={(value) => onPolicyChange({ lockAfterApproval: value })}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2 mt-4">
        {saved && (
          <div className="flex items-center gap-1.5 text-xs text-teal-600 dark:text-teal-400">
            <CheckCircle2 className="size-3.5" />
            Saved
          </div>
        )}
        <Button
          size="sm"
          className="h-7 text-xs bg-teal-600 hover:bg-teal-700 text-white"
          onClick={handleSave}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}

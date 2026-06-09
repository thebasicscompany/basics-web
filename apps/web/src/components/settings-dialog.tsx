"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";

type UserResource = NonNullable<ReturnType<typeof useUser>["user"]>;

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateLearnerDisplayName } from "@/lib/profile-actions";

export type SettingsTab = "profile" | "account";

export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = "profile",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
}) {
  const { user } = useUser();

  if (!user) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Remount on open so local form state resets to the latest values. */}
      {open ? <SettingsDialogBody user={user} initialTab={initialTab} /> : null}
    </Dialog>
  );
}

function SettingsDialogBody({
  user,
  initialTab,
}: {
  user: UserResource;
  initialTab: SettingsTab;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [name, setName] = useState(user.fullName ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  async function saveProfile() {
    const trimmed = name.trim();
    if (!trimmed) {
      setStatus({ kind: "error", message: "Enter a display name." });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const [firstName, ...rest] = trimmed.split(/\s+/);
      await user.update({ firstName, lastName: rest.join(" ") });
      await updateLearnerDisplayName(trimmed);
      setStatus({ kind: "success", message: "Profile updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to update profile.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your profile and account.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as SettingsTab)}
        >
          <TabsList className="w-full">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="settings-display-name">Display name</Label>
              <Input
                id="settings-display-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground">
                Shown to your tutor and used across Basics.
              </p>
            </div>
            {status ? (
              <p
                className={
                  status.kind === "error"
                    ? "text-sm text-destructive"
                    : "text-sm text-primary"
                }
              >
                {status.message}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button onClick={() => void saveProfile()} disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="account" className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="settings-email">Email</Label>
              <Input id="settings-email" value={email} readOnly disabled />
              <p className="text-xs text-muted-foreground">
                Your sign-in email. Contact support to change it.
              </p>
            </div>
          </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

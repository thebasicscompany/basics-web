"use client";

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  GearIcon,
  SignOutIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";

import { SettingsDialog, type SettingsTab } from "@/components/settings-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavUser() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");

  if (!user) {
    return null;
  }

  const name = user.fullName ?? user.username ?? "Learner";
  const email = user.primaryEmailAddress?.emailAddress ?? "";

  const openSettings = (tab: SettingsTab) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton className="aria-expanded:bg-muted" />
            }
          >
            <GearIcon />
            Settings
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side="top"
            align="start"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2 font-normal text-muted-foreground">
                <UserCircleIcon className="size-4" />
                <span className="truncate">{email || name}</span>
              </DropdownMenuLabel>
              <DropdownMenuLabel className="flex items-center gap-2 pt-0 font-normal text-muted-foreground">
                <GearIcon className="size-4" />
                Personal account
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openSettings("profile")}>
              <UserCircleIcon />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openSettings("account")}>
              <GearIcon />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void signOut({ redirectUrl: "/sign-in" })}
            >
              <SignOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          initialTab={settingsTab}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

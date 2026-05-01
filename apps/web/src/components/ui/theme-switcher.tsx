import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/use-theme";

type ThemeSwitcherProps = {
  triggerStyle?: "icon" | "text";
  buttonVariant?: "outline" | "ghost";
  buttonClassName?: string;
  textLabel?: string;
};

export function ThemeSwitcher({
  triggerStyle = "icon",
  buttonVariant = "outline",
  buttonClassName,
  textLabel,
}: ThemeSwitcherProps) {
  const { setTheme, theme } = useTheme();
  const resolvedTextLabel =
    textLabel ?? `${theme.charAt(0).toUpperCase()}${theme.slice(1)}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {triggerStyle === "text" ? (
          <Button variant={buttonVariant} size="sm" className={buttonClassName}>
            {resolvedTextLabel}
          </Button>
        ) : (
          <Button variant={buttonVariant} size="icon" className={buttonClassName}>
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          <span>Dark</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

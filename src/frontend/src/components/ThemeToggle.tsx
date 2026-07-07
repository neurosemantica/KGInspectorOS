import { Sun, Moon } from "lucide-react";
import { useTheme } from "../hooks";

export function ThemeToggle() {
  const { dark, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

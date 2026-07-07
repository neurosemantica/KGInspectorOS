import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Menu, X, GitCompare, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "./ThemeToggle";
import { HelpDialog } from "./HelpDialog";

const NAV_LINKS = [
  { to: "/diff", label: "Diff", icon: GitCompare },
  { to: "/visualize", label: "Visualize", icon: Eye },
] as const;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-background/80 backdrop-blur-md border-b border-border/50 shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.4)]"
            : "bg-transparent"
        }`}
      >
        <nav className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <button
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <NavLink to="/diff" className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
            <img
              src="/logo.png"
              alt="KG Inspector"
              width={28}
              height={28}
              className="w-7 h-7 object-contain"
            />
            <span className="font-bold text-base tracking-tight">
              KG <span className="text-primary">Inspector</span>
            </span>
          </NavLink>

          <div className="flex items-center gap-1">
            <HelpDialog />
            <ThemeToggle />
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />

            <motion.aside
              key="sidebar"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              className="fixed top-0 left-0 z-50 h-full w-72 bg-background/80 backdrop-blur-md border-r border-border/60 flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-end px-4 h-16 border-b border-border/50 shrink-0">
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Close menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <nav className="flex flex-col gap-0.5 px-3 pt-5 flex-1">
                {NAV_LINKS.map((link, i) => {
                  const active = location.pathname === link.to;
                  const Icon = link.icon;
                  return (
                    <motion.div
                      key={link.to}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.04 }}
                    >
                      <NavLink
                        to={link.to}
                        className={
                          `flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                            active
                              ? "bg-black/7 dark:bg-white/12 text-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/8"
                          }`
                        }
                      >
                        <span className="flex items-center gap-2">
                          {active && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                          <Icon className="w-4 h-4" />
                          {link.label}
                        </span>
                      </NavLink>
                    </motion.div>
                  );
                })}
              </nav>

            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

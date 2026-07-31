import { createContext, useContext } from "react";

interface NavContextType {
  navCollapsed: boolean;
  toggleNav: () => void;
  /** Opens the Add Source wizard, which is mounted once by the shell so it can
      outlive the surface that opened it (Settings → Sources, sidebar button). */
  openAddSource: () => void;
}

export const NavContext = createContext<NavContextType>({
  navCollapsed: false,
  toggleNav: () => {},
  openAddSource: () => {},
});

export const useNav = () => useContext(NavContext);

import { createContext, useContext } from "react";

interface NavContextType {
  navCollapsed: boolean;
  toggleNav: () => void;
}

export const NavContext = createContext<NavContextType>({
  navCollapsed: false,
  toggleNav: () => {},
});

export const useNav = () => useContext(NavContext);

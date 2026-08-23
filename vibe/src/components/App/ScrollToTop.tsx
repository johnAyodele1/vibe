import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    const adultZoneScrollContainer = document.querySelector<HTMLElement>(
      ".az-grain > .flex-1"
    );

    if (adultZoneScrollContainer) {
      adultZoneScrollContainer.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [pathname]);

  return null;
}

export default ScrollToTop;

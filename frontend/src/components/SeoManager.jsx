import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/* Search engines render our SPA, so we adjust the <meta name="robots"> tag per
   route: public marketing + boutique booking pages stay indexable, while the
   private admin & superadmin panels are set to noindex,nofollow. This complements
   the path rules in /robots.txt. */
function setRobots(content) {
  let tag = document.querySelector('meta[name="robots"]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", "robots");
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function isPrivate(pathname) {
  if (pathname.startsWith("/superadmin")) return true;
  // any tenant admin area: /{tenant}/admin...
  const parts = pathname.split("/").filter(Boolean);
  return parts.includes("admin");
}

export default function SeoManager() {
  const { pathname } = useLocation();
  useEffect(() => {
    setRobots(isPrivate(pathname) ? "noindex, nofollow" : "index, follow");
  }, [pathname]);
  return null;
}

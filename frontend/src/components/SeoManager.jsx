import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/* Search engines render our SPA, so we adjust the <meta name="robots"> tag per
   route. Public marketing + boutique booking pages stay fully indexable with rich
   snippets/image previews; private admin & superadmin panels are set to
   noindex,nofollow plus noarchive,nosnippet (no cached copy, no snippet) — even
   if a URL ever leaks. This complements the path rules in /robots.txt. */
const PUBLIC_ROBOTS = "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";
const PRIVATE_ROBOTS = "noindex, nofollow, noarchive, nosnippet";

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
    setRobots(isPrivate(pathname) ? PRIVATE_ROBOTS : PUBLIC_ROBOTS);
  }, [pathname]);
  return null;
}

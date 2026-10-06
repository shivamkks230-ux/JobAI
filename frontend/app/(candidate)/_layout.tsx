import { RoleTabs } from "@/src/RoleTabs";

export default function CandidateTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: "home", title: "Home", icon: "home-outline", iconActive: "home", sf: "house.fill" },
        { name: "jobs", title: "Jobs", icon: "search-outline", iconActive: "search", sf: "magnifyingglass" },
        { name: "applications", title: "Applications", icon: "document-text-outline", iconActive: "document-text", sf: "doc.text.fill" },
        { name: "saved", title: "Saved", icon: "bookmark-outline", iconActive: "bookmark", sf: "bookmark.fill" },
        { name: "profile", title: "Profile", icon: "person-outline", iconActive: "person", sf: "person.fill" },
      ]}
    />
  );
}

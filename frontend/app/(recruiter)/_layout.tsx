import { RoleTabs } from "@/src/RoleTabs";

export default function RecruiterTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: "dashboard", title: "Dashboard", icon: "grid-outline", iconActive: "grid", sf: "square.grid.2x2.fill" },
        { name: "postings", title: "Jobs", icon: "briefcase-outline", iconActive: "briefcase", sf: "briefcase.fill" },
        { name: "candidates", title: "Candidates", icon: "people-outline", iconActive: "people", sf: "person.2.fill" },
        { name: "interviews", title: "Interviews", icon: "calendar-outline", iconActive: "calendar", sf: "calendar" },
        { name: "company", title: "Company", icon: "business-outline", iconActive: "business", sf: "building.2.fill" },
      ]}
    />
  );
}

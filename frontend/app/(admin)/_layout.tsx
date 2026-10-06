import { RoleTabs } from "@/src/RoleTabs";

export default function AdminTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: "overview", title: "Overview", icon: "analytics-outline", iconActive: "analytics", sf: "chart.bar.fill" },
        { name: "review", title: "Review", icon: "shield-checkmark-outline", iconActive: "shield-checkmark", sf: "checkmark.shield.fill" },
        { name: "reports", title: "Reports", icon: "flag-outline", iconActive: "flag", sf: "flag.fill" },
        { name: "users", title: "Users", icon: "people-outline", iconActive: "people", sf: "person.3.fill" },
      ]}
    />
  );
}

import { AdminJobs } from "@/src/admin/AdminJobs";

export default function Rejected() {
  return <AdminJobs status="rejected" title="Rejected Jobs" subtitle="Not visible to candidates" />;
}

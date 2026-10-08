import { AdminJobs } from "@/src/admin/AdminJobs";

export default function Approvals() {
  return <AdminJobs status="pending_approval" title="Job Approvals" subtitle="Awaiting review" />;
}

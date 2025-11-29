import { redirect } from 'next/navigation';

export default function DashboardRootPage() {
  // Redirect to the main project dashboard by default
  redirect('/dashboard/p_main');
}

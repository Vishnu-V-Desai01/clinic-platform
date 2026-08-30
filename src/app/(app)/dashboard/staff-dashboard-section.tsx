import StaffDashboardView from "@/features/staff-dashboard/components/StaffDashboardView";
import {
  listPendingAppointmentRequests,
  listTodaysAppointments,
  listPatientsWithoutPortalAccess,
  listOutstandingPayments,
  getRemindersDueTodayCount,
  listClinicDoctors,
  listRecentMedicineSales,
  confirmAppointmentRequest,
  rejectAppointmentRequest,
  updatePatientEmail,
} from "@/features/staff-dashboard/actions";

export const dynamic = "force-dynamic";

export default async function StaffDashboardSection() {
  const [
    pendingRequests,
    todaysAppointments,
    missingEmailPatients,
    outstandingPayments,
    reminders,
    doctors,
    recentMedicineSales,
  ] = await Promise.all([
    listPendingAppointmentRequests(),
    listTodaysAppointments(),
    listPatientsWithoutPortalAccess(),
    listOutstandingPayments(),
    getRemindersDueTodayCount(),
    listClinicDoctors(),
    listRecentMedicineSales(),
  ]);

  return (
    <StaffDashboardView
      pendingRequests={pendingRequests}
      doctors={doctors}
      todaysAppointments={todaysAppointments}
      missingEmailPatients={missingEmailPatients}
      outstandingPayments={outstandingPayments}
      remindersDueToday={reminders.count}
      recentMedicineSales={recentMedicineSales}
      onConfirm={async (requestId, values) => {
        "use server";
        await confirmAppointmentRequest({ requestId, ...values });
      }}
      onReject={async (requestId, reason) => {
        "use server";
        await rejectAppointmentRequest({ requestId, responseNote: reason });
      }}
      onAddEmail={async (patientId, email) => {
        "use server";
        await updatePatientEmail({ patientId, email });
      }}
      onPrintSchedule={undefined}
    />
  );
}
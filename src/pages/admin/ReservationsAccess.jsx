import React from 'react'
import ReservationsDashboard from './ReservationsDashboard.jsx'
import StaffModuleAccess from './StaffModuleAccess.jsx'

export default function ReservationsAccess({ onBack }) {
  return (
    <StaffModuleAccess
      permissionRpc="reservations_staff_has_access"
      title="Acceso a Reservas"
      deniedMessage="Esta cuenta no tiene permiso para gestionar reservas."
    >
      {({ userId, ...auth }) => <ReservationsDashboard key={userId} onBack={onBack} {...auth} />}
    </StaffModuleAccess>
  )
}
